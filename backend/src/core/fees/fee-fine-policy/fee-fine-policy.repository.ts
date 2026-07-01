/**
 * FeeLateFinePolicyRepository — persistence for `fee_late_fine_policies`.
 *
 * Soft-deleted rows are filtered out of all reads. Active-uniqueness on
 * `code` is enforced by the partial unique index on the table; the service
 * still performs an explicit duplicate-code guard for friendlier errors.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeeFinePolicyTypeValue } from '../fees.constants';
import type { FeeLateFinePolicyRow } from '../fees.types';

export interface CreateFeeLateFinePolicyInput {
  readonly code: string;
  readonly name: string;
  readonly type: FeeFinePolicyTypeValue;
  readonly value: number;
  readonly gracePeriodDays: number;
  readonly capAmount?: number | null;
  readonly description?: string | null;
}

export interface UpdateFeeLateFinePolicyInput {
  readonly code?: string;
  readonly name?: string;
  readonly type?: FeeFinePolicyTypeValue;
  readonly value?: number;
  readonly gracePeriodDays?: number;
  readonly capAmount?: number | null;
  readonly description?: string | null;
}

export interface ListFeeLateFinePolicyArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly type?: FeeFinePolicyTypeValue;
  readonly nameContains?: string;
}

@Injectable()
export class FeeLateFinePolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeLateFinePolicyRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeLateFinePolicyRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeLateFinePolicy.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<FeeLateFinePolicyRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeLateFinePolicy.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(
    args: ListFeeLateFinePolicyArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeLateFinePolicyRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.type !== undefined) where.type = args.type;
    if (args.nameContains !== undefined && args.nameContains.length > 0) {
      where.name = { contains: args.nameContains };
    }
    const rows = await reader.feeLateFinePolicy.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(
    input: CreateFeeLateFinePolicyInput,
    tx?: PrismaTx,
  ): Promise<FeeLateFinePolicyRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.feeLateFinePolicy.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        type: input.type,
        value: input.value,
        gracePeriodDays: input.gracePeriodDays,
        capAmount: input.capAmount ?? null,
        description: input.description ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateFeeLateFinePolicyInput,
    tx?: PrismaTx,
  ): Promise<FeeLateFinePolicyRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.value !== undefined) data.value = input.value;
    if (input.gracePeriodDays !== undefined) {
      data.gracePeriodDays = input.gracePeriodDays;
    }
    if (input.capAmount !== undefined) data.capAmount = input.capAmount;
    if (input.description !== undefined) data.description = input.description;
    const result = await writer.feeLateFinePolicy.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeLateFinePolicy', id, expectedVersion);
    }
    const reloaded = await writer.feeLateFinePolicy.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeLateFinePolicy', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.feeLateFinePolicy.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeLateFinePolicy', id, expectedVersion);
    }
  }

  /** Count active structure lines that reference the given policy. */
  public async countActiveStructureLineRefs(
    policyId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    return reader.feeStructureLine.count({
      where: {
        schoolId,
        lateFinePolicyId: policyId,
        deletedAt: null,
        structure: {
          deletedAt: null,
          status: { not: 'ARCHIVED' },
        },
      },
    });
  }
}

interface RawPolicy {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  type: FeeFinePolicyTypeValue;
  value: unknown;
  gracePeriodDays: number;
  capAmount: unknown | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapRow(row: RawPolicy): FeeLateFinePolicyRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    type: row.type,
    value: toNumber(row.value),
    gracePeriodDays: row.gracePeriodDays,
    capAmount: row.capAmount === null ? null : toNumber(row.capAmount),
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

export const __test__ = { toNumber };
