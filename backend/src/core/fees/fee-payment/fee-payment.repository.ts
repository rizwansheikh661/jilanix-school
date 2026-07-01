/**
 * FeePaymentRepository — persistence for `fee_payments` (header) plus child
 * `fee_payment_allocations` rows. Payments are append-only (status flips on
 * cancel/refund flows); allocation rows are never row-deleted — reversals are
 * tracked by writing `reversedAt`/`reversedBy`/`reversalReason`.
 *
 * The receipt for a captured payment lives in `fee_receipts` and is created
 * inline by the service in the same transaction (no separate sub-module yet).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  FeePaymentMethodValue,
  FeePaymentStatusValue,
  FeePaymentVerificationStatusValue,
} from '../fees.constants';
import type {
  FeePaymentAllocationRow,
  FeePaymentRow,
  FeePaymentWithAllocations,
} from '../fees.types';

export interface CreateFeePaymentAllocationInput {
  readonly feeInvoiceId: string;
  readonly amount: number;
}

export interface CreateFeePaymentInput {
  readonly studentId: string;
  readonly method: FeePaymentMethodValue;
  readonly amount: number;
  readonly status: FeePaymentStatusValue;
  readonly referenceNo?: string | null;
  readonly paidAt: Date;
  readonly gatewayCode?: string | null;
  readonly gatewayPaymentId?: string | null;
  readonly paymentNo?: string | null;
  readonly notes?: string | null;
  readonly paymentSourceId?: string | null;
  readonly paymentProofUrl?: string | null;
  readonly verificationStatus?: FeePaymentVerificationStatusValue;
  readonly verifiedBy?: string | null;
  readonly verifiedAt?: Date | null;
  readonly verificationNotes?: string | null;
}

export interface ListFeePaymentArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly studentId?: string;
  readonly method?: FeePaymentMethodValue;
  readonly status?: FeePaymentStatusValue;
  readonly verificationStatus?: FeePaymentVerificationStatusValue;
  readonly from?: Date;
  readonly to?: Date;
}

export interface UpdateFeePaymentVerificationInput {
  readonly status: FeePaymentStatusValue;
  readonly verificationStatus: FeePaymentVerificationStatusValue;
  readonly verifiedAt: Date | null;
  readonly verifiedBy: string | null;
  readonly verificationNotes: string | null;
}

@Injectable()
export class FeePaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeePaymentRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeePaymentWithAllocations | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.feePayment.findFirst({
      where: { schoolId, id, deletedAt: null },
      include: { allocations: true },
    });
    if (header === null) return null;
    return assemble(header);
  }

  public async findByIdInTx(
    tx: PrismaTx,
    schoolId: string,
    id: string,
  ): Promise<FeePaymentWithAllocations | null> {
    const header = await tx.feePayment.findFirst({
      where: { schoolId, id, deletedAt: null },
      include: { allocations: true },
    });
    if (header === null) return null;
    return assemble(header);
  }

  public async list(
    args: ListFeePaymentArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeePaymentWithAllocations[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.method !== undefined) where.method = args.method;
    if (args.status !== undefined) where.status = args.status;
    if (args.verificationStatus !== undefined) {
      where.verificationStatus = args.verificationStatus;
    }
    if (args.from !== undefined || args.to !== undefined) {
      const range: Record<string, unknown> = {};
      if (args.from !== undefined) range.gte = args.from;
      if (args.to !== undefined) range.lte = args.to;
      where.paidAt = range;
    }
    const headers = await reader.feePayment.findMany({
      where,
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: args.limit + 1,
      include: { allocations: true },
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      headers.length > args.limit ? (headers.pop()?.id ?? null) : null;
    const rows = headers.map((h) => assemble(h));
    return { rows, nextCursorId };
  }

  public async create(
    tx: PrismaTx,
    payment: CreateFeePaymentInput,
    allocations: readonly CreateFeePaymentAllocationInput[],
  ): Promise<FeePaymentWithAllocations> {
    const { schoolId, userId } = this.tenant();
    const header = await tx.feePayment.create({
      data: {
        schoolId,
        studentId: payment.studentId,
        paymentNo: payment.paymentNo ?? null,
        method: payment.method,
        amount: payment.amount,
        status: payment.status,
        referenceNo: payment.referenceNo ?? null,
        paidAt: payment.paidAt,
        gatewayCode: payment.gatewayCode ?? null,
        gatewayPaymentId: payment.gatewayPaymentId ?? null,
        notes: payment.notes ?? null,
        paymentSourceId: payment.paymentSourceId ?? null,
        paymentProofUrl: payment.paymentProofUrl ?? null,
        ...(payment.verificationStatus !== undefined
          ? { verificationStatus: payment.verificationStatus }
          : {}),
        verifiedBy: payment.verifiedBy ?? null,
        verifiedAt: payment.verifiedAt ?? null,
        verificationNotes: payment.verificationNotes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    const allocRows: RawAllocation[] = [];
    for (const a of allocations) {
      const created = await tx.feePaymentAllocation.create({
        data: {
          schoolId,
          feePaymentId: header.id,
          feeInvoiceId: a.feeInvoiceId,
          amount: a.amount,
          allocatedAt: new Date(),
          allocatedBy: userId ?? null,
        },
      });
      allocRows.push(created as RawAllocation);
    }
    return {
      ...mapHeader(header as RawHeader),
      allocations: allocRows.map(mapAllocation),
    };
  }

  public async updateVerification(
    tx: PrismaTx,
    id: string,
    expectedVersion: number,
    input: UpdateFeePaymentVerificationInput,
  ): Promise<FeePaymentWithAllocations> {
    const { schoolId, userId } = this.tenant();
    const result = await tx.feePayment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        status: input.status,
        verificationStatus: input.verificationStatus,
        verifiedAt: input.verifiedAt,
        verifiedBy: input.verifiedBy,
        verificationNotes: input.verificationNotes,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeePayment', id, expectedVersion);
    }
    const reloaded = await tx.feePayment.findFirst({
      where: { schoolId, id, deletedAt: null },
      include: { allocations: true },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeePayment', id, expectedVersion);
    }
    return assemble(reloaded as RawHeader & { allocations: RawAllocation[] });
  }
}

interface RawHeader {
  id: string;
  schoolId: string;
  studentId: string;
  paymentNo: string | null;
  method: string;
  amount: unknown;
  status: string;
  referenceNo: string | null;
  paidAt: Date;
  gatewayCode: string | null;
  gatewayPaymentId: string | null;
  notes: string | null;
  paymentSourceId: string | null;
  paymentProofUrl: string | null;
  verificationStatus: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  verificationNotes: string | null;
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

function assemble(
  raw: RawHeader & { allocations: RawAllocation[] },
): FeePaymentWithAllocations {
  return {
    ...mapHeader(raw),
    allocations: raw.allocations.map(mapAllocation),
  };
}

function mapHeader(row: RawHeader): FeePaymentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    paymentNo: row.paymentNo,
    method: row.method as FeePaymentMethodValue,
    amount: toNumber(row.amount),
    status: row.status as FeePaymentStatusValue,
    referenceNo: row.referenceNo,
    paidAt: row.paidAt,
    gatewayCode: row.gatewayCode,
    gatewayPaymentId: row.gatewayPaymentId,
    notes: row.notes,
    paymentSourceId: row.paymentSourceId,
    paymentProofUrl: row.paymentProofUrl,
    verificationStatus: row.verificationStatus as FeePaymentVerificationStatusValue,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    verificationNotes: row.verificationNotes,
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
