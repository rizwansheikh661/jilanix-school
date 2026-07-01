/**
 * FeeReceiptService — owns READ + CANCEL for `fee_receipts`.
 *
 * The receipt itself is issued by `fee-payment.service.ts` inline during
 * payment capture. Cancellation orchestrates the inverse of capture:
 *
 *   1. `module.fees` feature flag gate.
 *   2. Refuse if status !== ISSUED (already cancelled).
 *   3. Refuse if any FeeRefund references the underlying payment.
 *   4. For every still-active allocation: mark reversed; decrement the
 *      target invoice's paidTotal, recompute balanceTotal + status with a
 *      version-checked updateMany.
 *   5. Flip payment status to CANCELLED (version-checked).
 *   6. Flip receipt status to CANCELLED (If-Match version-checked).
 *   7. Publish RECEIPT_CANCELLED + per-invoice INVOICE_RECOMPUTED outbox.
 *   8. Write ONE finance-category audit row.
 *
 * Mirrors the transactional pattern of `fee-payment.service.ts#capture`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { FeePaymentRepository } from '../fee-payment/fee-payment.repository';
import {
  FEE_DECIMAL_PLACES,
  FeesFeatureFlags,
  FeesOutboxTopics,
  type FeeInvoiceStatusValue,
} from '../fees.constants';
import {
  FeeReceiptNotFoundError,
  FeePaymentNotFoundError,
  FeesModuleDisabledError,
  FeesVersionConflictError,
  ReceiptAlreadyCancelledError,
  ReceiptCancelRefundExistsError,
} from '../fees.errors';
import type {
  FeePaymentAllocationRow,
  FeeReceiptRow,
  FeeReceiptWithLines,
} from '../fees.types';
import {
  FeeReceiptRepository,
  type ListFeeReceiptArgs,
} from './fee-receipt.repository';

export interface CancelReceiptArgs {
  readonly id: string;
  readonly ifMatchVersion: number;
  readonly reason: string;
}

interface ReversedAllocationSummary {
  readonly allocationId: string;
  readonly invoiceId: string;
  readonly amount: number;
  readonly previousInvoiceStatus: FeeInvoiceStatusValue;
  readonly nextInvoiceStatus: FeeInvoiceStatusValue;
}

@Injectable()
export class FeeReceiptService {
  private readonly logger = new Logger(FeeReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeReceiptRepository,
    private readonly paymentRepo: FeePaymentRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  public async list(args: ListFeeReceiptArgs): Promise<{
    readonly items: readonly FeeReceiptRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getDetail(id: string): Promise<FeeReceiptWithLines> {
    const schoolId = this.requireSchoolId();
    const found = await this.repo.findDetailById(schoolId, id);
    if (found === null) throw new FeeReceiptNotFoundError(id);
    return found;
  }

  // -------------------------------------------------------------------------
  // Cancel — single transaction
  // -------------------------------------------------------------------------

  public async cancel(args: CancelReceiptArgs): Promise<FeeReceiptWithLines> {
    await this.assertModuleEnabled();
    const schoolId = this.requireSchoolId();
    const ctx = RequestContextRegistry.require();
    const userId = ctx.userId ?? null;

    return this.prisma.transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaTx;

      // 2. Load receipt (in-tx, tenant-scoped).
      const receipt = await this.repo.findByIdInTx(tx, schoolId, args.id);
      if (receipt === null) throw new FeeReceiptNotFoundError(args.id);

      // If-Match guard — fail fast if a concurrent writer bumped version.
      if (receipt.version !== args.ifMatchVersion) {
        throw new FeesVersionConflictError('FeeReceipt', receipt.id);
      }

      // 3. Refuse unless ISSUED.
      if (receipt.status !== 'ISSUED') {
        throw new ReceiptAlreadyCancelledError(receipt.id, receipt.status);
      }

      // 4. Refuse if any refund references the underlying payment.
      const refund = await tx.feeRefund.findFirst({
        where: { schoolId, feePaymentId: receipt.feePaymentId },
        select: { id: true },
      });
      if (refund !== null) {
        throw new ReceiptCancelRefundExistsError(receipt.id);
      }

      // 5. Load payment + allocations (in the same tx).
      const payment = await this.paymentRepo.findByIdInTx(
        tx,
        schoolId,
        receipt.feePaymentId,
      );
      if (payment === null) {
        throw new FeePaymentNotFoundError(receipt.feePaymentId);
      }

      // 6. Reverse every non-reversed allocation and roll back its invoice.
      const reversedSummaries: ReversedAllocationSummary[] = [];
      const touchedInvoiceIds: string[] = [];
      const reversedAllocationIds: string[] = [];

      for (const alloc of payment.allocations) {
        if (alloc.reversedAt !== null) continue;

        // Mark the allocation reversed.
        await tx.feePaymentAllocation.update({
          where: { schoolId_id: { schoolId, id: alloc.id } },
          data: {
            reversedAt: new Date(),
            reversedBy: userId,
            reversalReason: args.reason,
          },
        });
        reversedAllocationIds.push(alloc.id);

        // Recompute target invoice totals + status.
        const invoice = await tx.feeInvoice.findFirst({
          where: { schoolId, id: alloc.feeInvoiceId, deletedAt: null },
        });
        if (invoice === null) {
          // Invoice gone? Allocation references must stay consistent — treat
          // as a version conflict so the caller retries with fresh state.
          throw new FeesVersionConflictError('FeeInvoice', alloc.feeInvoiceId);
        }
        const previousStatus = invoice.status as FeeInvoiceStatusValue;
        const total = toNumber(invoice.total);
        const expectedVersion = invoice.version;
        const currentPaid = toNumber(invoice.paidTotal);
        const nextPaid = round2(currentPaid - alloc.amount);
        const nextBalance = round2(total - nextPaid);
        const nextStatus = this.computeInvoiceStatusAfterReversal(
          previousStatus,
          nextPaid,
          total,
        );

        const result = await tx.feeInvoice.updateMany({
          where: {
            schoolId,
            id: invoice.id,
            version: expectedVersion,
            deletedAt: null,
          },
          data: {
            paidTotal: nextPaid,
            balanceTotal: nextBalance,
            status: nextStatus,
            version: { increment: 1 },
            updatedBy: userId,
          },
        });
        if (result.count === 0) {
          throw new FeesVersionConflictError('FeeInvoice', invoice.id);
        }

        touchedInvoiceIds.push(invoice.id);
        reversedSummaries.push({
          allocationId: alloc.id,
          invoiceId: invoice.id,
          amount: alloc.amount,
          previousInvoiceStatus: previousStatus,
          nextInvoiceStatus: nextStatus,
        });
      }

      // 7. Flip payment status -> CANCELLED (version-checked).
      const paymentResult = await tx.feePayment.updateMany({
        where: {
          schoolId,
          id: payment.id,
          version: payment.version,
          deletedAt: null,
        },
        data: {
          status: 'CANCELLED',
          version: { increment: 1 },
          updatedBy: userId,
        },
      });
      if (paymentResult.count === 0) {
        throw new FeesVersionConflictError('FeePayment', payment.id);
      }

      // 8. Flip receipt status -> CANCELLED via the repo (also version-checked).
      const cancelledReceipt = await this.repo.cancel(tx, {
        id: receipt.id,
        schoolId,
        version: receipt.version,
        cancelledBy: userId,
        cancellationReason: args.reason,
      });

      // 9. Outbox — receipt cancelled + one recompute per touched invoice.
      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.RECEIPT_CANCELLED,
        eventType: 'FeeReceiptCancelled',
        aggregateType: 'FeeReceipt',
        aggregateId: cancelledReceipt.id,
        schoolId,
        payload: {
          id: cancelledReceipt.id,
          receiptNo: cancelledReceipt.receiptNo,
          feePaymentId: cancelledReceipt.feePaymentId,
          studentId: cancelledReceipt.studentId,
          totalAmount: cancelledReceipt.totalAmount,
          cancelledAt:
            cancelledReceipt.cancelledAt === null
              ? null
              : cancelledReceipt.cancelledAt.toISOString(),
          cancellationReason: cancelledReceipt.cancellationReason,
          reversedAllocations: reversedSummaries.map((s) => ({
            id: s.allocationId,
            invoiceId: s.invoiceId,
            amount: s.amount,
          })),
        },
      });
      for (const invoiceId of touchedInvoiceIds) {
        await this.outbox.publish(tx, {
          topic: FeesOutboxTopics.INVOICE_RECOMPUTED,
          eventType: 'FeeInvoiceRecomputed',
          aggregateType: 'FeeInvoice',
          aggregateId: invoiceId,
          schoolId,
          payload: {
            id: invoiceId,
            reason: 'receipt-cancelled',
            receiptId: cancelledReceipt.id,
          },
        });
      }

      // 10. Single finance-category audit row.
      await this.audit.record(
        {
          action: 'fee-receipt.cancelled',
          category: 'finance',
          resourceType: 'FeeReceipt',
          resourceId: cancelledReceipt.id,
          before: {
            id: receipt.id,
            status: receipt.status,
            version: receipt.version,
          },
          after: {
            id: cancelledReceipt.id,
            status: cancelledReceipt.status,
            version: cancelledReceipt.version,
            paymentId: payment.id,
            reason: args.reason,
            reversedAllocations: reversedSummaries,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeReceipt cancelled id=${cancelledReceipt.id} receiptNo=${cancelledReceipt.receiptNo} reversed=${reversedAllocationIds.length} invoices=${touchedInvoiceIds.length}.`,
      );

      // 11. Re-read allocations so the caller sees the freshly-flipped state.
      const allocs = await tx.feePaymentAllocation.findMany({
        where: { schoolId, feePaymentId: cancelledReceipt.feePaymentId },
        orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }],
      });
      const allocationRows: readonly FeePaymentAllocationRow[] = allocs.map(
        (a) => mapAllocation(a as unknown as RawAllocation),
      );
      return { ...cancelledReceipt, allocations: allocationRows };
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private computeInvoiceStatusAfterReversal(
    previousStatus: FeeInvoiceStatusValue,
    nextPaid: number,
    total: number,
  ): FeeInvoiceStatusValue {
    if (nextPaid >= total && total > 0) return 'PAID';
    if (nextPaid > 0 && nextPaid < total) return 'PARTIAL';
    // nextPaid === 0
    if (previousStatus === 'PARTIAL' || previousStatus === 'PAID') {
      return 'SENT';
    }
    return previousStatus;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeReceiptService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(FeesFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new FeesModuleDisabledError();
  }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

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

function round2(v: number): number {
  const factor = Math.pow(10, FEE_DECIMAL_PLACES);
  return Math.round(v * factor) / factor;
}

export const __test__ = { round2 };
