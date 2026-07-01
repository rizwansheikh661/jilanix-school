/**
 * Sprint 9 e2e — Late fines + refunds flow.
 *
 * Service-orchestration spec (no Testcontainers, no real DB). Real
 * `FeeInvoiceService` and `FeeRefundService` are wired with stubbed repos +
 * a transactional client mock.
 *
 * Flow:
 *   1. Pure-helper sanity: `computeFine` on an invoice 15 days past due with
 *      grace=5, FLAT_PER_DAY=50 → (15-5)*50 = 500.
 *   2. `FeeInvoiceService.applyFines` freezes the same 500 fine into a new
 *      FeeInvoiceLine (`isLateFine=true`), bumps invoice.total, emits
 *      INVOICE_FINES_APPLIED + finance audit.
 *   3. Second `applyFines` on the same invoice (now carrying a fine line)
 *      → FineAlreadyAppliedError; no second line, no second publish.
 *   4. `FeeRefundService.create` for half the captured payment → allocation
 *      reversedAt set, invoice flips to PARTIAL via the REFUNDED status
 *      rule (paidTotal recalc), payment stays CAPTURED (not fully refunded),
 *      one PAYMENT_REFUNDED + per-invoice INVOICE_RECOMPUTED + audit.
 *   5. Refund the remaining half → payment flips to REFUNDED, second
 *      PAYMENT_REFUNDED emitted.
 *   6. Over-refund attempt (anything > 0 on a fully-REFUNDED payment) is
 *      refused with `PaymentNotRefundableError`.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { FeesOutboxTopics } from '../../src/core/fees/fees.constants';
import {
  FineAlreadyAppliedError,
  PaymentNotRefundableError,
} from '../../src/core/fees/fees.errors';
import { FeeInvoiceService, __test__ as InvoiceTest } from '../../src/core/fees/fee-invoice/fee-invoice.service';
import { FeeRefundService } from '../../src/core/fees/fee-refund/fee-refund.service';
import type {
  FeeHeadRow,
  FeeInvoiceLineRow,
  FeeInvoiceRow,
  FeeLateFinePolicyRow,
  FeePaymentWithAllocations,
  FeeStructureWithLines,
} from '../../src/core/fees/fees.types';
import type { FeePaymentMethodValue as FeeRefundMethod } from '../../src/core/fees/fees.constants';

const { computeFine } = InvoiceTest;

const SCHOOL = 'sch-e2e9fr';
const STUDENT = 'st-e2e9fr';
const INV_ID = 'inv-e2e9fr';
const STRUCT_ID = 'fs-e2e9fr';
const HEAD_ID = 'fh-tuition-e2e9fr';
const POLICY_ID = 'pol-e2e9fr';
const PAYMENT_ID = 'pay-e2e9fr';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makeInvoice(over: Partial<FeeInvoiceRow> = {}): FeeInvoiceRow {
  return {
    id: INV_ID,
    schoolId: SCHOOL,
    studentId: STUDENT,
    feeStructureId: STRUCT_ID,
    academicYearId: 'ay-1',
    branchId: null,
    invoiceNo: 'INV/2026-27/000001',
    periodFrom: new Date('2026-06-01'),
    periodTo: new Date('2026-06-30'),
    issueDate: new Date('2026-06-01'),
    // 15 days before NOW (2026-06-20) = 2026-06-05.
    dueDate: new Date('2026-06-05T00:00:00.000Z'),
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

function makeTuitionLine(): FeeInvoiceLineRow {
  return {
    id: 'inv-line-1',
    schoolId: SCHOOL,
    feeInvoiceId: INV_ID,
    feeHeadId: HEAD_ID,
    sourceFinePolicyId: null,
    sourceDiscountId: null,
    description: 'Tuition',
    quantity: 1,
    unitAmount: 1000,
    discountAmount: 0,
    taxAmount: 0,
    lineTotal: 1000,
    isLateFine: false,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  };
}

function makePolicy(): FeeLateFinePolicyRow {
  return {
    id: POLICY_ID,
    schoolId: SCHOOL,
    code: 'STD-FINE',
    name: 'Standard late fine',
    type: 'FLAT_PER_DAY',
    value: 50,
    gracePeriodDays: 5,
    capAmount: null,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  };
}

function makeStructure(): FeeStructureWithLines {
  return {
    id: STRUCT_ID,
    schoolId: SCHOOL,
    branchId: null,
    academicYearId: 'ay-1',
    name: 'AY26 Standard',
    appliesTo: 'CLASS',
    classId: 'cls-1',
    sectionId: null,
    studentId: null,
    currency: 'INR',
    status: 'PUBLISHED',
    publishedAt: NOW,
    archivedAt: null,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    lines: [
      {
        id: 'sl-1',
        schoolId: SCHOOL,
        feeStructureId: STRUCT_ID,
        feeHeadId: HEAD_ID,
        lateFinePolicyId: POLICY_ID,
        amount: 1000,
        frequency: 'MONTHLY',
        dueDay: null,
        ordering: 1,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      },
    ],
  };
}

function makeTuitionHead(): FeeHeadRow {
  return {
    id: HEAD_ID,
    schoolId: SCHOOL,
    code: 'TUI',
    name: 'Tuition',
    category: 'TUITION',
    hsnSac: null,
    isRefundable: true,
    isTaxable: false,
    defaultAmount: 1000,
    glAccount: null,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  };
}

/**
 * Build a `FeeInvoiceService` wired to in-memory state covering the
 * apply-fines flow. The invoice + lines collection mutate as the service
 * adds the late-fine line and bumps totals.
 */
function makeInvoiceHarness() {
  let invoiceState: FeeInvoiceRow = makeInvoice();
  const lineState: FeeInvoiceLineRow[] = [makeTuitionLine()];

  const prisma = {
    client: {},
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const repo = {
    list: jest.fn(),
    findById: jest.fn(async () => ({
      header: { ...invoiceState },
      lines: lineState.map((l) => ({ ...l })),
    })),
    findActiveForStudentPeriod: jest.fn(),
    create: jest.fn(),
    replaceNonFineLines: jest.fn(),
    addLine: jest.fn(async (_id: string, input: Partial<FeeInvoiceLineRow>) => {
      const created: FeeInvoiceLineRow = {
        id: `inv-line-${lineState.length + 1}`,
        schoolId: SCHOOL,
        feeInvoiceId: INV_ID,
        feeHeadId: input.feeHeadId ?? HEAD_ID,
        sourceFinePolicyId: input.sourceFinePolicyId ?? null,
        sourceDiscountId: input.sourceDiscountId ?? null,
        description: input.description ?? '',
        quantity: input.quantity ?? 1,
        unitAmount: input.unitAmount ?? 0,
        discountAmount: input.discountAmount ?? 0,
        taxAmount: input.taxAmount ?? 0,
        lineTotal: input.lineTotal ?? 0,
        isLateFine: input.isLateFine ?? false,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      lineState.push(created);
      return created;
    }),
    updateTotals: jest.fn(
      async (
        _id: string,
        expectedVersion: number,
        input: { subtotal: number; discountTotal: number; taxTotal: number; total: number; status?: FeeInvoiceRow['status'] },
      ) => {
        if (invoiceState.version !== expectedVersion) {
          // Mirror VersionConflictError-like surface.
          throw new Error('VersionConflictError(FeeInvoice)');
        }
        invoiceState = {
          ...invoiceState,
          subtotal: input.subtotal,
          discountTotal: input.discountTotal,
          taxTotal: input.taxTotal,
          total: input.total,
          balanceTotal: input.total - invoiceState.paidTotal,
          status: input.status ?? invoiceState.status,
          version: invoiceState.version + 1,
        };
        return { ...invoiceState };
      },
    ),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
  };

  const structureRepo = {
    findById: jest.fn(async () => makeStructure()),
  };
  const headRepo = {
    findById: jest.fn(async () => makeTuitionHead()),
  };
  const finePolicyRepo = {
    findById: jest.fn(async () => makePolicy()),
  };
  const discountRepo = { findById: jest.fn() };
  const studentDiscountRepo = { findActiveForStudent: jest.fn(async () => []) };
  const sequenceService = { nextValue: jest.fn() };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new FeeInvoiceService(
    prisma as never,
    repo as never,
    structureRepo as never,
    headRepo as never,
    finePolicyRepo as never,
    discountRepo as never,
    studentDiscountRepo as never,
    sequenceService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );

  return {
    svc,
    repo,
    structureRepo,
    headRepo,
    finePolicyRepo,
    outbox,
    audit,
    state: {
      get invoice(): FeeInvoiceRow {
        return invoiceState;
      },
      get lines(): readonly FeeInvoiceLineRow[] {
        return lineState;
      },
    },
  };
}

/**
 * Build a `FeeRefundService` against shared in-memory payment + invoice
 * state. The test drives two refunds in sequence; the harness preserves
 * mutations across calls (payment.status, allocations.reversedAt,
 * invoice.paidTotal/refundTotal/status).
 */
function makeRefundHarness(initialPaid: number = 1000) {
  let paymentState: FeePaymentWithAllocations = {
    id: PAYMENT_ID,
    schoolId: SCHOOL,
    studentId: STUDENT,
    paymentNo: 'PAY-FR-001',
    method: 'CASH',
    amount: initialPaid,
    status: 'CAPTURED',
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
    allocations: [
      {
        id: 'alloc-fr-1',
        schoolId: SCHOOL,
        feePaymentId: PAYMENT_ID,
        feeInvoiceId: INV_ID,
        amount: initialPaid,
        allocatedAt: NOW,
        allocatedBy: null,
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
      },
    ],
  };

  const invoiceState: Record<string, FeeInvoiceRow> = {
    [INV_ID]: makeInvoice({
      paidTotal: initialPaid,
      balanceTotal: 0,
      status: 'PAID',
    }),
  };

  const refunds: { id: string; amount: number }[] = [];

  const tx = {
    feeRefund: {
      findMany: jest.fn(async () =>
        refunds.map((r) => ({ amount: r.amount })),
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: { amount: number; feePaymentId: string; reason: string; method: string; referenceNo: string | null; refundedAt: Date };
        }) => {
          const id = `ref-${refunds.length + 1}`;
          refunds.push({ id, amount: data.amount });
          return {
            id,
            schoolId: SCHOOL,
            feePaymentId: data.feePaymentId,
            amount: data.amount,
            reason: data.reason,
            refundedAt: data.refundedAt,
            refundedBy: null,
            method: data.method,
            referenceNo: data.referenceNo,
          };
        },
      ),
    },
    feePaymentAllocation: {
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { schoolId_id: { id: string } };
          data: { reversedAt: Date; reversedBy: string | null; reversalReason: string };
        }) => {
          const next = paymentState.allocations.map((a) =>
            a.id === where.schoolId_id.id
              ? {
                  ...a,
                  reversedAt: data.reversedAt,
                  reversedBy: data.reversedBy,
                  reversalReason: data.reversalReason,
                }
              : a,
          );
          paymentState = { ...paymentState, allocations: next };
        },
      ),
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
          data: { paidTotal: number; refundTotal: number; balanceTotal: number; status: string };
        }) => {
          const inv = invoiceState[where.id];
          if (inv === undefined || inv.version !== where.version) {
            return { count: 0 };
          }
          invoiceState[where.id] = {
            ...inv,
            paidTotal: data.paidTotal,
            refundTotal: data.refundTotal,
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
          paymentState = {
            ...paymentState,
            status: 'REFUNDED',
            version: paymentState.version + 1,
          };
          return { count: 1 };
        },
      ),
    },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  // Note: FeeRefundService calls FeeRefundRepository.sumByPayment and .create
  // directly — we stub both to read/write the in-memory `refunds` array, so
  // the cap check sees prior refund amounts correctly across multiple calls.
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(
      async (
        _tx: unknown,
        input: { feePaymentId: string; amount: number; reason: string; method: string; referenceNo: string | null; refundedAt: Date },
      ) => {
        const id = `ref-${refunds.length + 1}`;
        refunds.push({ id, amount: input.amount });
        return {
          id,
          schoolId: SCHOOL,
          feePaymentId: input.feePaymentId,
          amount: input.amount,
          reason: input.reason,
          refundedAt: input.refundedAt,
          refundedBy: null,
          method: input.method as FeeRefundMethod,
          referenceNo: input.referenceNo,
        };
      },
    ),
    sumByPayment: jest.fn(async () =>
      refunds.reduce((acc, r) => acc + r.amount, 0),
    ),
  };

  const paymentRepo = {
    findByIdInTx: jest.fn(async () => paymentState),
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

  return {
    svc,
    repo,
    paymentRepo,
    outbox,
    audit,
    tx,
    state: {
      get payment(): FeePaymentWithAllocations {
        return paymentState;
      },
      get invoice(): FeeInvoiceRow {
        return { ...invoiceState[INV_ID]! };
      },
      get refunds(): readonly { id: string; amount: number }[] {
        return refunds;
      },
      setPayment(next: FeePaymentWithAllocations): void {
        paymentState = next;
      },
    },
  };
}

describe('Sprint 9 e2e — late fines + refunds flow', () => {
  it('computeFine: 15 days past due with grace=5 + FLAT_PER_DAY 50 → 500', () => {
    const invoice = {
      total: 1000,
      dueDate: new Date('2026-06-05T00:00:00.000Z'),
    };
    const policy = {
      id: POLICY_ID,
      type: 'FLAT_PER_DAY' as const,
      value: 50,
      gracePeriodDays: 5,
      capAmount: null,
    };
    const result = computeFine(invoice, policy, NOW);
    expect(result.daysOverdue).toBe(10); // 15 calendar days - 5 grace.
    expect(result.amount).toBe(500); // (15-5)*50.
    expect(result.cappedAt).toBeNull();
  });

  it('applyFines freezes the 500 fine into a new LATE_FINE line, bumps total, emits INVOICE_FINES_APPLIED + finance audit', async () => {
    const h = makeInvoiceHarness();

    const updated = await withCtx(() => h.svc.applyFines(INV_ID, 1));

    expect(updated.total).toBe(1500); // 1000 + 500.
    expect(updated.lines).toHaveLength(2);
    const fineLine = updated.lines.find((l) => l.isLateFine);
    expect(fineLine).toBeDefined();
    expect(fineLine!.lineTotal).toBe(500);
    expect(fineLine!.sourceFinePolicyId).toBe(POLICY_ID);

    expect(h.repo.addLine).toHaveBeenCalledTimes(1);
    expect(h.repo.updateTotals).toHaveBeenCalledTimes(1);

    type OutboxCall = [unknown, { topic: string }];
    const topics = (h.outbox.publish.mock.calls as unknown as OutboxCall[]).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(FeesOutboxTopics.INVOICE_FINES_APPLIED);

    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'fee_invoice.apply_fines',
        category: 'finance',
      }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('second applyFines on the same invoice (already carrying a fine line) → FineAlreadyAppliedError', async () => {
    const h = makeInvoiceHarness();
    await withCtx(() => h.svc.applyFines(INV_ID, 1));

    await expect(
      withCtx(() => h.svc.applyFines(INV_ID, h.state.invoice.version)),
    ).rejects.toBeInstanceOf(FineAlreadyAppliedError);

    // Only one addLine / updateTotals across both attempts.
    expect(h.repo.addLine).toHaveBeenCalledTimes(1);
    expect(h.repo.updateTotals).toHaveBeenCalledTimes(1);
  });

  it('first half-refund: reverses the allocation residue, rolls invoice paidTotal down, payment stays CAPTURED, emits PAYMENT_REFUNDED + INVOICE_RECOMPUTED + audit', async () => {
    const h = makeRefundHarness(1000);

    const refund = await withCtx(() =>
      h.svc.create({
        paymentId: PAYMENT_ID,
        amount: 500,
        reason: 'Half refund (test)',
        method: 'CASH',
      }),
    );

    expect(refund.amount).toBe(500);
    expect(h.state.refunds).toHaveLength(1);
    // Allocation reversedAt set (residue path: cumulative > requested).
    expect(h.state.payment.allocations[0]!.reversedAt).not.toBeNull();
    // Payment NOT yet flipped — refund(500) < amount(1000).
    expect(h.state.payment.status).toBe('CAPTURED');
    // Invoice paidTotal decremented by alloc.amount (full reversal),
    // refundTotal incremented by refundApplied (=500).
    expect(h.state.invoice.paidTotal).toBe(0);
    expect(h.state.invoice.refundTotal).toBe(500);

    type OutboxCall = [unknown, { topic: string }];
    const topics = (h.outbox.publish.mock.calls as unknown as OutboxCall[]).map(
      (c) => c[1].topic,
    );
    expect(topics).toEqual(
      expect.arrayContaining([
        FeesOutboxTopics.PAYMENT_REFUNDED,
        FeesOutboxTopics.INVOICE_RECOMPUTED,
      ]),
    );
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'fee-refund.created',
        category: 'finance',
      }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('second half-refund flips the payment to REFUNDED and emits another PAYMENT_REFUNDED', async () => {
    // First refund leaves the lone allocation already reversed. The next
    // refund must succeed on the cap check (refundable = 500) without any
    // remaining non-reversed allocation — exercising the immutable-alloc
    // semantics described in fee-refund.service.ts.
    const h = makeRefundHarness(1000);
    await withCtx(() =>
      h.svc.create({
        paymentId: PAYMENT_ID,
        amount: 500,
        reason: 'First half',
        method: 'CASH',
      }),
    );

    const secondRefund = await withCtx(() =>
      h.svc.create({
        paymentId: PAYMENT_ID,
        amount: 500,
        reason: 'Second half',
        method: 'CASH',
      }),
    );
    expect(secondRefund.amount).toBe(500);
    expect(h.state.refunds).toHaveLength(2);

    // Payment is now fully refunded (existing 500 + 500 == amount 1000).
    expect(h.state.payment.status).toBe('REFUNDED');

    type OutboxCall = [unknown, { topic: string }];
    const refundTopicCount = (
      h.outbox.publish.mock.calls as unknown as OutboxCall[]
    ).filter((c) => c[1].topic === FeesOutboxTopics.PAYMENT_REFUNDED).length;
    expect(refundTopicCount).toBe(2);
  });

  it('any further refund after the payment is REFUNDED → PaymentNotRefundableError', async () => {
    const h = makeRefundHarness(1000);
    await withCtx(() =>
      h.svc.create({
        paymentId: PAYMENT_ID,
        amount: 500,
        reason: 'First half',
        method: 'CASH',
      }),
    );
    await withCtx(() =>
      h.svc.create({
        paymentId: PAYMENT_ID,
        amount: 500,
        reason: 'Second half',
        method: 'CASH',
      }),
    );
    // Payment is REFUNDED — any further request must fail at the guard.
    await expect(
      withCtx(() =>
        h.svc.create({
          paymentId: PAYMENT_ID,
          amount: 1,
          reason: 'Over-refund',
          method: 'CASH',
        }),
      ),
    ).rejects.toBeInstanceOf(PaymentNotRefundableError);
    expect(h.state.refunds).toHaveLength(2);
  });
});
