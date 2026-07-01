/**
 * SchoolUsageRepository — persistence for the `school_usage` singleton row
 * (one per school). TENANT_OWNED, composite PK, NOT soft-deleted (counter
 * deletion would orphan the running window), NOT APPEND_ONLY (counters
 * mutate on every consume).
 *
 * Cross-tenant operations from super-admin endpoints bypass the tenant
 * scope via `__schoolosCtx.bypassTenantScope`.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SchoolUsageRow } from '../subscription.types';

export interface CreateSchoolUsageInput {
  readonly schoolId: string;
  readonly usagePeriodStart: Date;
  readonly usagePeriodEnd: Date;
}

export type UsageCounterColumn =
  | 'studentCount'
  | 'staffCount'
  | 'branchCount'
  | 'smsUsedThisPeriod'
  | 'whatsappUsedThisPeriod'
  | 'emailUsedThisPeriod'
  | 'storageBytesUsed';

export interface SetUsageInput {
  readonly studentCount?: number;
  readonly staffCount?: number;
  readonly branchCount?: number;
  readonly smsUsedThisPeriod?: number;
  readonly whatsappUsedThisPeriod?: number;
  readonly emailUsedThisPeriod?: number;
  readonly storageBytesUsed?: bigint;
  readonly lastRecomputedAt?: Date | null;
}

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'super-admin usage op' }),
  }),
});

@Injectable()
export class SchoolUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findBySchool(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<SchoolUsageRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.schoolUsage.findFirst({
      where: { schoolId },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as unknown as RawUsage);
  }

  public async create(
    input: CreateSchoolUsageInput,
    tx?: PrismaTx,
  ): Promise<SchoolUsageRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.schoolUsage.create({
      data: {
        id: randomUUID(),
        schoolId: input.schoolId,
        usagePeriodStart: input.usagePeriodStart,
        usagePeriodEnd: input.usagePeriodEnd,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(created as unknown as RawUsage);
  }

  /**
   * Atomic delta application — used by consume / release / bulk increment.
   * Adds `by` to the chosen column. Bumps `version`. Returns reloaded row.
   * Caller passes a fresh tx for the same-row read.
   */
  public async incrementColumn(
    schoolId: string,
    id: string,
    column: UsageCounterColumn,
    by: number | bigint,
    tx: PrismaTx,
  ): Promise<SchoolUsageRow> {
    const writer = tx;
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      [column]: { increment: by },
      version: { increment: 1 },
      updatedBy: userId,
    };
    await writer.schoolUsage.update({
      where: { schoolId_id: { schoolId, id } },
      data: data as never,
    });
    const reloaded = await writer.schoolUsage.findUnique({
      where: { schoolId_id: { schoolId, id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('SchoolUsage', id, 0);
    }
    return mapRow(reloaded as unknown as RawUsage);
  }

  /**
   * Full rewrite (recompute). Bumps `version` and stamps lastRecomputedAt.
   */
  public async setCounters(
    schoolId: string,
    id: string,
    expectedVersion: number,
    patch: SetUsageInput,
    tx: PrismaTx,
  ): Promise<SchoolUsageRow> {
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.studentCount !== undefined) data.studentCount = patch.studentCount;
    if (patch.staffCount !== undefined) data.staffCount = patch.staffCount;
    if (patch.branchCount !== undefined) data.branchCount = patch.branchCount;
    if (patch.smsUsedThisPeriod !== undefined) data.smsUsedThisPeriod = patch.smsUsedThisPeriod;
    if (patch.whatsappUsedThisPeriod !== undefined) data.whatsappUsedThisPeriod = patch.whatsappUsedThisPeriod;
    if (patch.emailUsedThisPeriod !== undefined) data.emailUsedThisPeriod = patch.emailUsedThisPeriod;
    if (patch.storageBytesUsed !== undefined) data.storageBytesUsed = patch.storageBytesUsed;
    if (patch.lastRecomputedAt !== undefined) data.lastRecomputedAt = patch.lastRecomputedAt;

    const result = await tx.schoolUsage.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: data as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('SchoolUsage', id, expectedVersion);
    }
    const reloaded = await tx.schoolUsage.findUnique({
      where: { schoolId_id: { schoolId, id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('SchoolUsage', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawUsage);
  }
}

interface RawUsage {
  id: string;
  schoolId: string;
  studentCount: number;
  staffCount: number;
  branchCount: number;
  smsUsedThisPeriod: number;
  whatsappUsedThisPeriod: number;
  emailUsedThisPeriod: number;
  storageBytesUsed: bigint;
  usagePeriodStart: Date;
  usagePeriodEnd: Date;
  lastRecomputedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: RawUsage): SchoolUsageRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentCount: row.studentCount,
    staffCount: row.staffCount,
    branchCount: row.branchCount,
    smsUsedThisPeriod: row.smsUsedThisPeriod,
    whatsappUsedThisPeriod: row.whatsappUsedThisPeriod,
    emailUsedThisPeriod: row.emailUsedThisPeriod,
    storageBytesUsed: row.storageBytesUsed,
    usagePeriodStart: row.usagePeriodStart,
    usagePeriodEnd: row.usagePeriodEnd,
    lastRecomputedAt: row.lastRecomputedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
