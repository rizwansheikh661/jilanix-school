/**
 * CreditNoteService — orchestrates credit notes and adjustments.
 *
 *   issue          → ISSUED row, allocates CN number
 *   apply          → ISSUED → APPLIED, optionally credits an invoice via
 *                    InvoiceService.applyCreditNote (reduces amountDue and
 *                    grows the account's creditBalance counter when there is
 *                    no invoice link).
 *   void           → ISSUED/APPLIED → VOID (no money moves if already applied,
 *                    that's the operator's call to reverse manually)
 *   createAdjustment → standalone CREDIT/DEBIT against an invoice or account.
 *
 * All mutations gate on `module.billing`; each emits its own outbox event and
 * finance-category audit row inside a single transaction.
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
import { BillingOutboxTopics } from '../billing.constants';
import {
  BillingAccountNotFoundError,
  CreditNoteNotFoundError,
  InvalidCreditNoteTransitionError,
  InvoiceNotFoundError,
} from '../billing.errors';
import {
  assertBillingEnabled,
  computeFiscalYear,
  formatCreditNoteNumber,
} from '../billing.shared';
import type {
  AdjustmentKindValue,
  AdjustmentRow,
  CreditNoteRow,
} from '../billing.types';
import { BillingAccountRepository } from '../account/billing-account.repository';
import { BillingAccountService } from '../account/billing-account.service';
import { InvoiceRepository } from '../invoice/invoice.repository';
import { InvoiceService } from '../invoice/invoice.service';
import {
  CreditNoteRepository,
  type ListAdjustmentsArgs,
  type ListCreditNotesArgs,
} from './credit-note.repository';

export interface IssueCreditNoteArgs {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly amount: number;
  readonly reason: string;
  readonly currency?: string;
}

export interface CreateAdjustmentArgs {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly kind: AdjustmentKindValue;
  readonly amount: number;
  readonly reason: string;
  readonly currency?: string;
}

@Injectable()
export class CreditNoteService {
  private readonly logger = new Logger(CreditNoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: CreditNoteRepository,
    private readonly accountRepo: BillingAccountRepository,
    private readonly accountService: BillingAccountService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceService: InvoiceService,
    private readonly sequences: SequenceService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public async getCreditNote(id: string): Promise<CreditNoteRow> {
    const row = await this.repo.findCreditNoteById(id);
    if (row === null) throw new CreditNoteNotFoundError(id);
    return row;
  }

  public async listCreditNotes(query: ListCreditNotesArgs): Promise<{
    readonly items: readonly CreditNoteRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.listCreditNotes(query);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  public async getAdjustment(id: string): Promise<AdjustmentRow | null> {
    return this.repo.findAdjustmentById(id);
  }

  public async listAdjustments(query: ListAdjustmentsArgs): Promise<{
    readonly items: readonly AdjustmentRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.listAdjustments(query);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  // -------------------------------------------------------------------------
  // issue
  // -------------------------------------------------------------------------

  public async issue(args: IssueCreditNoteArgs): Promise<CreditNoteRow> {
    const account = await this.accountRepo.findById(args.accountId);
    if (account === null) throw new BillingAccountNotFoundError(args.accountId);
    if (args.invoiceId !== null && args.invoiceId !== undefined) {
      const invoice = await this.invoiceRepo.findById(args.invoiceId);
      if (invoice === null) throw new InvoiceNotFoundError(args.invoiceId);
    }
    await assertBillingEnabled(this.featureFlags, account.schoolId);
    const fiscalYear = computeFiscalYear(new Date());

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const seq = await this.sequences.nextValue(SEQ_NAMES.BILLING_CREDIT_NOTE, {
        fiscalYear,
        tx,
      });
      const creditNoteNumber = formatCreditNoteNumber(fiscalYear, seq);

      const cn = await this.repo.createCreditNote(
        {
          accountId: account.id,
          invoiceId: args.invoiceId ?? null,
          schoolId: account.schoolId,
          creditNoteNumber,
          status: 'ISSUED',
          currency: args.currency ?? account.currency,
          amount: args.amount,
          reason: args.reason,
          fiscalYear,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.CREDIT_NOTE_ISSUED,
        eventType: 'CreditNoteIssued',
        aggregateType: 'CreditNote',
        aggregateId: cn.id,
        schoolId: account.schoolId,
        payload: this.cnPayload(cn) as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.credit_note.issued',
          category: 'finance',
          resourceType: 'CreditNote',
          resourceId: cn.id,
          schoolId: account.schoolId,
          after: cn,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `CreditNote issued id=${cn.id} number=${creditNoteNumber} amount=${cn.amount}.`,
      );
      return cn;
    });
  }

  // -------------------------------------------------------------------------
  // apply — ISSUED → APPLIED. If linked to an invoice, credits the invoice
  // via InvoiceService.applyCreditNote; otherwise grows the account's
  // creditBalance counter.
  // -------------------------------------------------------------------------

  public async apply(
    id: string,
    expectedVersion: number,
    invoiceId?: string | null,
  ): Promise<CreditNoteRow> {
    const existing = await this.repo.findCreditNoteById(id);
    if (existing === null) throw new CreditNoteNotFoundError(id);
    if (existing.status !== 'ISSUED') {
      throw new InvalidCreditNoteTransitionError(existing.status, 'APPLIED');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);
    const targetInvoiceId = invoiceId ?? existing.invoiceId;
    if (targetInvoiceId !== null && targetInvoiceId !== undefined) {
      const invoice = await this.invoiceRepo.findById(targetInvoiceId);
      if (invoice === null) throw new InvoiceNotFoundError(targetInvoiceId);
    }

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.updateCreditNote(
        id,
        expectedVersion,
        {
          status: 'APPLIED',
          appliedAt: new Date(),
          appliedToInvoiceId: targetInvoiceId ?? null,
          amountApplied: existing.amount,
        },
        tx,
      );
      if (targetInvoiceId !== null && targetInvoiceId !== undefined) {
        await this.invoiceService.applyCreditNote(targetInvoiceId, existing.amount, id, tx);
      } else {
        // No invoice — just grow the account's credit balance for later use.
        await this.accountService.incrementBalances(
          existing.accountId,
          { creditBalance: existing.amount },
          tx,
        );
      }

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.CREDIT_NOTE_APPLIED,
        eventType: 'CreditNoteApplied',
        aggregateType: 'CreditNote',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: {
          ...this.cnPayload(updated),
          appliedToInvoiceId: targetInvoiceId ?? null,
        } as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.credit_note.applied',
          category: 'finance',
          resourceType: 'CreditNote',
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
  // void — ISSUED/APPLIED → VOID
  // -------------------------------------------------------------------------

  public async void(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<CreditNoteRow> {
    const existing = await this.repo.findCreditNoteById(id);
    if (existing === null) throw new CreditNoteNotFoundError(id);
    if (existing.status === 'VOID') {
      throw new InvalidCreditNoteTransitionError(existing.status, 'VOID');
    }
    await assertBillingEnabled(this.featureFlags, existing.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.updateCreditNote(
        id,
        expectedVersion,
        { status: 'VOID', voidedAt: new Date(), voidReason: reason },
        tx,
      );
      // If the CN had only grown the account credit balance (no invoice
      // application), reverse that credit on void.
      if (existing.status === 'APPLIED' && existing.appliedToInvoiceId === null) {
        await this.accountService.incrementBalances(
          existing.accountId,
          { creditBalance: -existing.amount },
          tx,
        );
      }

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.CREDIT_NOTE_VOIDED,
        eventType: 'CreditNoteVoided',
        aggregateType: 'CreditNote',
        aggregateId: id,
        schoolId: existing.schoolId,
        payload: { ...this.cnPayload(updated), reason } as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.credit_note.voided',
          category: 'finance',
          resourceType: 'CreditNote',
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
  // createAdjustment — standalone CREDIT or DEBIT on an invoice or account
  // -------------------------------------------------------------------------

  public async createAdjustment(args: CreateAdjustmentArgs): Promise<AdjustmentRow> {
    const account = await this.accountRepo.findById(args.accountId);
    if (account === null) throw new BillingAccountNotFoundError(args.accountId);
    if (args.invoiceId !== null && args.invoiceId !== undefined) {
      const invoice = await this.invoiceRepo.findById(args.invoiceId);
      if (invoice === null) throw new InvoiceNotFoundError(args.invoiceId);
    }
    await assertBillingEnabled(this.featureFlags, account.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const adj = await this.repo.createAdjustment(
        {
          accountId: account.id,
          invoiceId: args.invoiceId ?? null,
          schoolId: account.schoolId,
          kind: args.kind,
          currency: args.currency ?? account.currency,
          amount: args.amount,
          reason: args.reason,
        },
        tx,
      );

      if (args.invoiceId !== null && args.invoiceId !== undefined) {
        await this.invoiceService.applyAdjustment(
          args.invoiceId,
          args.amount,
          args.kind,
          adj.id,
          tx,
        );
      } else {
        const signed = args.kind === 'CREDIT' ? args.amount : -args.amount;
        await this.accountService.incrementBalances(
          account.id,
          { creditBalance: signed },
          tx,
        );
      }

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.ADJUSTMENT_APPLIED,
        eventType: 'AdjustmentApplied',
        aggregateType: 'Adjustment',
        aggregateId: adj.id,
        schoolId: account.schoolId,
        payload: {
          adjustmentId: adj.id,
          accountId: adj.accountId,
          invoiceId: adj.invoiceId,
          schoolId: adj.schoolId,
          kind: adj.kind,
          amount: adj.amount,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.adjustment.applied',
          category: 'finance',
          resourceType: 'Adjustment',
          resourceId: adj.id,
          schoolId: account.schoolId,
          after: adj,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Adjustment ${adj.kind} created id=${adj.id} amount=${adj.amount} invoiceId=${adj.invoiceId ?? 'none'}.`,
      );
      return adj;
    });
  }

  private cnPayload(cn: CreditNoteRow): Record<string, unknown> {
    return {
      creditNoteId: cn.id,
      creditNoteNumber: cn.creditNoteNumber,
      accountId: cn.accountId,
      invoiceId: cn.invoiceId,
      schoolId: cn.schoolId,
      amount: cn.amount,
      status: cn.status,
    };
  }
}
