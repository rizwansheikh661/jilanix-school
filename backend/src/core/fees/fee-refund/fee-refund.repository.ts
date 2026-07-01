/**
 * FeeRefundRepository — persistence for `fee_refunds`.
 *
 * APPEND_ONLY:
 *   - No update method (partial refunds add new rows; never mutate).
 *   - No soft-delete (no deletedAt column on the model).
 *   - No version column (no optimistic-lock).
 *
 * Mirrors the mapRow pattern from `fee-payment.repository.ts`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeePaymentMethodValue } from '../fees.constants';
import type { FeeRefundRow } from '../fees.types';

export interface CreateFeeRefundInput {
  readonly feePaymentId: string;
  readonly amount: number;
  readonly reason: string;
  readonly method: FeePaymentMethodValue;
  readonly referenceNo?: string | null;
  readonly refundedAt: Date;
}

export interface ListFeeRefundArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly paymentId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

@Injectable()
export class FeeRefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeRefundRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    schoolId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeRefundRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.feeRefund.findFirst({
      where: { schoolId, id },
    });
    if (row === null) return null;
    return mapRow(row as unknown as RawRefund);
  }

  public async list(
    args: ListFeeRefundArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeRefundRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId };
    if (args.paymentId !== undefined) where.feePaymentId = args.paymentId;
    if (args.from !== undefined || args.to !== undefined) {
      const range: Record<string, unknown> = {};
      if (args.from !== undefined) range.gte = args.from;
      if (args.to !== undefined) range.lte = args.to;
      where.refundedAt = range;
    }
    const rows = await reader.feeRefund.findMany({
      where,
      orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawRefund)),
      nextCursorId,
    };
  }

  public async create(
    tx: PrismaTx,
    input: CreateFeeRefundInput,
  ): Promise<FeeRefundRow> {
    const { schoolId, userId } = this.tenant();
    const row = await tx.feeRefund.create({
      data: {
        schoolId,
        feePaymentId: input.feePaymentId,
        amount: input.amount,
        reason: input.reason,
        refundedAt: input.refundedAt,
        refundedBy: userId ?? null,
        method: input.method,
        referenceNo: input.referenceNo ?? null,
      },
    });
    return mapRow(row as unknown as RawRefund);
  }

  /**
   * Sum of all refund amounts on a given payment (within tenant). Used by
   * the service to compute the remaining refundable balance before insert.
   */
  public async sumByPayment(
    tx: PrismaTx,
    schoolId: string,
    feePaymentId: string,
  ): Promise<number> {
    const rows = await tx.feeRefund.findMany({
      where: { schoolId, feePaymentId },
      select: { amount: true },
    });
    return rows.reduce((acc, r) => acc + toNumber(r.amount), 0);
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

interface RawRefund {
  id: string;
  schoolId: string;
  feePaymentId: string;
  amount: unknown;
  reason: string;
  refundedAt: Date;
  refundedBy: string | null;
  method: string;
  referenceNo: string | null;
}

function mapRow(row: RawRefund): FeeRefundRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    feePaymentId: row.feePaymentId,
    amount: toNumber(row.amount),
    reason: row.reason,
    refundedAt: row.refundedAt,
    refundedBy: row.refundedBy,
    method: row.method as FeePaymentMethodValue,
    referenceNo: row.referenceNo,
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
