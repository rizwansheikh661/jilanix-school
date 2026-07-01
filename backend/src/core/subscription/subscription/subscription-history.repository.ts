/**
 * SubscriptionHistoryRepository — APPEND_ONLY journal of every state change
 * applied to a Subscription. No update / no delete / no version.
 *
 * History rows are always written from inside the same transaction as the
 * Subscription mutation that produced them.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  SubscriptionActionValue,
  SubscriptionHistoryRow,
} from '../subscription.types';

export interface RecordHistoryInput {
  readonly schoolId: string;
  readonly subscriptionId: string;
  readonly action: SubscriptionActionValue;
  readonly fromPlanId?: string | null;
  readonly toPlanId?: string | null;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly actorReason?: string | null;
  readonly metadataJson?: Record<string, unknown> | null;
}

export interface ListHistoryArgs {
  readonly schoolId: string;
  readonly subscriptionId?: string;
  readonly limit: number;
  readonly cursorId?: string;
}

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'super-admin subscription history' }),
  }),
});

@Injectable()
export class SubscriptionHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async record(
    input: RecordHistoryInput,
    tx?: PrismaTx,
  ): Promise<SubscriptionHistoryRow> {
    const writer = this.resolve(tx);
    const userId = RequestContextRegistry.peek()?.userId ?? null;
    const row = await writer.subscriptionHistory.create({
      data: {
        id: randomUUID(),
        schoolId: input.schoolId,
        subscriptionId: input.subscriptionId,
        action: input.action,
        fromPlanId: input.fromPlanId ?? null,
        toPlanId: input.toPlanId ?? null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        actorUserId: userId,
        actorReason: input.actorReason ?? null,
        metadataJson: (input.metadataJson ?? null) as never,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(row as unknown as RawHistory);
  }

  public async list(
    args: ListHistoryArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly SubscriptionHistoryRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const take = args.limit + 1;
    const rows = await reader.subscriptionHistory.findMany({
      where: {
        schoolId: args.schoolId,
        ...(args.subscriptionId !== undefined ? { subscriptionId: args.subscriptionId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId: args.schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? (last as { id: string }).id : null;
    return {
      rows: trimmed.map((r) => mapRow(r as unknown as RawHistory)),
      nextCursorId,
    };
  }
}

interface RawHistory {
  id: string;
  schoolId: string;
  subscriptionId: string;
  action: SubscriptionActionValue;
  fromPlanId: string | null;
  toPlanId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  actorReason: string | null;
  metadataJson: unknown;
  occurredAt: Date;
}

function mapRow(row: RawHistory): SubscriptionHistoryRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    subscriptionId: row.subscriptionId,
    action: row.action,
    fromPlanId: row.fromPlanId,
    toPlanId: row.toPlanId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actorUserId: row.actorUserId,
    actorReason: row.actorReason,
    metadataJson:
      row.metadataJson !== null && typeof row.metadataJson === 'object'
        ? (row.metadataJson as Record<string, unknown>)
        : null,
    occurredAt: row.occurredAt,
  };
}
