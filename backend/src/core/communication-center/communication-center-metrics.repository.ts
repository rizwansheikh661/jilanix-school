/**
 * CommunicationCenterMetricsRepository — read-only aggregations over the
 * existing `notification_messages` table. Sprint 19 deliberately adds NO
 * new storage; this repo is a thin layer over Prisma `groupBy` /
 * `count` so multiple orchestration services (dashboard, monitoring,
 * analytics) share a single Prisma surface.
 *
 * Filters mirror `ListNotificationMessagesFilters` plus the
 * "operational module" filter on `aggregateType` (e.g. `Homework`,
 * `FeeInvoice`, `Attendance`).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';
import type {
  NotificationAudienceValue,
  NotificationChannelValue,
  NotificationMessageStatusValue,
} from '../notifications/notifications.constants';

export interface CommunicationFilters {
  readonly from?: Date;
  readonly to?: Date;
  readonly channel?: NotificationChannelValue;
  readonly status?: NotificationMessageStatusValue;
  readonly aggregateType?: string;
  readonly recipientAudience?: NotificationAudienceValue;
}

export interface ByStatusRow {
  readonly status: NotificationMessageStatusValue;
  readonly count: number;
}

export interface ByChannelRow {
  readonly channel: NotificationChannelValue;
  readonly count: number;
}

@Injectable()
export class CommunicationCenterMetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where(schoolId: string, filters: CommunicationFilters): Record<string, unknown> {
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filters.channel !== undefined) where.channel = filters.channel;
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.aggregateType !== undefined) where.aggregateType = filters.aggregateType;
    if (filters.recipientAudience !== undefined) {
      where.recipientAudience = filters.recipientAudience;
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (filters.from !== undefined) createdAt.gte = filters.from;
      if (filters.to !== undefined) createdAt.lte = filters.to;
      where.createdAt = createdAt;
    }
    return where;
  }

  public async count(schoolId: string, filters: CommunicationFilters): Promise<number> {
    return this.prisma.client.notificationMessage.count({
      where: this.where(schoolId, filters),
    });
  }

  public async countScheduled(
    schoolId: string,
    filters: CommunicationFilters,
    now: Date,
  ): Promise<number> {
    const where = this.where(schoolId, filters);
    where.status = 'QUEUED';
    where.scheduledAt = { gt: now };
    return this.prisma.client.notificationMessage.count({ where });
  }

  public async groupByStatus(
    schoolId: string,
    filters: CommunicationFilters,
  ): Promise<readonly ByStatusRow[]> {
    const rows = await this.prisma.client.notificationMessage.groupBy({
      by: ['status'],
      where: this.where(schoolId, filters),
      _count: { _all: true },
    });
    return rows.map((r) => ({
      status: r.status as NotificationMessageStatusValue,
      count: r._count._all,
    }));
  }

  public async groupByChannel(
    schoolId: string,
    filters: CommunicationFilters,
  ): Promise<readonly ByChannelRow[]> {
    const rows = await this.prisma.client.notificationMessage.groupBy({
      by: ['channel'],
      where: this.where(schoolId, filters),
      _count: { _all: true },
    });
    return rows.map((r) => ({
      channel: r.channel as NotificationChannelValue,
      count: r._count._all,
    }));
  }

  public async sumAttempts(
    schoolId: string,
    filters: CommunicationFilters,
  ): Promise<number> {
    const result = await this.prisma.client.notificationMessage.aggregate({
      where: this.where(schoolId, filters),
      _sum: { attemptCount: true },
    });
    return result._sum.attemptCount ?? 0;
  }
}
