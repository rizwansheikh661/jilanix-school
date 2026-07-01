/**
 * UsageEventRepository — APPEND_ONLY delta ledger that backs the
 * SchoolUsage aggregate. One row per consume/release. Read paths only;
 * the only mutation is `record`.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { UsageEventRow } from '../subscription.types';

export interface RecordUsageEventInput {
  readonly schoolId: string;
  readonly featureKey: string;
  readonly delta: number;
  readonly sourceRef?: string | null;
}

export interface ListUsageEventsArgs {
  readonly schoolId: string;
  readonly featureKey?: string;
  readonly limit: number;
  readonly cursorId?: string;
}

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'super-admin usage event op' }),
  }),
});

@Injectable()
export class UsageEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async record(
    input: RecordUsageEventInput,
    tx?: PrismaTx,
  ): Promise<UsageEventRow> {
    const writer = this.resolve(tx);
    const userId = RequestContextRegistry.peek()?.userId ?? null;
    const row = await writer.usageEvent.create({
      data: {
        id: randomUUID(),
        schoolId: input.schoolId,
        featureKey: input.featureKey,
        delta: input.delta,
        actorUserId: userId,
        sourceRef: input.sourceRef ?? null,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(row as unknown as RawEvent);
  }

  public async list(
    args: ListUsageEventsArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly UsageEventRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const take = args.limit + 1;
    const rows = await reader.usageEvent.findMany({
      where: {
        schoolId: args.schoolId,
        ...(args.featureKey !== undefined ? { featureKey: args.featureKey } : {}),
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
      rows: trimmed.map((r) => mapRow(r as unknown as RawEvent)),
      nextCursorId,
    };
  }

  /**
   * Sum deltas per featureKey within a window — used by the recompute
   * service to re-derive the SchoolUsage aggregate.
   */
  public async sumByKey(
    schoolId: string,
    from: Date,
    to: Date,
    tx?: PrismaTx,
  ): Promise<ReadonlyMap<string, number>> {
    const reader = this.resolve(tx);
    const grouped = await reader.usageEvent.groupBy({
      by: ['featureKey'],
      where: { schoolId, occurredAt: { gte: from, lte: to } },
      _sum: { delta: true },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    } as never);
    const out = new Map<string, number>();
    for (const g of grouped as Array<{ featureKey: string; _sum: { delta: number | null } }>) {
      out.set(g.featureKey, g._sum.delta ?? 0);
    }
    return out;
  }
}

interface RawEvent {
  id: string;
  schoolId: string;
  featureKey: string;
  delta: number;
  actorUserId: string | null;
  sourceRef: string | null;
  occurredAt: Date;
}

function mapRow(row: RawEvent): UsageEventRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    featureKey: row.featureKey,
    delta: row.delta,
    actorUserId: row.actorUserId,
    sourceRef: row.sourceRef,
    occurredAt: row.occurredAt,
  };
}
