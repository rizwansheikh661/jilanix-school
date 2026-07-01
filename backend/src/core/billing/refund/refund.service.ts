/**
 * RefundService — orchestrates the refund FSM and reverses the parent payment
 * + invoice when `markProcessed` fires.
 *
 *   create        → PENDING refund row (validates payment is refundable)
 *   approve       → PENDING → APPROVED
 *   reject        → PENDING/APPROVED → REJECTED
 *   markProcessed → APPROVED → PROCESSED + applyRefundReversal on payment &
 *                   invoice (when applicable)
 *
 * All mutations gate on `module.billing`; each emits an outbox event and
 * finance-category audit row inside the tx.
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
  InvalidPaymentTransitionError,
  InvalidRefundTransitionError,
  PaymentNotFoundError,
  RefundAmountExceedsPaymentError,
  RefundNotFoundError,
} from '../billing.errors';
import {
  assertBillingEnabled,
  computeFiscalYear,
  formatRefundNumber,
  roundMoney,
} from '../billing.shared';
import type { RefundRow } from '../billing.types';
import { PaymentRepository } from '../payment/payment.repository';
import { PaymentService } from '../payment/payment.service';
import { InvoiceService } from '../invoice/invoice.service';
import {
  RefundRepository,
  type ListRefundsArgs,
} from './refund.repository';

export interface CreateRefundArgs {
  readonly paymentId: string;
  readonly amount: number;
  readonly reason: string;
  readonly externalReference?: string | null;
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RefundRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly paymentService: PaymentService,
    private readonly invoiceService: InvoiceService,
    private readonly sequences: SequenceService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public async get(id: string): Promise<RefundRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new RefundNotFoundError(id);
    return row;
  }

  public async list(query: ListRefundsArgs): Promise<{
    readonly items: readonly RefundRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.list(query);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  // -------------------------------------------------------------------------
  // create — validates the payment, allocates a refund number, persists PENDING
  // -------------------------------------------------------------------------

  public async create(args: CreateRefundArgs): Promise<RefundRow> {
    const payment = await this.paymentRepo.findById(args.paymentId);
    if (payment === null) throw new PaymentNotFoundError(args.paymentId);
    if (payment.status !== 'APPROVED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new InvalidPaymentTransitionError(payment.status, 'REFUNDED');
    }
    const available = roundMoney(payment.amount - payment.amountRefunded);
    if (args.amount > available + 0.01) {
      throw new RefundAmountExceedsPaymentError(
        payment.id,
        args.amount.toFixed(2),
        available.toFixed(2),
      );
    }
    await assertBillingEnabled(this.featureFlags, payment.schoolId);

    const fiscalYear = computeFiscalYear(new Date());

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const seq = await this.sequences.nextValue(SEQ_NAMES.BILLING_REFUND, {
        fiscalYear,
        tx,
      });
      const refundNumber = formatRefundNumber(fiscalYear, seq);

      const refund = await this.repo.create(
        {
          accountId: payment.accountId,
          invoiceId: payment.invoiceId ?? null,
          paymentId: payment.id,
          schoolId: payment.schoolId,
          refundNumber,
          status: 'PENDING',
          currency: payment.currency,
          amount: args.amount,
          reason: args.reason,
          externalReference: args.externalReference ?? null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.REFUND_CREATED,
        eventType: 'RefundCreated',
        aggregateType: 'Refund',
        aggregateId: refund.id,
        schoolId: payment.schoolId,
        payload: this.payload(refund) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.refund.created',
          category: 'finance',
          resourceType: 'Refund',
          resourceId: refund.id,
          schoolId: payment.schoolId,
          after: refund,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Refund created id=${refund.id} number=${refundNumber} amount=${refund.amount}.`,
      );
      return refund;
    });
  }

  // -------------------------------------------------------------------------
  // approve — PENDING → APPROVED
  // -------------------------------------------------------------------------

  public async approve(id: string, expectedVersion: number): Promise<RefundRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new RefundNotFoundError(id);
    if (existing.status !== 'PENDING') {
      throw new InvalidRefundTransitionError(existing.status, 'APPROVED');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);
    const actorId = RequestContextRegistry.peek()?.userId ?? null;

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(
        id,
        expectedVersion,
        { status: 'APPROVED', approvedAt: new Date(), approvedBy: actorId },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.REFUND_APPROVED,
        eventType: 'RefundApproved',
        aggregateType: 'Refund',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: this.payload(updated) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.refund.approved',
          category: 'finance',
          resourceType: 'Refund',
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
  // reject — PENDING/APPROVED → REJECTED (no money moved)
  // -------------------------------------------------------------------------

  public async reject(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<RefundRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new RefundNotFoundError(id);
    if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
      throw new InvalidRefundTransitionError(existing.status, 'REJECTED');
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
        topic: BillingOutboxTopics.REFUND_REJECTED,
        eventType: 'RefundRejected',
        aggregateType: 'Refund',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: { ...this.payload(updated), reason } as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.refund.rejected',
          category: 'finance',
          resourceType: 'Refund',
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
  // markProcessed — APPROVED → PROCESSED + applyRefundReversal on parent
  // payment and invoice (when present).
  // -------------------------------------------------------------------------

  public async markProcessed(
    id: string,
    expectedVersion: number,
    gatewayRefundId?: string | null,
  ): Promise<RefundRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new RefundNotFoundError(id);
    if (existing.status !== 'APPROVED') {
      throw new InvalidRefundTransitionError(existing.status, 'PROCESSED');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);
    const actorId = RequestContextRegistry.peek()?.userId ?? null;

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(
        id,
        expectedVersion,
        {
          status: 'PROCESSED',
          processedAt: new Date(),
          processedBy: actorId,
          gatewayRefundId: gatewayRefundId ?? null,
        },
        tx,
      );
      // Reverse the parent payment.
      await this.paymentService.applyRefundReversal(existing.paymentId, existing.amount, tx);
      // Reverse the invoice if linked.
      if (existing.invoiceId !== null) {
        await this.invoiceService.applyRefundReversal(existing.invoiceId, existing.amount, tx);
      }

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.REFUND_PROCESSED,
        eventType: 'RefundProcessed',
        aggregateType: 'Refund',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: this.payload(updated) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.refund.processed',
          category: 'finance',
          resourceType: 'Refund',
          resourceId: id,
          schoolId: existing.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Refund processed id=${id} paymentId=${existing.paymentId} amount=${existing.amount}.`,
      );
      return updated;
    });
  }

  private payload(refund: RefundRow): Record<string, unknown> {
    return {
      refundId: refund.id,
      refundNumber: refund.refundNumber,
      paymentId: refund.paymentId,
      invoiceId: refund.invoiceId,
      accountId: refund.accountId,
      schoolId: refund.schoolId,
      amount: refund.amount,
      status: refund.status,
    };
  }
}
