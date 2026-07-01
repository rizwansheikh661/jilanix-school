/**
 * NotificationCampaignService — orchestration for broadcast envelopes
 * (Sprint 10 Wave 10).
 *
 * Sprint 10 simplifications (documented inline):
 *   1. Campaigns are single-channel: `channels[]` MUST equal
 *      `[template.channel]`. Multi-channel broadcasts → create one
 *      campaign per channel. This avoids cross-channel template lookup
 *      and matches the schema (campaign carries ONE templateId).
 *   2. Recipient audience is restricted to USER. Parent/student audience
 *      resolution is deferred. Campaigns targeting CLASS/SECTION (and
 *      BRANCH, since the User row carries no branchId in Sprint 10) are
 *      rejected at `start()` with an explicit error message.
 *   3. Campaigns render with an EMPTY variables object — the rendered
 *      output is literal text. Richer payloads use the event dispatcher.
 *
 * Every mutation publishes a `notification.campaign.*` outbox event and
 * writes a general-category audit row inside the same transaction.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { ValidationFailedError } from '../../errors/domain-error';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import { SequenceService } from '../../sequences/sequence/sequence.service';
import { CommunicationEntitlementService } from '../communication-entitlement/communication-entitlement.service';
import { NotificationPreferenceService } from '../notification-preference/notification-preference.service';
import { renderTemplateForChannel } from '../notification-renderer';
import { NotificationTemplateRepository } from '../notification-template/notification-template.repository';
import {
  DEFAULT_MAX_ATTEMPTS,
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationAudienceValue,
  type NotificationCampaignStatusValue,
  type NotificationCampaignTargetValue,
  type NotificationChannelValue,
} from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationQuotaExceededError,
  NotificationBroadcastDisabledError,
  NotificationCampaignNotFoundError,
  NotificationCampaignNotStartableError,
  NotificationsModuleDisabledError,
  NotificationTemplateInactiveError,
  NotificationTemplateNotFoundError,
} from '../notifications.errors';
import type {
  NotificationCampaignRecipientRow,
  NotificationCampaignRow,
} from '../notifications.types';
import {
  type CampaignRecipientSummary,
  NotificationCampaignRepository,
} from './notification-campaign.repository';

export interface CreateNotificationCampaignArgs {
  readonly code?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly channels: readonly NotificationChannelValue[];
  readonly notificationTemplateId: string;
  readonly targetType: NotificationCampaignTargetValue;
  readonly targetId?: string | null;
  readonly audience?: NotificationAudienceValue;
  readonly scheduledAt?: Date | null;
}

export interface CampaignWithSummary {
  readonly campaign: NotificationCampaignRow;
  readonly summary: CampaignRecipientSummary;
}

interface ResolvedRecipient {
  readonly userId: string;
  readonly audience: NotificationAudienceValue;
  readonly resolutionReason: string;
}

const RESOLVE_PAGE_SIZE = 500;

@Injectable()
export class NotificationCampaignService {
  private readonly logger = new Logger(NotificationCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: NotificationCampaignRepository,
    private readonly templates: NotificationTemplateRepository,
    private readonly preferences: NotificationPreferenceService,
    private readonly entitlements: CommunicationEntitlementService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
    private readonly sequences: SequenceService,
  ) {}

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  public async list(filters: {
    status?: NotificationCampaignStatusValue;
    targetType?: NotificationCampaignTargetValue;
    cursor?: string;
    limit: number;
  }): Promise<{
    readonly items: readonly NotificationCampaignRow[];
    readonly nextCursor: string | null;
  }> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const { rows, nextCursor } = await this.repo.list(undefined, schoolId, filters);
    return { items: rows, nextCursor };
  }

  public async getById(id: string): Promise<CampaignWithSummary> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const campaign = await this.repo.findById(undefined, schoolId, id);
    if (campaign === null) throw new NotificationCampaignNotFoundError(id);
    const summary = await this.repo.recipientSummary(undefined, schoolId, id);
    return { campaign, summary };
  }

  public async listRecipients(
    id: string,
    filters: { cursor?: string; limit: number },
  ): Promise<{
    readonly items: readonly NotificationCampaignRecipientRow[];
    readonly nextCursor: string | null;
  }> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const campaign = await this.repo.findById(undefined, schoolId, id);
    if (campaign === null) throw new NotificationCampaignNotFoundError(id);
    const { rows, nextCursor } = await this.repo.listRecipients(
      undefined,
      schoolId,
      id,
      filters,
    );
    return { items: rows, nextCursor };
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public async create(
    input: CreateNotificationCampaignArgs,
  ): Promise<NotificationCampaignRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    if (input.channels.length !== 1) {
      throw new ValidationFailedError(
        [
          {
            path: 'channels',
            code: 'SINGLE_CHANNEL_REQUIRED',
            message:
              'Sprint 10: campaigns are single-channel. Provide exactly one channel matching the template channel.',
          },
        ],
        'channels must contain exactly one entry',
      );
    }
    if (
      input.targetType !== 'SCHOOL' &&
      (input.targetId === null || input.targetId === undefined)
    ) {
      throw new ValidationFailedError(
        [
          {
            path: 'targetId',
            code: 'TARGET_ID_REQUIRED',
            message: 'targetId is required when targetType is not SCHOOL.',
          },
        ],
        'targetId required for non-SCHOOL targets',
      );
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const template = await this.templates.findById(
        tx,
        schoolId,
        input.notificationTemplateId,
      );
      if (template === null) {
        throw new NotificationTemplateNotFoundError(input.notificationTemplateId);
      }
      if (!template.isActive) {
        throw new NotificationTemplateInactiveError(template.id);
      }
      if (input.channels[0] !== template.channel) {
        throw new ValidationFailedError(
          [
            {
              path: 'channels',
              code: 'CHANNEL_TEMPLATE_MISMATCH',
              message: `channels[0] (${input.channels[0]}) must equal the template channel (${template.channel}).`,
            },
          ],
          'channel does not match template channel',
        );
      }

      let code: string | null = input.code ?? null;
      if (code === null || code === '') {
        const seq = await this.sequences.nextValue(SEQ_NAMES.NOTIFICATION, { tx });
        code = `CMP-${seq.toString().padStart(6, '0')}`;
      }

      const header = await this.repo.create(tx, schoolId, {
        code,
        name: input.name,
        description: input.description ?? null,
        channels: input.channels,
        notificationTemplateId: template.id,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        ...(input.audience !== undefined ? { audience: input.audience } : {}),
        scheduledAt: input.scheduledAt ?? null,
        createdBy: userId ?? null,
      });

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.CAMPAIGN_CREATED,
        eventType: 'NotificationCampaignCreated',
        aggregateType: 'NotificationCampaign',
        aggregateId: header.id,
        schoolId,
        payload: {
          id: header.id,
          code: header.code,
          name: header.name,
          targetType: header.targetType,
          channels: input.channels,
          notificationTemplateId: header.notificationTemplateId,
        },
      });

      await this.audit.record(
        {
          action: 'notification_campaign.create',
          category: 'general',
          resourceType: 'NotificationCampaign',
          resourceId: header.id,
          after: header,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `NotificationCampaign created id=${header.id} code="${header.code ?? ''}" target=${header.targetType}.`,
      );

      return header;
    });
  }

  public async start(
    id: string,
    expectedVersion: number,
  ): Promise<CampaignWithSummary> {
    await this.assertModuleEnabled();
    await this.assertBroadcastEnabled();
    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const campaign = await this.repo.findById(tx, schoolId, id);
      if (campaign === null) throw new NotificationCampaignNotFoundError(id);
      if (campaign.status !== 'DRAFT') {
        throw new NotificationCampaignNotStartableError(id, campaign.status);
      }

      const template = await this.templates.findById(
        tx,
        schoolId,
        campaign.notificationTemplateId,
      );
      if (template === null) {
        throw new NotificationTemplateNotFoundError(campaign.notificationTemplateId);
      }
      if (!template.isActive) {
        throw new NotificationTemplateInactiveError(template.id);
      }
      const activeVersion = await this.templates.findActiveVersion(
        tx,
        schoolId,
        template.id,
      );
      if (activeVersion === null) {
        throw new NotificationTemplateInactiveError(template.id);
      }

      const channel = template.channel as NotificationChannelValue;
      const category = template.category;
      const priority = template.defaultPriority;
      const audience = (campaign.audience ?? 'USER') as NotificationAudienceValue;
      const now = new Date();

      const recipients = await this._resolveRecipients(tx, campaign, audience);

      let createdCount = 0;
      let skippedCount = 0;
      const skipBuffer: Array<{
        userId: string;
        audience: NotificationAudienceValue;
        reason: string;
      }> = [];
      const createdRecipientsBuffer: ResolvedRecipient[] = [];

      for (const recipient of recipients) {
        const prefResult = await this.preferences.shouldDeliver(
          tx,
          schoolId,
          recipient.userId,
          channel,
          category as never,
          priority,
          now,
        );
        if (!prefResult.allowed) {
          skipBuffer.push({
            userId: recipient.userId,
            audience: recipient.audience,
            reason: prefResult.skipReason ?? 'OPTED_OUT',
          });
          skippedCount += 1;
          continue;
        }

        if (channel !== 'IN_APP') {
          try {
            await this.entitlements.assertAndIncrement(tx, schoolId, channel);
          } catch (err) {
            if (err instanceof CommunicationChannelDisabledError) {
              skipBuffer.push({
                userId: recipient.userId,
                audience: recipient.audience,
                reason: 'CHANNEL_DISABLED',
              });
              skippedCount += 1;
              continue;
            }
            if (err instanceof CommunicationQuotaExceededError) {
              skipBuffer.push({
                userId: recipient.userId,
                audience: recipient.audience,
                reason: 'QUOTA_EXHAUSTED',
              });
              skippedCount += 1;
              continue;
            }
            throw err;
          }
        }

        // Sprint 10: empty variables — rendered output is literal.
        const rendered = renderTemplateForChannel(channel, {
          subjectTemplate: activeVersion.subject,
          bodyTextTemplate: activeVersion.bodyText,
          bodyHtmlTemplate: activeVersion.bodyHtml,
          variables: {},
        });

        const recipientAddress =
          channel === 'IN_APP' ? recipient.userId : recipient.userId;
        const dedupeKey = `campaign:${campaign.id}:${recipient.userId}:${channel}`;

        const baseData: Prisma.NotificationMessageUncheckedCreateInput = {
          schoolId,
          messageNo: null,
          recipientUserId: recipient.userId,
          recipientAudience: recipient.audience as never,
          recipientAddress,
          channel: channel as never,
          category: category as never,
          priority: priority as never,
          notificationTemplateId: template.id,
          templateVersionNo: activeVersion.versionNo,
          eventKey: template.eventKey,
          aggregateType: 'NotificationCampaign',
          aggregateId: campaign.id,
          campaignId: campaign.id,
          subjectRendered: rendered.subject,
          bodyRendered: rendered.bodyText,
          dataPayload: {} as unknown as Prisma.InputJsonValue,
          deepLink: null,
          dedupeKey,
          status:
            channel === 'IN_APP' ? ('DELIVERED' as never) : ('QUEUED' as never),
          scheduledAt: channel === 'IN_APP' ? null : now,
          sentAt: channel === 'IN_APP' ? now : null,
          deliveredAt: channel === 'IN_APP' ? now : null,
          attemptCount: 0,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        };

        let message: { id: string };
        try {
          message = await tx.notificationMessage.create({
            data: baseData,
            select: { id: true },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            // Dedupe collision — silently skip; the recipient is already targeted.
            this.logger.debug(
              `Dedupe collision suppressed campaign=${campaign.id} recipient=${recipient.userId} channel=${channel}`,
            );
            continue;
          }
          throw err;
        }

        await tx.notificationMessageEvent.create({
          data: {
            schoolId,
            notificationMessageId: message.id,
            eventType: channel === 'IN_APP' ? 'DELIVERED' : 'QUEUED',
            occurredAt: now,
            createdBy: userId ?? null,
          },
        });

        await this.outbox.publish(tx, {
          topic:
            channel === 'IN_APP'
              ? NotificationsOutboxTopics.MESSAGE_DELIVERED
              : NotificationsOutboxTopics.MESSAGE_QUEUED,
          eventType:
            channel === 'IN_APP'
              ? 'NotificationDelivered'
              : 'NotificationQueued',
          aggregateType: 'NotificationMessage',
          aggregateId: message.id,
          schoolId,
          payload: {
            messageId: message.id,
            schoolId,
            channel,
            recipientUserId: recipient.userId,
            campaignId: campaign.id,
          },
        });

        createdRecipientsBuffer.push(recipient);
        createdCount += 1;
      }

      if (createdRecipientsBuffer.length > 0) {
        await this.repo.appendRecipients(
          tx,
          createdRecipientsBuffer.map((r) => ({
            schoolId,
            notificationCampaignId: campaign.id,
            recipientUserId: r.userId,
            recipientAudience: r.audience,
            resolutionReason: r.resolutionReason,
            skipped: false,
            createdBy: userId ?? null,
          })),
        );
      }
      if (skipBuffer.length > 0) {
        await this.repo.appendRecipients(
          tx,
          skipBuffer.map((s) => ({
            schoolId,
            notificationCampaignId: campaign.id,
            recipientUserId: s.userId,
            recipientAudience: s.audience,
            skipped: true,
            skipReason: s.reason,
            createdBy: userId ?? null,
          })),
        );
      }

      const total = createdCount + skippedCount;
      const updated = await this.repo.update(
        tx,
        schoolId,
        campaign.id,
        expectedVersion,
        {
          status: 'COMPLETED',
          startedAt: now,
          completedAt: now,
          recipientCount: total,
          sentCount: createdCount,
          updatedBy: userId ?? null,
        },
      );

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.CAMPAIGN_STARTED,
        eventType: 'NotificationCampaignStarted',
        aggregateType: 'NotificationCampaign',
        aggregateId: campaign.id,
        schoolId,
        payload: {
          id: campaign.id,
          recipientCount: total,
          sentCount: createdCount,
          skippedCount,
        },
      });

      await this.audit.record(
        {
          action: 'notification_campaign.start',
          category: 'general',
          resourceType: 'NotificationCampaign',
          resourceId: campaign.id,
          before: { status: campaign.status },
          after: {
            status: updated.status,
            recipientCount: total,
            sentCount: createdCount,
            skippedCount,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      const summary = await this.repo.recipientSummary(tx, schoolId, campaign.id);
      return { campaign: updated, summary };
    });
  }

  public async cancel(
    id: string,
    expectedVersion: number,
  ): Promise<NotificationCampaignRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current = await this.repo.findById(tx, schoolId, id);
      if (current === null) throw new NotificationCampaignNotFoundError(id);
      const cancellable = ['DRAFT', 'QUEUED', 'SENDING'];
      if (!cancellable.includes(current.status)) {
        throw new NotificationCampaignNotStartableError(id, current.status);
      }

      const now = new Date();

      await tx.notificationMessage.updateMany({
        where: { schoolId, campaignId: id, status: 'QUEUED', deletedAt: null },
        data: { status: 'CANCELLED', updatedBy: userId ?? null },
      });

      const updated = await this.repo.update(
        tx,
        schoolId,
        id,
        expectedVersion,
        {
          status: 'CANCELLED',
          cancelledAt: now,
          updatedBy: userId ?? null,
        },
      );

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.CAMPAIGN_CANCELLED,
        eventType: 'NotificationCampaignCancelled',
        aggregateType: 'NotificationCampaign',
        aggregateId: id,
        schoolId,
        payload: { id, code: updated.code },
      });

      await this.audit.record(
        {
          action: 'notification_campaign.cancel',
          category: 'general',
          resourceType: 'NotificationCampaign',
          resourceId: id,
          before: { status: current.status },
          after: { status: updated.status },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Resolve recipients for a campaign. Sprint 10 supports only the SCHOOL
   * target (audience USER): BRANCH/CLASS/SECTION require parent/student
   * audience modeling that is deferred. Paginated in 500-row batches with
   * a `Set` for cross-page dedupe.
   */
  private async _resolveRecipients(
    tx: PrismaTx,
    campaign: NotificationCampaignRow,
    audience: NotificationAudienceValue,
  ): Promise<readonly ResolvedRecipient[]> {
    if (audience !== 'USER') {
      throw new Error(
        `Sprint 10: campaign audience "${audience}" is not supported. Only USER is implemented; PARENT/STUDENT audience resolution is deferred.`,
      );
    }

    if (campaign.targetType === 'SCHOOL') {
      return this._pageUsers(tx, campaign.schoolId, 'SCHOOL_MEMBER');
    }
    if (
      campaign.targetType === 'BRANCH' ||
      campaign.targetType === 'CLASS' ||
      campaign.targetType === 'SECTION'
    ) {
      throw new Error(
        `Sprint 10: ${campaign.targetType} audience resolution is deferred. ` +
          'BRANCH requires a User.branchId column; CLASS/SECTION require ' +
          'parent/student audience resolvers. Use SCHOOL targets only.',
      );
    }
    throw new Error(`Unknown campaign targetType: ${campaign.targetType}`);
  }

  private async _pageUsers(
    tx: PrismaTx,
    schoolId: string,
    resolutionReason: string,
  ): Promise<readonly ResolvedRecipient[]> {
    const seen = new Set<string>();
    const out: ResolvedRecipient[] = [];
    let cursor: string | undefined;
    for (;;) {
      const rows: Array<{ id: string }> = await tx.user.findMany({
        where: { schoolId, status: 'active' },
        select: { id: true },
        orderBy: [{ id: 'asc' }],
        take: RESOLVE_PAGE_SIZE,
        ...(cursor !== undefined
          ? { cursor: { schoolId_id: { schoolId, id: cursor } }, skip: 1 }
          : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ userId: r.id, audience: 'USER', resolutionReason });
      }
      if (rows.length < RESOLVE_PAGE_SIZE) break;
      cursor = rows[rows.length - 1]!.id;
    }
    return out;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new NotificationsModuleDisabledError();
  }

  private async assertBroadcastEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.ALLOW_BROADCAST,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new NotificationBroadcastDisabledError();
  }

  private tenant(): {
    readonly schoolId: string;
    readonly userId: string | undefined;
  } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('NotificationCampaignService requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }
}
