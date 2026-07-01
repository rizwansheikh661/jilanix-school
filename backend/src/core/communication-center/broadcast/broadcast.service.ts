/**
 * BroadcastService — orchestration wrapper over
 * `NotificationCampaignService`.
 *
 * Sprint 19 explicitly forbids re-implementing recipient resolution,
 * fanout or delivery. This service does five things only:
 *
 *   1. CREATE — `create()` wraps `NotificationCampaignService.create`
 *      and, when `scheduleNow` is true (default), kicks the underlying
 *      `start()` straight after. When `scheduledAt` is provided, the
 *      campaign stays in DRAFT (scheduling is handled by
 *      `SchedulingService` which enqueues a Job at `scheduledAt`).
 *
 *   2. LIST / GET — read-through to the existing campaign service /
 *      repo so dashboards stay in sync.
 *
 *   3. CANCEL — wraps `NotificationCampaignService.cancel`.
 *
 *   4. RETRY — emits a `comms.center.broadcast.retry_requested` outbox
 *      event. The actual retry path is implemented in the notification
 *      module's existing send-job retry mechanism; this is a hook for
 *      operators + downstream reporting.
 *
 *   5. HISTORY — same as list, but with no status filter so callers
 *      can pull COMPLETED / FAILED / CANCELLED in one page.
 *
 * Every method asserts `module.communication_center` is enabled.
 */
import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { JobEnqueueService } from '../../jobs/services/job-enqueue.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma';
import { RequestContextRegistry } from '../../request-context';
import { NotificationCampaignService } from '../../notifications/notification-campaign/notification-campaign.service';
import { NotificationCampaignRepository } from '../../notifications/notification-campaign/notification-campaign.repository';
import type {
  NotificationAudienceValue,
  NotificationCampaignStatusValue,
  NotificationCampaignTargetValue,
  NotificationChannelValue,
} from '../../notifications/notifications.constants';
import type {
  NotificationCampaignRow,
} from '../../notifications/notifications.types';
import type { CampaignRecipientSummary } from '../../notifications/notification-campaign/notification-campaign.repository';
import {
  CommunicationCenterFeatureFlags,
  CommunicationCenterJobs,
  CommunicationCenterOutboxTopics,
} from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';

export interface CreateBroadcastInput {
  readonly name: string;
  readonly description?: string;
  readonly notificationTemplateId: string;
  readonly channel: NotificationChannelValue;
  readonly targetType: NotificationCampaignTargetValue;
  readonly targetId?: string;
  readonly audience?: NotificationAudienceValue;
  readonly scheduledAt?: Date;
}

export interface CreateBroadcastResult {
  readonly campaign: NotificationCampaignRow;
  readonly started: boolean;
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagService,
    private readonly campaigns: NotificationCampaignService,
    private readonly campaignRepo: NotificationCampaignRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly jobs: JobEnqueueService,
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
    return this.campaigns.list(filters);
  }

  public async history(filters: {
    cursor?: string;
    limit: number;
  }): Promise<{
    readonly items: readonly NotificationCampaignRow[];
    readonly nextCursor: string | null;
  }> {
    await this.assertModuleEnabled();
    return this.campaigns.list({ limit: filters.limit, ...(filters.cursor !== undefined ? { cursor: filters.cursor } : {}) });
  }

  public async getById(id: string): Promise<{
    readonly campaign: NotificationCampaignRow;
    readonly summary: CampaignRecipientSummary;
  }> {
    await this.assertModuleEnabled();
    return this.campaigns.getById(id);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public async create(input: CreateBroadcastInput): Promise<CreateBroadcastResult> {
    const { schoolId } = await this.assertModuleEnabled();

    const campaign = await this.campaigns.create({
      name: input.name,
      channels: [input.channel],
      notificationTemplateId: input.notificationTemplateId,
      targetType: input.targetType,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(input.audience !== undefined ? { audience: input.audience } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
    });

    const now = new Date();
    const isFuture = input.scheduledAt !== undefined && input.scheduledAt.getTime() > now.getTime();

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      if (isFuture && input.scheduledAt !== undefined) {
        await this.jobs.enqueue(
          {
            queue: CommunicationCenterJobs.QUEUE,
            handlerName: CommunicationCenterJobs.SCHEDULED_BROADCAST_START_HANDLER,
            payload: { schoolId, campaignId: campaign.id },
            schoolId,
            runAt: input.scheduledAt,
          },
          tx,
        );
      }
      await this.outbox.publish(tx, {
        topic: isFuture
          ? CommunicationCenterOutboxTopics.BROADCAST_SCHEDULED
          : CommunicationCenterOutboxTopics.BROADCAST_CREATED,
        eventType: isFuture ? 'BroadcastScheduled' : 'BroadcastCreated',
        aggregateType: 'NotificationCampaign',
        aggregateId: campaign.id,
        schoolId,
        payload: {
          campaignId: campaign.id,
          name: campaign.name,
          channel: input.channel,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          scheduledAt: input.scheduledAt?.toISOString() ?? null,
        },
      });
      await this.audit.record(
        {
          action: isFuture ? 'comms.broadcast.scheduled' : 'comms.broadcast.created',
          category: 'general',
          resourceType: 'NotificationCampaign',
          resourceId: campaign.id,
          schoolId,
          after: {
            campaignId: campaign.id,
            channel: input.channel,
            targetType: input.targetType,
            targetId: input.targetId ?? null,
            scheduledAt: input.scheduledAt?.toISOString() ?? null,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });

    if (isFuture) {
      this.logger.log(
        `Broadcast ${campaign.id} created in DRAFT for scheduled dispatch at ${input.scheduledAt?.toISOString()}.`,
      );
      return { campaign, started: false };
    }

    const started = await this.campaigns.start(campaign.id, campaign.version);
    return { campaign: started.campaign, started: true };
  }

  public async cancel(id: string, expectedVersion: number): Promise<NotificationCampaignRow> {
    const { schoolId } = await this.assertModuleEnabled();
    const cancelled = await this.campaigns.cancel(id, expectedVersion);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      await this.outbox.publish(tx, {
        topic: CommunicationCenterOutboxTopics.BROADCAST_CANCELLED,
        eventType: 'BroadcastCancelled',
        aggregateType: 'NotificationCampaign',
        aggregateId: id,
        schoolId,
        payload: { campaignId: id },
      });
      await this.audit.record(
        {
          action: 'comms.broadcast.cancelled',
          category: 'general',
          resourceType: 'NotificationCampaign',
          resourceId: id,
          schoolId,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });

    return cancelled;
  }

  public async retry(id: string): Promise<{
    readonly campaign: NotificationCampaignRow;
    readonly failedCount: number;
  }> {
    const { schoolId } = await this.assertModuleEnabled();
    const campaign = await this.campaignRepo.findById(undefined, schoolId, id);
    if (campaign === null) {
      // surface via the existing notification campaign service so the
      // 404 envelope matches the rest of the comms module.
      await this.campaigns.getById(id);
      throw new Error('unreachable');
    }

    const failedCount = await this.prisma.client.notificationMessage.count({
      where: {
        schoolId,
        campaignId: id,
        status: { in: ['FAILED', 'DEAD_LETTER'] },
        deletedAt: null,
      },
    });

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      await this.outbox.publish(tx, {
        topic: CommunicationCenterOutboxTopics.BROADCAST_RETRY_REQUESTED,
        eventType: 'BroadcastRetryRequested',
        aggregateType: 'NotificationCampaign',
        aggregateId: id,
        schoolId,
        payload: { campaignId: id, failedCount },
      });
      await this.audit.record(
        {
          action: 'comms.broadcast.retry_requested',
          category: 'general',
          resourceType: 'NotificationCampaign',
          resourceId: id,
          schoolId,
          after: { failedCount },
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });

    return { campaign, failedCount };
  }

  // -------------------------------------------------------------------------
  // Guards
  // -------------------------------------------------------------------------

  private async assertModuleEnabled(): Promise<{
    readonly schoolId: string;
    readonly userId: string | null;
  }> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === null || ctx.schoolId === undefined) {
      throw new CommunicationCenterDisabledError();
    }
    const enabled = await this.featureFlags.isEnabled(
      CommunicationCenterFeatureFlags.MODULE,
      { schoolId: ctx.schoolId },
    );
    if (!enabled) throw new CommunicationCenterDisabledError();
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? null };
  }
}
