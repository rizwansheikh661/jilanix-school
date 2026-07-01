/**
 * SubscriptionRepository — persistence for the `subscriptions` table
 * (TENANT_OWNED, soft-delete, version-guarded, composite PK).
 *
 * Cross-tenant operations from super-admin endpoints pass the schoolId in
 * explicitly and set `__schoolosCtx.bypassTenantScope` so the tenant-scope
 * extension does not refuse the query.
 *
 * STORED column note: `active_key` is computed by the database from
 * `(status, schoolId)`. We never write it. The UNIQUE index on `active_key`
 * is what guarantees "at most one ACTIVE row per school"; we still take the
 * application-side belt-and-suspenders of soft-cancelling the previous
 * ACTIVE row before inserting a new one.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  BillingCycleValue,
  SubscriptionRow,
  SubscriptionStatusValue,
} from '../subscription.types';

export interface CreateSubscriptionInput {
  readonly schoolId: string;
  readonly planId: string;
  readonly status: SubscriptionStatusValue;
  readonly billingCycle: BillingCycleValue;
  readonly currency?: string;
  readonly monthlyPrice?: number;
  readonly yearlyPrice?: number;
  readonly assignedBy?: string | null;
  readonly assignedAt?: Date | null;
  readonly startedAt?: Date | null;
  readonly expiryDate?: Date | null;
  readonly trialEndsAt?: Date | null;
  readonly lastRenewedAt?: Date | null;
  readonly nextRenewalAt?: Date | null;
  readonly autoRenew?: boolean;
}

export interface UpdateSubscriptionInput {
  readonly status?: SubscriptionStatusValue;
  readonly billingCycle?: BillingCycleValue;
  readonly monthlyPrice?: number;
  readonly yearlyPrice?: number;
  readonly currency?: string;
  readonly startedAt?: Date | null;
  readonly expiryDate?: Date | null;
  readonly cancelledAt?: Date | null;
  readonly cancellationReason?: string | null;
  readonly trialEndsAt?: Date | null;
  readonly lastRenewedAt?: Date | null;
  readonly nextRenewalAt?: Date | null;
  readonly autoRenew?: boolean;
}

export interface ListExpiringArgs {
  readonly horizon: Date;
  readonly limit: number;
}

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'super-admin subscription op' }),
  }),
});

@Injectable()
export class SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findById(
    schoolId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<SubscriptionRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.subscription.findFirst({
      where: { schoolId, id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as unknown as RawSubscription);
  }

  public async findActiveBySchool(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<SubscriptionRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.subscription.findFirst({
      where: {
        schoolId,
        status: { in: ['PENDING', 'TRIAL', 'ACTIVE', 'EXPIRING'] },
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as unknown as RawSubscription);
  }

  public async listBySchool(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<readonly SubscriptionRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.subscription.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return rows.map((r) => mapRow(r as unknown as RawSubscription));
  }

  public async listExpiring(
    args: ListExpiringArgs,
    tx?: PrismaTx,
  ): Promise<readonly SubscriptionRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL', 'EXPIRING'] },
        expiryDate: { not: null, lte: args.horizon },
        deletedAt: null,
      },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
      take: args.limit,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return rows.map((r) => mapRow(r as unknown as RawSubscription));
  }

  public async create(
    input: CreateSubscriptionInput,
    tx?: PrismaTx,
  ): Promise<SubscriptionRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      id: randomUUID(),
      schoolId: input.schoolId,
      planId: input.planId,
      status: input.status,
      billingCycle: input.billingCycle,
      currency: input.currency ?? 'INR',
      monthlyPrice: input.monthlyPrice ?? 0,
      yearlyPrice: input.yearlyPrice ?? 0,
      assignedBy: input.assignedBy ?? userId,
      assignedAt: input.assignedAt ?? new Date(),
      startedAt: input.startedAt ?? null,
      expiryDate: input.expiryDate ?? null,
      trialEndsAt: input.trialEndsAt ?? null,
      lastRenewedAt: input.lastRenewedAt ?? null,
      nextRenewalAt: input.nextRenewalAt ?? null,
      autoRenew: input.autoRenew ?? false,
      createdBy: userId,
      updatedBy: userId,
    };
    const created = await writer.subscription.create({
      data: data as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(created as unknown as RawSubscription);
  }

  public async update(
    schoolId: string,
    id: string,
    expectedVersion: number,
    patch: UpdateSubscriptionInput,
    tx?: PrismaTx,
  ): Promise<SubscriptionRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.billingCycle !== undefined) data.billingCycle = patch.billingCycle;
    if (patch.monthlyPrice !== undefined) data.monthlyPrice = patch.monthlyPrice;
    if (patch.yearlyPrice !== undefined) data.yearlyPrice = patch.yearlyPrice;
    if (patch.currency !== undefined) data.currency = patch.currency;
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.expiryDate !== undefined) data.expiryDate = patch.expiryDate;
    if (patch.cancelledAt !== undefined) data.cancelledAt = patch.cancelledAt;
    if (patch.cancellationReason !== undefined) data.cancellationReason = patch.cancellationReason;
    if (patch.trialEndsAt !== undefined) data.trialEndsAt = patch.trialEndsAt;
    if (patch.lastRenewedAt !== undefined) data.lastRenewedAt = patch.lastRenewedAt;
    if (patch.nextRenewalAt !== undefined) data.nextRenewalAt = patch.nextRenewalAt;
    if (patch.autoRenew !== undefined) data.autoRenew = patch.autoRenew;

    const result = await writer.subscription.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('Subscription', id, expectedVersion);
    }
    const reloaded = await writer.subscription.findUnique({
      where: { schoolId_id: { schoolId, id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('Subscription', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawSubscription);
  }

  public async softDelete(
    schoolId: string,
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.subscription.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        version: { increment: 1 },
        updatedBy: userId,
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('Subscription', id, expectedVersion);
    }
  }
}

interface RawSubscription {
  id: string;
  schoolId: string;
  planId: string;
  status: SubscriptionStatusValue;
  billingCycle: BillingCycleValue;
  currency: string;
  monthlyPrice: { toString(): string } | number;
  yearlyPrice: { toString(): string } | number;
  assignedBy: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  expiryDate: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  trialEndsAt: Date | null;
  lastRenewedAt: Date | null;
  nextRenewalAt: Date | null;
  autoRenew: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function decimalToNumber(val: { toString(): string } | number): number {
  if (typeof val === 'number') return val;
  const n = Number(val.toString());
  return Number.isFinite(n) ? n : 0;
}

function mapRow(row: RawSubscription): SubscriptionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    planId: row.planId,
    status: row.status,
    billingCycle: row.billingCycle,
    currency: row.currency,
    monthlyPrice: decimalToNumber(row.monthlyPrice),
    yearlyPrice: decimalToNumber(row.yearlyPrice),
    assignedBy: row.assignedBy,
    assignedAt: row.assignedAt,
    startedAt: row.startedAt,
    expiryDate: row.expiryDate,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    trialEndsAt: row.trialEndsAt,
    lastRenewedAt: row.lastRenewedAt,
    nextRenewalAt: row.nextRenewalAt,
    autoRenew: row.autoRenew,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
