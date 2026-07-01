/**
 * Sprint 9 e2e — Fee receipt cancellation flow.
 *
 * Service-orchestration spec (no Testcontainers, no real DB, no Nest
 * TestingModule). Real `FeeReceiptService` is wired with stubbed repos +
 * mocked transactional client; assertions cover the inverse-of-capture
 * orchestration end-to-end.
 *
 * Flow:
 *   1. Cancel a freshly-ISSUED receipt with the matching If-Match version
 *      → receipt + payment flip to CANCELLED, every allocation gets
 *        reversedAt set, invoice rolls back to SENT, outbox emits
 *        RECEIPT_CANCELLED + INVOICE_RECOMPUTED, one finance audit row.
 *   2. Re-cancel the same (now CANCELLED) receipt → ReceiptAlreadyCancelledError;
 *      no repo.cancel call, no allocation/payment writes.
 *   3. Cancel when a FeeRefund already references the payment →
 *      ReceiptCancelRefundExistsError; no allocations reversed.
 *   4. Cancel with a stale If-Match version → FeesVersionConflictError.
 *   5. After a successful cancel, capture a fresh payment for the same student
 *      → succeeds, gets the NEXT receipt number from SequenceService.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { FeesOutboxTopics } from '../../src/core/fees/fees.constants';
import {
  FeesVersionConflictError,
  ReceiptAlreadyCancelledError,
  ReceiptCancelRefundExistsError,
} from '../../src/core/fees/fees.errors';
import { FeePaymentService } from '../../src/core/fees/fee-payment/fee-payment.service';
import { FeeReceiptService } from '../../src/core/fees/fee-receipt/fee-receipt.service';
import type {
  FeeInvoiceRow,
  FeePaymentAllocationRow,
  FeePaymentWithAllocations,
  FeeReceiptRow,
} from '../../src/core/fees/fees.types';

const SCHOOL = 'sch-e2e9rc';
const STUDENT = 'st-e2e9rc';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makeReceipt(over: Partial<FeeReceiptRow> = {}): FeeReceiptRow {
  return {
    id: 'rcp-1',
    schoolId: SCHOOL,
    feePaymentId: 'pay-1',
    studentId: STUDENT,
    receiptNo: 'RCP/2026-27/000001',
    issuedAt: NOW,
    issuedBy: null,
    totalAmount: 1000,
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
    ...over,
  };
}

function makeAllocation(
  over: Partial<FeePaymentAllocationRow> = {},
): FeePaymentAllocationRow {
  return {
    id: 'alloc-1',
    schoolId: SCHOOL,
    feePaymentId: 'pay-1',
    feeInvoiceId: 'inv-1',
    amount: 1000,
    allocatedAt: NOW,
    allocatedBy: null,
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
    ...over,
  };
}

function makePayment(
  status: 'CAPTURED' | 'CANCELLED' = 'CAPTURED',
  allocations: readonly FeePaymentAllocationRow[] = [makeAllocation()],
): FeePaymentWithAllocations {
  return {
    id: 'pay-1',
    schoolId: SCHOOL,
    studentId: STUDENT,
    paymentNo: 'PAY-001',
    method: 'CASH',
    amount: 1000,
    status,
    referenceNo: null,
    paidAt: NOW,
    gatewayCode: null,
    gatewayPaymentId: null,
    notes: null,
    paymentSourceId: null,
    paymentProofUrl: null,
    verificationStatus: 'NOT_REQUIRED',
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
    allocations,
  };
}

function makeInvoice(over: Partial<FeeInvoiceRow> = {}): FeeInvoiceRow {
  return {
    id: 'inv-1',
    schoolId: SCHOOL,
    studentId: STUDENT,
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
    paidTotal: 1000,
    refundTotal: 0,
    balanceTotal: 0,
    status: 'PAID',
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

/**
 * Build a fully stubbed `FeeReceiptService` + co-resident shared state.
 * `receiptState`, `paymentState`, and `invoiceState` mutate as the test
 * drives the orchestration. Returns the service + every mock for assertion.
 */
function makeReceiptHarness() {
  let receiptState: FeeReceiptRow = makeReceipt();
  let paymentState: FeePaymentWithAllocations = makePayment();
  const invoiceState: Record<string, FeeInvoiceRow> = {
    'inv-1': makeInvoice(),
  };
  const refundExists = { value: false };

  const tx = {
    feeRefund: {
      findFirst: jest.fn(async () => (refundExists.value ? { id: 'ref-1' } : null)),
    },
    feePaymentAllocation: {
      update: jest.fn(async ({ where, data }: { where: { schoolId_id: { id: string } }; data: Record<string, unknown> }) => {
        const next = paymentState.allocations.map((a) =>
          a.id === where.schoolId_id.id
            ? {
                ...a,
                reversedAt: data.reversedAt as Date,
                reversedBy: (data.reversedBy as string | null) ?? null,
                reversalReason: (data.reversalReason as string) ?? null,
              }
            : a,
        );
        paymentState = { ...paymentState, allocations: next };
      }),
      findMany: jest.fn(async () => paymentState.allocations.map((a) => ({ ...a }))),
    },
    feeInvoice: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const inv = invoiceState[where.id];
        return inv === undefined ? null : { ...inv };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; version: number };
          data: { paidTotal: number; balanceTotal: number; status: string };
        }) => {
          const inv = invoiceState[where.id];
          if (inv === undefined || inv.version !== where.version) {
            return { count: 0 };
          }
          invoiceState[where.id] = {
            ...inv,
            paidTotal: data.paidTotal,
            balanceTotal: data.balanceTotal,
            status: data.status as FeeInvoiceRow['status'],
            version: inv.version + 1,
          };
          return { count: 1 };
        },
      ),
    },
    feePayment: {
      updateMany: jest.fn(
        async ({
          where,
        }: {
          where: { id: string; version: number };
        }) => {
          if (paymentState.id !== where.id || paymentState.version !== where.version) {
            return { count: 0 };
          }
          paymentState = { ...paymentState, status: 'CANCELLED', version: paymentState.version + 1 };
          return { count: 1 };
        },
      ),
    },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    list: jest.fn(),
    findDetailById: jest.fn(),
    findByIdInTx: jest.fn(async () => ({ ...receiptState })),
    cancel: jest.fn(async (_tx: unknown, input: { id: string; version: number; cancellationReason: string }) => {
      if (receiptState.version !== input.version) {
        throw new FeesVersionConflictError('FeeReceipt', input.id);
      }
      receiptState = {
        ...receiptState,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: input.cancellationReason,
        version: receiptState.version + 1,
      };
      return { ...receiptState };
    }),
  };

  const paymentRepo = {
    findByIdInTx: jest.fn(async () => paymentState),
  };

  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new FeeReceiptService(
    prisma as never,
    repo as never,
    paymentRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );

  return {
    svc,
    prisma,
    tx,
    repo,
    paymentRepo,
    featureFlags,
    outbox,
    audit,
    refundExists,
    state: {
      get receipt(): FeeReceiptRow {
        return receiptState;
      },
      get payment(): FeePaymentWithAllocations {
        return paymentState;
      },
      get invoice(): FeeInvoiceRow {
        return { ...invoiceState['inv-1']! };
      },
      setReceipt(next: FeeReceiptRow): void {
        receiptState = next;
      },
      setPayment(next: FeePaymentWithAllocations): void {
        paymentState = next;
      },
    },
  };
}

/**
 * Build a stubbed `FeePaymentService` capable of capturing the second
 * "re-payment" after the original receipt has been cancelled. Used for
 * the final flow only; isolated from the receipt harness on purpose.
 */
function makePaymentHarness() {
  const invoice: FeeInvoiceRow = makeInvoice({
    paidTotal: 0,
    balanceTotal: 1000,
    status: 'SENT',
  });

  const tx = {
    student: { findFirst: jest.fn(async () => ({ id: STUDENT })) },
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
        id: 'rcp-2',
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
    create: jest.fn(
      async (
        _tx: unknown,
        payment: { studentId: string; method: string; amount: number; status: string; paidAt: Date; referenceNo: string | null; notes: string | null; paymentNo: string | null },
        allocations: readonly { feeInvoiceId: string; amount: number }[],
      ) => ({
        id: 'pay-2',
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
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        version: 1,
        allocations: allocations.map((a, i) => ({
          id: `alloc-2-${i}`,
          schoolId: SCHOOL,
          feePaymentId: 'pay-2',
          feeInvoiceId: a.feeInvoiceId,
          amount: a.amount,
          allocatedAt: NOW,
          allocatedBy: null,
          reversedAt: null,
          reversedBy: null,
          reversalReason: null,
        })),
      }),
    ),
  };
  const invoiceRepo = {
    findById: jest.fn(async () => ({ header: invoice, lines: [] })),
  };
  const sequenceService = { nextValue: jest.fn(async () => 2) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const gateways = { resolve: jest.fn() };
  const paymentSourceRepo = { findById: jest.fn(async () => null) };

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
  return { svc, sequenceService };
}

const CANCEL_ARGS = {
  id: 'rcp-1',
  ifMatchVersion: 1,
  reason: 'Issued in error',
};

describe('Sprint 9 e2e — receipt cancellation flow', () => {
  it('cancels an ISSUED receipt → reverses allocations, flips payment to CANCELLED, rolls invoice back, emits RECEIPT_CANCELLED + INVOICE_RECOMPUTED + finance audit', async () => {
    const h = makeReceiptHarness();

    const cancelled = await withCtx(() => h.svc.cancel(CANCEL_ARGS));

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe(CANCEL_ARGS.reason);
    expect(cancelled.allocations).toHaveLength(1);
    expect(cancelled.allocations[0]!.reversedAt).not.toBeNull();
    expect(cancelled.allocations[0]!.reversalReason).toBe(CANCEL_ARGS.reason);

    // Allocation marked reversed on the shared state.
    expect(h.state.payment.status).toBe('CANCELLED');
    expect(h.state.payment.allocations[0]!.reversedAt).not.toBeNull();

    // Invoice rolled back from PAID → SENT (paidTotal 0, balance 1000).
    expect(h.state.invoice.status).toBe('SENT');
    expect(h.state.invoice.paidTotal).toBe(0);
    expect(h.state.invoice.balanceTotal).toBe(1000);

    // One alloc reversed, one payment flip, one repo.cancel.
    expect(h.tx.feePaymentAllocation.update).toHaveBeenCalledTimes(1);
    expect(h.tx.feePayment.updateMany).toHaveBeenCalledTimes(1);
    expect(h.repo.cancel).toHaveBeenCalledTimes(1);

    // Outbox: RECEIPT_CANCELLED + INVOICE_RECOMPUTED.
    type OutboxCall = [unknown, { topic: string }];
    const topics = (h.outbox.publish.mock.calls as unknown as OutboxCall[]).map(
      (c) => c[1].topic,
    );
    expect(topics).toEqual(
      expect.arrayContaining([
        FeesOutboxTopics.RECEIPT_CANCELLED,
        FeesOutboxTopics.INVOICE_RECOMPUTED,
      ]),
    );

    // Finance audit row.
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'finance',
        action: 'fee-receipt.cancelled',
      }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('refuses a second cancel on the same (now CANCELLED) receipt → ReceiptAlreadyCancelledError; no allocation/payment writes', async () => {
    const h = makeReceiptHarness();
    h.state.setReceipt(
      makeReceipt({
        status: 'CANCELLED',
        cancelledAt: NOW,
        cancellationReason: 'prior cancel',
      }),
    );

    await expect(withCtx(() => h.svc.cancel(CANCEL_ARGS))).rejects.toBeInstanceOf(
      ReceiptAlreadyCancelledError,
    );
    expect(h.repo.cancel).not.toHaveBeenCalled();
    expect(h.tx.feePaymentAllocation.update).not.toHaveBeenCalled();
    expect(h.tx.feePayment.updateMany).not.toHaveBeenCalled();
    expect(h.outbox.publish).not.toHaveBeenCalled();
  });

  it('refuses cancel when a FeeRefund already references the payment → ReceiptCancelRefundExistsError; no allocations reversed', async () => {
    const h = makeReceiptHarness();
    h.refundExists.value = true;

    await expect(withCtx(() => h.svc.cancel(CANCEL_ARGS))).rejects.toBeInstanceOf(
      ReceiptCancelRefundExistsError,
    );
    expect(h.repo.cancel).not.toHaveBeenCalled();
    expect(h.tx.feePaymentAllocation.update).not.toHaveBeenCalled();
    expect(h.tx.feePayment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses cancel with a stale If-Match version → FeesVersionConflictError', async () => {
    const h = makeReceiptHarness();
    h.state.setReceipt(makeReceipt({ version: 7 })); // concurrent writer bumped it.

    await expect(
      withCtx(() => h.svc.cancel({ ...CANCEL_ARGS, ifMatchVersion: 1 })),
    ).rejects.toBeInstanceOf(FeesVersionConflictError);
    expect(h.repo.cancel).not.toHaveBeenCalled();
    expect(h.tx.feePaymentAllocation.update).not.toHaveBeenCalled();
  });

  it('after a successful cancel, capturing a fresh payment for the same student succeeds and gets the next receipt number', async () => {
    // First, run the cancel happy path so we know the invoice is back at SENT.
    const cancelHarness = makeReceiptHarness();
    const cancelled = await withCtx(() => cancelHarness.svc.cancel(CANCEL_ARGS));
    expect(cancelled.status).toBe('CANCELLED');

    // Now capture a new payment of the full amount on the rolled-back invoice.
    const payHarness = makePaymentHarness();
    payHarness.sequenceService.nextValue.mockResolvedValue(2);
    const { payment, receipt } = await withCtx(() =>
      payHarness.svc.capture({
        studentId: STUDENT,
        method: 'CASH',
        amount: 1000,
        paidAt: new Date('2026-06-21T10:00:00.000Z'),
        allocations: [{ invoiceId: 'inv-1', amount: 1000 }],
      }),
    );

    expect(payment.id).toBe('pay-2');
    expect(receipt!.receiptNo).toBe('RCP/2026-27/000002');
    expect(receipt!.status).toBe('ISSUED');
  });
});
