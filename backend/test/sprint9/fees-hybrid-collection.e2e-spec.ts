/**
 * Sprint 9.1 e2e — Hybrid Fee Collection (manual UPI verify / reject flow).
 *
 * Service-orchestration spec (no Testcontainers, no real DB). Real services
 * wired with stub repos backed by shared in-memory state so that the
 * following lifecycle runs end-to-end:
 *
 *  Test 1 (happy path):
 *    1. Create a PRINCIPAL_UPI FeePaymentSource via FeePaymentSourceService;
 *       outbox publishes PAYMENT_SOURCE_CREATED.
 *    2. Capture a UPI_MANUAL payment against a SENT 1000 invoice. Result:
 *       PENDING + verificationStatus=PENDING, no receipt issued, invoice
 *       untouched, outbox has PAYMENT_CAPTURED but NO RECEIPT_ISSUED.
 *    3. FeeLedgerService.getStudentLedger drops the PENDING payment — only
 *       the INVOICE row appears.
 *    4. FeePaymentService.verify → status CAPTURED + verificationStatus
 *       VERIFIED; receipt RCP/2026-27/000001 issued; invoice flips PAID with
 *       paidTotal=1000, balanceTotal=0.
 *    5. Outbox additionally has PAYMENT_VERIFIED + RECEIPT_ISSUED; audit
 *       includes `fee-payment.verified`.
 *    6. Ledger now has 2 entries (INVOICE + PAYMENT). PAYMENT description
 *       includes the source name ("Principal UPI").
 *
 *  Test 2 (rejection path):
 *    1. Create a source + capture a UPI_MANUAL payment (PENDING).
 *    2. FeePaymentService.reject → status FAILED, verificationStatus
 *       REJECTED, no receipt, invoice unchanged, outbox PAYMENT_REJECTED.
 *    3. A subsequent verify call throws PaymentNotPendingVerificationError.
 *    4. Ledger still shows only INVOICE (REJECTED payment never appears).
 */
import { FeeLedgerService } from '../../src/core/fees/fee-ledger/fee-ledger.service';
import { FeePaymentService } from '../../src/core/fees/fee-payment/fee-payment.service';
import { FeePaymentSourceService } from '../../src/core/fees/fee-payment-source/fee-payment-source.service';
import { FeesOutboxTopics } from '../../src/core/fees/fees.constants';
import { PaymentNotPendingVerificationError } from '../../src/core/fees/fees.errors';
import { RequestContextRegistry } from '../../src/core/request-context';
import type {
  FeeInvoiceRow,
  FeePaymentSourceRow,
  FeePaymentWithAllocations,
  FeeReceiptRow,
} from '../../src/core/fees/fees.types';

const SCHOOL = 'sch-hybrid';
const STUDENT = 'st-hybrid';
const INV_ID = 'inv-hybrid';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: 'user-hybrid',
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

interface HarnessState {
  invoices: Record<string, FeeInvoiceRow>;
  sources: FeePaymentSourceRow[];
  payments: FeePaymentWithAllocations[];
  receipts: FeeReceiptRow[];
}

/**
 * Build the shared in-memory state + stubs that wire FeePaymentSourceService,
 * FeePaymentService, and FeeLedgerService together.
 */
function makeHarness() {
  const state: HarnessState = {
    invoices: { [INV_ID]: makeInvoice() },
    sources: [],
    payments: [],
    receipts: [],
  };

  // ---------------------------------------------------------------------------
  // Shared tx — also serves as `prisma.client` for non-tx reads in the ledger.
  // ---------------------------------------------------------------------------
  const tx = {
    student: { findFirst: jest.fn(async () => ({ id: STUDENT })) },

    feeInvoice: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const inv = state.invoices[where.id];
        return inv === undefined ? null : { ...inv };
      }),
      findMany: jest.fn(async () =>
        Object.values(state.invoices).map((i) => ({ ...i, lines: [] })),
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; version: number };
          data: { paidTotal: number; balanceTotal: number; status: string };
        }) => {
          const inv = state.invoices[where.id];
          if (inv === undefined || inv.version !== where.version) {
            return { count: 0 };
          }
          state.invoices[where.id] = {
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
          id: `rcp-${state.receipts.length + 1}`,
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
        state.receipts.push(row);
        return row;
      }),
      findFirst: jest.fn(async () => null),
    },

    feePayment: {
      // Ledger uses `status: { in: ['CAPTURED', 'REFUNDED'] }` and
      // `verificationStatus: { not: 'PENDING' }` to filter out unverified /
      // rejected rows. Honor both here so the ledger reflects reality.
      findMany: jest.fn(
        async (
          {
            where,
          }: {
            where: {
              status?: { in?: string[] };
              verificationStatus?: { not?: string };
            };
          } = { where: {} },
        ) => {
          const statusIn = where?.status?.in;
          const notVerification = where?.verificationStatus?.not;
          return state.payments
            .filter((p) => (statusIn === undefined ? true : statusIn.includes(p.status)))
            .filter((p) =>
              notVerification === undefined
                ? true
                : p.verificationStatus !== notVerification,
            )
            .map((p) => {
              const source =
                p.paymentSourceId === null
                  ? null
                  : (state.sources.find((s) => s.id === p.paymentSourceId) ?? null);
              return {
                ...p,
                allocations: p.allocations.map((a) => ({ ...a })),
                paymentSource: source === null ? null : { name: source.name },
              };
            });
        },
      ),
      // Used by FeePaymentSourceService.softDelete in-use guard; not exercised
      // here but kept for parity with the real schema.
      count: jest.fn(async () => 0),
    },

    feeRefund: { findMany: jest.fn(async () => []) },
  };

  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  // ---------------------------------------------------------------------------
  // FeePaymentSource repo stub — backed by `state.sources`.
  // ---------------------------------------------------------------------------
  const paymentSourceRepoStub = {
    list: jest.fn(async () => ({ rows: state.sources, nextCursorId: null })),
    findById: jest.fn(async (id: string) =>
      state.sources.find((s) => s.id === id) ?? null,
    ),
    findByCodeInTx: jest.fn(async (_tx: unknown, code: string) =>
      state.sources.find((s) => s.code === code && s.deletedAt === null) ?? null,
    ),
    create: jest.fn(
      async (
        _tx: unknown,
        input: {
          code: string;
          name: string;
          kind: FeePaymentSourceRow['kind'];
          identifier: string;
          ifsc?: string | null;
          holderName?: string | null;
          isActive?: boolean;
          description?: string | null;
        },
      ) => {
        const row: FeePaymentSourceRow = {
          id: `src-${state.sources.length + 1}`,
          schoolId: SCHOOL,
          code: input.code,
          name: input.name,
          kind: input.kind,
          identifier: input.identifier,
          ifsc: input.ifsc ?? null,
          holderName: input.holderName ?? null,
          isActive: input.isActive ?? true,
          description: input.description ?? null,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: null,
          updatedBy: null,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        };
        state.sources.push(row);
        return row;
      },
    ),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  // ---------------------------------------------------------------------------
  // FeePayment repo stub — backed by `state.payments`.
  // ---------------------------------------------------------------------------
  const paymentRepoStub = {
    list: jest.fn(),
    findById: jest.fn(async (id: string) =>
      state.payments.find((p) => p.id === id) ?? null,
    ),
    findByIdInTx: jest.fn(async (_tx: unknown, _school: string, id: string) =>
      state.payments.find((p) => p.id === id) ?? null,
    ),
    create: jest.fn(
      async (
        _tx: unknown,
        payment: {
          studentId: string;
          method: FeePaymentWithAllocations['method'];
          amount: number;
          status: FeePaymentWithAllocations['status'];
          paidAt: Date;
          referenceNo: string | null;
          notes: string | null;
          paymentNo: string | null;
          paymentSourceId?: string | null;
          paymentProofUrl?: string | null;
          verificationStatus?: FeePaymentWithAllocations['verificationStatus'];
          verifiedBy?: string | null;
          verifiedAt?: Date | null;
          verificationNotes?: string | null;
        },
        allocations: readonly { feeInvoiceId: string; amount: number }[],
      ) => {
        const pid = `pay-${state.payments.length + 1}`;
        const built: FeePaymentWithAllocations = {
          id: pid,
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
        state.payments.push(built);
        return built;
      },
    ),
    updateVerification: jest.fn(
      async (
        _tx: unknown,
        id: string,
        expectedVersion: number,
        input: {
          status: FeePaymentWithAllocations['status'];
          verificationStatus: FeePaymentWithAllocations['verificationStatus'];
          verifiedAt: Date | null;
          verifiedBy: string | null;
          verificationNotes: string | null;
        },
      ) => {
        const idx = state.payments.findIndex((p) => p.id === id);
        if (idx === -1 || state.payments[idx]!.version !== expectedVersion) {
          throw new Error(`updateVerification mismatch ${id}@${expectedVersion}`);
        }
        const updated: FeePaymentWithAllocations = {
          ...state.payments[idx]!,
          status: input.status,
          verificationStatus: input.verificationStatus,
          verifiedAt: input.verifiedAt,
          verifiedBy: input.verifiedBy,
          verificationNotes: input.verificationNotes,
          version: state.payments[idx]!.version + 1,
        };
        state.payments[idx] = updated;
        return updated;
      },
    ),
  };

  const invoiceRepoStub = {
    findById: jest.fn(async (id: string) => {
      const inv = state.invoices[id];
      if (inv === undefined) return null;
      return { header: { ...inv }, lines: [] };
    }),
  };

  const sequenceService = {
    nextValue: jest.fn(async () => state.receipts.length + 1),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const gateways = { resolve: jest.fn() };

  const sourceSvc = new FeePaymentSourceService(
    prisma as never,
    paymentSourceRepoStub as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );

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

  const ledgerSvc = new FeeLedgerService(prisma as never, featureFlags as never);

  return {
    sourceSvc,
    paymentSvc,
    ledgerSvc,
    outbox,
    audit,
    state: {
      get invoice(): FeeInvoiceRow {
        return { ...state.invoices[INV_ID]! };
      },
      get receipts(): readonly FeeReceiptRow[] {
        return state.receipts;
      },
      get payments(): readonly FeePaymentWithAllocations[] {
        return state.payments;
      },
      get sources(): readonly FeePaymentSourceRow[] {
        return state.sources;
      },
    },
  };
}

type OutboxCall = [unknown, { topic: string }];
type AuditCall = [{ action: string; category: string }];

function topicsOf(outbox: { publish: jest.Mock }): string[] {
  return (outbox.publish.mock.calls as unknown as OutboxCall[]).map((c) => c[1].topic);
}

function auditActionsOf(audit: { record: jest.Mock }): string[] {
  return (audit.record.mock.calls as unknown as AuditCall[]).map((c) => c[0].action);
}

describe('Sprint 9.1 e2e — Hybrid Fee Collection', () => {
  it('Principal-UPI UPI_MANUAL happy path: capture → PENDING (ledger excludes) → verify → CAPTURED + receipt + invoice PAID + source-name in ledger description', async () => {
    const h = makeHarness();

    // ----- 1. Create payment source -----
    const source = await withCtx(() =>
      h.sourceSvc.create({
        code: 'PRIN_UPI_01',
        name: 'Principal UPI',
        kind: 'PRINCIPAL_UPI',
        identifier: 'principal@upi',
        isActive: true,
      }),
    );
    expect(source.code).toBe('PRIN_UPI_01');
    expect(topicsOf(h.outbox)).toEqual(
      expect.arrayContaining([FeesOutboxTopics.PAYMENT_SOURCE_CREATED]),
    );

    // ----- 2. Capture UPI_MANUAL payment (1000 against the SENT 1000 invoice) -----
    const cap = await withCtx(() =>
      h.paymentSvc.capture({
        studentId: STUDENT,
        method: 'UPI_MANUAL',
        amount: 1000,
        paidAt: new Date('2026-06-20T09:00:00.000Z'),
        paymentSourceId: source.id,
        paymentProofUrl: 'https://files.example.com/proof.jpg',
        allocations: [{ invoiceId: INV_ID, amount: 1000 }],
      }),
    );
    expect(cap.payment.status).toBe('PENDING');
    expect(cap.payment.verificationStatus).toBe('PENDING');
    expect(cap.receipt).toBeNull();
    expect(h.state.invoice.paidTotal).toBe(0);
    expect(h.state.invoice.balanceTotal).toBe(1000);
    expect(h.state.invoice.status).toBe('SENT');

    // Outbox: PAYMENT_CAPTURED but NOT RECEIPT_ISSUED.
    const topicsAfterCapture = topicsOf(h.outbox);
    expect(topicsAfterCapture).toEqual(
      expect.arrayContaining([FeesOutboxTopics.PAYMENT_CAPTURED]),
    );
    expect(topicsAfterCapture).not.toEqual(
      expect.arrayContaining([FeesOutboxTopics.RECEIPT_ISSUED]),
    );

    // ----- 3. Ledger excludes PENDING payment -----
    const ledger1 = await withCtx(() =>
      h.ledgerSvc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }),
    );
    expect(ledger1.entries).toHaveLength(1);
    expect(ledger1.entries[0]!.type).toBe('INVOICE');

    // ----- 4. Verify payment -----
    const ver = await withCtx(() =>
      h.paymentSvc.verify(cap.payment.id, '"1"', {
        notes: 'Confirmed receipt in bank',
      }),
    );
    expect(ver.payment.status).toBe('CAPTURED');
    expect(ver.payment.verificationStatus).toBe('VERIFIED');
    expect(ver.receipt.receiptNo).toBe('RCP/2026-27/000001');
    expect(h.state.invoice.paidTotal).toBe(1000);
    expect(h.state.invoice.balanceTotal).toBe(0);
    expect(h.state.invoice.status).toBe('PAID');

    // ----- 5. Outbox + audit fan-out post-verify -----
    const topicsAfterVerify = topicsOf(h.outbox);
    expect(topicsAfterVerify).toEqual(
      expect.arrayContaining([
        FeesOutboxTopics.PAYMENT_VERIFIED,
        FeesOutboxTopics.RECEIPT_ISSUED,
      ]),
    );
    expect(auditActionsOf(h.audit)).toEqual(
      expect.arrayContaining(['fee-payment.verified']),
    );

    // ----- 6. Ledger now shows 2 entries; PAYMENT description includes source name -----
    const ledger2 = await withCtx(() =>
      h.ledgerSvc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }),
    );
    expect(ledger2.entries).toHaveLength(2);
    expect(ledger2.entries.map((e) => e.type)).toEqual(['INVOICE', 'PAYMENT']);
    expect(ledger2.entries[1]!.credit).toBe(1000);
    expect(ledger2.entries[1]!.description).toContain('Principal UPI');
    expect(ledger2.totals.totalInvoiced).toBe(1000);
    expect(ledger2.totals.totalPaid).toBe(1000);
    expect(ledger2.totals.outstandingBalance).toBe(0);
  });

  it('UPI_MANUAL rejection path: capture → reject → no receipt + invoice unchanged + subsequent verify throws + ledger still has only INVOICE', async () => {
    const h = makeHarness();

    // ----- 1. Create source + capture pending payment -----
    const source = await withCtx(() =>
      h.sourceSvc.create({
        code: 'PRIN_UPI_02',
        name: 'Principal UPI',
        kind: 'PRINCIPAL_UPI',
        identifier: 'principal2@upi',
        isActive: true,
      }),
    );
    const cap = await withCtx(() =>
      h.paymentSvc.capture({
        studentId: STUDENT,
        method: 'UPI_MANUAL',
        amount: 1000,
        paidAt: new Date('2026-06-20T09:00:00.000Z'),
        paymentSourceId: source.id,
        paymentProofUrl: 'https://files.example.com/proof.jpg',
        allocations: [{ invoiceId: INV_ID, amount: 1000 }],
      }),
    );
    expect(cap.payment.verificationStatus).toBe('PENDING');

    // ----- 2. Reject -----
    const rej = await withCtx(() =>
      h.paymentSvc.reject(cap.payment.id, '"1"', {
        reason: 'Proof unreadable; parent to re-submit',
      }),
    );
    expect(rej.payment.status).toBe('FAILED');
    expect(rej.payment.verificationStatus).toBe('REJECTED');

    // No receipt; invoice untouched.
    expect(h.state.receipts).toHaveLength(0);
    expect(h.state.invoice.paidTotal).toBe(0);
    expect(h.state.invoice.balanceTotal).toBe(1000);
    expect(h.state.invoice.status).toBe('SENT');

    // Outbox PAYMENT_REJECTED present.
    expect(topicsOf(h.outbox)).toEqual(
      expect.arrayContaining([FeesOutboxTopics.PAYMENT_REJECTED]),
    );
    expect(auditActionsOf(h.audit)).toEqual(
      expect.arrayContaining(['fee-payment.rejected']),
    );

    // ----- 3. Subsequent verify throws PaymentNotPendingVerificationError -----
    await expect(
      withCtx(() => h.paymentSvc.verify(cap.payment.id, '"2"', { notes: 'late' })),
    ).rejects.toBeInstanceOf(PaymentNotPendingVerificationError);

    // ----- 4. Ledger still has only INVOICE -----
    const ledger = await withCtx(() =>
      h.ledgerSvc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }),
    );
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]!.type).toBe('INVOICE');
  });
});
