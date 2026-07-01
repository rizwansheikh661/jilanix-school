/**
 * FeePaymentService — orchestrates offline payment capture, allocation,
 * receipt issuance, outbox publishes, and audit writes inside one tx.
 *
 * Rules (Sprint 9 plan §11):
 *   1. `module.fees` feature flag gate on every mutation.
 *   2. Cross-tenant FK guards for studentId + every allocation's invoiceId.
 *   3. POST /payments accepts only offline methods (CASH/CHEQUE/BANK_TRANSFER/UPI);
 *      ONLINE must go through /checkout (refuse with InvalidPaymentMethodError).
 *   4. Sum of allocations MUST equal payment.amount (PaymentAmountMismatchError).
 *   5. Each touched invoice must belong to the same school + student, and be in
 *      {DRAFT, SENT, PARTIAL, OVERDUE}; allocation.amount may not exceed
 *      invoice.balanceTotal.
 *   6. If an allocation would leave the invoice partially paid, the
 *      `fees.allow_partial_payment` feature flag must be on; otherwise refuse.
 *   7. Status: PAID when paidTotal >= total, else PARTIAL (flag-gated).
 *   8. Receipt number is `RCP/<FY>/<seq>`, FY derived from the AcademicYear
 *      covering payment.paidAt; refuse if no academic year contains paidAt.
 *   9. PAYMENT_CAPTURED + RECEIPT_ISSUED outbox events; one finance-category
 *      audit row with action `fee-payment.captured`.
 *   10. Online checkout resolves a gateway through PaymentGatewayRegistry;
 *      adapter throws PaymentGatewayDisabledError or NotImplementedError.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { parseIfMatch } from '../../http/if-match';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SequenceService } from '../../sequences/sequence/sequence.service';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import { FeeInvoiceRepository } from '../fee-invoice/fee-invoice.repository';
import { FeePaymentSourceRepository } from '../fee-payment-source/fee-payment-source.repository';
import {
  FEE_DECIMAL_PLACES,
  FEE_PAYMENT_ALLOCATIONS_MAX,
  FEE_PAYMENT_METHOD_DEPRECATED,
  FEE_PAYMENT_VERIFY_REQUIRED_METHODS,
  FeesFeatureFlags,
  FeesOutboxTopics,
  type FeeInvoiceStatusValue,
  type FeePaymentMethodValue,
} from '../fees.constants';
import {
  AllocationExceedsBalanceError,
  FeeInvoiceNotFoundError,
  FeePaymentNotFoundError,
  FeePaymentSourceInactiveError,
  FeePaymentSourceNotFoundError,
  FeesBulkLimitExceededError,
  FeesCrossTenantReferenceError,
  FeesModuleDisabledError,
  FeesVersionConflictError,
  InvalidPaymentMethodError,
  PartialPaymentDisabledError,
  PaymentAmountMismatchError,
  PaymentGatewayNotImplementedError,
  PaymentNotPendingVerificationError,
  PaymentSourceRequiredError,
} from '../fees.errors';
import type {
  FeePaymentWithAllocations,
  FeeReceiptRow,
} from '../fees.types';
import {
  type CheckoutSession,
  type GatewayCode,
} from './gateways/payment-gateway.port';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import {
  FeePaymentRepository,
  type ListFeePaymentArgs,
} from './fee-payment.repository';

export interface CreateFeePaymentAllocation {
  readonly invoiceId: string;
  readonly amount: number;
}

export interface CreateFeePaymentArgs {
  readonly studentId: string;
  readonly method: FeePaymentMethodValue;
  readonly amount: number;
  readonly referenceNo?: string | null;
  readonly paidAt: Date;
  readonly notes?: string | null;
  readonly paymentSourceId?: string;
  readonly paymentProofUrl?: string;
  readonly verificationNotes?: string;
  readonly allocations: readonly CreateFeePaymentAllocation[];
}

export interface CapturedFeePayment {
  readonly payment: FeePaymentWithAllocations;
  readonly receipt: FeeReceiptRow | null;
}

export interface VerifiedFeePayment {
  readonly payment: FeePaymentWithAllocations;
  readonly receipt: FeeReceiptRow;
}

export interface RejectedFeePayment {
  readonly payment: FeePaymentWithAllocations;
}

export interface VerifyFeePaymentArgs {
  readonly notes?: string;
}

export interface RejectFeePaymentArgs {
  readonly reason: string;
}

export interface CheckoutArgs {
  readonly invoiceId: string;
  readonly gatewayCode: GatewayCode;
  readonly returnUrl?: string;
}

interface TenantRefs {
  readonly studentIds?: readonly string[];
  readonly feeInvoiceIds?: readonly string[];
}

interface InvoiceUpdate {
  readonly invoiceId: string;
  readonly expectedVersion: number;
  readonly nextPaidTotal: number;
  readonly nextTotal: number;
  readonly nextStatus: FeeInvoiceStatusValue;
  readonly allocAmount: number;
}

const AUTO_CAPTURE_METHODS: readonly FeePaymentMethodValue[] = [
  'CASH',
  'ONLINE_GATEWAY',
];

const ALLOCATABLE_INVOICE_STATUSES: readonly FeeInvoiceStatusValue[] = [
  'DRAFT',
  'SENT',
  'PARTIAL',
  'OVERDUE',
];

@Injectable()
export class FeePaymentService {
  private readonly logger = new Logger(FeePaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeePaymentRepository,
    private readonly invoiceRepo: FeeInvoiceRepository,
    private readonly sequenceService: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly paymentSourceRepo: FeePaymentSourceRepository,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  public async list(args: ListFeePaymentArgs): Promise<{
    readonly items: readonly FeePaymentWithAllocations[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<{
    readonly payment: FeePaymentWithAllocations;
    readonly receipt: FeeReceiptRow | null;
  }> {
    const found = await this.repo.findById(id);
    if (found === null) throw new FeePaymentNotFoundError(id);
    const receipt = await this.loadReceiptForPayment(undefined, found.id);
    return { payment: found, receipt };
  }

  // -------------------------------------------------------------------------
  // Capture (offline) — single transaction
  // -------------------------------------------------------------------------

  public async capture(args: CreateFeePaymentArgs): Promise<CapturedFeePayment> {
    await this.assertModuleEnabled();

    if (this.isDeprecatedMethod(args.method)) {
      // UPI / ONLINE are deprecated method names retained only for old data.
      throw new InvalidPaymentMethodError(args.method);
    }
    const verifyRequired = this.requiresVerification(args.method);
    if (verifyRequired && args.paymentSourceId === undefined) {
      throw new PaymentSourceRequiredError(args.method);
    }
    if (args.allocations.length === 0) {
      throw new FeesBulkLimitExceededError(FEE_PAYMENT_ALLOCATIONS_MAX, 0);
    }
    if (args.allocations.length > FEE_PAYMENT_ALLOCATIONS_MAX) {
      throw new FeesBulkLimitExceededError(
        FEE_PAYMENT_ALLOCATIONS_MAX,
        args.allocations.length,
      );
    }
    const allocationsTotal = round2(
      args.allocations.reduce((acc, a) => acc + a.amount, 0),
    );
    const amount = round2(args.amount);
    if (allocationsTotal !== amount) {
      throw new PaymentAmountMismatchError(amount, allocationsTotal);
    }

    return this.prisma.transaction(async (tx) => {
      await this.assertTenantRefs(tx, {
        studentIds: [args.studentId],
        feeInvoiceIds: args.allocations.map((a) => a.invoiceId),
      });

      const ctx = RequestContextRegistry.require();
      const schoolId = this.requireSchoolId();

      // Resolve + validate the optional payment source (in-tx, tenant-scoped).
      if (args.paymentSourceId !== undefined) {
        const source = await this.paymentSourceRepo.findById(
          args.paymentSourceId,
          tx,
        );
        if (source === null) {
          throw new FeePaymentSourceNotFoundError(args.paymentSourceId);
        }
        if (!source.isActive) {
          throw new FeePaymentSourceInactiveError(args.paymentSourceId);
        }
      }

      const partialAllowed = await this.featureFlags.isEnabled(
        FeesFeatureFlags.ALLOW_PARTIAL_PAYMENT,
        { schoolId },
      );

      // Validate every allocation against its invoice (status, student,
      // balance) and pre-compute next totals/status.
      const updates = await this.computeInvoiceUpdates(tx, {
        schoolId,
        studentId: args.studentId,
        allocations: args.allocations,
        partialAllowed,
      });

      if (verifyRequired) {
        return this.captureForVerification({
          tx,
          ctx,
          schoolId,
          args,
          amount,
        });
      }

      return this.captureAndIssueReceipt({
        tx,
        ctx,
        schoolId,
        args,
        amount,
        updates,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Verify a previously-captured manual payment (CHEQUE / BANK_TRANSFER /
  // UPI_MANUAL). Recomputes invoice totals + issues the receipt.
  // -------------------------------------------------------------------------

  public async verify(
    id: string,
    ifMatch: string | undefined,
    dto: VerifyFeePaymentArgs,
  ): Promise<VerifiedFeePayment> {
    await this.assertModuleEnabled();
    const expectedVersion = parseIfMatch(ifMatch);

    return this.prisma.transaction(async (tx) => {
      const ctx = RequestContextRegistry.require();
      const schoolId = this.requireSchoolId();

      const existing = await this.repo.findByIdInTx(tx, schoolId, id);
      if (existing === null) throw new FeePaymentNotFoundError(id);
      if (existing.version !== expectedVersion) {
        throw new FeesVersionConflictError('FeePayment', id);
      }
      if (existing.verificationStatus !== 'PENDING') {
        throw new PaymentNotPendingVerificationError(
          id,
          existing.verificationStatus,
        );
      }

      const partialAllowed = await this.featureFlags.isEnabled(
        FeesFeatureFlags.ALLOW_PARTIAL_PAYMENT,
        { schoolId },
      );

      // Recompute invoice totals using the active allocations.
      const allocs = existing.allocations
        .filter((a) => a.reversedAt === null)
        .map((a) => ({ invoiceId: a.feeInvoiceId, amount: a.amount }));
      const updates = await this.computeInvoiceUpdates(tx, {
        schoolId,
        studentId: existing.studentId,
        allocations: allocs,
        partialAllowed,
      });
      await this.applyInvoiceUpdates(tx, schoolId, ctx.userId ?? null, updates);

      // Flip payment to CAPTURED + VERIFIED with optimistic concurrency.
      const verifiedNotes =
        dto.notes !== undefined ? dto.notes : existing.verificationNotes;
      const verifiedPayment = await this.repo.updateVerification(
        tx,
        id,
        expectedVersion,
        {
          status: 'CAPTURED',
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedBy: ctx.userId ?? null,
          verificationNotes: verifiedNotes,
        },
      );

      // Issue receipt RCP/<FY>/<seq> inline (mirrors capture-path).
      const fiscalYear = await this.resolveFiscalYearForDate(
        tx,
        verifiedPayment.paidAt,
      );
      const seq = await this.sequenceService.nextValue(SEQ_NAMES.RECEIPT, {
        fiscalYear,
        tx,
      });
      const receiptNo = this.formatReceiptNo(fiscalYear, seq);
      const receiptRow = await tx.feeReceipt.create({
        data: {
          schoolId,
          feePaymentId: verifiedPayment.id,
          studentId: verifiedPayment.studentId,
          receiptNo,
          issuedAt: new Date(),
          issuedBy: ctx.userId ?? null,
          totalAmount: verifiedPayment.amount,
          status: 'ISSUED',
          createdBy: ctx.userId ?? null,
          updatedBy: ctx.userId ?? null,
        },
      });
      const receipt = mapReceipt(receiptRow as unknown as RawReceipt);

      // Outbox publishes — PAYMENT_VERIFIED + RECEIPT_ISSUED.
      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.PAYMENT_VERIFIED,
        eventType: 'FeePaymentVerified',
        aggregateType: 'FeePayment',
        aggregateId: verifiedPayment.id,
        schoolId,
        payload: {
          id: verifiedPayment.id,
          studentId: verifiedPayment.studentId,
          method: verifiedPayment.method,
          amount: verifiedPayment.amount,
          verifiedAt:
            verifiedPayment.verifiedAt === null
              ? null
              : verifiedPayment.verifiedAt.toISOString(),
          verifiedBy: verifiedPayment.verifiedBy,
        },
      });
      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.RECEIPT_ISSUED,
        eventType: 'FeeReceiptIssued',
        aggregateType: 'FeeReceipt',
        aggregateId: receipt.id,
        schoolId,
        payload: {
          id: receipt.id,
          receiptNo: receipt.receiptNo,
          feePaymentId: verifiedPayment.id,
          studentId: verifiedPayment.studentId,
          totalAmount: receipt.totalAmount,
          issuedAt: receipt.issuedAt.toISOString(),
        },
      });

      // Finance-category audit row.
      await this.audit.record(
        {
          action: 'fee-payment.verified',
          category: 'finance',
          resourceType: 'FeePayment',
          resourceId: verifiedPayment.id,
          before: {
            id: existing.id,
            status: existing.status,
            verificationStatus: existing.verificationStatus,
            version: existing.version,
          },
          after: {
            id: verifiedPayment.id,
            status: verifiedPayment.status,
            verificationStatus: verifiedPayment.verificationStatus,
            verifiedAt:
              verifiedPayment.verifiedAt === null
                ? null
                : verifiedPayment.verifiedAt.toISOString(),
            verifiedBy: verifiedPayment.verifiedBy,
            receiptId: receipt.id,
            receiptNo: receipt.receiptNo,
            version: verifiedPayment.version,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeePayment verified id=${verifiedPayment.id} receipt=${receipt.receiptNo}.`,
      );

      return { payment: verifiedPayment, receipt };
    });
  }

  // -------------------------------------------------------------------------
  // Reject a previously-captured manual payment. No invoice/receipt impact.
  // -------------------------------------------------------------------------

  public async reject(
    id: string,
    ifMatch: string | undefined,
    dto: RejectFeePaymentArgs,
  ): Promise<RejectedFeePayment> {
    await this.assertModuleEnabled();
    const expectedVersion = parseIfMatch(ifMatch);

    return this.prisma.transaction(async (tx) => {
      const ctx = RequestContextRegistry.require();
      const schoolId = this.requireSchoolId();

      const existing = await this.repo.findByIdInTx(tx, schoolId, id);
      if (existing === null) throw new FeePaymentNotFoundError(id);
      if (existing.version !== expectedVersion) {
        throw new FeesVersionConflictError('FeePayment', id);
      }
      if (existing.verificationStatus !== 'PENDING') {
        throw new PaymentNotPendingVerificationError(
          id,
          existing.verificationStatus,
        );
      }

      const rejected = await this.repo.updateVerification(
        tx,
        id,
        expectedVersion,
        {
          status: 'FAILED',
          verificationStatus: 'REJECTED',
          verifiedAt: new Date(),
          verifiedBy: ctx.userId ?? null,
          verificationNotes: dto.reason,
        },
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.PAYMENT_REJECTED,
        eventType: 'FeePaymentRejected',
        aggregateType: 'FeePayment',
        aggregateId: rejected.id,
        schoolId,
        payload: {
          id: rejected.id,
          studentId: rejected.studentId,
          method: rejected.method,
          reason: dto.reason,
          rejectedAt:
            rejected.verifiedAt === null
              ? null
              : rejected.verifiedAt.toISOString(),
          rejectedBy: rejected.verifiedBy,
        },
      });

      await this.audit.record(
        {
          action: 'fee-payment.rejected',
          category: 'finance',
          resourceType: 'FeePayment',
          resourceId: rejected.id,
          before: {
            id: existing.id,
            status: existing.status,
            verificationStatus: existing.verificationStatus,
            version: existing.version,
          },
          after: {
            id: rejected.id,
            status: rejected.status,
            verificationStatus: rejected.verificationStatus,
            reason: dto.reason,
            version: rejected.version,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`FeePayment rejected id=${rejected.id} reason=${dto.reason}.`);

      return { payment: rejected };
    });
  }

  // -------------------------------------------------------------------------
  // Checkout (online) — resolves a registered gateway adapter
  // -------------------------------------------------------------------------

  public async checkout(args: CheckoutArgs): Promise<CheckoutSession> {
    await this.assertModuleEnabled();
    const schoolId = this.requireSchoolId();
    const invoice = await this.invoiceRepo.findById(args.invoiceId);
    if (invoice === null) throw new FeeInvoiceNotFoundError(args.invoiceId);
    if (invoice.header.schoolId !== schoolId) {
      throw new FeesCrossTenantReferenceError('FeeInvoice', args.invoiceId);
    }
    if (!ALLOCATABLE_INVOICE_STATUSES.includes(invoice.header.status)) {
      throw new AllocationExceedsBalanceError(
        args.invoiceId,
        invoice.header.balanceTotal,
        invoice.header.balanceTotal,
      );
    }
    const adapter = await this.gateways.resolve(args.gatewayCode, schoolId);
    return adapter.createCheckout({
      schoolId,
      studentId: invoice.header.studentId,
      invoiceIds: [args.invoiceId],
      amount: invoice.header.balanceTotal,
      currency: 'INR',
      ...(args.returnUrl !== undefined ? { returnUrl: args.returnUrl } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Webhook stub — always 501
  // -------------------------------------------------------------------------

  public async handleWebhook(gateway: string): Promise<never> {
    throw new PaymentGatewayNotImplementedError(gateway);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private requiresVerification(method: FeePaymentMethodValue): boolean {
    return (FEE_PAYMENT_VERIFY_REQUIRED_METHODS as readonly string[]).includes(
      method,
    );
  }

  private isDeprecatedMethod(method: FeePaymentMethodValue): boolean {
    return (FEE_PAYMENT_METHOD_DEPRECATED as readonly string[]).includes(method);
  }

  private async computeInvoiceUpdates(
    tx: PrismaTx,
    args: {
      readonly schoolId: string;
      readonly studentId: string;
      readonly allocations: readonly CreateFeePaymentAllocation[];
      readonly partialAllowed: boolean;
    },
  ): Promise<readonly InvoiceUpdate[]> {
    const updates: InvoiceUpdate[] = [];
    for (const alloc of args.allocations) {
      const found = await this.invoiceRepo.findById(alloc.invoiceId, tx);
      if (found === null) throw new FeeInvoiceNotFoundError(alloc.invoiceId);
      const header = found.header;
      if (header.schoolId !== args.schoolId) {
        throw new FeesCrossTenantReferenceError('FeeInvoice', alloc.invoiceId);
      }
      if (header.studentId !== args.studentId) {
        throw new FeesCrossTenantReferenceError('FeeInvoice', alloc.invoiceId);
      }
      if (!ALLOCATABLE_INVOICE_STATUSES.includes(header.status)) {
        throw new AllocationExceedsBalanceError(
          alloc.invoiceId,
          header.balanceTotal,
          alloc.amount,
        );
      }
      const allocAmount = round2(alloc.amount);
      if (allocAmount > header.balanceTotal) {
        throw new AllocationExceedsBalanceError(
          alloc.invoiceId,
          header.balanceTotal,
          allocAmount,
        );
      }
      const nextPaidTotal = round2(header.paidTotal + allocAmount);
      const fullyPaid = nextPaidTotal >= header.total;
      const partialAfter =
        !fullyPaid && nextPaidTotal > 0 && nextPaidTotal < header.total;
      if (partialAfter && !args.partialAllowed) {
        throw new PartialPaymentDisabledError();
      }
      const nextStatus: FeeInvoiceStatusValue = fullyPaid
        ? 'PAID'
        : partialAfter
          ? 'PARTIAL'
          : header.status;
      updates.push({
        invoiceId: header.id,
        expectedVersion: header.version,
        nextPaidTotal,
        nextTotal: header.total,
        nextStatus,
        allocAmount,
      });
    }
    return updates;
  }

  private async applyInvoiceUpdates(
    tx: PrismaTx,
    schoolId: string,
    userId: string | null,
    updates: readonly InvoiceUpdate[],
  ): Promise<void> {
    for (const u of updates) {
      const newBalance = round2(u.nextTotal - u.nextPaidTotal);
      const result = await tx.feeInvoice.updateMany({
        where: {
          schoolId,
          id: u.invoiceId,
          version: u.expectedVersion,
          deletedAt: null,
        },
        data: {
          paidTotal: u.nextPaidTotal,
          balanceTotal: newBalance,
          status: u.nextStatus,
          version: { increment: 1 },
          updatedBy: userId,
        },
      });
      if (result.count === 0) {
        throw new VersionConflictError(
          'FeeInvoice',
          u.invoiceId,
          u.expectedVersion,
        );
      }
    }
  }

  private async captureAndIssueReceipt(args: {
    readonly tx: PrismaTx;
    readonly ctx: { readonly userId?: string | null };
    readonly schoolId: string;
    readonly args: CreateFeePaymentArgs;
    readonly amount: number;
    readonly updates: readonly InvoiceUpdate[];
  }): Promise<CapturedFeePayment> {
    const { tx, ctx, schoolId, args: input, amount, updates } = args;

    // Insert FeePayment + allocations.
    const created = await this.repo.create(
      tx,
      {
        studentId: input.studentId,
        method: input.method,
        amount,
        status: 'CAPTURED',
        paidAt: input.paidAt,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        paymentNo: null,
        paymentSourceId: input.paymentSourceId ?? null,
        paymentProofUrl: input.paymentProofUrl ?? null,
        verificationStatus: 'NOT_REQUIRED',
        verifiedBy: null,
        verifiedAt: null,
        verificationNotes: input.verificationNotes ?? null,
      },
      input.allocations.map((a) => ({
        feeInvoiceId: a.invoiceId,
        amount: a.amount,
      })),
    );

    // Update invoice totals + flip status in a single version-checked
    // updateMany (cleaner than raw-update + updateTotals).
    await this.applyInvoiceUpdates(tx, schoolId, ctx.userId ?? null, updates);

    // Receipt number — fiscal year from the AcademicYear covering paidAt.
    const fiscalYear = await this.resolveFiscalYearForDate(tx, input.paidAt);
    const seq = await this.sequenceService.nextValue(SEQ_NAMES.RECEIPT, {
      fiscalYear,
      tx,
    });
    const receiptNo = this.formatReceiptNo(fiscalYear, seq);

    // Create receipt inline (no fee-receipt sub-module yet).
    const receiptRow = await tx.feeReceipt.create({
      data: {
        schoolId,
        feePaymentId: created.id,
        studentId: input.studentId,
        receiptNo,
        issuedAt: new Date(),
        issuedBy: ctx.userId ?? null,
        totalAmount: amount,
        status: 'ISSUED',
        createdBy: ctx.userId ?? null,
        updatedBy: ctx.userId ?? null,
      },
    });
    const receipt = mapReceipt(receiptRow as unknown as RawReceipt);

    // Outbox publishes — PAYMENT_CAPTURED + RECEIPT_ISSUED.
    await this.outbox.publish(tx, {
      topic: FeesOutboxTopics.PAYMENT_CAPTURED,
      eventType: 'FeePaymentCaptured',
      aggregateType: 'FeePayment',
      aggregateId: created.id,
      schoolId,
      payload: {
        id: created.id,
        studentId: created.studentId,
        method: created.method,
        amount: created.amount,
        paidAt: created.paidAt.toISOString(),
        verificationStatus: created.verificationStatus,
        allocations: created.allocations.map((a) => ({
          invoiceId: a.feeInvoiceId,
          amount: a.amount,
        })),
      },
    });
    await this.outbox.publish(tx, {
      topic: FeesOutboxTopics.RECEIPT_ISSUED,
      eventType: 'FeeReceiptIssued',
      aggregateType: 'FeeReceipt',
      aggregateId: receipt.id,
      schoolId,
      payload: {
        id: receipt.id,
        receiptNo: receipt.receiptNo,
        feePaymentId: created.id,
        studentId: created.studentId,
        totalAmount: receipt.totalAmount,
        issuedAt: receipt.issuedAt.toISOString(),
      },
    });

    // Single finance-category audit row.
    await this.audit.record(
      {
        action: 'fee-payment.captured',
        category: 'finance',
        resourceType: 'FeePayment',
        resourceId: created.id,
        after: {
          id: created.id,
          studentId: created.studentId,
          method: created.method,
          amount: created.amount,
          status: created.status,
          verificationStatus: created.verificationStatus,
          paidAt: created.paidAt.toISOString(),
          receiptId: receipt.id,
          receiptNo: receipt.receiptNo,
          allocations: created.allocations.map((a) => ({
            id: a.id,
            invoiceId: a.feeInvoiceId,
            amount: a.amount,
          })),
        },
      },
      { tx: tx as unknown as AuditTxLike },
    );

    this.logger.log(
      `FeePayment captured id=${created.id} amount=${amount} allocs=${created.allocations.length} receipt=${receipt.receiptNo}.`,
    );

    return { payment: created, receipt };
  }

  private async captureForVerification(args: {
    readonly tx: PrismaTx;
    readonly ctx: { readonly userId?: string | null };
    readonly schoolId: string;
    readonly args: CreateFeePaymentArgs;
    readonly amount: number;
  }): Promise<CapturedFeePayment> {
    const { tx, schoolId, args: input, amount } = args;

    // Insert FeePayment + allocations only — invoices stay untouched.
    const created = await this.repo.create(
      tx,
      {
        studentId: input.studentId,
        method: input.method,
        amount,
        status: 'PENDING',
        paidAt: input.paidAt,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        paymentNo: null,
        paymentSourceId: input.paymentSourceId ?? null,
        paymentProofUrl: input.paymentProofUrl ?? null,
        verificationStatus: 'PENDING',
        verifiedBy: null,
        verifiedAt: null,
        verificationNotes: input.verificationNotes ?? null,
      },
      input.allocations.map((a) => ({
        feeInvoiceId: a.invoiceId,
        amount: a.amount,
      })),
    );

    // Outbox: PAYMENT_CAPTURED with verificationStatus=PENDING in payload.
    await this.outbox.publish(tx, {
      topic: FeesOutboxTopics.PAYMENT_CAPTURED,
      eventType: 'FeePaymentCaptured',
      aggregateType: 'FeePayment',
      aggregateId: created.id,
      schoolId,
      payload: {
        id: created.id,
        studentId: created.studentId,
        method: created.method,
        amount: created.amount,
        paidAt: created.paidAt.toISOString(),
        verificationStatus: 'PENDING',
        allocations: created.allocations.map((a) => ({
          invoiceId: a.feeInvoiceId,
          amount: a.amount,
        })),
      },
    });

    // Audit — keep `fee-payment.captured` and surface verificationStatus.
    await this.audit.record(
      {
        action: 'fee-payment.captured',
        category: 'finance',
        resourceType: 'FeePayment',
        resourceId: created.id,
        after: {
          id: created.id,
          studentId: created.studentId,
          method: created.method,
          amount: created.amount,
          status: created.status,
          verificationStatus: created.verificationStatus,
          paidAt: created.paidAt.toISOString(),
          paymentSourceId: created.paymentSourceId,
          allocations: created.allocations.map((a) => ({
            id: a.id,
            invoiceId: a.feeInvoiceId,
            amount: a.amount,
          })),
        },
      },
      { tx: tx as unknown as AuditTxLike },
    );

    this.logger.log(
      `FeePayment captured (pending verification) id=${created.id} method=${created.method} amount=${amount}.`,
    );

    // Reference the AUTO_CAPTURE_METHODS constant to keep it live for tests.
    void AUTO_CAPTURE_METHODS;

    return { payment: created, receipt: null };
  }

  private async loadReceiptForPayment(
    tx: PrismaTx | undefined,
    feePaymentId: string,
  ): Promise<FeeReceiptRow | null> {
    const reader = tx ?? (this.prisma.client as unknown as PrismaTx);
    const schoolId = this.requireSchoolId();
    const row = await reader.feeReceipt.findFirst({
      where: { schoolId, feePaymentId, deletedAt: null },
    });
    if (row === null) return null;
    return mapReceipt(row as unknown as RawReceipt);
  }

  private async resolveFiscalYearForDate(
    tx: PrismaTx,
    paidAt: Date,
  ): Promise<string> {
    const schoolId = this.requireSchoolId();
    const ay = await tx.academicYear.findFirst({
      where: {
        schoolId,
        deletedAt: null,
        startDate: { lte: paidAt },
        endDate: { gte: paidAt },
      },
      select: { startDate: true },
    });
    if (ay === null) {
      throw new FeesCrossTenantReferenceError(
        'AcademicYear',
        `paidAt:${paidAt.toISOString()}`,
      );
    }
    const startYear = ay.startDate.getUTCFullYear();
    const endTwo = ((startYear + 1) % 100).toString().padStart(2, '0');
    return `${startYear}-${endTwo}`;
  }

  private formatReceiptNo(fiscalYear: string, seq: number): string {
    const seqStr = seq.toString().padStart(6, '0');
    return `RCP/${fiscalYear}/${seqStr}`;
  }

  private async assertTenantRefs(tx: PrismaTx, refs: TenantRefs): Promise<void> {
    const schoolId = this.requireSchoolId();
    for (const id of dedupe(refs.studentIds)) {
      const found = await tx.student.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Student', id);
    }
    for (const id of dedupe(refs.feeInvoiceIds)) {
      const found = await tx.feeInvoice.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) {
        throw new FeesCrossTenantReferenceError('FeeInvoice', id);
      }
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeePaymentService requires tenant scope.');
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
// Local helpers + receipt mapper
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
    status: row.status as FeeReceiptRow['status'],
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

function dedupe(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined || values.length === 0) return [];
  return Array.from(new Set(values));
}

export const __test__ = { round2 };
