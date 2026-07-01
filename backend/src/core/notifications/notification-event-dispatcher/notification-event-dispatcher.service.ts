/**
 * NotificationEventDispatcherService — single-tx fanout from a domain
 * event to per-recipient `NotificationMessage` rows.
 *
 * Pipeline (one tx per `dispatch()` call):
 *   1. `module.notifications` feature-flag gate.
 *   2. Resolve event definition from the registry (category, default
 *      priority, audience). Unknown event keys throw.
 *   3. For every active template matching `(schoolId, eventKey)`:
 *      a. Load its active version.
 *      b. For every recipient:
 *         - preference check (`shouldDeliver`) — opt-out / quiet-hours.
 *         - entitlement check (EMAIL/SMS/WHATSAPP only; IN_APP bypasses).
 *           Channel-disabled / quota-exceeded ⇒ per-recipient skip, NOT
 *           a whole-batch failure.
 *         - render via pure `renderTemplateForChannel` helper.
 *         - persist `NotificationMessage` + matching
 *           `NotificationMessageEvent` ledger row.
 *         - publish a transactional outbox event (`notification.queued`
 *           for async channels, `notification.delivered` for IN_APP).
 *   4. Audit one `general`-category row summarising the dispatch.
 *
 * Callable from request-bound services (uses tenant/user from
 * RequestContext) and from background jobs (falls back to the
 * schoolId on `input` if no context is bound). Wave 8's send-job
 * handler picks up the QUEUED rows and emits provider calls.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SchoolBrandingResolverService } from '../../school/branding/school-branding-resolver.service';
import { CommunicationEntitlementService } from '../communication-entitlement/communication-entitlement.service';
import { NotificationEventRegistry } from '../notification-event.registry';
import { NotificationPreferenceService } from '../notification-preference/notification-preference.service';
import { NotificationTemplateRepository } from '../notification-template/notification-template.repository';
import { renderTemplateForChannel } from '../notification-renderer';
import {
  DEFAULT_MAX_ATTEMPTS,
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationAudienceValue,
  type NotificationChannelValue,
  type NotificationPriorityValue,
} from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationQuotaExceededError,
  NotificationsModuleDisabledError,
} from '../notifications.errors';

export interface DispatchRecipient {
  readonly userId: string;
  readonly audience?: NotificationAudienceValue;
  readonly address?: string;
}

export interface EventDispatchInput {
  readonly eventKey: string;
  readonly schoolId: string;
  readonly recipients: readonly DispatchRecipient[];
  readonly variables: Record<string, unknown>;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly campaignId?: string;
  readonly priorityOverride?: NotificationPriorityValue;
  readonly scheduledAt?: Date;
  readonly dedupeKey?: string;
  readonly now?: Date;
}

export type DispatchSkipReason =
  | 'OPTED_OUT'
  | 'QUIET_HOURS'
  | 'CHANNEL_DISABLED'
  | 'QUOTA_EXCEEDED'
  | 'TEMPLATE_INACTIVE'
  | 'TEMPLATE_NOT_FOUND';

export interface DispatchCreatedEntry {
  readonly messageId: string;
  readonly channel: NotificationChannelValue;
  readonly recipientUserId: string;
}

export interface DispatchSkippedEntry {
  readonly recipientUserId: string;
  readonly channel: NotificationChannelValue;
  readonly reason: DispatchSkipReason;
}

export interface DispatchResult {
  readonly created: readonly DispatchCreatedEntry[];
  readonly skipped: readonly DispatchSkippedEntry[];
}

@Injectable()
export class NotificationEventDispatcherService {
  private readonly logger = new Logger(NotificationEventDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: NotificationEventRegistry,
    private readonly templates: NotificationTemplateRepository,
    private readonly preferences: NotificationPreferenceService,
    private readonly entitlements: CommunicationEntitlementService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
    private readonly brandingResolver: SchoolBrandingResolverService,
  ) {}

  public async dispatch(input: EventDispatchInput): Promise<DispatchResult> {
    await this.assertModuleEnabled(input.schoolId);

    const definition = this.registry.get(input.eventKey);
    const priority: NotificationPriorityValue =
      input.priorityOverride ?? definition.defaultPriority;
    const audience: NotificationAudienceValue = definition.audience;
    const now = input.now ?? new Date();
    const actorUserId = RequestContextRegistry.peek()?.userId ?? null;
    const branding = await this.brandingResolver.resolve(input.schoolId);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const created: DispatchCreatedEntry[] = [];
      const skipped: DispatchSkippedEntry[] = [];

      const templatesPage = await this.templates.list(tx, input.schoolId, {
        eventKey: input.eventKey,
        isActive: true,
        limit: 50,
      });

      if (templatesPage.rows.length === 0) {
        this.logger.warn(
          `No active templates for event=${input.eventKey} school=${input.schoolId}; nothing to dispatch.`,
        );
        await this.audit.record(
          {
            action: 'notification.dispatched',
            category: 'general',
            resourceType: 'NotificationEvent',
            resourceId: input.eventKey,
            schoolId: input.schoolId,
            after: { created: 0, skipped: 0, reason: 'NO_TEMPLATE' },
          },
          { tx: tx as unknown as AuditTxLike },
        );
        return { created, skipped };
      }

      for (const template of templatesPage.rows) {
        const channel = template.channel as NotificationChannelValue;
        const activeVersion = await this.templates.findActiveVersion(
          tx,
          input.schoolId,
          template.id,
        );
        if (activeVersion === null) {
          for (const recipient of input.recipients) {
            skipped.push({
              recipientUserId: recipient.userId,
              channel,
              reason: 'TEMPLATE_NOT_FOUND',
            });
          }
          continue;
        }

        const variables: Record<string, unknown> = {
          ...branding,
          ...(definition.sampleVariables as Record<string, unknown>),
          ...input.variables,
        };

        for (const recipient of input.recipients) {
          const preferenceResult = await this.preferences.shouldDeliver(
            tx,
            input.schoolId,
            recipient.userId,
            channel,
            template.category as never,
            priority,
            now,
          );
          if (!preferenceResult.allowed) {
            skipped.push({
              recipientUserId: recipient.userId,
              channel,
              reason: preferenceResult.skipReason ?? 'OPTED_OUT',
            });
            continue;
          }

          if (channel !== 'IN_APP') {
            try {
              await this.entitlements.assertAndIncrement(
                tx,
                input.schoolId,
                channel,
              );
            } catch (err) {
              if (err instanceof CommunicationChannelDisabledError) {
                skipped.push({
                  recipientUserId: recipient.userId,
                  channel,
                  reason: 'CHANNEL_DISABLED',
                });
                continue;
              }
              if (err instanceof CommunicationQuotaExceededError) {
                skipped.push({
                  recipientUserId: recipient.userId,
                  channel,
                  reason: 'QUOTA_EXCEEDED',
                });
                continue;
              }
              throw err;
            }
          }

          const rendered = renderTemplateForChannel(channel, {
            subjectTemplate: activeVersion.subject,
            bodyTextTemplate: activeVersion.bodyText,
            bodyHtmlTemplate: activeVersion.bodyHtml,
            variables,
          });

          const recipientAddress =
            channel === 'IN_APP'
              ? recipient.userId
              : (recipient.address ?? recipient.userId);

          const dedupeKey =
            input.dedupeKey ??
            `${input.eventKey}:${input.aggregateId ?? '*'}:${recipient.userId}:${channel}`;

          const baseData: Prisma.NotificationMessageUncheckedCreateInput = {
            schoolId: input.schoolId,
            messageNo: null,
            recipientUserId: recipient.userId,
            recipientAudience: (recipient.audience ?? audience) as never,
            recipientAddress,
            channel: channel as never,
            category: template.category as never,
            priority: priority as never,
            notificationTemplateId: template.id,
            templateVersionNo: activeVersion.versionNo,
            eventKey: input.eventKey,
            aggregateType: input.aggregateType ?? null,
            aggregateId: input.aggregateId ?? null,
            campaignId: input.campaignId ?? null,
            subjectRendered: rendered.subject,
            bodyRendered: rendered.bodyText,
            bodyHtmlRendered: rendered.bodyHtml,
            dataPayload: input.variables as unknown as Prisma.InputJsonValue,
            deepLink: null,
            dedupeKey,
            status:
              channel === 'IN_APP' ? ('DELIVERED' as never) : ('QUEUED' as never),
            scheduledAt: channel === 'IN_APP' ? null : (input.scheduledAt ?? now),
            sentAt: channel === 'IN_APP' ? now : null,
            deliveredAt: channel === 'IN_APP' ? now : null,
            attemptCount: 0,
            maxAttempts: DEFAULT_MAX_ATTEMPTS,
            createdBy: actorUserId,
            updatedBy: actorUserId,
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
              this.logger.debug(
                `Dedupe collision suppressed event=${input.eventKey} channel=${channel} recipient=${recipient.userId} key=${dedupeKey}`,
              );
              continue;
            }
            throw err;
          }

          const eventType = channel === 'IN_APP' ? 'DELIVERED' : 'QUEUED';
          await tx.notificationMessageEvent.create({
            data: {
              schoolId: input.schoolId,
              notificationMessageId: message.id,
              eventType,
              occurredAt: now,
              createdBy: actorUserId,
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
            schoolId: input.schoolId,
            payload: {
              messageId: message.id,
              schoolId: input.schoolId,
              channel,
              recipientUserId: recipient.userId,
              eventKey: input.eventKey,
            },
          });

          created.push({
            messageId: message.id,
            channel,
            recipientUserId: recipient.userId,
          });
        }
      }

      await this.audit.record(
        {
          action: 'notification.dispatched',
          category: 'general',
          resourceType: 'NotificationEvent',
          resourceId: input.eventKey,
          schoolId: input.schoolId,
          after: {
            created: created.length,
            skipped: skipped.length,
            eventKey: input.eventKey,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return { created, skipped };
    });
  }

  private async assertModuleEnabled(schoolId: string): Promise<void> {
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId },
    );
    if (!enabled) {
      throw new NotificationsModuleDisabledError();
    }
  }
}
