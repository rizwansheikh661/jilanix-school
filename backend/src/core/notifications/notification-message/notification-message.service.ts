/**
 * NotificationMessageService — admin/operator view + cancel + send-test
 * orchestration for outbound notification messages (Sprint 10 Wave 8).
 *
 * Read paths are cross-cutting (any user with `notification-message.read`
 * within their school sees all messages). Mutations:
 *   - `cancel` is restricted to QUEUED messages; transitions to CANCELLED
 *     with an APPEND_ONLY ledger row + outbox event + general-category
 *     audit.
 *   - `sendTest` renders the requested template against an ad-hoc payload
 *     and persists a single `NotificationMessage` directly (bypassing the
 *     event dispatcher) so it works for templates that are not bound to
 *     a registered event key. Idempotency is enforced upstream by the
 *     global `Idempotency-Key` middleware.
 *
 * Super-admin (actorScope === 'global') may target any recipient on send-
 * test; tenant users may only target themselves.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { ForbiddenError } from '../../errors/domain-error';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { NotificationEventRegistry } from '../notification-event.registry';
import { renderTemplateForChannel } from '../notification-renderer';
import { NotificationTemplateRepository } from '../notification-template/notification-template.repository';
import {
  DEFAULT_MAX_ATTEMPTS,
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationAudienceValue,
  type NotificationChannelValue,
} from '../notifications.constants';
import {
  NotificationMessageNotCancellableError,
  NotificationMessageNotFoundError,
  NotificationsModuleDisabledError,
  NotificationTemplateInactiveError,
  NotificationTemplateNotFoundError,
} from '../notifications.errors';
import type {
  NotificationMessageRow,
  NotificationMessageWithEvents,
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import {
  type ListNotificationMessagesFilters,
  NotificationMessageRepository,
} from './notification-message.repository';

export interface SendTestNotificationArgs {
  readonly templateId: string;
  readonly recipientUserId?: string;
  readonly payload: Record<string, unknown>;
}

@Injectable()
export class NotificationMessageService {
  private readonly logger = new Logger(NotificationMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: NotificationMessageRepository,
    private readonly templates: NotificationTemplateRepository,
    private readonly registry: NotificationEventRegistry,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  public async list(filters: ListNotificationMessagesFilters): Promise<{
    readonly items: readonly NotificationMessageRow[];
    readonly nextCursor: string | null;
  }> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const { rows, nextCursor } = await this.repo.list(undefined, schoolId, filters);
    return { items: rows, nextCursor };
  }

  public async getById(id: string): Promise<NotificationMessageWithEvents> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const row = (await this.repo.findById(undefined, schoolId, id, {
      includeEvents: true,
    })) as NotificationMessageWithEvents | null;
    if (row === null) throw new NotificationMessageNotFoundError(id);
    return row;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public async cancel(
    id: string,
    expectedVersion: number,
  ): Promise<NotificationMessageRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = (await this.repo.findById(tx, schoolId, id)) as
        | NotificationMessageRow
        | null;
      if (current === null) throw new NotificationMessageNotFoundError(id);
      if (current.status !== 'QUEUED') {
        throw new NotificationMessageNotCancellableError(id, current.status);
      }

      const now = new Date();
      const updated = await this.repo.updateStatus(
        tx,
        schoolId,
        id,
        expectedVersion,
        { status: 'CANCELLED', updatedBy: userId ?? null },
      );

      await this.repo.appendEvent(tx, {
        schoolId,
        notificationMessageId: id,
        eventType: 'CANCELLED',
        occurredAt: now,
        createdBy: userId ?? null,
      });

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.MESSAGE_CANCELLED,
        eventType: 'NotificationCancelled',
        aggregateType: 'NotificationMessage',
        aggregateId: id,
        schoolId,
        payload: {
          messageId: id,
          schoolId,
          channel: updated.channel,
          recipientUserId: updated.recipientUserId,
        },
      });

      await this.audit.record(
        {
          action: 'notification_message.cancel',
          category: 'general',
          resourceType: 'NotificationMessage',
          resourceId: id,
          before: { status: current.status },
          after: { status: updated.status },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`NotificationMessage cancelled id=${id}.`);
      return updated;
    });
  }

  public async sendTest(
    input: SendTestNotificationArgs,
  ): Promise<NotificationMessageRow> {
    await this.assertModuleEnabled();
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('NotificationMessageService requires tenant scope.');
    }
    const schoolId = ctx.schoolId;
    const callerUserId = ctx.userId;
    if (callerUserId === undefined) {
      throw new Error(
        'NotificationMessageService.sendTest requires an authenticated user.',
      );
    }

    const recipientUserId = input.recipientUserId ?? callerUserId;
    if (ctx.actorScope !== 'global' && recipientUserId !== callerUserId) {
      throw new ForbiddenError(
        'Tenant users may only send test notifications to themselves.',
        { reason: 'CROSS_TENANT_RECIPIENT', recipientUserId },
      );
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const template = await this.templates.findById(tx, schoolId, input.templateId);
      if (template === null) {
        throw new NotificationTemplateNotFoundError(input.templateId);
      }
      if (!template.isActive) {
        throw new NotificationTemplateInactiveError(input.templateId);
      }
      const activeVersion = await this.templates.findActiveVersion(
        tx,
        schoolId,
        input.templateId,
      );
      if (activeVersion === null) {
        throw new NotificationTemplateNotFoundError(input.templateId);
      }

      // Sprint 10 send-test fallback: ad-hoc render for templates not bound
      // to a registered event. We intentionally skip the dispatcher so this
      // endpoint stays usable for arbitrary templates and remains
      // idempotency-safe via the global Idempotency-Key middleware.
      const message = await this.renderAndCreateOne(
        tx,
        schoolId,
        template,
        activeVersion,
        recipientUserId,
        input.payload,
        callerUserId,
      );

      await this.audit.record(
        {
          action: 'notification_message.send_test',
          category: 'general',
          resourceType: 'NotificationMessage',
          resourceId: message.id,
          after: {
            messageId: message.id,
            templateId: template.id,
            channel: template.channel,
            recipientUserId,
            eventKey: template.eventKey,
            registeredEvent:
              template.eventKey !== null && this.registry.has(template.eventKey),
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `NotificationMessage send-test id=${message.id} template=${template.id} recipient=${recipientUserId} channel=${template.channel}.`,
      );
      return message;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Mirror of the dispatcher's per-(template, recipient) write path for a
   * single ad-hoc send. Renders the active version, persists a
   * `NotificationMessage` + matching `NotificationMessageEvent`, and
   * publishes the right outbox topic. Bypasses preference/entitlement
   * gates because send-test is an explicit operator action.
   */
  private async renderAndCreateOne(
    tx: PrismaTx,
    schoolId: string,
    template: NotificationTemplateRow,
    activeVersion: NotificationTemplateVersionRow,
    recipientUserId: string,
    variables: Record<string, unknown>,
    actorUserId: string,
  ): Promise<NotificationMessageRow> {
    const channel = template.channel as NotificationChannelValue;
    const audience = template.audience as NotificationAudienceValue;
    const now = new Date();

    const rendered = renderTemplateForChannel(channel, {
      subjectTemplate: activeVersion.subject,
      bodyTextTemplate: activeVersion.bodyText,
      bodyHtmlTemplate: activeVersion.bodyHtml,
      variables,
    });

    const recipientAddress = recipientUserId;

    const baseData: Prisma.NotificationMessageUncheckedCreateInput = {
      schoolId,
      messageNo: null,
      recipientUserId,
      recipientAudience: audience as never,
      recipientAddress,
      channel: channel as never,
      category: template.category as never,
      priority: template.defaultPriority as never,
      notificationTemplateId: template.id,
      templateVersionNo: activeVersion.versionNo,
      eventKey: template.eventKey ?? 'TEST',
      aggregateType: 'TestSend',
      aggregateId: template.id,
      campaignId: null,
      subjectRendered: rendered.subject,
      bodyRendered: rendered.bodyText,
      dataPayload: variables as unknown as Prisma.InputJsonValue,
      deepLink: null,
      dedupeKey: null,
      status:
        channel === 'IN_APP' ? ('DELIVERED' as never) : ('QUEUED' as never),
      scheduledAt: channel === 'IN_APP' ? null : now,
      sentAt: channel === 'IN_APP' ? now : null,
      deliveredAt: channel === 'IN_APP' ? now : null,
      attemptCount: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };

    const created = await tx.notificationMessage.create({ data: baseData });

    const eventType = channel === 'IN_APP' ? 'DELIVERED' : 'QUEUED';
    await this.repo.appendEvent(tx, {
      schoolId,
      notificationMessageId: created.id,
      eventType,
      occurredAt: now,
      createdBy: actorUserId,
    });

    await this.outbox.publish(tx, {
      topic:
        channel === 'IN_APP'
          ? NotificationsOutboxTopics.MESSAGE_DELIVERED
          : NotificationsOutboxTopics.MESSAGE_QUEUED,
      eventType:
        channel === 'IN_APP' ? 'NotificationDelivered' : 'NotificationQueued',
      aggregateType: 'NotificationMessage',
      aggregateId: created.id,
      schoolId,
      payload: {
        messageId: created.id,
        schoolId,
        channel,
        recipientUserId,
        eventKey: template.eventKey ?? 'TEST',
        test: true,
      },
    });

    return created;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new NotificationsModuleDisabledError();
  }

  private tenant(): {
    readonly schoolId: string;
    readonly userId: string | undefined;
  } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('NotificationMessageService requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }
}
