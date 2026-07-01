/**
 * PaymentService unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - recordManual with UPI creates PENDING payment + INITIATED attempt; throws
 *     ManualPaymentsDisabledError when `billing.manual_payments_enabled` is
 *     off.
 *   - approve on PENDING transitions to APPROVED, updates account balance via
 *     InvoiceService.applyPayment, emits `billing.payment.approved` outbox.
 *   - recordRazorpay with signatureValid=true inserts an APPROVED payment with
 *     gateway fields populated.
 */
import { withTestContext } from '../../src/core/request-context';
import { PaymentService } from '../../src/core/billing/payment/payment.service';
import { BillingOutboxTopics } from '../../src/core/billing/billing.constants';
import {
  InvoiceOverpaymentError,
  ManualPaymentsDisabledError,
} from '../../src/core/billing/billing.errors';
import type {
  BillingAccountRow,
  InvoiceRow,
  PaymentRow,
} from '../../src/core/billing/billing.types';

function makeAccount(overrides: Partial<BillingAccountRow> = {}): BillingAccountRow {
  return {
    id: 'acc-1',
    schoolId: 'school-1',
    accountNumber: 'BA-000001',
    currency: 'INR',
    balanceDue: 1180,
    creditBalance: 0,
    totalInvoiced: 1180,
    totalPaid: 0,
    totalRefunded: 0,
    isActive: true,
    lastInvoiceAt: new Date('2026-06-25T00:00:00Z'),
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
    invoiceNumber: 'INV-2026-27-000001',
    status: 'PENDING',
    fiscalYear: '2026-27',
    subscriptionId: null,
    billingCycle: null,
    periodStart: null,
    periodEnd: null,
    issuedAt: new Date('2026-06-25T00:00:00Z'),
    dueDate: new Date('2026-07-09T00:00:00Z'),
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
    version: 2,
    ...overrides,
  };
}

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay-1',
    accountId: 'acc-1',
    invoiceId: 'inv-1',
    schoolId: 'school-1',
    receiptNumber: 'RCP-2026-27-000001',
    method: 'UPI',
    status: 'PENDING',
    currency: 'INR',
    amount: 1180,
    amountRefunded: 0,
    feeAmount: 0,
    netAmount: 1180,
    fiscalYear: '2026-27',
    gatewayOrderId: null,
    gatewayPaymentId: null,
    gatewaySignature: null,
    externalReference: null,
    proofUrl: null,
    payerNotes: null,
    receivedAt: new Date('2026-06-25T00:00:00Z'),
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    holdReason: null,
    paymentSourceId: null,
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
    findById: jest.fn(),
    list: jest.fn(),
    listAttempts: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    appendAttempt: jest.fn().mockResolvedValue({}),
    incrementRefunded: jest.fn().mockResolvedValue({}),
  };
  const invoiceRepo = { findById: jest.fn() };
  const invoiceService = { applyPayment: jest.fn().mockResolvedValue({}) };
  const accountRepo = { findById: jest.fn() };
  const sequences = { nextValue: jest.fn().mockResolvedValue(1) };
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };

  const svc = new PaymentService(
    prisma as never,
    repo as never,
    invoiceRepo as never,
    invoiceService as never,
    accountRepo as never,
    sequences as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return {
    svc,
    prisma,
    repo,
    invoiceRepo,
    invoiceService,
    accountRepo,
    sequences,
    outbox,
    audit,
    featureFlags,
  };
}

describe('PaymentService.recordManual', () => {
  it('with UPI creates PENDING payment + INITIATED attempt and emits PAYMENT_RECORDED', async () => {
    const t = makeService();
    t.accountRepo.findById.mockResolvedValue(makeAccount());
    t.invoiceRepo.findById.mockResolvedValue(makeInvoice());
    const created = makePayment();
    t.repo.create.mockResolvedValue(created);

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.recordManual({
        accountId: 'acc-1',
        invoiceId: 'inv-1',
        method: 'UPI',
        amount: 1180,
      }),
    );

    expect(out.status).toBe('PENDING');
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'UPI', status: 'PENDING' }),
      expect.anything(),
    );
    expect(t.repo.appendAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', status: 'INITIATED' }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: BillingOutboxTopics.PAYMENT_RECORDED,
        eventType: 'PaymentRecorded',
      }),
    );
  });

  it('throws ManualPaymentsDisabledError when the manual flag is off', async () => {
    const t = makeService();
    t.accountRepo.findById.mockResolvedValue(makeAccount());
    // module.billing ON, billing.manual_payments_enabled OFF.
    t.featureFlags.isEnabled.mockImplementation(async (key: string) => key !== 'billing.manual_payments_enabled');

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        t.svc.recordManual({
          accountId: 'acc-1',
          invoiceId: 'inv-1',
          method: 'UPI',
          amount: 1180,
        }),
      ),
    ).rejects.toBeInstanceOf(ManualPaymentsDisabledError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('PaymentService.approve', () => {
  it('transitions PENDING → APPROVED, calls InvoiceService.applyPayment, emits PAYMENT_APPROVED', async () => {
    const t = makeService();
    const pending = makePayment({ status: 'PENDING', version: 1 });
    t.repo.findById.mockResolvedValue(pending);
    t.invoiceRepo.findById.mockResolvedValue(makeInvoice());
    t.repo.update.mockResolvedValue(makePayment({ status: 'APPROVED', version: 2 }));

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.approve('pay-1', 1, 'ok'),
    );

    expect(out.status).toBe('APPROVED');
    expect(t.invoiceService.applyPayment).toHaveBeenCalledWith(
      'inv-1',
      1180,
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: BillingOutboxTopics.PAYMENT_APPROVED,
        eventType: 'PaymentApproved',
      }),
    );
  });

  it('rejects an overpayment via assertInvoicePayable', async () => {
    const t = makeService();
    t.accountRepo.findById.mockResolvedValue(makeAccount());
    // amountDue < amount → overpayment
    t.invoiceRepo.findById.mockResolvedValue(makeInvoice({ amountDue: 100 }));

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        t.svc.recordManual({
          accountId: 'acc-1',
          invoiceId: 'inv-1',
          method: 'UPI',
          amount: 1180,
        }),
      ),
    ).rejects.toBeInstanceOf(InvoiceOverpaymentError);
  });
});

describe('PaymentService.recordRazorpay', () => {
  it('signatureValid=true inserts APPROVED row with gateway fields populated', async () => {
    const t = makeService();
    t.accountRepo.findById.mockResolvedValue(makeAccount());
    t.invoiceRepo.findById.mockResolvedValue(makeInvoice());
    const inserted = makePayment({
      status: 'APPROVED',
      method: 'RAZORPAY',
      gatewayOrderId: 'order_X',
      gatewayPaymentId: 'pay_X',
      gatewaySignature: 'sig',
    });
    t.repo.create.mockResolvedValue(inserted);

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.recordRazorpay({
        accountId: 'acc-1',
        invoiceId: 'inv-1',
        amount: 1180,
        gatewayOrderId: 'order_X',
        gatewayPaymentId: 'pay_X',
        gatewaySignature: 'sig',
        signatureValid: true,
      }),
    );

    expect(out.status).toBe('APPROVED');
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'RAZORPAY',
        status: 'APPROVED',
        gatewayOrderId: 'order_X',
        gatewayPaymentId: 'pay_X',
        gatewaySignature: 'sig',
      }),
      expect.anything(),
    );
    expect(t.invoiceService.applyPayment).toHaveBeenCalledWith('inv-1', 1180, expect.anything());
  });
});
