/**
 * SearchService — operational search over the `notification_messages`
 * table indexed by linked aggregate (Student / Parent / Staff / Class /
 * Branch / Homework / FeeInvoice / Event / etc.).
 *
 * Sprint 19 reuses the existing `aggregateType` + `aggregateId` columns
 * on NotificationMessage; no new search index is introduced. Channel,
 * status, recipient and date-window filters narrow the result further.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { PrismaService } from '../../../infra/prisma';
import { RequestContextRegistry } from '../../request-context';
import { CommunicationCenterFeatureFlags } from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';
import type {
  NotificationAudienceValue,
  NotificationChannelValue,
  NotificationMessageStatusValue,
} from '../../notifications/notifications.constants';

export interface SearchFilters {
  readonly aggregateType: string;
  readonly aggregateId?: string;
  readonly channel?: NotificationChannelValue;
  readonly status?: NotificationMessageStatusValue;
  readonly recipientAudience?: NotificationAudienceValue;
  readonly recipientUserId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly cursor?: string;
  readonly limit: number;
}

export interface SearchHit {
  readonly id: string;
  readonly channel: string;
  readonly status: string;
  readonly recipientUserId: string;
  readonly recipientAudience: string | null;
  readonly eventKey: string | null;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
  readonly campaignId: string | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly readAt: Date | null;
  readonly failedAt: Date | null;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  public async search(filters: SearchFilters): Promise<{
    readonly items: readonly SearchHit[];
    readonly nextCursor: string | null;
  }> {
    const { schoolId } = await this.assertModuleEnabled();
    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
      aggregateType: filters.aggregateType,
    };
    if (filters.aggregateId !== undefined) where.aggregateId = filters.aggregateId;
    if (filters.channel !== undefined) where.channel = filters.channel;
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.recipientAudience !== undefined) {
      where.recipientAudience = filters.recipientAudience;
    }
    if (filters.recipientUserId !== undefined) {
      where.recipientUserId = filters.recipientUserId;
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (filters.from !== undefined) createdAt.gte = filters.from;
      if (filters.to !== undefined) createdAt.lte = filters.to;
      where.createdAt = createdAt;
    }

    const rows = await this.prisma.client.notificationMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor !== undefined
        ? {
            cursor: { schoolId_id: { schoolId, id: filters.cursor } },
            skip: 1,
          }
        : {}),
    });
    const nextCursor = rows.length > filters.limit ? (rows.pop()?.id ?? null) : null;
    return {
      items: rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        status: r.status,
        recipientUserId: r.recipientUserId,
        recipientAudience: r.recipientAudience,
        eventKey: r.eventKey,
        aggregateType: r.aggregateType,
        aggregateId: r.aggregateId,
        campaignId: r.campaignId,
        createdAt: r.createdAt,
        sentAt: r.sentAt,
        deliveredAt: r.deliveredAt,
        readAt: r.readAt,
        failedAt: r.failedAt,
      })),
      nextCursor,
    };
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
