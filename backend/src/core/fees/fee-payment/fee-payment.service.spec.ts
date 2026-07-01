/**
 * FeePaymentService.capture unit specs.
 *
 * Persistence is mocked. We assert:
 *   - payment + allocations + receipt are written inside one tx
 *   - PAYMENT_CAPTURED + RECEIPT_ISSUED outbox + finance audit
 *   - amount-vs-allocations mismatch raises
 *   - alloc > invoice.balanceTotal raises
 *   - ONLINE method is rejected (must go through /checkout)
 *   - partial-payment-disabled flag enforces full-pay-only mode
 *   - receipt number uses RCP/<FY>/<seq> with SequenceService.nextValue(SEQ_NAMES.RECEIPT)
 */
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import { FeesOutboxTopics } from '../fees.constants';
import {
  AllocationExceedsBalanceError,
  InvalidPaymentMethodError,
  PartialPaymentDisabledError,
  PaymentAmountMismatchError,
  PaymentSourceRequiredError,
} from '../fees.errors';
import type {
  FeeInvoiceRow,
  FeePaymentSourceRow,
  FeePaymentWithAllocations,
} from '../fees.types';
import { FeePaymentService } from './fee-payment.service';

const SCHOOL = 'sch-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeInvoice(over: Partial<FeeInvoiceRow> = {}): FeeInvoiceRow {
  return {
    id: 'inv-1',
    schoolId: SCHOOL,
    studentId: 'st-1',
    feeStructureId: 'fs-1',
    academicYearId: 'ay-1',
    branchId: null,
    invoiceNo: 'INV/2026-27/000001',
    periodFrom: new Date('2026-06-01'),
    periodTo: new Date('2026-06-30'),
    issueDate: NOW,
    dueDate: new Date('2026-07-10'),
    subtotal: 1000,
    discountTotal: 0,
    taxTotal: 0,
    total: 1000,
    paidTotal: 0,
    refundTotal: 0,
    balanceTotal: 1000,
    status: 'SENT',
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...over,
  };
}

function makeService() {
  const tx = {
    student: { findFirst: jest.fn(async () => ({ id: 'st-1' })) },
    feeInvoice: {
      findFirst: jest.fn(async () => ({ id: 'inv-1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    academicYear: {
      findFirst: jest.fn(async () => ({
        startDate: new Date('2026-04-01T00:00:00.000Z'),
      })),
    },
    feeReceipt: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'rcp-1',
        schoolId: SCHOOL,
        feePaymentId: data.feePaymentId,
        studentId: data.studentId,
        receiptNo: data.receiptNo,
        issuedAt: NOW,
        issuedBy: null,
        totalAmount: data.totalAmount,
        status: 'ISSUED',
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
        notes: null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      })),
      findFirst: jest.fn(async () => null),
    },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findByIdInTx: jest.fn(),
    create: jest.fn(async (_tx, payment, allocations) => ({
      id: 'pay-1',
      schoolId: SCHOOL,
      studentId: payment.studentId,
      paymentNo: payment.paymentNo,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      referenceNo: payment.referenceNo,
      paidAt: payment.paidAt,
      gatewayCode: null,
      gatewayPaymentId: null,
      notes: payment.notes,
      paymentSourceId: payment.paymentSourceId ?? null,
      paymentProofUrl: payment.paymentProofUrl ?? null,
      verificationStatus: payment.verificationStatus ?? 'NOT_REQUIRED',
      verifiedBy: payment.verifiedBy ?? null,
      verifiedAt: payment.verifiedAt ?? null,
      verificationNotes: payment.verificationNotes ?? null,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      allocations: allocations.map((a: { feeInvoiceId: string; amount: number }, i: number) => ({
        id: `alloc-${i}`,
        schoolId: SCHOOL,
        feePaymentId: 'pay-1',
        feeInvoiceId: a.feeInvoiceId,
        amount: a.amount,
        allocatedAt: NOW,
        allocatedBy: null,
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
      })),
    })),
    updateVerification: jest.fn() as jest.Mock,
  };
  const invoiceRepo = {
    findById: jest.fn(async (_id: string) => ({
      header: makeInvoice(),
      lines: [],
    })),
  };
  const sequenceService = { nextValue: jest.fn(async () => 1) };
  const featureFlags = {
    isEnabled: jest.fn(async () => true),
  };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const gateways = { resolve: jest.fn() };
  const paymentSourceRepo = {
    findById: jest.fn() as jest.Mock,
  };

  const svc = new FeePaymentService(
    prisma as never,
    repo as never,
    invoiceRepo as never,
    sequenceService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    gateways as never,
    paymentSourceRepo as never,
  );
  return {
    svc,
    prisma,
    tx,
    repo,
    invoiceRepo,
    sequenceService,
    featureFlags,
    outbox,
    audit,
    gateways,
    paymentSourceRepo,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

const BASE_ARGS = {
  studentId: 'st-1',
  method: 'CASH' as const,
  amount: 1000,
  paidAt: new Date('2026-06-20T10:00:00.000Z'),
  allocations: [{ invoiceId: 'inv-1', amount: 1000 }],
};

describe('FeePaymentService.capture', () => {
  it('writes payment + allocations + receipt; emits PAYMENT_CAPTURED + RECEIPT_ISSUED + finance audit', async () => {
    const t = makeService();
    const { payment, receipt } = await withCtx(() => t.svc.capture(BASE_ARGS));
    expect(payment.id).toBe('pay-1');
    expect(payment.allocations).toHaveLength(1);
    expect(receipt!.receiptNo).toMatch(/^RCP\/2026-27\/\d{6}$/);
    expect(t.tx.feeReceipt.create).toHaveBeenCalledTimes(1);

    const topics = (
      t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>
    ).map((c) => c[1].topic);
    expect(topics).toEqual(
      expect.arrayContaining([FeesOutboxTopics.PAYMENT_CAPTURED, FeesOutboxTopics.RECEIPT_ISSUED]),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee-payment.captured' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('rejects amount mismatch with PaymentAmountMismatchError', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.capture({
          ...BASE_ARGS,
          amount: 900,
          allocations: [{ invoiceId: 'inv-1', amount: 1000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(PaymentAmountMismatchError);
  });

  it('rejects allocation > invoice.balanceTotal with AllocationExceedsBalanceError', async () => {
    const t = makeService();
    t.invoiceRepo.findById.mockResolvedValue({
      header: makeInvoice({ balanceTotal: 500, total: 1000, paidTotal: 500, status: 'PARTIAL' }),
      lines: [],
    });
    await expect(
      withCtx(() =>
        t.svc.capture({
          ...BASE_ARGS,
          amount: 1000,
          allocations: [{ invoiceId: 'inv-1', amount: 1000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationExceedsBalanceError);
  });

  it('rejects ONLINE method on /payments with InvalidPaymentMethodError', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.capture({ ...BASE_ARGS, method: 'ONLINE' as never })),
    ).rejects.toBeInstanceOf(InvalidPaymentMethodError);
  });

  it('throws PartialPaymentDisabledError when allow_partial_payment is false and allocation leaves invoice PARTIAL', async () => {
    const t = makeService();
    t.invoiceRepo.findById.mockResolvedValue({
      header: makeInvoice({ total: 1000, balanceTotal: 1000, paidTotal: 0 }),
      lines: [],
    });
    // First call gates the module (true), subsequent allow_partial_payment check returns false.
    (t.featureFlags.isEnabled as jest.Mock).mockImplementation(async (key: string) =>
      key === 'fees.allow_partial_payment' ? false : true,
    );
    await expect(
      withCtx(() =>
        t.svc.capture({
          ...BASE_ARGS,
          amount: 600,
          allocations: [{ invoiceId: 'inv-1', amount: 600 }],
        }),
      ),
    ).rejects.toBeInstanceOf(PartialPaymentDisabledError);
  });

  it('receipt number uses RCP/<FY>/<seq> pattern and calls SequenceService with SEQ_NAMES.RECEIPT', async () => {
    const t = makeService();
    t.sequenceService.nextValue.mockResolvedValue(42);
    const { receipt } = await withCtx(() => t.svc.capture(BASE_ARGS));
    expect(receipt!.receiptNo).toBe('RCP/2026-27/000042');
    expect(t.sequenceService.nextValue).toHaveBeenCalledWith(
      SEQ_NAMES.RECEIPT,
      expect.objectContaining({ fiscalYear: '2026-27' }),
    );
  });

  // ---------------------------------------------------------------------------
  // Sprint 9.1 — Hybrid Fee Collection additions
  // ---------------------------------------------------------------------------

  it('rejects deprecated UPI method with InvalidPaymentMethodError (Sprint 9.1)', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.capture({ ...BASE_ARGS, method: 'UPI' as never })),
    ).rejects.toBeInstanceOf(InvalidPaymentMethodError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('rejects UPI_MANUAL without paymentSourceId with PaymentSourceRequiredError', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.capture({
          ...BASE_ARGS,
          method: 'UPI_MANUAL' as never,
        }),
      ),
    ).rejects.toBeInstanceOf(PaymentSourceRequiredError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('UPI_MANUAL with active source → PENDING, no receipt, no invoice writes, only PAYMENT_CAPTURED outbox', async () => {
    const t = makeService();
    t.paymentSourceRepo.findById.mockResolvedValue(makePaymentSource());
    const { payment, receipt } = await withCtx(() =>
      t.svc.capture({
        ...BASE_ARGS,
        method: 'UPI_MANUAL' as never,
        paymentSourceId: 'src-1',
        paymentProofUrl: 'https://files.example.com/proof.jpg',
      }),
    );
    expect(payment.status).toBe('PENDING');
    expect(payment.verificationStatus).toBe('PENDING');
    expect(receipt).toBeNull();
    // Invoice rows untouched.
    expect(t.tx.feeInvoice.updateMany).not.toHaveBeenCalled();
    // No receipt row created.
    expect(t.tx.feeReceipt.create).not.toHaveBeenCalled();
    // Only PAYMENT_CAPTURED was published (no RECEIPT_ISSUED on pending).
    const topics = (
      t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>
    ).map((c) => c[1].topic);
    expect(topics).toEqual([FeesOutboxTopics.PAYMENT_CAPTURED]);
  });

  it('verify happy path → CAPTURED + VERIFIED, receipt issued, invoice paidTotal updated, PAYMENT_VERIFIED + RECEIPT_ISSUED outbox, fee-payment.verified audit', async () => {
    const t = makeService();
    const pending = makePendingPayment({ amount: 1000 });
    t.repo.findByIdInTx.mockResolvedValue(pending);
    t.repo.updateVerification.mockImplementation(async (_tx, _id, _ver, input) => ({
      ...pending,
      status: input.status,
      verificationStatus: input.verificationStatus,
      verifiedAt: input.verifiedAt,
      verifiedBy: input.verifiedBy,
      verificationNotes: input.verificationNotes,
      version: pending.version + 1,
    }));

    const { payment, receipt } = await withCtx(() =>
      t.svc.verify('pay-pending-1', '"1"', { notes: 'Confirmed receipt in bank' }),
    );
    expect(payment.status).toBe('CAPTURED');
    expect(payment.verificationStatus).toBe('VERIFIED');
    expect(receipt.receiptNo).toMatch(/^RCP\/2026-27\/\d{6}$/);
    expect(t.tx.feeInvoice.updateMany).toHaveBeenCalledTimes(1);

    const topics = (
      t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>
    ).map((c) => c[1].topic);
    expect(topics).toEqual(
      expect.arrayContaining([
        FeesOutboxTopics.PAYMENT_VERIFIED,
        FeesOutboxTopics.RECEIPT_ISSUED,
      ]),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee-payment.verified' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('reject happy path → FAILED + REJECTED, no receipt, invoices untouched, PAYMENT_REJECTED outbox + fee-payment.rejected audit', async () => {
    const t = makeService();
    const pending = makePendingPayment({ amount: 1000 });
    t.repo.findByIdInTx.mockResolvedValue(pending);
    t.repo.updateVerification.mockImplementation(async (_tx, _id, _ver, input) => ({
      ...pending,
      status: input.status,
      verificationStatus: input.verificationStatus,
      verifiedAt: input.verifiedAt,
      verifiedBy: input.verifiedBy,
      verificationNotes: input.verificationNotes,
      version: pending.version + 1,
    }));

    const { payment } = await withCtx(() =>
      t.svc.reject('pay-pending-1', '"1"', {
        reason: 'Proof unreadable; parent to re-submit',
      }),
    );
    expect(payment.status).toBe('FAILED');
    expect(payment.verificationStatus).toBe('REJECTED');
    expect(t.tx.feeReceipt.create).not.toHaveBeenCalled();
    expect(t.tx.feeInvoice.updateMany).not.toHaveBeenCalled();

    const topics = (
      t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>
    ).map((c) => c[1].topic);
    expect(topics).toEqual([FeesOutboxTopics.PAYMENT_REJECTED]);
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee-payment.rejected' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test helpers (Sprint 9.1)
// ---------------------------------------------------------------------------

function makePaymentSource(
  over: Partial<FeePaymentSourceRow> = {},
): FeePaymentSourceRow {
  return {
    id: 'src-1',
    schoolId: SCHOOL,
    code: 'PRIN_UPI_01',
    name: 'Principal UPI',
    kind: 'PRINCIPAL_UPI',
    identifier: 'principal@upi',
    ifsc: null,
    holderName: null,
    isActive: true,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...over,
  };
}

function makePendingPayment(
  over: Partial<FeePaymentWithAllocations> = {},
): FeePaymentWithAllocations {
  return {
    id: 'pay-pending-1',
    schoolId: SCHOOL,
    studentId: 'st-1',
    paymentNo: null,
    method: 'UPI_MANUAL',
    amount: 1000,
    status: 'PENDING',
    referenceNo: null,
    paidAt: new Date('2026-06-20T10:00:00.000Z'),
    gatewayCode: null,
    gatewayPaymentId: null,
    notes: null,
    paymentSourceId: 'src-1',
    paymentProofUrl: 'https://files.example.com/proof.jpg',
    verificationStatus: 'PENDING',
    verifiedBy: null,
    verifiedAt: null,
    verificationNotes: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    allocations: [
      {
        id: 'alloc-0',
        schoolId: SCHOOL,
        feePaymentId: 'pay-pending-1',
        feeInvoiceId: 'inv-1',
        amount: 1000,
        allocatedAt: NOW,
        allocatedBy: null,
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
      },
    ],
    ...over,
  };
}
