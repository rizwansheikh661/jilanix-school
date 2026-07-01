/**
 * FeeRefundService — orchestrates partial/full refund of a captured payment,
 * allocation reversal, invoice rollback, outbox publishes, and audit writes
 * inside one tx. APPEND_ONLY (no update, no soft-delete, no version column).
 *
 * Rules:
 *   1. `module.fees` feature flag gate.
 *   2. Load payment in-tx; refuse unless status === 'CAPTURED'.
 *   3. existingRefundTotal = SUM(fee_refunds where feePaymentId = ...).
 *      refundable = payment.amount - existingRefundTotal.
 *      Refuse if body.amount > refundable.
 *   4. Insert FeeRefund row.
 *   5. Reverse non-reversed allocations largest-first until cumulative
 *      reversed >= body.amount. Allocations are immutable except for the
 *      reversal columns, so the last allocation reversed may carry a
 *      "residue" (cumulative - body.amount). The residue stays on the books
 *      as outstanding balance the school must re-collect; annotated in the
 *      reversal reason for an honest audit trail.
 *      Per-invoice impact:
 *        - paidTotal -= alloc.amount (full reversal)
 *        - refundTotal += min(alloc.amount, remaining) so the cumulative
 *          refundTotal increment across invoices equals exactly body.amount.
 *      Status flips per `computeInvoiceStatusAfterRefund`.
 *   6. Flip payment status -> REFUNDED iff (existing + body.amount) >= payment.amount.
 *   7. Outbox: PAYMENT_REFUNDED + per-invoice INVOICE_RECOMPUTED.
 *   8. Audit: ONE finance row, action `fee-refund.created`.
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
  type FeePaymentMethodValue,
} from '../fees.constants';
import {
  FeePaymentNotFoundError,
  FeesModuleDisabledError,
  FeesVersionConflictError,
  PaymentNotRefundableError,
  RefundExceedsPaidError,
} from '../fees.errors';
import type { FeeRefundRow } from '../fees.types';
import {
  FeeRefundRepository,
  type ListFeeRefundArgs,
} from './fee-refund.repository';

export interface CreateFeeRefundArgs {
  readonly paymentId: string;
  readonly amount: number;
  readonly reason: string;
  readonly method: FeePaymentMethodValue;
  readonly referenceNo?: string | null;
}

interface ReversedAllocationSummary {
  readonly allocationId: string;
  readonly invoiceId: string;
  readonly allocationAmount: number;
  readonly refundApplied: number;
  readonly previousInvoiceStatus: FeeInvoiceStatusValue;
  readonly nextInvoiceStatus: FeeInvoiceStatusValue;
}

@Injectable()
export class FeeRefundService {
  private readonly logger = new Logger(FeeRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeRefundRepository,
    private readonly paymentRepo: FeePaymentRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  public async list(args: ListFeeRefundArgs): Promise<{
    readonly items: readonly FeeRefundRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  // -------------------------------------------------------------------------
  // Create refund — single transaction
  // -------------------------------------------------------------------------

  public async create(args: CreateFeeRefundArgs): Promise<FeeRefundRow> {
    await this.assertModuleEnabled();
    const schoolId = this.requireSchoolId();
    const ctx = RequestContextRegistry.require();
    const userId = ctx.userId ?? null;
    const amount = round2(args.amount);

    return this.prisma.transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaTx;

      // 2. Load payment + allocations (in-tx, tenant-scoped).
      const payment = await this.paymentRepo.findByIdInTx(
        tx,
        schoolId,
        args.paymentId,
      );
      if (payment === null) {
        throw new FeePaymentNotFoundError(args.paymentId);
      }
      if (payment.status !== 'CAPTURED') {
        throw new PaymentNotRefundableError(payment.id, payment.status);
      }

      // 3. Cap check — body.amount must fit inside the remaining refundable.
      const existingRefundTotal = round2(
        await this.repo.sumByPayment(tx, schoolId, payment.id),
      );
      const refundable = round2(payment.amount - existingRefundTotal);
      if (amount > refundable) {
        throw new RefundExceedsPaidError(payment.id, refundable, amount);
      }

      // 4. Insert FeeRefund (APPEND_ONLY — no version, no deletedAt).
      const refund = await this.repo.create(tx, {
        feePaymentId: payment.id,
        amount,
        reason: args.reason,
        method: args.method,
        referenceNo: args.referenceNo ?? null,
        refundedAt: new Date(),
      });

      // 5. Reverse allocations largest-first. Allocation rows are immutable
      //    except for the reversal columns — we cannot split a single
      //    allocation, so the last reversed row may carry a residue that the
      //    invoice's refundTotal absorbs (see file header).
      const nonReversed = payment.allocations
        .filter((a) => a.reversedAt === null)
        .slice()
        .sort((a, b) => b.amount - a.amount);

      const reversedSummaries: ReversedAllocationSummary[] = [];
      const touchedInvoiceIds: string[] = [];
      let remaining = amount;

      for (const alloc of nonReversed) {
        if (remaining <= 0) break;

        const refundApplied = round2(Math.min(alloc.amount, remaining));
        const residue = round2(alloc.amount - refundApplied);
        const reversalReason =
          residue > 0
            ? `${args.reason} (residue: ${residue.toFixed(FEE_DECIMAL_PLACES)})`
            : args.reason;

        await tx.feePaymentAllocation.update({
          where: { schoolId_id: { schoolId, id: alloc.id } },
          data: {
            reversedAt: new Date(),
            reversedBy: userId,
            reversalReason,
          },
        });

        // Recompute target invoice totals + status.
        const invoice = await tx.feeInvoice.findFirst({
          where: { schoolId, id: alloc.feeInvoiceId, deletedAt: null },
        });
        if (invoice === null) {
          throw new FeesVersionConflictError('FeeInvoice', alloc.feeInvoiceId);
        }
        const previousStatus = invoice.status as FeeInvoiceStatusValue;
        const total = toNumber(invoice.total);
        const expectedVersion = invoice.version;
        const currentPaid = toNumber(invoice.paidTotal);
        const currentRefund = toNumber(invoice.refundTotal);
        const nextPaid = round2(currentPaid - alloc.amount);
        const nextRefund = round2(currentRefund + refundApplied);
        const nextBalance = round2(total - nextPaid);
        const nextStatus = this.computeInvoiceStatusAfterRefund(
          nextPaid,
          nextRefund,
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
            refundTotal: nextRefund,
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
          allocationAmount: alloc.amount,
          refundApplied,
          previousInvoiceStatus: previousStatus,
          nextInvoiceStatus: nextStatus,
        });

        remaining = round2(remaining - refundApplied);
      }

      // 6. Flip payment status -> REFUNDED iff fully refunded.
      const newRefundTotal = round2(existingRefundTotal + amount);
      const paymentFullyRefunded = newRefundTotal >= payment.amount;
      if (paymentFullyRefunded) {
        const paymentResult = await tx.feePayment.updateMany({
          where: {
            schoolId,
            id: payment.id,
            version: payment.version,
            deletedAt: null,
          },
          data: {
            status: 'REFUNDED',
            version: { increment: 1 },
            updatedBy: userId,
          },
        });
        if (paymentResult.count === 0) {
          throw new FeesVersionConflictError('FeePayment', payment.id);
        }
      }

      // 7. Outbox — PAYMENT_REFUNDED + one recompute per touched invoice.
      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.PAYMENT_REFUNDED,
        eventType: 'FeePaymentRefunded',
        aggregateType: 'FeePayment',
        aggregateId: payment.id,
        schoolId,
        payload: {
          refundId: refund.id,
          feePaymentId: payment.id,
          amount,
          reason: args.reason,
          method: args.method,
          referenceNo: refund.referenceNo,
          refundedAt: refund.refundedAt.toISOString(),
          paymentFullyRefunded,
          reversedAllocations: reversedSummaries.map((s) => ({
            id: s.allocationId,
            invoiceId: s.invoiceId,
            allocationAmount: s.allocationAmount,
            refundApplied: s.refundApplied,
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
            reason: 'payment-refunded',
            refundId: refund.id,
          },
        });
      }

      // 8. Single finance-category audit row.
      const residueTotal = reversedSummaries.reduce(
        (acc, s) => acc + round2(s.allocationAmount - s.refundApplied),
        0,
      );
      await this.audit.record(
        {
          action: 'fee-refund.created',
          category: 'finance',
          resourceType: 'FeeRefund',
          resourceId: refund.id,
          after: {
            id: refund.id,
            feePaymentId: payment.id,
            amount,
            reason: args.reason,
            method: args.method,
            referenceNo: refund.referenceNo,
            paymentFullyRefunded,
            residue: round2(residueTotal),
            reversedAllocations: reversedSummaries,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeRefund created id=${refund.id} payment=${payment.id} amount=${amount} reversed=${reversedSummaries.length} invoices=${touchedInvoiceIds.length}${paymentFullyRefunded ? ' payment=REFUNDED' : ''}.`,
      );

      return refund;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private computeInvoiceStatusAfterRefund(
    nextPaid: number,
    nextRefund: number,
  ): FeeInvoiceStatusValue {
    // Spec rule: REFUNDED iff refundTotal >= paidTotal AND paidTotal > 0
    // (i.e. all currently-paid money was returned).
    if (nextPaid > 0 && nextRefund >= nextPaid) return 'REFUNDED';
    if (nextPaid === 0) return 'SENT';
    return 'PARTIAL';
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeRefundService requires tenant scope.');
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
