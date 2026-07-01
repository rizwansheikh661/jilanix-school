/**
 * ScheduleService — operational view of pending scheduled broadcasts.
 *
 * "Scheduled broadcast" = a `NotificationCampaign` row with status
 * `DRAFT` and `scheduledAt > now`. The associated Job (queued by
 * `BroadcastService.create`) holds the actual run trigger.
 *
 * Sprint 19 deliberately keeps this read-only + cancel; deeper schedule
 * mutations (reschedule, etc.) are deferred — operators cancel + recreate.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { PrismaService } from '../../../infra/prisma';
import { RequestContextRegistry } from '../../request-context';
import {
  CommunicationCenterFeatureFlags,
  CommunicationCenterJobs,
} from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';

export interface ScheduledBroadcastRow {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly status: string;
  readonly scheduledAt: Date;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  public async list(filters: {
    limit: number;
    cursor?: string;
  }): Promise<{
    readonly items: readonly ScheduledBroadcastRow[];
    readonly nextCursor: string | null;
  }> {
    const { schoolId } = await this.assertModuleEnabled();
    const now = new Date();
    const rows = await this.prisma.client.notificationCampaign.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: 'DRAFT',
        scheduledAt: { gt: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: filters.limit + 1,
      ...(filters.cursor !== undefined
        ? {
            cursor: { schoolId_id: { schoolId, id: filters.cursor } },
            skip: 1,
          }
        : {}),
    });

    const nextCursor =
      rows.length > filters.limit ? (rows.pop()?.id ?? null) : null;

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        scheduledAt: r.scheduledAt as Date,
        targetType: r.targetType,
        targetId: r.targetId,
        version: r.version,
        createdAt: r.createdAt,
      })),
      nextCursor,
    };
  }

  /**
   * Convenience helper used by the e2e test + handler unit test to confirm
   * a Job row was enqueued at the expected `runAt` for a given campaign.
   * Returns null if no pending job exists.
   */
  public async findPendingJobForCampaign(
    schoolId: string,
    campaignId: string,
  ): Promise<{
    readonly id: string;
    readonly status: string;
    readonly runAt: Date;
  } | null> {
    const row = await this.prisma.client.job.findFirst({
      where: {
        schoolId,
        queue: CommunicationCenterJobs.QUEUE,
        type: CommunicationCenterJobs.SCHEDULED_BROADCAST_START_HANDLER,
        status: 'PENDING',
      },
      orderBy: { runAt: 'desc' },
    });
    if (row === null) return null;
    const payload = (row.payload ?? {}) as { campaignId?: string };
    if (payload.campaignId !== campaignId) return null;
    return { id: row.id, status: row.status, runAt: row.runAt };
  }

  private async assertModuleEnabled(): Promise<{ schoolId: string }> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === null || ctx.schoolId === undefined) {
      throw new CommunicationCenterDisabledError();
    }
    const enabled = await this.featureFlags.isEnabled(
      CommunicationCenterFeatureFlags.MODULE,
      { schoolId: ctx.schoolId },
    );
    if (!enabled) throw new CommunicationCenterDisabledError();
    return { schoolId: ctx.schoolId };
  }
}
