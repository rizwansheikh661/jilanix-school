/**
 * NotificationCampaignRepository — persistence for the campaign header
 * (`notification_campaigns`) and its APPEND_ONLY resolution log
 * (`notification_campaign_recipients`).
 *
 * Soft-deleted rows (`deletedAt IS NOT NULL`) are filtered out of read paths.
 * Header mutations use optimistic concurrency via `version`.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { VersionConflict } from '../../errors/domain-error';
import type {
  NotificationAudienceValue,
  NotificationCampaignStatusValue,
  NotificationCampaignTargetValue,
  NotificationChannelValue,
} from '../notifications.constants';
import type {
  NotificationCampaignRecipientRow,
  NotificationCampaignRow,
} from '../notifications.types';

export interface CreateNotificationCampaignInput {
  readonly code: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly channels: readonly NotificationChannelValue[];
  readonly notificationTemplateId: string;
  readonly targetType: NotificationCampaignTargetValue;
  readonly targetId?: string | null;
  readonly audience?: NotificationAudienceValue;
  readonly scheduledAt?: Date | null;
  readonly createdBy: string | null;
}

export interface UpdateNotificationCampaignInput {
  readonly status?: NotificationCampaignStatusValue;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly cancelledAt?: Date | null;
  readonly recipientCount?: number;
  readonly sentCount?: number;
  readonly failedCount?: number;
  readonly updatedBy: string | null;
}

export interface ListNotificationCampaignsFilters {
  readonly status?: NotificationCampaignStatusValue;
  readonly targetType?: NotificationCampaignTargetValue;
  readonly cursor?: string;
  readonly limit: number;
}

export interface ListCampaignRecipientsFilters {
  readonly cursor?: string;
  readonly limit: number;
}

export interface AppendCampaignRecipientRow {
  readonly schoolId: string;
  readonly notificationCampaignId: string;
  readonly recipientUserId: string;
  readonly recipientAudience: NotificationAudienceValue;
  readonly resolutionReason?: string | null;
  readonly skipped: boolean;
  readonly skipReason?: string | null;
  readonly createdBy?: string | null;
}

export interface CampaignRecipientSummary {
  readonly total: number;
  readonly skipped: number;
  readonly byReason: {
    readonly OPTED_OUT: number;
    readonly QUIET_HOURS: number;
    readonly QUOTA_EXHAUSTED: number;
    readonly CHANNEL_DISABLED: number;
  };
}

@Injectable()
export class NotificationCampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  public async findById(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
  ): Promise<NotificationCampaignRow | null> {
    const reader = this.resolve(tx);
    return reader.notificationCampaign.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
  }

  public async list(
    tx: PrismaTx | undefined,
    schoolId: string,
    filters: ListNotificationCampaignsFilters,
  ): Promise<{
    readonly rows: readonly NotificationCampaignRow[];
    readonly nextCursor: string | null;
  }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.targetType !== undefined) where.targetType = filters.targetType;

    const rows = await reader.notificationCampaign.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: filters.cursor } }, skip: 1 }
        : {}),
    });

    const nextCursor =
      rows.length > filters.limit ? (rows.pop()?.id ?? null) : null;
    return { rows, nextCursor };
  }

  public async create(
    tx: PrismaTx | undefined,
    schoolId: string,
    data: CreateNotificationCampaignInput,
  ): Promise<NotificationCampaignRow> {
    const writer = this.resolve(tx);
    return writer.notificationCampaign.create({
      data: {
        schoolId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        channels: data.channels as unknown as Prisma.InputJsonValue,
        notificationTemplateId: data.notificationTemplateId,
        targetType: data.targetType,
        targetId: data.targetId ?? null,
        ...(data.audience !== undefined ? { audience: data.audience } : {}),
        scheduledAt: data.scheduledAt ?? null,
        status: 'DRAFT',
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      },
    });
  }

  public async update(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
    expectedVersion: number,
    data: UpdateNotificationCampaignInput,
  ): Promise<NotificationCampaignRow> {
    const writer = this.resolve(tx);
    const patch: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: data.updatedBy,
    };
    if (data.status !== undefined) patch.status = data.status;
    if (data.startedAt !== undefined) patch.startedAt = data.startedAt;
    if (data.completedAt !== undefined) patch.completedAt = data.completedAt;
    if (data.cancelledAt !== undefined) patch.cancelledAt = data.cancelledAt;
    if (data.recipientCount !== undefined) {
      patch.recipientCount = data.recipientCount;
    }
    if (data.sentCount !== undefined) patch.sentCount = data.sentCount;
    if (data.failedCount !== undefined) patch.failedCount = data.failedCount;

    const result = await writer.notificationCampaign.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: patch,
    });
    if (result.count === 0) {
      throw new VersionConflict('NotificationCampaign', id, expectedVersion);
    }
    const reloaded = await writer.notificationCampaign.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflict('NotificationCampaign', id, expectedVersion);
    }
    return reloaded;
  }

  // -------------------------------------------------------------------------
  // Recipients (APPEND_ONLY)
  // -------------------------------------------------------------------------

  public async appendRecipients(
    tx: PrismaTx | undefined,
    rows: readonly AppendCampaignRecipientRow[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const writer = this.resolve(tx);
    const result = await writer.notificationCampaignRecipient.createMany({
      data: rows.map((r) => ({
        schoolId: r.schoolId,
        notificationCampaignId: r.notificationCampaignId,
        recipientUserId: r.recipientUserId,
        recipientAudience: r.recipientAudience,
        resolutionReason: r.resolutionReason ?? null,
        skipped: r.skipped,
        skipReason: r.skipReason ?? null,
        createdBy: r.createdBy ?? null,
      })),
    });
    return result.count;
  }

  public async listRecipients(
    tx: PrismaTx | undefined,
    schoolId: string,
    campaignId: string,
    filters: ListCampaignRecipientsFilters,
  ): Promise<{
    readonly rows: readonly NotificationCampaignRecipientRow[];
    readonly nextCursor: string | null;
  }> {
    const reader = this.resolve(tx);
    const rows = await reader.notificationCampaignRecipient.findMany({
      where: { schoolId, notificationCampaignId: campaignId },
      orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
      take: filters.limit + 1,
      ...(filters.cursor !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: filters.cursor } }, skip: 1 }
        : {}),
    });
    const nextCursor =
      rows.length > filters.limit ? (rows.pop()?.id ?? null) : null;
    return { rows, nextCursor };
  }

  public async recipientSummary(
    tx: PrismaTx | undefined,
    schoolId: string,
    campaignId: string,
  ): Promise<CampaignRecipientSummary> {
    const reader = this.resolve(tx);
    const [total, skippedTotal, groups] = await Promise.all([
      reader.notificationCampaignRecipient.count({
        where: { schoolId, notificationCampaignId: campaignId },
      }),
      reader.notificationCampaignRecipient.count({
        where: { schoolId, notificationCampaignId: campaignId, skipped: true },
      }),
      reader.notificationCampaignRecipient.groupBy({
        by: ['skipReason'],
        where: { schoolId, notificationCampaignId: campaignId, skipped: true },
        _count: { _all: true },
      }),
    ]);

    const byReason = {
      OPTED_OUT: 0,
      QUIET_HOURS: 0,
      QUOTA_EXHAUSTED: 0,
      CHANNEL_DISABLED: 0,
    };
    for (const g of groups) {
      const reason = g.skipReason;
      if (reason === null || reason === undefined) continue;
      if (reason in byReason) {
        (byReason as Record<string, number>)[reason] = g._count._all;
      }
    }

    return { total, skipped: skippedTotal, byReason };
  }
}
