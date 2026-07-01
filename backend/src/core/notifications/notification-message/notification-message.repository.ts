/**
 * NotificationMessageRepository — persistence for the outbound message
 * envelope (`notification_messages`) and its APPEND_ONLY delivery ledger
 * (`notification_message_events`).
 *
 * Soft-deleted rows (`deletedAt IS NOT NULL`) are filtered out of read
 * paths. Status mutations use optimistic concurrency via `version`.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { VersionConflict } from '../../errors/domain-error';
import type {
  NotificationChannelValue,
  NotificationMessageStatusValue,
} from '../notifications.constants';
import type {
  NotificationMessageEventRow,
  NotificationMessageRow,
  NotificationMessageWithEvents,
} from '../notifications.types';

export interface ListNotificationMessagesFilters {
  readonly channel?: NotificationChannelValue;
  readonly status?: NotificationMessageStatusValue;
  readonly recipientUserId?: string;
  readonly eventKey?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly cursor?: string;
  readonly limit: number;
}

export interface UpdateNotificationMessageStatusInput {
  readonly status: NotificationMessageStatusValue;
  readonly sentAt?: Date | null;
  readonly deliveredAt?: Date | null;
  readonly failedAt?: Date | null;
  readonly readAt?: Date | null;
  readonly lastError?: string | null;
  readonly attemptCount?: number;
  readonly updatedBy?: string | null;
}

export interface AppendNotificationMessageEventInput {
  readonly schoolId: string;
  readonly notificationMessageId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly providerCode?: string | null;
  readonly providerMessageId?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly createdBy?: string | null;
}

@Injectable()
export class NotificationMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findById(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
    options: { includeEvents?: boolean } = {},
  ): Promise<NotificationMessageRow | NotificationMessageWithEvents | null> {
    const reader = this.resolve(tx);
    if (options.includeEvents === true) {
      const row = await reader.notificationMessage.findFirst({
        where: { schoolId, id, deletedAt: null },
        include: { events: { orderBy: { occurredAt: 'asc' } } },
      });
      return row as NotificationMessageWithEvents | null;
    }
    return reader.notificationMessage.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
  }

  public async list(
    tx: PrismaTx | undefined,
    schoolId: string,
    filters: ListNotificationMessagesFilters,
  ): Promise<{
    readonly rows: readonly NotificationMessageRow[];
    readonly nextCursor: string | null;
  }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filters.channel !== undefined) where.channel = filters.channel;
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.recipientUserId !== undefined) {
      where.recipientUserId = filters.recipientUserId;
    }
    if (filters.eventKey !== undefined) where.eventKey = filters.eventKey;
    if (filters.from !== undefined || filters.to !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (filters.from !== undefined) createdAt.gte = filters.from;
      if (filters.to !== undefined) createdAt.lte = filters.to;
      where.createdAt = createdAt;
    }

    const rows = await reader.notificationMessage.findMany({
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

  public async updateStatus(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
    expectedVersion: number,
    data: UpdateNotificationMessageStatusInput,
  ): Promise<NotificationMessageRow> {
    const writer = this.resolve(tx);
    const patch: Record<string, unknown> = {
      status: data.status,
      version: { increment: 1 },
    };
    if (data.sentAt !== undefined) patch.sentAt = data.sentAt;
    if (data.deliveredAt !== undefined) patch.deliveredAt = data.deliveredAt;
    if (data.failedAt !== undefined) patch.failedAt = data.failedAt;
    if (data.readAt !== undefined) patch.readAt = data.readAt;
    if (data.lastError !== undefined) patch.lastError = data.lastError;
    if (data.attemptCount !== undefined) patch.attemptCount = data.attemptCount;
    if (data.updatedBy !== undefined) patch.updatedBy = data.updatedBy;

    const result = await writer.notificationMessage.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: patch,
    });
    if (result.count === 0) {
      throw new VersionConflict('NotificationMessage', id, expectedVersion);
    }
    const reloaded = await writer.notificationMessage.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflict('NotificationMessage', id, expectedVersion);
    }
    return reloaded;
  }

  public async appendEvent(
    tx: PrismaTx | undefined,
    data: AppendNotificationMessageEventInput,
  ): Promise<NotificationMessageEventRow> {
    const writer = this.resolve(tx);
    return writer.notificationMessageEvent.create({
      data: {
        schoolId: data.schoolId,
        notificationMessageId: data.notificationMessageId,
        eventType: data.eventType,
        occurredAt: data.occurredAt,
        providerCode: data.providerCode ?? null,
        providerMessageId: data.providerMessageId ?? null,
        errorCode: data.errorCode ?? null,
        errorMessage: data.errorMessage ?? null,
        metadata:
          data.metadata === null || data.metadata === undefined
            ? Prisma.JsonNull
            : (data.metadata as unknown as Prisma.InputJsonValue),
        createdBy: data.createdBy ?? null,
      },
    });
  }
}
