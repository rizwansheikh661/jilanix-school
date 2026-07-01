/**
 * RefundService unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - create() rejects when `amount + payment.amountRefunded > payment.amount`
 *     with RefundAmountExceedsPaymentError.
 *   - markProcessed() flips APPROVED → PROCESSED, then calls both
 *     PaymentService.applyRefundReversal and InvoiceService.applyRefundReversal.
 *     The downstream InvoiceService.applyRefundReversal increments
 *     `account.totalRefunded` via BillingAccountService.incrementBalances.
 */
import { withTestContext } from '../../src/core/request-context';
import { RefundService } from '../../src/core/billing/refund/refund.service';
import { BillingOutboxTopics } from '../../src/core/billing/billing.constants';
import { RefundAmountExceedsPaymentError } from '../../src/core/billing/billing.errors';
import type { PaymentRow, RefundRow } from '../../src/core/billing/billing.types';

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay-1',
    accountId: 'acc-1',
    invoiceId: 'inv-1',
    schoolId: 'school-1',
    receiptNumber: 'RCP-2026-27-000001',
    method: 'UPI',
    status: 'APPROVED',
    currency: 'INR',
    amount: 1000,
    amountRefunded: 0,
    feeAmount: 0,
    netAmount: 1000,
    fiscalYear: '2026-27',
    gatewayOrderId: null,
    gatewayPaymentId: null,
    gatewaySignature: null,
    externalReference: null,
    proofUrl: null,
    payerNotes: null,
    receivedAt: new Date('2026-06-25T00:00:00Z'),
    approvedAt: new Date('2026-06-25T00:00:00Z'),
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    holdReason: null,
    paymentSourceId: null,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    version: 2,
    ...overrides,
  };
}

function makeRefund(overrides: Partial<RefundRow> = {}): RefundRow {
  return {
    id: 'ref-1',
    accountId: 'acc-1',
    invoiceId: 'inv-1',
    paymentId: 'pay-1',
    schoolId: 'school-1',
    refundNumber: 'REF-2026-27-000001',
    status: 'APPROVED',
    currency: 'INR',
    amount: 200,
    reason: 'overcharge',
    approvedAt: new Date('2026-06-25T00:00:00Z'),
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    processedAt: null,
    processedBy: null,
    gatewayRefundId: null,
    externalReference: null,
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
    create: jest.fn(),
    update: jest.fn(),
  };
  const paymentRepo = { findById: jest.fn() };
  const paymentService = { applyRefundReversal: jest.fn().mockResolvedValue({}) };
  const invoiceService = { applyRefundReversal: jest.fn().mockResolvedValue({}) };
  const sequences = { nextValue: jest.fn().mockResolvedValue(1) };
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };

  const svc = new RefundService(
    prisma as never,
    repo as never,
    paymentRepo as never,
    paymentService as never,
    invoiceService as never,
    sequences as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return { svc, prisma, repo, paymentRepo, paymentService, invoiceService, sequences, outbox, audit, featureFlags };
}

describe('RefundService.create', () => {
  it('throws RefundAmountExceedsPaymentError when amount + already-refunded exceeds payment.amount', async () => {
    const t = makeService();
    t.paymentRepo.findById.mockResolvedValue(makePayment({ amount: 1000, amountRefunded: 800 }));

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        t.svc.create({ paymentId: 'pay-1', amount: 500, reason: 'duplicate' }),
      ),
    ).rejects.toBeInstanceOf(RefundAmountExceedsPaymentError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('RefundService.markProcessed', () => {
  it('calls PaymentService.applyRefundReversal + InvoiceService.applyRefundReversal, emits REFUND_PROCESSED', async () => {
    const t = makeService();
    const refund = makeRefund({ amount: 200 });
    t.repo.findById.mockResolvedValue(refund);
    t.repo.update.mockResolvedValue({ ...refund, status: 'PROCESSED', version: 2 });

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.markProcessed('ref-1', 1, 'gw_ref_99'),
    );

    expect(out.status).toBe('PROCESSED');
    expect(t.paymentService.applyRefundReversal).toHaveBeenCalledWith(
      'pay-1',
      200,
      expect.anything(),
    );
    expect(t.invoiceService.applyRefundReversal).toHaveBeenCalledWith(
      'inv-1',
      200,
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: BillingOutboxTopics.REFUND_PROCESSED,
        eventType: 'RefundProcessed',
      }),
    );
  });
});
