/**
 * BillingAuditRepository — persistence for `billing_audits`. APPEND_ONLY:
 * rows are only ever inserted (never updated or soft-deleted) and form the
 * chronological billing-specific trail. The global AuditService captures
 * cross-cutting events; this table is the admin-facing billing log.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { BillingAuditAction } from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform billing audit op' }),
  }),
});

export interface BillingAuditRow {
  readonly id: string;
  readonly accountId: string | null;
  readonly schoolId: string;
  readonly action: BillingAuditAction;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly actorUserId: string | null;
  readonly summary: string | null;
  readonly metadata: unknown;
  readonly occurredAt: Date;
}

export interface AppendBillingAuditInput {
  readonly accountId?: string | null;
  readonly schoolId: string;
  readonly action: BillingAuditAction;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly actorUserId?: string | null;
  readonly summary?: string | null;
  readonly metadata?: unknown;
}

export interface ListBillingAuditsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly schoolId?: string;
  readonly accountId?: string;
  readonly action?: BillingAuditAction;
  readonly resourceType?: string;
  readonly resourceId?: string;
}

@Injectable()
export class BillingAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async append(
    input: AppendBillingAuditInput,
    tx?: PrismaTx,
  ): Promise<BillingAuditRow> {
    const writer = this.resolve(tx);
    const actorUserId = input.actorUserId ?? this.currentUserId();
    const created = await writer.billingAudit.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId ?? null,
        schoolId: input.schoolId,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        actorUserId: actorUserId,
        summary: input.summary ?? null,
        metadata: (input.metadata ?? null) as never,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(created as RawBillingAudit);
  }

  public async list(
    args: ListBillingAuditsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly BillingAuditRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = {};
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.accountId !== undefined) where.accountId = args.accountId;
    if (args.action !== undefined) where.action = args.action;
    if (args.resourceType !== undefined) where.resourceType = args.resourceType;
    if (args.resourceId !== undefined) where.resourceId = args.resourceId;
    const rows = await reader.billingAudit.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { id: args.cursorId }, skip: 1 }
        : {}),
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? (last as { id: string }).id : null;
    return {
      rows: trimmed.map((r) => mapRow(r as RawBillingAudit)),
      nextCursorId,
    };
  }
}

// ---------------------------------------------------------------------------
// Raw + mapper
// ---------------------------------------------------------------------------
interface RawBillingAudit {
  id: string;
  accountId: string | null;
  schoolId: string;
  action: BillingAuditAction;
  resourceType: string | null;
  resourceId: string | null;
  actorUserId: string | null;
  summary: string | null;
  metadata: unknown;
  occurredAt: Date;
}

function mapRow(row: RawBillingAudit): BillingAuditRow {
  return {
    id: row.id,
    accountId: row.accountId,
    schoolId: row.schoolId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorUserId: row.actorUserId,
    summary: row.summary,
    metadata: row.metadata,
    occurredAt: row.occurredAt,
  };
}
