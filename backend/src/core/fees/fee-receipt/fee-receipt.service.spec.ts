/**
 * FeeReceiptService unit specs — cancel orchestration + list passthrough.
 *
 * Asserts:
 *   - cancel on ISSUED: reverses allocations, flips payment + receipt to
 *     CANCELLED, emits RECEIPT_CANCELLED + per-invoice INVOICE_RECOMPUTED,
 *     writes a finance-category audit row.
 *   - cancel on already-CANCELLED → ReceiptAlreadyCancelledError.
 *   - cancel refused when a FeeRefund references the payment →
 *     ReceiptCancelRefundExistsError.
 *   - list returns repo rows + nextCursorId.
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  ReceiptAlreadyCancelledError,
  ReceiptCancelRefundExistsError,
} from '../fees.errors';
import type {
  FeePaymentAllocationRow,
  FeePaymentWithAllocations,
  FeeReceiptRow,
} from '../fees.types';
import { FeeReceiptService } from './fee-receipt.service';

const SCHOOL = 'sch-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeReceipt(over: Partial<FeeReceiptRow> = {}): FeeReceiptRow {
  return {
    id: 'rcp-1',
    schoolId: SCHOOL,
    feePaymentId: 'pay-1',
    studentId: 'st-1',
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

function makeAllocation(over: Partial<FeePaymentAllocationRow> = {}): FeePaymentAllocationRow {
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
    studentId: 'st-1',
    paymentNo: 'PAY-001',
    method: 'CASH',
    amount: 1000,
    status,
    referenceNo: null,
    paidAt: NOW,
    gatewayCode: null,
    gatewayPaymentId: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    paymentSourceId: null,
    paymentProofUrl: null,
    verificationStatus: 'NOT_REQUIRED',
    verifiedBy: null,
    verifiedAt: null,
    verificationNotes: null,
    allocations,
  };
}

function makeService() {
  const invoices: Record<
    string,
    { id: string; status: string; paidTotal: number; total: number; version: number }
  > = {
    'inv-1': { id: 'inv-1', status: 'PAID', paidTotal: 1000, total: 1000, version: 1 },
  };
  const tx = {
    feeRefund: { findFirst: jest.fn(async () => null) },
    feePaymentAllocation: {
      update: jest.fn(async () => undefined),
      findMany: jest.fn(async () => [
        {
          id: 'alloc-1',
          schoolId: SCHOOL,
          feePaymentId: 'pay-1',
          feeInvoiceId: 'inv-1',
          amount: 1000,
          allocatedAt: NOW,
          allocatedBy: null,
          reversedAt: NOW,
          reversedBy: null,
          reversalReason: 'Mistake',
        },
      ]),
    },
    feeInvoice: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const inv = invoices[where.id];
        if (inv === undefined) return null;
        return { ...inv };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; version: number };
          data: { paidTotal: number; status: string };
        }) => {
          const inv = invoices[where.id];
          if (inv === undefined || inv.version !== where.version) {
            return { count: 0 };
          }
          inv.paidTotal = data.paidTotal;
          inv.status = data.status;
          inv.version += 1;
          return { count: 1 };
        },
      ),
    },
    feePayment: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    list: jest.fn(async () => ({
      rows: [makeReceipt()],
      nextCursorId: 'rcp-next',
    })),
    findDetailById: jest.fn(),
    findByIdInTx: jest.fn(async () => makeReceipt()),
    cancel: jest.fn(async (_tx, input) => ({
      ...makeReceipt({
        id: input.id,
        status: 'CANCELLED',
        cancelledAt: NOW,
        cancellationReason: input.cancellationReason,
        version: input.version + 1,
      }),
    })),
  };

  const paymentRepo = {
    findByIdInTx: jest.fn(async () => makePayment()),
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
  return { svc, prisma, tx, repo, paymentRepo, featureFlags, outbox, audit, invoices };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

const CANCEL_ARGS = {
  id: 'rcp-1',
  ifMatchVersion: 1,
  reason: 'Issued in error',
};

describe('FeeReceiptService.cancel', () => {
  it('reverses allocations, flips payment + receipt to CANCELLED, emits RECEIPT_CANCELLED + INVOICE_RECOMPUTED + finance audit', async () => {
    const t = makeService();
    const out = await withCtx(() => t.svc.cancel(CANCEL_ARGS));
    expect(out.status).toBe('CANCELLED');

    // Each allocation reversed exactly once.
    expect(t.tx.feePaymentAllocation.update).toHaveBeenCalledTimes(1);
    // Payment flipped.
    expect(t.tx.feePayment.updateMany).toHaveBeenCalledTimes(1);
    const paymentData = (t.tx.feePayment.updateMany.mock.calls as unknown as Array<
      [{ data: { status: string } }]
    >)[0]![0].data;
    expect(paymentData.status).toBe('CANCELLED');
    // Repo cancel called with the receipt's version.
    expect(t.repo.cancel).toHaveBeenCalledTimes(1);

    const topics = (
      t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>
    ).map((c) => c[1].topic);
    expect(topics).toEqual(
      expect.arrayContaining([
        FeesOutboxTopics.RECEIPT_CANCELLED,
        FeesOutboxTopics.INVOICE_RECOMPUTED,
      ]),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee-receipt.cancelled' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('refuses cancel on already-CANCELLED receipt → ReceiptAlreadyCancelledError', async () => {
    const t = makeService();
    t.repo.findByIdInTx.mockResolvedValue(
      makeReceipt({ status: 'CANCELLED', cancelledAt: NOW, cancellationReason: 'x' }),
    );
    await expect(withCtx(() => t.svc.cancel(CANCEL_ARGS))).rejects.toBeInstanceOf(
      ReceiptAlreadyCancelledError,
    );
    expect(t.repo.cancel).not.toHaveBeenCalled();
    expect(t.tx.feePayment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses cancel when a FeeRefund exists for the payment → ReceiptCancelRefundExistsError', async () => {
    const t = makeService();
    (t.tx.feeRefund.findFirst as jest.Mock).mockResolvedValue({ id: 'ref-1' });
    await expect(withCtx(() => t.svc.cancel(CANCEL_ARGS))).rejects.toBeInstanceOf(
      ReceiptCancelRefundExistsError,
    );
    expect(t.repo.cancel).not.toHaveBeenCalled();
    expect(t.tx.feePaymentAllocation.update).not.toHaveBeenCalled();
  });
});

describe('FeeReceiptService.list', () => {
  it('returns repo items + nextCursorId', async () => {
    const t = makeService();
    const result = await withCtx(() => t.svc.list({ limit: 25 }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('rcp-1');
    expect(result.nextCursorId).toBe('rcp-next');
    expect(t.repo.list).toHaveBeenCalledWith({ limit: 25 });
  });
});
