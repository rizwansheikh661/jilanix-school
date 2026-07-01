/**
 * FeeRefundService.create unit specs — APPEND_ONLY refund flow.
 *
 * Asserts:
 *   - allocations reversed largest-first
 *   - fully-refunded payment flips → REFUNDED, partial leaves CAPTURED
 *   - cap check raises RefundExceedsPaidError
 *   - non-CAPTURED payment refused with PaymentNotRefundableError
 *   - PAYMENT_REFUNDED outbox + finance audit emitted
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  PaymentNotRefundableError,
  RefundExceedsPaidError,
} from '../fees.errors';
import type {
  FeePaymentAllocationRow,
  FeePaymentWithAllocations,
} from '../fees.types';
import { FeeRefundService } from './fee-refund.service';

const SCHOOL = 'sch-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeAllocation(over: Partial<FeePaymentAllocationRow> = {}): FeePaymentAllocationRow {
  return {
    id: 'alloc-1',
    schoolId: SCHOOL,
    feePaymentId: 'pay-1',
    feeInvoiceId: 'inv-1',
    amount: 500,
    allocatedAt: NOW,
    allocatedBy: null,
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
    ...over,
  };
}

function makePayment(
  status: 'CAPTURED' | 'REFUNDED' | 'CANCELLED' | 'FAILED' | 'PENDING' = 'CAPTURED',
  amount = 1000,
  allocations: readonly FeePaymentAllocationRow[] = [
    makeAllocation({ id: 'alloc-1', amount: 700, feeInvoiceId: 'inv-1' }),
    makeAllocation({ id: 'alloc-2', amount: 300, feeInvoiceId: 'inv-2' }),
  ],
): FeePaymentWithAllocations {
  return {
    id: 'pay-1',
    schoolId: SCHOOL,
    studentId: 'st-1',
    paymentNo: 'PAY-001',
    method: 'CASH',
    amount,
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
  // Track per-invoice version + paid/refund so that updateMany succeeds with version check.
  const invoices: Record<string, { id: string; status: string; paidTotal: number; refundTotal: number; total: number; version: number }> = {
    'inv-1': { id: 'inv-1', status: 'PAID', paidTotal: 700, refundTotal: 0, total: 700, version: 1 },
    'inv-2': { id: 'inv-2', status: 'PAID', paidTotal: 300, refundTotal: 0, total: 300, version: 1 },
  };
  const tx = {
    feePaymentAllocation: {
      update: jest.fn(async () => undefined),
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
          data: { paidTotal: number; refundTotal: number; status: string };
        }) => {
          const inv = invoices[where.id];
          if (inv === undefined || inv.version !== where.version) {
            return { count: 0 };
          }
          inv.paidTotal = data.paidTotal;
          inv.refundTotal = data.refundTotal;
          inv.status = data.status;
          inv.version += 1;
          return { count: 1 };
        },
      ),
    },
    feePayment: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    list: jest.fn(),
    create: jest.fn(async (_tx, input) => ({
      id: 'ref-1',
      schoolId: SCHOOL,
      feePaymentId: input.feePaymentId,
      amount: input.amount,
      reason: input.reason,
      refundedAt: input.refundedAt,
      refundedBy: null,
      method: input.method,
      referenceNo: input.referenceNo,
    })),
    sumByPayment: jest.fn(async () => 0),
  };

  const paymentRepo = {
    findByIdInTx: jest.fn(async () => makePayment()),
  };

  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new FeeRefundService(
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

const BASE_ARGS = {
  paymentId: 'pay-1',
  amount: 1000,
  reason: 'Withdrawal',
  method: 'CASH' as const,
};

describe('FeeRefundService.create', () => {
  it('full refund reverses allocations largest-first; emits PAYMENT_REFUNDED + finance audit', async () => {
    const t = makeService();
    const refund = await withCtx(() => t.svc.create(BASE_ARGS));
    expect(refund.id).toBe('ref-1');
    // Two allocations reversed.
    expect(t.tx.feePaymentAllocation.update).toHaveBeenCalledTimes(2);
    const firstId = (t.tx.feePaymentAllocation.update.mock.calls as unknown as Array<
      [{ where: { schoolId_id: { id: string } } }]
    >)[0]![0].where.schoolId_id.id;
    // Largest first: alloc-1 (amount 700) > alloc-2 (amount 300).
    expect(firstId).toBe('alloc-1');

    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.PAYMENT_REFUNDED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee-refund.created' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('throws RefundExceedsPaidError when amount > payment.amount - existing refunds', async () => {
    const t = makeService();
    t.repo.sumByPayment.mockResolvedValue(400); // already refunded 400 of 1000
    await expect(
      withCtx(() => t.svc.create({ ...BASE_ARGS, amount: 700 })),
    ).rejects.toBeInstanceOf(RefundExceedsPaidError);
  });

  it('full refund flips payment.status → REFUNDED', async () => {
    const t = makeService();
    await withCtx(() => t.svc.create(BASE_ARGS));
    expect(t.tx.feePayment.updateMany).toHaveBeenCalledTimes(1);
    const data = (t.tx.feePayment.updateMany.mock.calls as unknown as Array<
      [{ data: { status: string } }]
    >)[0]![0].data;
    expect(data.status).toBe('REFUNDED');
  });

  it('partial refund leaves payment.status CAPTURED (does not flip)', async () => {
    const t = makeService();
    await withCtx(() => t.svc.create({ ...BASE_ARGS, amount: 300 }));
    expect(t.tx.feePayment.updateMany).not.toHaveBeenCalled();
  });

  it('payment with status CANCELLED rejected with PaymentNotRefundableError', async () => {
    const t = makeService();
    t.paymentRepo.findByIdInTx.mockResolvedValue(makePayment('CANCELLED'));
    await expect(withCtx(() => t.svc.create(BASE_ARGS))).rejects.toBeInstanceOf(
      PaymentNotRefundableError,
    );
  });
});
