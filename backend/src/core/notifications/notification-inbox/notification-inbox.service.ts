/**
 * NotificationInboxService — current-user IN_APP read model for the
 * notification bell + feed (Sprint 10 Wave 8).
 *
 * Pure queries against `notification_messages` filtered to
 * `(schoolId, recipientUserId = ctx.userId, channel = IN_APP, deletedAt IS NULL)`.
 * Mark-read paths are idempotent and DO NOT emit audit rows — they are
 * high-volume user-driven inbox interactions, not operator actions.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationCategoryValue,
} from '../notifications.constants';
import {
  NotificationMessageNotFoundError,
  NotificationsModuleDisabledError,
} from '../notifications.errors';
import type { NotificationMessageRow } from '../notifications.types';

export interface InboxFeedQuery {
  readonly unread?: boolean;
  readonly category?: NotificationCategoryValue;
  readonly cursor?: string;
  readonly limit?: number;
}

const FEED_DEFAULT_LIMIT = 25;
const FEED_MAX_LIMIT = 100;

@Injectable()
export class NotificationInboxService {
  private readonly logger = new Logger(NotificationInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxPublisherService,
    // AuditService is injected per Wave 8 spec but intentionally not used —
    // inbox interactions (mark-read, mark-all-read) are high-volume user
    // actions and deliberately skip the audit log.
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {
    void this.audit;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  public async feed(query: InboxFeedQuery): Promise<{
    readonly items: readonly NotificationMessageRow[];
    readonly nextCursor: string | null;
  }> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.requireTenantUser();
    const limit = clampLimit(query.limit);
    const where: Record<string, unknown> = {
      schoolId,
      recipientUserId: userId,
      channel: 'IN_APP',
      deletedAt: null,
    };
    if (query.unread === true) where.readAt = null;
    if (query.category !== undefined) where.category = query.category;

    const client = this.prisma.client as unknown as PrismaTx;
    const rows = await client.notificationMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: query.cursor } }, skip: 1 }
        : {}),
    });

    const nextCursor = rows.length > limit ? (rows.pop()?.id ?? null) : null;
    return { items: rows, nextCursor };
  }

  public async unreadCount(): Promise<{ readonly count: number }> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.requireTenantUser();
    const client = this.prisma.client as unknown as PrismaTx;
    const count = await client.notificationMessage.count({
      where: {
        schoolId,
        recipientUserId: userId,
        channel: 'IN_APP',
        readAt: null,
        deletedAt: null,
      },
    });
    return { count };
  }

  // -------------------------------------------------------------------------
  // Mutations (idempotent; no audit on read interactions)
  // -------------------------------------------------------------------------

  public async markRead(messageId: string): Promise<NotificationMessageRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.requireTenantUser();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await tx.notificationMessage.findFirst({
        where: { schoolId, id: messageId, deletedAt: null },
      });
      if (
        current === null ||
        current.recipientUserId !== userId ||
        current.channel !== 'IN_APP'
      ) {
        throw new NotificationMessageNotFoundError(messageId);
      }
      if (current.readAt !== null) {
        return current;
      }

      const now = new Date();
      await tx.notificationMessage.update({
        where: { schoolId_id: { schoolId, id: messageId } },
        data: {
          readAt: now,
          status: 'READ' as never,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      await tx.notificationMessageEvent.create({
        data: {
          schoolId,
          notificationMessageId: messageId,
          eventType: 'READ',
          occurredAt: now,
          createdBy: userId,
        },
      });
      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.MESSAGE_READ,
        eventType: 'NotificationRead',
        aggregateType: 'NotificationMessage',
        aggregateId: messageId,
        schoolId,
        payload: {
          messageId,
          schoolId,
          recipientUserId: userId,
          channel: 'IN_APP',
        },
      });

      const reloaded = await tx.notificationMessage.findUnique({
        where: { schoolId_id: { schoolId, id: messageId } },
      });
      return reloaded as NotificationMessageRow;
    });
  }

  public async markAllRead(): Promise<{ readonly updated: number }> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.requireTenantUser();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const unread = await tx.notificationMessage.findMany({
        where: {
          schoolId,
          recipientUserId: userId,
          channel: 'IN_APP',
          readAt: null,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (unread.length === 0) return { updated: 0 };

      const now = new Date();
      const ids = unread.map((row) => row.id);

      const result = await tx.notificationMessage.updateMany({
        where: {
          schoolId,
          recipientUserId: userId,
          channel: 'IN_APP',
          id: { in: ids },
          readAt: null,
          deletedAt: null,
        },
        data: {
          readAt: now,
          status: 'READ' as never,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      // Per Wave 8 spec: append one APPEND_ONLY ledger row per id so each
      // message keeps a precise READ event. Acceptable batch size since
      // inbox is per-user.
      for (const id of ids) {
        await tx.notificationMessageEvent.create({
          data: {
            schoolId,
            notificationMessageId: id,
            eventType: 'READ',
            occurredAt: now,
            createdBy: userId,
          },
        });
      }

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.MESSAGE_READ,
        eventType: 'NotificationRead',
        aggregateType: 'NotificationMessage',
        aggregateId: userId,
        schoolId,
        payload: {
          schoolId,
          recipientUserId: userId,
          channel: 'IN_APP',
          messageIds: ids,
          bulk: true,
        },
      });

      this.logger.debug(
        `Inbox mark-all-read user=${userId} school=${schoolId} updated=${result.count}.`,
      );
      return { updated: result.count };
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireTenantUser(): { schoolId: string; userId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error(
        'NotificationInboxService requires tenant scope (schoolId).',
      );
    }
    if (ctx.userId === undefined) {
      throw new Error(
        'NotificationInboxService requires an authenticated user (userId).',
      );
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId };
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new NotificationsModuleDisabledError();
  }
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined) return FEED_DEFAULT_LIMIT;
  if (raw < 1) return 1;
  if (raw > FEED_MAX_LIMIT) return FEED_MAX_LIMIT;
  return raw;
}
