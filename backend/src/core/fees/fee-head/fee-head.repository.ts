/**
 * FeeHeadRepository — persistence for `fee_heads` rows.
 *
 * Soft-deleted (`deletedAt`); active-uniqueness on `(schoolId, code)` is
 * enforced at the DB level by a hand-edited partial unique on the STORED
 * `deleted_at_key` column. The repo additionally pre-checks for duplicates
 * to surface a friendlier domain error before the DB constraint trips.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeeHeadCategoryValue } from '../fees.constants';
import type { FeeHeadRow } from '../fees.types';

export interface CreateFeeHeadInput {
  readonly code: string;
  readonly name: string;
  readonly category: FeeHeadCategoryValue;
  readonly hsnSac?: string | null;
  readonly isRefundable?: boolean;
  readonly isTaxable?: boolean;
  readonly defaultAmount?: number | null;
  readonly glAccount?: string | null;
  readonly description?: string | null;
}

export interface UpdateFeeHeadInput {
  readonly code?: string;
  readonly name?: string;
  readonly category?: FeeHeadCategoryValue;
  readonly hsnSac?: string | null;
  readonly isRefundable?: boolean;
  readonly isTaxable?: boolean;
  readonly defaultAmount?: number | null;
  readonly glAccount?: string | null;
  readonly description?: string | null;
}

export interface ListFeeHeadArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly category?: FeeHeadCategoryValue;
  readonly nameContains?: string;
}

@Injectable()
export class FeeHeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeHeadRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeHeadRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeHead.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<FeeHeadRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeHead.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(
    args: ListFeeHeadArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeHeadRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.category !== undefined) where.category = args.category;
    if (args.nameContains !== undefined && args.nameContains.length > 0) {
      where.name = { contains: args.nameContains };
    }
    const rows = await reader.feeHead.findMany({
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
    input: CreateFeeHeadInput,
    tx?: PrismaTx,
  ): Promise<FeeHeadRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.feeHead.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        category: input.category,
        hsnSac: input.hsnSac ?? null,
        ...(input.isRefundable !== undefined
          ? { isRefundable: input.isRefundable }
          : {}),
        ...(input.isTaxable !== undefined ? { isTaxable: input.isTaxable } : {}),
        defaultAmount: input.defaultAmount ?? null,
        glAccount: input.glAccount ?? null,
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
    input: UpdateFeeHeadInput,
    tx?: PrismaTx,
  ): Promise<FeeHeadRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.name = input.name;
    if (input.category !== undefined) data.category = input.category;
    if (input.hsnSac !== undefined) data.hsnSac = input.hsnSac;
    if (input.isRefundable !== undefined) data.isRefundable = input.isRefundable;
    if (input.isTaxable !== undefined) data.isTaxable = input.isTaxable;
    if (input.defaultAmount !== undefined) data.defaultAmount = input.defaultAmount;
    if (input.glAccount !== undefined) data.glAccount = input.glAccount;
    if (input.description !== undefined) data.description = input.description;
    const result = await writer.feeHead.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeHead', id, expectedVersion);
    }
    const reloaded = await writer.feeHead.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeHead', id, expectedVersion);
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
    const result = await writer.feeHead.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeHead', id, expectedVersion);
    }
  }

  /** Count of non-deleted structure lines on non-archived, non-deleted structures. */
  public async countActiveStructureLineRefs(
    headId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    return reader.feeStructureLine.count({
      where: {
        schoolId,
        feeHeadId: headId,
        deletedAt: null,
        structure: {
          status: { not: 'ARCHIVED' },
          deletedAt: null,
        },
      },
    });
  }
}

interface RawFeeHead {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  category: string;
  hsnSac: string | null;
  isRefundable: boolean;
  isTaxable: boolean;
  defaultAmount: unknown | null;
  glAccount: string | null;
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

function mapRow(row: RawFeeHead): FeeHeadRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    category: row.category as FeeHeadCategoryValue,
    hsnSac: row.hsnSac,
    isRefundable: row.isRefundable,
    isTaxable: row.isTaxable,
    defaultAmount: row.defaultAmount === null ? null : toNumber(row.defaultAmount),
    glAccount: row.glAccount,
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
