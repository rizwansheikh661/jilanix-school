/**
 * FeeDiscountRepository — persistence for `fee_discounts`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeeDiscountTypeValue } from '../fees.constants';
import type { FeeDiscountRow } from '../fees.types';

export interface CreateFeeDiscountInput {
  readonly code: string;
  readonly name: string;
  readonly type: FeeDiscountTypeValue;
  readonly value: number;
  readonly maxAmount?: number | null;
  readonly appliesToFeeHeadId?: string | null;
  readonly description?: string | null;
  readonly requiresApprovalAbove?: number | null;
}

export interface UpdateFeeDiscountInput {
  readonly code?: string;
  readonly name?: string;
  readonly type?: FeeDiscountTypeValue;
  readonly value?: number;
  readonly maxAmount?: number | null;
  readonly appliesToFeeHeadId?: string | null;
  readonly description?: string | null;
  readonly requiresApprovalAbove?: number | null;
}

export interface ListFeeDiscountArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly type?: FeeDiscountTypeValue;
  readonly appliesToFeeHeadId?: string;
}

@Injectable()
export class FeeDiscountRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeDiscountRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeDiscountRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeDiscount.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<FeeDiscountRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeDiscount.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(
    args: ListFeeDiscountArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeDiscountRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.type !== undefined) where.type = args.type;
    if (args.appliesToFeeHeadId !== undefined) {
      where.appliesToFeeHeadId = args.appliesToFeeHeadId;
    }
    const rows = await reader.feeDiscount.findMany({
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
    input: CreateFeeDiscountInput,
    tx?: PrismaTx,
  ): Promise<FeeDiscountRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.feeDiscount.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        type: input.type,
        value: input.value,
        maxAmount: input.maxAmount ?? null,
        appliesToFeeHeadId: input.appliesToFeeHeadId ?? null,
        description: input.description ?? null,
        requiresApprovalAbove: input.requiresApprovalAbove ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateFeeDiscountInput,
    tx?: PrismaTx,
  ): Promise<FeeDiscountRow> {
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
    if (input.maxAmount !== undefined) data.maxAmount = input.maxAmount;
    if (input.appliesToFeeHeadId !== undefined) {
      data.appliesToFeeHeadId = input.appliesToFeeHeadId;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.requiresApprovalAbove !== undefined) {
      data.requiresApprovalAbove = input.requiresApprovalAbove;
    }
    const result = await writer.feeDiscount.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeDiscount', id, expectedVersion);
    }
    const reloaded = await writer.feeDiscount.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeDiscount', id, expectedVersion);
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
    const result = await writer.feeDiscount.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeDiscount', id, expectedVersion);
    }
  }

  public async countActiveStudentAssignments(
    discountId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    return reader.studentFeeDiscount.count({
      where: { schoolId, feeDiscountId: discountId, deletedAt: null },
    });
  }
}

interface RawFeeDiscount {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  type: FeeDiscountTypeValue;
  value: unknown;
  maxAmount: unknown | null;
  appliesToFeeHeadId: string | null;
  description: string | null;
  requiresApprovalAbove: unknown | null;
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

function mapRow(row: RawFeeDiscount): FeeDiscountRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    type: row.type,
    value: toNumber(row.value),
    maxAmount: row.maxAmount === null ? null : toNumber(row.maxAmount),
    appliesToFeeHeadId: row.appliesToFeeHeadId,
    description: row.description,
    requiresApprovalAbove:
      row.requiresApprovalAbove === null
        ? null
        : toNumber(row.requiresApprovalAbove),
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
