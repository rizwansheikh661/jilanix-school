/**
 * InvoiceService — orchestrates the platform-side invoice FSM and all
 * money-bearing side effects:
 *
 *   DRAFT → (issue) → PENDING → (apply payments) → PARTIALLY_PAID → PAID
 *                              ↳ (markOverdue cron)       → OVERDUE
 *                              ↳ (void / writeOff)        → VOID / WRITTEN_OFF
 *
 * Every mutation:
 *   - is gated by `module.billing`,
 *   - happens inside a single `$transaction`,
 *   - appends an `InvoiceHistory` row,
 *   - publishes a billing outbox event,
 *   - records a finance-category audit row,
 *   - and, for the money-bearing helpers (applyPayment / applyRefundReversal /
 *     applyCreditNote / applyAdjustment) bumps the running counters on the
 *     parent `BillingAccount` via `BillingAccountService.incrementBalances`.
 *
 * Sequence allocation (`BILLING_INVOICE`) happens inside the tx on `issue` so
 * an aborted issuance rolls the counter back.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { SequenceService } from '../../sequences/sequence/sequence.service';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import {
  BILLING_DEFAULT_BILLING_LEAD_DAYS,
  BILLING_DEFAULT_GRACE_PERIOD_DAYS,
  BILLING_INVOICE_NUMBER_PREFIX,
  BillingOutboxTopics,
} from '../billing.constants';
import {
  BillingAccountNotFoundError,
  InvalidInvoiceTransitionError,
  InvoiceNotFoundError,
} from '../billing.errors';
import {
  assertBillingEnabled,
  computeFiscalYear,
  computeTotalsFromLines,
  formatInvoiceNumber,
  roundMoney,
} from '../billing.shared';
import type {
  AdjustmentKindValue,
  InvoiceLineRow,
  InvoiceRow,
  InvoiceStatusValue,
} from '../billing.types';
import { BillingAccountRepository } from '../account/billing-account.repository';
import { BillingAccountService } from '../account/billing-account.service';
import { BillingSettingsRepository } from '../settings/billing-settings.repository';
import {
  InvoiceRepository,
  type CreateInvoiceLineInput,
  type InvoiceHistoryRow,
  type ListInvoicesArgs,
} from './invoice.repository';

export interface CreateInvoiceDraftArgs {
  readonly accountId: string;
  readonly schoolId: string;
  readonly fiscalYear: string;
  readonly subscriptionId?: string | null;
  readonly billingCycle?: string | null;
  readonly periodStart?: Date | null;
  readonly periodEnd?: Date | null;
  readonly dueDate?: Date | null;
  readonly currency?: string;
  readonly notes?: string | null;
  readonly lines: readonly CreateInvoiceLineInput[];
}

export interface IssueInvoiceArgs {
  readonly invoiceId: string;
  readonly expectedVersion: number;
  readonly issuedAt?: Date | null;
  readonly dueDate?: Date | null;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: InvoiceRepository,
    private readonly accountRepo: BillingAccountRepository,
    private readonly accountService: BillingAccountService,
    private readonly settingsRepo: BillingSettingsRepository,
    private readonly sequences: SequenceService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public async get(id: string): Promise<InvoiceRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new InvoiceNotFoundError(id);
    return row;
  }

  public async getWithLines(
    id: string,
  ): Promise<{ readonly invoice: InvoiceRow; readonly lines: readonly InvoiceLineRow[] }> {
    const found = await this.repo.findWithLines(id);
    if (found === null) throw new InvoiceNotFoundError(id);
    return found;
  }

  public async list(query: ListInvoicesArgs): Promise<{
    readonly items: readonly InvoiceRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.list(query);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  public async listHistory(invoiceId: string): Promise<readonly InvoiceHistoryRow[]> {
    await this.get(invoiceId);
    return this.repo.listHistory(invoiceId);
  }

  // -------------------------------------------------------------------------
  // createDraft
  // -------------------------------------------------------------------------

  public async createDraft(args: CreateInvoiceDraftArgs): Promise<{
    readonly invoice: InvoiceRow;
    readonly lines: readonly InvoiceLineRow[];
  }> {
    await assertBillingEnabled(this.featureFlags, args.schoolId);
    const account = await this.accountRepo.findById(args.accountId);
    if (account === null) throw new BillingAccountNotFoundError(args.accountId);

    const totals = computeTotalsFromLines(args.lines);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      // DRAFT invoices use a placeholder number — replaced on issue().
      const draftNumber = `DRAFT-${randomToken()}`;
      const invoice = await this.repo.createInvoice(
        {
          accountId: args.accountId,
          schoolId: args.schoolId,
          invoiceNumber: draftNumber,
          status: 'DRAFT',
          fiscalYear: args.fiscalYear,
          subscriptionId: args.subscriptionId ?? null,
          billingCycle: args.billingCycle ?? null,
          periodStart: args.periodStart ?? null,
          periodEnd: args.periodEnd ?? null,
          dueDate: args.dueDate ?? null,
          currency: args.currency ?? account.currency,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          totalAmount: totals.totalAmount,
          amountDue: totals.totalAmount,
          notes: args.notes ?? null,
        },
        tx,
      );
      const lines = await this.repo.replaceLines(invoice.id, args.lines, tx);
      await this.repo.appendHistory(
        {
          invoiceId: invoice.id,
          schoolId: invoice.schoolId,
          action: 'CREATED',
          toStatus: 'DRAFT',
          amount: invoice.totalAmount,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.INVOICE_CREATED,
        eventType: 'InvoiceCreated',
        aggregateType: 'Invoice',
        aggregateId: invoice.id,
        schoolId: invoice.schoolId,
        payload: {
          invoiceId: invoice.id,
          accountId: invoice.accountId,
          schoolId: invoice.schoolId,
          totalAmount: invoice.totalAmount,
          fiscalYear: invoice.fiscalYear,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.invoice.created',
          category: 'finance',
          resourceType: 'Invoice',
          resourceId: invoice.id,
          schoolId: invoice.schoolId,
          after: invoice,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Invoice DRAFT created id=${invoice.id} accountId=${invoice.accountId} total=${invoice.totalAmount}.`,
      );
      return { invoice, lines };
    });
  }

  // -------------------------------------------------------------------------
  // issue — DRAFT → PENDING
  // -------------------------------------------------------------------------

  public async issue(args: IssueInvoiceArgs): Promise<InvoiceRow> {
    const existing = await this.repo.findById(args.invoiceId);
    if (existing === null) throw new InvoiceNotFoundError(args.invoiceId);
    if (existing.status !== 'DRAFT') {
      throw new InvalidInvoiceTransitionError(existing.status, 'PENDING');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    const account = await this.accountRepo.findById(existing.accountId);
    if (account === null) throw new BillingAccountNotFoundError(existing.accountId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const seq = await this.sequences.nextValue(SEQ_NAMES.BILLING_INVOICE, {
        fiscalYear: existing.fiscalYear,
        tx,
      });
      const settings = await this.settingsRepo.findByAccountId(existing.accountId, tx);
      const prefix = settings?.invoicePrefix ?? BILLING_INVOICE_NUMBER_PREFIX;
      const invoiceNumber = formatInvoiceNumber(prefix, existing.fiscalYear, seq);

      const profile = await tx.billingProfile.findFirst({ where: { accountId: account.id } });
      const address = await tx.billingAddress.findFirst({ where: { accountId: account.id } });
      const taxDetails = await tx.taxDetails.findFirst({ where: { accountId: account.id } });

      const issuedAt = args.issuedAt ?? new Date();
      const lead = settings?.billingLeadDays ?? BILLING_DEFAULT_BILLING_LEAD_DAYS;
      const grace = settings?.gracePeriodDays ?? BILLING_DEFAULT_GRACE_PERIOD_DAYS;
      const fallbackDue = new Date(issuedAt.getTime() + (lead + grace) * 86_400_000);
      const dueDate = args.dueDate ?? existing.dueDate ?? fallbackDue;

      const updated = await this.repo.updateInvoice(
        existing.id,
        args.expectedVersion,
        {
          status: 'PENDING',
          issuedAt,
          dueDate,
          profileSnapshot: profile ?? null,
          addressSnapshot: address ?? null,
          taxSnapshot: taxDetails ?? null,
        },
        tx,
      );
      // Switch the placeholder DRAFT number for the canonical issued number.
      await tx.invoice.update({
        where: { id: existing.id },
        data: { invoiceNumber },
      });

      // Counters on the parent account.
      await this.accountService.incrementBalances(
        existing.accountId,
        {
          totalInvoiced: existing.totalAmount,
          balanceDue: existing.amountDue,
          lastInvoiceAt: issuedAt,
        },
        tx,
      );

      await this.repo.appendHistory(
        {
          invoiceId: existing.id,
          schoolId: existing.schoolId,
          action: 'ISSUED',
          fromStatus: 'DRAFT',
          toStatus: 'PENDING',
          amount: existing.totalAmount,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.INVOICE_ISSUED,
        eventType: 'InvoiceIssued',
        aggregateType: 'Invoice',
        aggregateId: existing.id,
        schoolId: existing.schoolId,
        payload: {
          invoiceId: existing.id,
          accountId: existing.accountId,
          schoolId: existing.schoolId,
          invoiceNumber,
          totalAmount: existing.totalAmount,
          dueDate: dueDate.toISOString(),
          fiscalYear: existing.fiscalYear,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.invoice.issued',
          category: 'finance',
          resourceType: 'Invoice',
          resourceId: existing.id,
          schoolId: existing.schoolId,
          before: existing,
          after: { ...updated, invoiceNumber },
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Invoice issued id=${existing.id} number=${invoiceNumber} due=${dueDate.toISOString()}.`,
      );
      return { ...updated, invoiceNumber };
    });
  }

  // -------------------------------------------------------------------------
  // void — any non-PAID/VOID/WRITTEN_OFF → VOID
  // -------------------------------------------------------------------------

  public async void(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<InvoiceRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new InvoiceNotFoundError(id);
    if (
      existing.status === 'PAID' ||
      existing.status === 'VOID' ||
      existing.status === 'WRITTEN_OFF' ||
      existing.status === 'REFUNDED'
    ) {
      throw new InvalidInvoiceTransitionError(existing.status, 'VOID');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const voidedAt = new Date();
      const updated = await this.repo.updateInvoice(
        id,
        expectedVersion,
        {
          status: 'VOID',
          voidedAt,
          voidReason: reason,
          amountDue: 0,
        },
        tx,
      );
      // Reverse running balance if invoice was already issued.
      if (existing.status !== 'DRAFT') {
        await this.accountService.incrementBalances(
          existing.accountId,
          {
            totalInvoiced: -existing.totalAmount,
            balanceDue: -existing.amountDue,
          },
          tx,
        );
      }
      await this.repo.appendHistory(
        {
          invoiceId: id,
          schoolId: existing.schoolId,
          action: 'VOIDED',
          fromStatus: existing.status,
          toStatus: 'VOID',
          amount: existing.amountDue,
          notes: reason,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.INVOICE_VOIDED,
        eventType: 'InvoiceVoided',
        aggregateType: 'Invoice',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: {
          invoiceId: id,
          accountId: existing.accountId,
          schoolId: existing.schoolId,
          reason,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.invoice.voided',
          category: 'finance',
          resourceType: 'Invoice',
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
  // writeOff — any non-terminal → WRITTEN_OFF
  // -------------------------------------------------------------------------

  public async writeOff(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<InvoiceRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new InvoiceNotFoundError(id);
    if (
      existing.status === 'PAID' ||
      existing.status === 'VOID' ||
      existing.status === 'WRITTEN_OFF'
    ) {
      throw new InvalidInvoiceTransitionError(existing.status, 'WRITTEN_OFF');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.updateInvoice(
        id,
        expectedVersion,
        {
          status: 'WRITTEN_OFF',
          amountDue: 0,
          notes: reason,
        },
        tx,
      );
      await this.accountService.incrementBalances(
        existing.accountId,
        { balanceDue: -existing.amountDue },
        tx,
      );
      await this.repo.appendHistory(
        {
          invoiceId: id,
          schoolId: existing.schoolId,
          action: 'WRITTEN_OFF',
          fromStatus: existing.status,
          toStatus: 'WRITTEN_OFF',
          amount: existing.amountDue,
          notes: reason,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.INVOICE_WRITTEN_OFF,
        eventType: 'InvoiceWrittenOff',
        aggregateType: 'Invoice',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: {
          invoiceId: id,
          accountId: existing.accountId,
          schoolId: existing.schoolId,
          amount: existing.amountDue,
          reason,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.invoice.written_off',
          category: 'finance',
          resourceType: 'Invoice',
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
  // markOverdue — PENDING / PARTIALLY_PAID → OVERDUE (cron-driven)
  // -------------------------------------------------------------------------

  public async markOverdue(id: string, expectedVersion: number): Promise<InvoiceRow> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new InvoiceNotFoundError(id);
    if (existing.status !== 'PENDING' && existing.status !== 'PARTIALLY_PAID') {
      throw new InvalidInvoiceTransitionError(existing.status, 'OVERDUE');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.updateInvoice(
        id,
        expectedVersion,
        { status: 'OVERDUE' },
        tx,
      );
      await this.repo.appendHistory(
        {
          invoiceId: id,
          schoolId: existing.schoolId,
          action: 'MARKED_OVERDUE',
          fromStatus: existing.status,
          toStatus: 'OVERDUE',
          amount: existing.amountDue,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.INVOICE_OVERDUE,
        eventType: 'InvoiceOverdue',
        aggregateType: 'Invoice',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: {
          invoiceId: id,
          accountId: existing.accountId,
          schoolId: existing.schoolId,
          amountDue: existing.amountDue,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.invoice.overdue',
          category: 'finance',
          resourceType: 'Invoice',
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
  // applyPayment — internal helper called by PaymentService inside its tx.
  // Bumps amountPaid / amountDue; flips status to PAID or PARTIALLY_PAID.
  // -------------------------------------------------------------------------

  public async applyPayment(
    invoiceId: string,
    paymentAmount: number,
    tx: PrismaTx,
  ): Promise<InvoiceRow> {
    const existing = await this.repo.findById(invoiceId, tx);
    if (existing === null) throw new InvoiceNotFoundError(invoiceId);

    const newPaid = roundMoney(existing.amountPaid + paymentAmount);
    const newDue = roundMoney(existing.totalAmount - newPaid - existing.amountRefunded);
    const nextStatus: InvoiceStatusValue = newDue <= 0 ? 'PAID' : 'PARTIALLY_PAID';
    const historyAction =
      nextStatus === 'PAID' ? 'PAID' : 'PARTIAL_PAYMENT';
    const updated = await this.repo.updateInvoice(
      invoiceId,
      existing.version,
      {
        status: nextStatus,
        amountPaid: newPaid,
        amountDue: Math.max(newDue, 0),
        ...(nextStatus === 'PAID' ? { paidAt: new Date() } : {}),
      },
      tx,
    );
    await this.accountService.incrementBalances(
      existing.accountId,
      {
        totalPaid: paymentAmount,
        balanceDue: -paymentAmount,
        lastPaymentAt: new Date(),
      },
      tx,
    );
    await this.repo.appendHistory(
      {
        invoiceId,
        schoolId: existing.schoolId,
        action: historyAction,
        fromStatus: existing.status,
        toStatus: nextStatus,
        amount: paymentAmount,
      },
      tx,
    );
    await this.outbox.publish(tx, {
      topic:
        nextStatus === 'PAID'
          ? BillingOutboxTopics.INVOICE_PAID
          : BillingOutboxTopics.INVOICE_PARTIALLY_PAID,
      eventType: nextStatus === 'PAID' ? 'InvoicePaid' : 'InvoicePartiallyPaid',
      aggregateType: 'Invoice',
      aggregateId: invoiceId,
      schoolId: existing.schoolId,
      payload: {
        invoiceId,
        accountId: existing.accountId,
        schoolId: existing.schoolId,
        paymentAmount,
        amountPaid: newPaid,
        amountDue: Math.max(newDue, 0),
      } as unknown as Prisma.InputJsonValue,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // applyRefundReversal — internal; called by RefundService.markProcessed.
  // Bumps amountRefunded, re-raises amountDue, transitions to REFUNDED when
  // the refund fully reverses the paid total.
  // -------------------------------------------------------------------------

  public async applyRefundReversal(
    invoiceId: string,
    refundAmount: number,
    tx: PrismaTx,
  ): Promise<InvoiceRow> {
    const existing = await this.repo.findById(invoiceId, tx);
    if (existing === null) throw new InvoiceNotFoundError(invoiceId);

    const newRefunded = roundMoney(existing.amountRefunded + refundAmount);
    const newDue = roundMoney(existing.totalAmount - existing.amountPaid + newRefunded);
    const nextStatus: InvoiceStatusValue =
      newRefunded >= existing.amountPaid && existing.amountPaid > 0
        ? 'REFUNDED'
        : existing.status;

    const updated = await this.repo.updateInvoice(
      invoiceId,
      existing.version,
      {
        amountRefunded: newRefunded,
        amountDue: Math.max(newDue, 0),
        status: nextStatus,
      },
      tx,
    );
    await this.accountService.incrementBalances(
      existing.accountId,
      {
        totalRefunded: refundAmount,
        balanceDue: refundAmount,
      },
      tx,
    );
    await this.repo.appendHistory(
      {
        invoiceId,
        schoolId: existing.schoolId,
        action: nextStatus === 'REFUNDED' ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        fromStatus: existing.status,
        toStatus: nextStatus,
        amount: refundAmount,
      },
      tx,
    );
    return updated;
  }

  // -------------------------------------------------------------------------
  // applyCreditNote — internal; reduces amountDue, flips to PAID if zero.
  // -------------------------------------------------------------------------

  public async applyCreditNote(
    invoiceId: string,
    creditAmount: number,
    creditNoteId: string,
    tx: PrismaTx,
  ): Promise<InvoiceRow> {
    const existing = await this.repo.findById(invoiceId, tx);
    if (existing === null) throw new InvoiceNotFoundError(invoiceId);

    const newDue = roundMoney(existing.amountDue - creditAmount);
    const nextStatus: InvoiceStatusValue = newDue <= 0 ? 'PAID' : existing.status;

    const updated = await this.repo.updateInvoice(
      invoiceId,
      existing.version,
      {
        amountDue: Math.max(newDue, 0),
        status: nextStatus,
        ...(nextStatus === 'PAID' && existing.status !== 'PAID' ? { paidAt: new Date() } : {}),
      },
      tx,
    );
    await this.accountService.incrementBalances(
      existing.accountId,
      { balanceDue: -creditAmount },
      tx,
    );
    await this.repo.appendHistory(
      {
        invoiceId,
        schoolId: existing.schoolId,
        action: 'CREDIT_NOTE_APPLIED',
        fromStatus: existing.status,
        toStatus: nextStatus,
        amount: creditAmount,
        metadata: { creditNoteId },
      },
      tx,
    );
    return updated;
  }

  // -------------------------------------------------------------------------
  // applyAdjustment — internal; CREDIT reduces amountDue, DEBIT raises it.
  // -------------------------------------------------------------------------

  public async applyAdjustment(
    invoiceId: string,
    amount: number,
    kind: AdjustmentKindValue,
    adjustmentId: string,
    tx: PrismaTx,
  ): Promise<InvoiceRow> {
    const existing = await this.repo.findById(invoiceId, tx);
    if (existing === null) throw new InvoiceNotFoundError(invoiceId);

    const signed = kind === 'CREDIT' ? -amount : amount;
    const newDue = roundMoney(existing.amountDue + signed);
    const updated = await this.repo.updateInvoice(
      invoiceId,
      existing.version,
      { amountDue: Math.max(newDue, 0) },
      tx,
    );
    await this.accountService.incrementBalances(
      existing.accountId,
      { balanceDue: signed },
      tx,
    );
    await this.repo.appendHistory(
      {
        invoiceId,
        schoolId: existing.schoolId,
        action: 'ADJUSTMENT_APPLIED',
        fromStatus: existing.status,
        toStatus: existing.status,
        amount: signed,
        metadata: { adjustmentId, kind },
      },
      tx,
    );
    return updated;
  }

  /** Convenience: derive an FY string for callers that don't track it. */
  public fiscalYearFor(date: Date): string {
    return computeFiscalYear(date);
  }
}

// ---------------------------------------------------------------------------
// Internal — short opaque token for DRAFT invoice numbers (replaced on issue)
// ---------------------------------------------------------------------------
function randomToken(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
