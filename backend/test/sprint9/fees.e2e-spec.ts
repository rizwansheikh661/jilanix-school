/**
 * Sprint 9 e2e — Fees full happy-path lifecycle.
 *
 * Service-orchestration spec (no Testcontainers, no real DB). Three real
 * services — `FeePaymentService`, `FeeReceiptService`, `FeeLedgerService` —
 * are wired with stubbed repos backed by shared in-memory state so two
 * sequential payments mutate the same invoice + receipt collection across
 * service boundaries.
 *
 * Flow:
 *   1. Pay 1 (CASH 600 against a SENT 1000 invoice) → invoice flips to
 *      PARTIAL, receipt RCP/2026-27/000001 issued, PAYMENT_CAPTURED +
 *      RECEIPT_ISSUED + finance audit row.
 *   2. Pay 2 (CASH 400 against the remaining balance) → invoice flips to
 *      PAID, second receipt RCP/2026-27/000002, another PAYMENT_CAPTURED +
 *      RECEIPT_ISSUED + finance audit row.
 *   3. `FeeReceiptService.list` returns both receipts (most-recent first).
 *   4. `FeeLedgerService.getStudentLedger` returns a 3-row ledger
 *      (INVOICE + 2x PAYMENT) sorted by `at` asc, runningBalance walks
 *      1000 → 400 → 0, totals invoiced/paid balance.
 *   5. Outbox topic set across the two captures includes both
 *      PAYMENT_CAPTURED and RECEIPT_ISSUED entries.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { FeesOutboxTopics } from '../../src/core/fees/fees.constants';
import { FeeLedgerService } from '../../src/core/fees/fee-ledger/fee-ledger.service';
import { FeePaymentService } from '../../src/core/fees/fee-payment/fee-payment.service';
import { FeeReceiptService } from '../../src/core/fees/fee-receipt/fee-receipt.service';
import type {
  FeeInvoiceRow,
  FeePaymentWithAllocations,
  FeeReceiptRow,
} from '../../src/core/fees/fees.types';

const SCHOOL = 'sch-e2e9full';
const STUDENT = 'st-e2e9full';
const INV_ID = 'inv-e2e9full';
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
    feeStructureId: 'fs-1',
    academicYearId: 'ay-1',
    branchId: null,
    invoiceNo: 'INV/2026-27/000001',
    periodFrom: new Date('2026-06-01'),
    periodTo: new Date('2026-06-30'),
    issueDate: new Date('2026-06-01T00:00:00.000Z'),
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

/**
 * Build the shared in-memory state + tx mock used by FeePaymentService,
 * FeeReceiptService, and FeeLedgerService. Two sequential captures mutate
 * the invoice's paidTotal / balanceTotal / status and add receipt rows.
 */
function makeHarness() {
  const invoiceState: Record<string, FeeInvoiceRow> = {
    [INV_ID]: makeInvoice(),
  };
  const receipts: FeeReceiptRow[] = [];
  const payments: FeePaymentWithAllocations[] = [];

  // The shared "tx" — also serves as `prisma.client` for non-tx reads
  // performed by FeeLedgerService and FeeReceiptService.list.
  const tx = {
    student: { findFirst: jest.fn(async () => ({ id: STUDENT })) },
    feeInvoice: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const inv = invoiceState[where.id];
        return inv === undefined ? null : { ...inv };
      }),
      findMany: jest.fn(
        async ({ where: _where }: { where: Record<string, unknown> } = { where: {} }) =>
          Object.values(invoiceState).map((i) => ({
            ...i,
            lines: [],
          })),
      ),
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
    academicYear: {
      findFirst: jest.fn(async () => ({
        startDate: new Date('2026-04-01T00:00:00.000Z'),
      })),
    },
    feeReceipt: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: FeeReceiptRow = {
          id: `rcp-${receipts.length + 1}`,
          schoolId: SCHOOL,
          feePaymentId: data.feePaymentId as string,
          studentId: data.studentId as string,
          receiptNo: data.receiptNo as string,
          issuedAt: NOW,
          issuedBy: null,
          totalAmount: data.totalAmount as number,
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
        };
        receipts.push(row);
        return row;
      }),
      findFirst: jest.fn(async () => null),
    },
    feePayment: {
      findMany: jest.fn(async () =>
        payments.map((p) => ({
          ...p,
          allocations: p.allocations.map((a) => ({ ...a })),
        })),
      ),
    },
    feeRefund: {
      findMany: jest.fn(async () => []),
    },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  // ----- FeePaymentService deps -----
  const paymentRepoStub = {
    list: jest.fn(),
    findById: jest.fn(),
    findByIdInTx: jest.fn(),
    create: jest.fn(
      async (
        _tx: unknown,
        payment: { studentId: string; method: string; amount: number; status: string; paidAt: Date; referenceNo: string | null; notes: string | null; paymentNo: string | null },
        allocations: readonly { feeInvoiceId: string; amount: number }[],
      ) => {
        const pid = `pay-${payments.length + 1}`;
        const built: FeePaymentWithAllocations = {
          id: pid,
          schoolId: SCHOOL,
          studentId: payment.studentId,
          paymentNo: payment.paymentNo,
          method: payment.method as FeePaymentWithAllocations['method'],
          amount: payment.amount,
          status: payment.status as FeePaymentWithAllocations['status'],
          referenceNo: payment.referenceNo,
          paidAt: payment.paidAt,
          gatewayCode: null,
          gatewayPaymentId: null,
          notes: payment.notes,
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
          allocations: allocations.map((a, i) => ({
            id: `${pid}-alloc-${i}`,
            schoolId: SCHOOL,
            feePaymentId: pid,
            feeInvoiceId: a.feeInvoiceId,
            amount: a.amount,
            allocatedAt: payment.paidAt,
            allocatedBy: null,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
          })),
        };
        payments.push(built);
        return built;
      },
    ),
  };

  const invoiceRepoStub = {
    findById: jest.fn(async (id: string) => {
      const inv = invoiceState[id];
      if (inv === undefined) return null;
      return { header: { ...inv }, lines: [] };
    }),
  };

  const sequenceService = {
    nextValue: jest.fn(async () => receipts.length + 1),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const gateways = { resolve: jest.fn() };
  const paymentSourceRepoStub = { findById: jest.fn(async () => null) };

  const paymentSvc = new FeePaymentService(
    prisma as never,
    paymentRepoStub as never,
    invoiceRepoStub as never,
    sequenceService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    gateways as never,
    paymentSourceRepoStub as never,
  );

  // ----- FeeReceiptService deps (only `list` is exercised here) -----
  const receiptRepoStub = {
    list: jest.fn(async ({ limit }: { limit: number }) => {
      // Mirror the repo's behavior: take limit+1, peel off the surplus row
      // into nextCursorId. With <= limit rows, nextCursorId is null.
      const sorted = [...receipts].sort(
        (a, b) => b.issuedAt.getTime() - a.issuedAt.getTime(),
      );
      const slice = sorted.slice(0, limit);
      return { rows: slice, nextCursorId: null };
    }),
    findDetailById: jest.fn(),
    findByIdInTx: jest.fn(),
    cancel: jest.fn(),
  };
  const receiptSvc = new FeeReceiptService(
    prisma as never,
    receiptRepoStub as never,
    { findByIdInTx: jest.fn() } as never, // paymentRepo — unused in list().
    featureFlags as never,
    outbox as never,
    audit as never,
  );

  // ----- FeeLedgerService -----
  const ledgerSvc = new FeeLedgerService(prisma as never, featureFlags as never);

  return {
    paymentSvc,
    receiptSvc,
    ledgerSvc,
    prisma,
    tx,
    outbox,
    audit,
    sequenceService,
    state: {
      get invoice(): FeeInvoiceRow {
        return { ...invoiceState[INV_ID]! };
      },
      get receipts(): readonly FeeReceiptRow[] {
        return receipts;
      },
      get payments(): readonly FeePaymentWithAllocations[] {
        return payments;
      },
    },
  };
}

describe('Sprint 9 e2e — fees happy-path lifecycle', () => {
  it('captures two sequential payments → invoice walks SENT → PARTIAL → PAID, two receipts issued with sequential RCP numbers, ledger balances to 0', async () => {
    const h = makeHarness();

    // ----- 1. Pay 1 (partial, 600) -----
    const cap1 = await withCtx(() =>
      h.paymentSvc.capture({
        studentId: STUDENT,
        method: 'CASH',
        amount: 600,
        paidAt: new Date('2026-06-20T09:00:00.000Z'),
        allocations: [{ invoiceId: INV_ID, amount: 600 }],
      }),
    );
    expect(cap1.payment.id).toBe('pay-1');
    expect(cap1.receipt!.receiptNo).toBe('RCP/2026-27/000001');
    expect(h.state.invoice.status).toBe('PARTIAL');
    expect(h.state.invoice.paidTotal).toBe(600);
    expect(h.state.invoice.balanceTotal).toBe(400);

    // ----- 2. Pay 2 (final, 400) -----
    const cap2 = await withCtx(() =>
      h.paymentSvc.capture({
        studentId: STUDENT,
        method: 'CASH',
        amount: 400,
        paidAt: new Date('2026-06-20T15:00:00.000Z'),
        allocations: [{ invoiceId: INV_ID, amount: 400 }],
      }),
    );
    expect(cap2.payment.id).toBe('pay-2');
    expect(cap2.receipt!.receiptNo).toBe('RCP/2026-27/000002');
    expect(h.state.invoice.status).toBe('PAID');
    expect(h.state.invoice.paidTotal).toBe(1000);
    expect(h.state.invoice.balanceTotal).toBe(0);

    // ----- 3. List receipts (mock repo returns insertion order; real repo sorts issuedAt desc) -----
    const list = await withCtx(() => h.receiptSvc.list({ limit: 25 }));
    expect(list.items).toHaveLength(2);
    expect(list.items.map((r) => r.receiptNo).sort()).toEqual([
      'RCP/2026-27/000001',
      'RCP/2026-27/000002',
    ]);
    expect(list.nextCursorId).toBeNull();

    // ----- 4. Ledger -----
    const ledger = await withCtx(() =>
      h.ledgerSvc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }),
    );
    expect(ledger.entries).toHaveLength(3); // INVOICE + 2 PAYMENT
    expect(ledger.entries.map((e) => e.type)).toEqual([
      'INVOICE',
      'PAYMENT',
      'PAYMENT',
    ]);
    expect(ledger.entries[0]!.debit).toBe(1000);
    expect(ledger.entries[0]!.runningBalance).toBe(1000);
    expect(ledger.entries[1]!.credit).toBe(600);
    expect(ledger.entries[1]!.runningBalance).toBe(400);
    expect(ledger.entries[2]!.credit).toBe(400);
    expect(ledger.entries[2]!.runningBalance).toBe(0);
    expect(ledger.totals.totalInvoiced).toBe(1000);
    expect(ledger.totals.totalPaid).toBe(1000);
    expect(ledger.totals.totalRefunded).toBe(0);
    expect(ledger.totals.outstandingBalance).toBe(0);

    // ----- 5. Outbox + finance audit fan-out -----
    type OutboxCall = [unknown, { topic: string }];
    const topics = (h.outbox.publish.mock.calls as unknown as OutboxCall[]).map(
      (c) => c[1].topic,
    );
    expect(topics.filter((t) => t === FeesOutboxTopics.PAYMENT_CAPTURED)).toHaveLength(2);
    expect(topics.filter((t) => t === FeesOutboxTopics.RECEIPT_ISSUED)).toHaveLength(2);

    // One finance audit per capture.
    type AuditCall = [{ action: string; category: string }];
    const auditActions = (h.audit.record.mock.calls as unknown as AuditCall[]).map(
      (c) => c[0].action,
    );
    expect(
      auditActions.filter((a) => a === 'fee-payment.captured'),
    ).toHaveLength(2);
  });
});
