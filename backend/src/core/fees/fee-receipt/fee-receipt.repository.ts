/**
 * FeeReceiptRepository — persistence for `fee_receipts`.
 *
 * The receipt row itself is created inline by `fee-payment.service.ts` during
 * payment capture. This repository owns the READ and CANCEL operations and
 * exposes a version-checked cancel helper for the service-level orchestrator.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeeReceiptStatusValue } from '../fees.constants';
import { FeesVersionConflictError } from '../fees.errors';
import type {
  FeePaymentAllocationRow,
  FeeReceiptRow,
  FeeReceiptWithLines,
} from '../fees.types';

export interface ListFeeReceiptArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly studentId?: string;
  readonly status?: FeeReceiptStatusValue;
  readonly from?: Date;
  readonly to?: Date;
}

export interface CancelFeeReceiptInput {
  readonly id: string;
  readonly schoolId: string;
  readonly version: number;
  readonly cancelledBy: string | null;
  readonly cancellationReason: string;
}

@Injectable()
export class FeeReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeReceiptRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    schoolId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeReceiptRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.feeReceipt.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (row === null) return null;
    return mapReceipt(row as unknown as RawReceipt);
  }

  public async findByIdInTx(
    tx: PrismaTx,
    schoolId: string,
    id: string,
  ): Promise<FeeReceiptRow | null> {
    const row = await tx.feeReceipt.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (row === null) return null;
    return mapReceipt(row as unknown as RawReceipt);
  }

  /**
   * Receipt + the allocations from its underlying payment. Used for the
   * detail / reprint endpoint.
   */
  public async findDetailById(
    schoolId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeReceiptWithLines | null> {
    const reader = this.resolve(tx);
    const row = await reader.feeReceipt.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (row === null) return null;
    const receipt = mapReceipt(row as unknown as RawReceipt);
    const allocs = await reader.feePaymentAllocation.findMany({
      where: { schoolId, feePaymentId: receipt.feePaymentId },
      orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }],
    });
    return {
      ...receipt,
      allocations: allocs.map((a) => mapAllocation(a as unknown as RawAllocation)),
    };
  }

  public async list(
    args: ListFeeReceiptArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeReceiptRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.status !== undefined) where.status = args.status;
    if (args.from !== undefined || args.to !== undefined) {
      const range: Record<string, unknown> = {};
      if (args.from !== undefined) range.gte = args.from;
      if (args.to !== undefined) range.lte = args.to;
      where.issuedAt = range;
    }
    const rows = await reader.feeReceipt.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapReceipt(r as unknown as RawReceipt)),
      nextCursorId,
    };
  }

  /**
   * Version-checked flip of an ISSUED receipt to CANCELLED. Returns the
   * reloaded row. Throws `FeesVersionConflictError` if the optimistic-lock
   * predicate matched zero rows.
   */
  public async cancel(
    tx: PrismaTx,
    input: CancelFeeReceiptInput,
  ): Promise<FeeReceiptRow> {
    const { userId } = this.tenant();
    const result = await tx.feeReceipt.updateMany({
      where: {
        schoolId: input.schoolId,
        id: input.id,
        version: input.version,
        deletedAt: null,
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: input.cancelledBy,
        cancellationReason: input.cancellationReason,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new FeesVersionConflictError('FeeReceipt', input.id);
    }
    const reloaded = await tx.feeReceipt.findFirst({
      where: { schoolId: input.schoolId, id: input.id, deletedAt: null },
    });
    if (reloaded === null) {
      throw new FeesVersionConflictError('FeeReceipt', input.id);
    }
    return mapReceipt(reloaded as unknown as RawReceipt);
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

interface RawReceipt {
  id: string;
  schoolId: string;
  feePaymentId: string;
  studentId: string;
  receiptNo: string;
  issuedAt: Date;
  issuedBy: string | null;
  totalAmount: unknown;
  status: string;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface RawAllocation {
  id: string;
  schoolId: string;
  feePaymentId: string;
  feeInvoiceId: string;
  amount: unknown;
  allocatedAt: Date;
  allocatedBy: string | null;
  reversedAt: Date | null;
  reversedBy: string | null;
  reversalReason: string | null;
}

function mapReceipt(row: RawReceipt): FeeReceiptRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    feePaymentId: row.feePaymentId,
    studentId: row.studentId,
    receiptNo: row.receiptNo,
    issuedAt: row.issuedAt,
    issuedBy: row.issuedBy,
    totalAmount: toNumber(row.totalAmount),
    status: row.status as FeeReceiptStatusValue,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    cancellationReason: row.cancellationReason,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapAllocation(row: RawAllocation): FeePaymentAllocationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    feePaymentId: row.feePaymentId,
    feeInvoiceId: row.feeInvoiceId,
    amount: toNumber(row.amount),
    allocatedAt: row.allocatedAt,
    allocatedBy: row.allocatedBy,
    reversedAt: row.reversedAt,
    reversedBy: row.reversedBy,
    reversalReason: row.reversalReason,
  };
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

export const __test__ = { toNumber };
