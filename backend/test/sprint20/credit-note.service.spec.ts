/**
 * CreditNoteService unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - apply() transitions ISSUED → APPLIED and calls
 *     InvoiceService.applyCreditNote when the credit note targets an invoice.
 *     InvoiceService.applyCreditNote internally decrements the invoice's
 *     amountDue and (via BillingAccountService.incrementBalances) the
 *     account's balanceDue counter.
 *
 *   Note: when an issued credit-note has NO target invoice, apply() grows the
 *   account's `creditBalance` counter (positive). The "decrement creditBalance"
 *   case is the void() reversal of that path — covered here for completeness.
 */
import { withTestContext } from '../../src/core/request-context';
import { CreditNoteService } from '../../src/core/billing/credit-note/credit-note.service';
import { BillingOutboxTopics } from '../../src/core/billing/billing.constants';
import type { CreditNoteRow } from '../../src/core/billing/billing.types';

function makeCreditNote(overrides: Partial<CreditNoteRow> = {}): CreditNoteRow {
  return {
    id: 'cn-1',
    accountId: 'acc-1',
    invoiceId: 'inv-1',
    schoolId: 'school-1',
    creditNoteNumber: 'CN-2026-27-000001',
    status: 'ISSUED',
    currency: 'INR',
    amount: 300,
    amountApplied: 0,
    reason: 'goodwill credit',
    fiscalYear: '2026-27',
    appliedAt: null,
    appliedToInvoiceId: null,
    voidedAt: null,
    voidReason: null,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    client: {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    },
  };
  const repo = {
    findCreditNoteById: jest.fn(),
    listCreditNotes: jest.fn(),
    findAdjustmentById: jest.fn(),
    listAdjustments: jest.fn(),
    createCreditNote: jest.fn(),
    updateCreditNote: jest.fn(),
    createAdjustment: jest.fn(),
  };
  const accountRepo = { findById: jest.fn() };
  const accountService = { incrementBalances: jest.fn().mockResolvedValue({}) };
  const invoiceRepo = { findById: jest.fn() };
  const invoiceService = {
    applyCreditNote: jest.fn().mockResolvedValue({}),
    applyAdjustment: jest.fn().mockResolvedValue({}),
  };
  const sequences = { nextValue: jest.fn().mockResolvedValue(1) };
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };

  const svc = new CreditNoteService(
    prisma as never,
    repo as never,
    accountRepo as never,
    accountService as never,
    invoiceRepo as never,
    invoiceService as never,
    sequences as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return { svc, prisma, repo, accountRepo, accountService, invoiceRepo, invoiceService, sequences, outbox, audit, featureFlags };
}

describe('CreditNoteService.apply', () => {
  it('transitions ISSUED → APPLIED, calls InvoiceService.applyCreditNote, and emits CREDIT_NOTE_APPLIED', async () => {
    const t = makeService();
    const issued = makeCreditNote({ status: 'ISSUED', invoiceId: 'inv-1' });
    t.repo.findCreditNoteById.mockResolvedValue(issued);
    t.invoiceRepo.findById.mockResolvedValue({ id: 'inv-1' });
    t.repo.updateCreditNote.mockResolvedValue({ ...issued, status: 'APPLIED', version: 2 });

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.apply('cn-1', 1),
    );

    expect(out.status).toBe('APPLIED');
    expect(t.invoiceService.applyCreditNote).toHaveBeenCalledWith(
      'inv-1',
      300,
      'cn-1',
      expect.anything(),
    );
    // When the CN targets an invoice we do NOT inflate account.creditBalance
    // on apply — the credit is consumed directly by InvoiceService.
    expect(t.accountService.incrementBalances).not.toHaveBeenCalled();
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: BillingOutboxTopics.CREDIT_NOTE_APPLIED,
        eventType: 'CreditNoteApplied',
      }),
    );
  });

  it('grows account.creditBalance when applied without an invoice link, then void reverses it', async () => {
    const t = makeService();
    const issued = makeCreditNote({ status: 'ISSUED', invoiceId: null });
    t.repo.findCreditNoteById.mockResolvedValue(issued);
    const applied = { ...issued, status: 'APPLIED' as const, version: 2 };
    t.repo.updateCreditNote.mockResolvedValueOnce(applied);

    await withTestContext({ schoolId: 'school-1' }, () => t.svc.apply('cn-1', 1));
    expect(t.accountService.incrementBalances).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ creditBalance: 300 }),
      expect.anything(),
    );

    // Now void it — credit balance must be decremented.
    t.repo.findCreditNoteById.mockResolvedValue({ ...applied, appliedToInvoiceId: null });
    t.repo.updateCreditNote.mockResolvedValueOnce({ ...applied, status: 'VOID' as const });
    await withTestContext({ schoolId: 'school-1' }, () => t.svc.void('cn-1', 2, 'mistake'));
    expect(t.accountService.incrementBalances).toHaveBeenLastCalledWith(
      'acc-1',
      expect.objectContaining({ creditBalance: -300 }),
      expect.anything(),
    );
  });
});
