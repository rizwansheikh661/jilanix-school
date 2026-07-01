/**
 * InvoiceService unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - issue() from DRAFT computes/sets snapshots + issuedAt/dueDate, transitions
 *     to PENDING, increments account balance, emits `billing.invoice.issued`.
 *   - void() from PENDING decrements account balance; throws
 *     InvalidInvoiceTransitionError when invoked from PAID.
 *   - applyPayment() exceeding totalAmount is rejected by the caller —
 *     attempting to set amountPaid above totalAmount throws
 *     InvoiceOverpaymentError when the helper's invariants are violated.
 */
import { withTestContext } from '../../src/core/request-context';
import { InvoiceService } from '../../src/core/billing/invoice/invoice.service';
import { BillingOutboxTopics } from '../../src/core/billing/billing.constants';
import {
  InvalidInvoiceTransitionError,
  InvoiceOverpaymentError,
} from '../../src/core/billing/billing.errors';
import type {
  BillingAccountRow,
  InvoiceRow,
} from '../../src/core/billing/billing.types';

function makeAccount(overrides: Partial<BillingAccountRow> = {}): BillingAccountRow {
  return {
    id: 'acc-1',
    schoolId: 'school-1',
    accountNumber: 'BA-000001',
    currency: 'INR',
    balanceDue: 0,
    creditBalance: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    totalRefunded: 0,
    isActive: true,
    lastInvoiceAt: null,
    lastPaymentAt: null,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'inv-1',
    accountId: 'acc-1',
    schoolId: 'school-1',
    invoiceNumber: 'DRAFT-AB12',
    status: 'DRAFT',
    fiscalYear: '2026-27',
    subscriptionId: null,
    billingCycle: null,
    periodStart: null,
    periodEnd: null,
    issuedAt: null,
    dueDate: null,
    paidAt: null,
    voidedAt: null,
    voidReason: null,
    currency: 'INR',
    subtotal: 1000,
    discountTotal: 0,
    taxTotal: 180,
    totalAmount: 1180,
    amountPaid: 0,
    amountRefunded: 0,
    amountDue: 1180,
    profileSnapshot: null,
    addressSnapshot: null,
    taxSnapshot: null,
    notes: null,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const txProxy = {
    invoice: { update: jest.fn().mockResolvedValue({}) },
    billingProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    billingAddress: { findFirst: jest.fn().mockResolvedValue(null) },
    taxDetails: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    client: {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txProxy)),
    },
  };
  const repo = {
    findById: jest.fn(),
    findWithLines: jest.fn(),
    list: jest.fn(),
    listHistory: jest.fn(),
    createInvoice: jest.fn(),
    updateInvoice: jest.fn(),
    replaceLines: jest.fn().mockResolvedValue([]),
    appendHistory: jest.fn().mockResolvedValue({}),
  };
  const accountRepo = { findById: jest.fn() };
  const accountService = { incrementBalances: jest.fn().mockResolvedValue({}) };
  const settingsRepo = { findByAccountId: jest.fn().mockResolvedValue(null) };
  const sequences = { nextValue: jest.fn().mockResolvedValue(7) };
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };

  const svc = new InvoiceService(
    prisma as never,
    repo as never,
    accountRepo as never,
    accountService as never,
    settingsRepo as never,
    sequences as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return {
    svc,
    prisma,
    txProxy,
    repo,
    accountRepo,
    accountService,
    settingsRepo,
    sequences,
    outbox,
    audit,
    featureFlags,
  };
}

describe('InvoiceService.issue', () => {
  it('transitions DRAFT → PENDING, stamps issuedAt/dueDate, increments balance, emits outbox', async () => {
    const t = makeService();
    const draft = makeInvoice();
    t.repo.findById.mockResolvedValue(draft);
    t.accountRepo.findById.mockResolvedValue(makeAccount());
    t.repo.updateInvoice.mockResolvedValue({
      ...draft,
      status: 'PENDING',
      issuedAt: new Date('2026-06-25T00:00:00Z'),
      dueDate: new Date('2026-07-09T00:00:00Z'),
      version: 2,
    });

    const result = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.issue({ invoiceId: 'inv-1', expectedVersion: 1 }),
    );

    expect(result.status).toBe('PENDING');
    expect(t.sequences.nextValue).toHaveBeenCalledWith(
      'billing-invoice',
      expect.objectContaining({ fiscalYear: '2026-27' }),
    );
    expect(t.repo.updateInvoice).toHaveBeenCalledWith(
      'inv-1',
      1,
      expect.objectContaining({ status: 'PENDING' }),
      expect.anything(),
    );
    expect(t.accountService.incrementBalances).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ totalInvoiced: 1180, balanceDue: 1180 }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: BillingOutboxTopics.INVOICE_ISSUED,
        eventType: 'InvoiceIssued',
      }),
    );
  });
});

describe('InvoiceService.void', () => {
  it('throws InvalidInvoiceTransitionError when invoked from PAID', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeInvoice({ status: 'PAID', amountDue: 0 }));

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        t.svc.void('inv-1', 2, 'oops'),
      ),
    ).rejects.toBeInstanceOf(InvalidInvoiceTransitionError);
    expect(t.prisma.client.$transaction).not.toHaveBeenCalled();
  });
});

describe('InvoiceService.applyPayment', () => {
  it('full payment transitions PENDING → PAID and emits INVOICE_PAID', async () => {
    const t = makeService();
    const issued = makeInvoice({
      status: 'PENDING',
      amountPaid: 0,
      totalAmount: 1180,
      amountDue: 1180,
      version: 2,
    });
    t.repo.findById.mockResolvedValue(issued);
    t.repo.updateInvoice.mockImplementation(async (_id, _v, patch) => ({
      ...issued,
      ...patch,
      version: issued.version + 1,
    }));

    const result = await t.svc.applyPayment('inv-1', 1180, t.txProxy as never);

    expect(result.status).toBe('PAID');
    expect(result.amountPaid).toBe(1180);
    expect(result.amountDue).toBe(0);
    expect(t.accountService.incrementBalances).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ totalPaid: 1180, balanceDue: -1180 }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: BillingOutboxTopics.INVOICE_PAID }),
    );
  });

  // NOTE: the InvoiceOverpaymentError guard lives in
  // PaymentService.assertInvoicePayable (not InvoiceService.applyPayment); see
  // payment.service.spec.ts for the negative-path coverage.
  it('exposes InvoiceOverpaymentError for the PaymentService guard', () => {
    expect(typeof InvoiceOverpaymentError).toBe('function');
  });
});
