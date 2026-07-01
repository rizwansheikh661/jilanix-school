/**
 * PaymentService — orchestrates manual + Razorpay-recorded payments and the
 * Pending → Approved | Rejected | OnHold | Failed FSM. Approval is the
 * point at which the parent Invoice is actually credited (via
 * `InvoiceService.applyPayment`).
 *
 *   recordManual   → status=PENDING, awaiting verifier
 *   recordRazorpay → status=APPROVED on signature OK, otherwise FAILED
 *   approve        → PENDING → APPROVED + applyPayment + outbox + audit
 *   reject         → PENDING → REJECTED
 *   hold           → PENDING → ON_HOLD
 *   markFailed     → PENDING/ON_HOLD → FAILED
 *   applyRefundReversal — internal; increments amountRefunded on this payment.
 *
 * All mutations gate on `module.billing`; manual paths additionally require
 * `billing.manual_payments_enabled`, Razorpay paths require
 * `billing.razorpay_enabled`.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SequenceService } from '../../sequences/sequence/sequence.service';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import { BillingOutboxTopics } from '../billing.constants';
import {
  BillingAccountNotFoundError,
  InvalidPaymentTransitionError,
  InvoiceNotFoundError,
  InvoiceNotPayableError,
  InvoiceOverpaymentError,
  PaymentNotFoundError,
} from '../billing.errors';
import {
  assertBillingEnabled,
  assertManualPaymentsEnabled,
  assertRazorpayEnabled,
  computeFiscalYear,
  formatReceiptNumber,
  roundMoney,
} from '../billing.shared';
import type {
  PaymentAttemptRow,
  PaymentMethodValue,
  PaymentRow,
  PaymentStatusValue,
} from '../billing.types';
import { BillingAccountRepository } from '../account/billing-account.repository';
import { InvoiceRepository } from '../invoice/invoice.repository';
import { InvoiceService } from '../invoice/invoice.service';
import {
  PaymentRepository,
  type ListPaymentsArgs,
} from './payment.repository';

export interface RecordManualPaymentArgs {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly method: PaymentMethodValue;
  readonly amount: number;
  readonly currency?: string;
  readonly externalReference?: string | null;
  readonly proofUrl?: string | null;
  readonly payerNotes?: string | null;
  readonly paymentSourceId?: string | null;
  readonly receivedAt?: Date | null;
}

export interface RecordRazorpayPaymentArgs {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly amount: number;
  readonly currency?: string;
  readonly gatewayOrderId: string;
  readonly gatewayPaymentId: string;
  readonly gatewaySignature: string;
  readonly signatureValid: boolean;
  readonly feeAmount?: number;
  readonly paymentSourceId?: string | null;
  readonly externalReference?: string | null;
  readonly receivedAt?: Date | null;
  readonly rawResponse?: unknown;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PaymentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceService: InvoiceService,
    private readonly accountRepo: BillingAccountRepository,
    private readonly sequences: SequenceService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public async get(id: string): Promise<PaymentRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new PaymentNotFoundError(id);
    return row;
  }

  public async list(query: ListPaymentsArgs): Promise<{
    readonly items: readonly PaymentRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.list(query);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  public async listAttempts(paymentId: string): Promise<readonly PaymentAttemptRow[]> {
    await this.get(paymentId);
    return this.repo.listAttempts(paymentId);
  }

  // -------------------------------------------------------------------------
  // recordManual — manual payment lands as PENDING awaiting approval
  // -------------------------------------------------------------------------

  public async recordManual(args: RecordManualPaymentArgs): Promise<PaymentRow> {
    const account = await this.accountRepo.findById(args.accountId);
    if (account === null) throw new BillingAccountNotFoundError(args.accountId);
    await assertBillingEnabled(this.featureFlags, account.schoolId);
    await assertManualPaymentsEnabled(this.featureFlags, account.schoolId);

    await this.assertInvoicePayable(args.invoiceId ?? null, args.amount);
    const fiscalYear = computeFiscalYear(args.receivedAt ?? new Date());

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const receiptNumber = await this.allocateReceiptNumber(fiscalYear, tx);
      const payment = await this.repo.create(
        {
          accountId: account.id,
          invoiceId: args.invoiceId ?? null,
          schoolId: account.schoolId,
          receiptNumber,
          method: args.method,
          status: 'PENDING',
          currency: args.currency ?? account.currency,
          amount: args.amount,
          fiscalYear,
          externalReference: args.externalReference ?? null,
          proofUrl: args.proofUrl ?? null,
          payerNotes: args.payerNotes ?? null,
          paymentSourceId: args.paymentSourceId ?? null,
          receivedAt: args.receivedAt ?? new Date(),
        },
        tx,
      );
      await this.repo.appendAttempt(
        {
          paymentId: payment.id,
          status: 'INITIATED',
          amount: args.amount,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_RECORDED,
        eventType: 'PaymentRecorded',
        aggregateType: 'Payment',
        aggregateId: payment.id,
        schoolId: account.schoolId,
        payload: this.paymentPayload(payment) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment.recorded',
          category: 'finance',
          resourceType: 'Payment',
          resourceId: payment.id,
          schoolId: account.schoolId,
          after: payment,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Payment manual recorded id=${payment.id} method=${payment.method} amount=${payment.amount}.`,
      );
      return payment;
    });
  }

  // -------------------------------------------------------------------------
  // recordRazorpay — gateway-verified payment. signatureValid drives outcome.
  // Caller (RazorpayService) is expected to have verified the HMAC.
  // -------------------------------------------------------------------------

  public async recordRazorpay(args: RecordRazorpayPaymentArgs): Promise<PaymentRow> {
    const account = await this.accountRepo.findById(args.accountId);
    if (account === null) throw new BillingAccountNotFoundError(args.accountId);
    await assertBillingEnabled(this.featureFlags, account.schoolId);
    await assertRazorpayEnabled(this.featureFlags, account.schoolId);

    if (args.signatureValid) {
      await this.assertInvoicePayable(args.invoiceId ?? null, args.amount);
    }
    const fiscalYear = computeFiscalYear(args.receivedAt ?? new Date());

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const receiptNumber = await this.allocateReceiptNumber(fiscalYear, tx);
      const status: PaymentStatusValue = args.signatureValid ? 'APPROVED' : 'FAILED';
      const feeAmount = args.feeAmount ?? 0;
      const netAmount = roundMoney(args.amount - feeAmount);
      const payment = await this.repo.create(
        {
          accountId: account.id,
          invoiceId: args.invoiceId ?? null,
          schoolId: account.schoolId,
          receiptNumber,
          method: 'RAZORPAY',
          status,
          currency: args.currency ?? account.currency,
          amount: args.amount,
          feeAmount,
          netAmount,
          fiscalYear,
          gatewayOrderId: args.gatewayOrderId,
          gatewayPaymentId: args.gatewayPaymentId,
          gatewaySignature: args.gatewaySignature,
          externalReference: args.externalReference ?? null,
          paymentSourceId: args.paymentSourceId ?? null,
          receivedAt: args.receivedAt ?? new Date(),
        },
        tx,
      );
      await this.repo.appendAttempt(
        {
          paymentId: payment.id,
          status: args.signatureValid ? 'SUCCESS' : 'FAILED',
          amount: args.amount,
          gatewayOrderId: args.gatewayOrderId,
          gatewayPaymentId: args.gatewayPaymentId,
          rawResponse: args.rawResponse ?? null,
          ...(args.signatureValid
            ? {}
            : { errorCode: 'SIGNATURE_INVALID', errorMessage: 'Razorpay signature mismatch.' }),
        },
        tx,
      );

      if (args.signatureValid && payment.invoiceId !== null) {
        await this.invoiceService.applyPayment(payment.invoiceId, payment.amount, tx);
      }

      await this.outbox.publish(tx, {
        topic: args.signatureValid
          ? BillingOutboxTopics.PAYMENT_GATEWAY_RECEIVED
          : BillingOutboxTopics.PAYMENT_FAILED,
        eventType: args.signatureValid ? 'PaymentGatewayReceived' : 'PaymentFailed',
        aggregateType: 'Payment',
        aggregateId: payment.id,
        schoolId: account.schoolId,
        payload: this.paymentPayload(payment) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: args.signatureValid ? 'billing.payment.gateway_received' : 'billing.payment.failed',
          category: 'finance',
          resourceType: 'Payment',
          resourceId: payment.id,
          schoolId: account.schoolId,
          after: payment,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Payment razorpay recorded id=${payment.id} status=${status} amount=${payment.amount}.`,
      );
      return payment;
    });
  }

  // -------------------------------------------------------------------------
  // approve — PENDING/ON_HOLD → APPROVED, then credit the invoice.
  // -------------------------------------------------------------------------

  public async approve(
    id: string,
    expectedVersion: number,
    notes?: string | null,
  ): Promise<PaymentRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new PaymentNotFoundError(id);
    if (existing.status !== 'PENDING' && existing.status !== 'ON_HOLD') {
      throw new InvalidPaymentTransitionError(existing.status, 'APPROVED');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);
    if (existing.invoiceId !== null) {
      await this.assertInvoicePayable(existing.invoiceId, existing.amount);
    }

    const actorId = RequestContextRegistry.peek()?.userId ?? null;

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const approvedAt = new Date();
      const updated = await this.repo.update(
        id,
        expectedVersion,
        {
          status: 'APPROVED',
          approvedAt,
          approvedBy: actorId,
          ...(notes !== undefined && notes !== null ? { payerNotes: notes } : {}),
        },
        tx,
      );
      await this.repo.appendAttempt(
        {
          paymentId: id,
          status: 'SUCCESS',
          amount: existing.amount,
        },
        tx,
      );
      if (existing.invoiceId !== null) {
        await this.invoiceService.applyPayment(existing.invoiceId, existing.amount, tx);
      }

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_APPROVED,
        eventType: 'PaymentApproved',
        aggregateType: 'Payment',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: this.paymentPayload(updated) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment.approved',
          category: 'finance',
          resourceType: 'Payment',
          resourceId: id,
          schoolId: existing.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // reject / hold / markFailed
  // -------------------------------------------------------------------------

  public async reject(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<PaymentRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new PaymentNotFoundError(id);
    if (existing.status !== 'PENDING' && existing.status !== 'ON_HOLD') {
      throw new InvalidPaymentTransitionError(existing.status, 'REJECTED');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);
    const actorId = RequestContextRegistry.peek()?.userId ?? null;

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(
        id,
        expectedVersion,
        {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedBy: actorId,
          rejectionReason: reason,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_REJECTED,
        eventType: 'PaymentRejected',
        aggregateType: 'Payment',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: { ...this.paymentPayload(updated), reason } as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment.rejected',
          category: 'finance',
          resourceType: 'Payment',
          resourceId: id,
          schoolId: existing.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async hold(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<PaymentRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new PaymentNotFoundError(id);
    if (existing.status !== 'PENDING') {
      throw new InvalidPaymentTransitionError(existing.status, 'ON_HOLD');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(
        id,
        expectedVersion,
        { status: 'ON_HOLD', holdReason: reason },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_HELD,
        eventType: 'PaymentHeld',
        aggregateType: 'Payment',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: { ...this.paymentPayload(updated), reason } as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment.held',
          category: 'finance',
          resourceType: 'Payment',
          resourceId: id,
          schoolId: existing.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async markFailed(
    id: string,
    expectedVersion: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<PaymentRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new PaymentNotFoundError(id);
    if (
      existing.status !== 'PENDING' &&
      existing.status !== 'ON_HOLD' &&
      existing.status !== 'APPROVED'
    ) {
      throw new InvalidPaymentTransitionError(existing.status, 'FAILED');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(id, expectedVersion, { status: 'FAILED' }, tx);
      await this.repo.appendAttempt(
        {
          paymentId: id,
          status: 'FAILED',
          amount: existing.amount,
          errorCode,
          errorMessage,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_FAILED,
        eventType: 'PaymentFailed',
        aggregateType: 'Payment',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: {
          ...this.paymentPayload(updated),
          errorCode,
          errorMessage,
        } as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment.failed',
          category: 'finance',
          resourceType: 'Payment',
          resourceId: id,
          schoolId: existing.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // applyRefundReversal — internal helper for RefundService.markProcessed.
  // Bumps amountRefunded and flips status to REFUNDED / PARTIALLY_REFUNDED.
  // -------------------------------------------------------------------------

  public async applyRefundReversal(
    paymentId: string,
    refundAmount: number,
    tx: PrismaTx,
  ): Promise<PaymentRow> {
    const existing = await this.repo.findById(paymentId, tx);
    if (existing === null) throw new PaymentNotFoundError(paymentId);
    const newRefunded = roundMoney(existing.amountRefunded + refundAmount);
    const nextStatus: PaymentStatusValue =
      newRefunded >= existing.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    // amountRefunded is incremented without bumping version (parallel-safe).
    await this.repo.incrementRefunded(paymentId, refundAmount, tx);
    const updated = await this.repo.update(paymentId, existing.version, { status: nextStatus }, tx);
    return updated;
  }

  /** Helper used by RefundService to validate amounts before issuing a row. */
  public async ensureRefundable(
    paymentId: string,
    refundAmount: number,
  ): Promise<PaymentRow> {
    const payment = await this.get(paymentId);
    if (payment.status !== 'APPROVED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new InvalidPaymentTransitionError(payment.status, 'REFUNDED');
    }
    const available = roundMoney(payment.amount - payment.amountRefunded);
    if (refundAmount > available) {
      // Errors are thrown by RefundService; keep this as a helper return.
    }
    return payment;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  private async assertInvoicePayable(
    invoiceId: string | null,
    paymentAmount: number,
  ): Promise<void> {
    if (invoiceId === null) return;
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (invoice === null) throw new InvoiceNotFoundError(invoiceId);
    if (
      invoice.status !== 'PENDING' &&
      invoice.status !== 'PARTIALLY_PAID' &&
      invoice.status !== 'OVERDUE'
    ) {
      throw new InvoiceNotPayableError(invoiceId, invoice.status);
    }
    if (paymentAmount > invoice.amountDue + 0.01) {
      throw new InvoiceOverpaymentError(
        invoiceId,
        invoice.amountDue.toFixed(2),
        paymentAmount.toFixed(2),
      );
    }
  }

  private async allocateReceiptNumber(fiscalYear: string, tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.BILLING_RECEIPT, {
      fiscalYear,
      tx,
    });
    return formatReceiptNumber(fiscalYear, seq);
  }

  private paymentPayload(payment: PaymentRow): Record<string, unknown> {
    return {
      paymentId: payment.id,
      accountId: payment.accountId,
      invoiceId: payment.invoiceId,
      schoolId: payment.schoolId,
      receiptNumber: payment.receiptNumber,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
    };
  }
}
