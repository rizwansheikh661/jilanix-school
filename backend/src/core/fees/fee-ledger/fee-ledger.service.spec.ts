/**
 * FeeLedgerService unit specs — read-only timeline assembly.
 *
 * Asserts:
 *   - INVOICE → PAYMENT → REFUND chronological order with correct
 *     runningBalance per entry.
 *   - VOID invoices and CANCELLED payments are excluded from the timeline.
 *   - LATE_FINE invoice lines emit a separate FINE entry; the invoice's
 *     debit excludes fine-line totals to avoid double-counting.
 *   - totals.totalInvoiced = Σ debits (INVOICE + FINE);
 *     totals.outstandingBalance = totalInvoiced - totalPaid + totalRefunded.
 */
import { RequestContextRegistry } from '../../request-context';
import { FeeLedgerService } from './fee-ledger.service';

const SCHOOL = 'sch-1';
const STUDENT = 'st-1';

function makeService(opts: {
  invoices?: unknown[];
  payments?: unknown[];
  refunds?: unknown[];
}) {
  const client = {
    feeInvoice: { findMany: jest.fn(async () => opts.invoices ?? []) },
    feePayment: { findMany: jest.fn(async () => opts.payments ?? []) },
    feeRefund: { findMany: jest.fn(async () => opts.refunds ?? []) },
  };
  const prisma = { client };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const svc = new FeeLedgerService(prisma as never, featureFlags as never);
  return { svc, client, featureFlags };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('FeeLedgerService.getStudentLedger', () => {
  it('builds INVOICE → PAYMENT → REFUND timeline with running balance + totals', async () => {
    const t = makeService({
      invoices: [
        {
          id: 'inv-1',
          invoiceNo: 'INV-1',
          issueDate: new Date('2026-06-01T00:00:00.000Z'),
          total: 1000,
          status: 'PAID',
          lines: [],
        },
      ],
      payments: [
        {
          id: 'pay-1',
          paymentNo: 'PAY-001',
          method: 'CASH',
          amount: 1000,
          paidAt: new Date('2026-06-05T00:00:00.000Z'),
          status: 'CAPTURED',
          allocations: [{ id: 'alloc-1', feeInvoiceId: 'inv-1' }],
        },
      ],
      refunds: [
        {
          id: 'ref-1',
          reason: 'Withdraw',
          amount: 200,
          refundedAt: new Date('2026-06-10T00:00:00.000Z'),
        },
      ],
    });

    const ledger = await withCtx(() => t.svc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }));
    expect(ledger.entries.map((e) => e.type)).toEqual(['INVOICE', 'PAYMENT', 'REFUND']);
    expect(ledger.entries[0]!.runningBalance).toBe(1000);
    expect(ledger.entries[1]!.runningBalance).toBe(0);
    expect(ledger.entries[2]!.runningBalance).toBe(200);
    expect(ledger.totals.totalInvoiced).toBe(1000);
    expect(ledger.totals.totalPaid).toBe(1000);
    expect(ledger.totals.totalRefunded).toBe(200);
    expect(ledger.totals.outstandingBalance).toBe(200); // 1000 - 1000 + 200
  });

  it('excludes VOID invoices and CANCELLED payments from the where filters', async () => {
    const t = makeService({});
    await withCtx(() => t.svc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }));

    const invWhere = (t.client.feeInvoice.findMany.mock.calls as unknown as Array<
      [{ where: { status: { not: string } } }]
    >)[0]![0].where;
    expect(invWhere.status).toEqual({ not: 'VOID' });

    const payWhere = (t.client.feePayment.findMany.mock.calls as unknown as Array<
      [{ where: { status: { in: readonly string[] } } }]
    >)[0]![0].where;
    expect(payWhere.status.in).toEqual(['CAPTURED', 'REFUNDED']);
    expect(payWhere.status.in).not.toContain('CANCELLED');
  });

  it('LATE_FINE lines emit a separate FINE entry; invoice debit excludes fine-line totals', async () => {
    const t = makeService({
      invoices: [
        {
          id: 'inv-1',
          invoiceNo: 'INV-1',
          issueDate: new Date('2026-06-01T00:00:00.000Z'),
          total: 1100, // 1000 tuition + 100 fine
          status: 'SENT',
          lines: [
            {
              id: 'il-1',
              description: 'Tuition',
              lineTotal: 1000,
              isLateFine: false,
              sourceDiscountId: null,
              createdAt: new Date('2026-06-01T00:00:00.000Z'),
            },
            {
              id: 'il-2',
              description: 'Late fine',
              lineTotal: 100,
              isLateFine: true,
              sourceDiscountId: null,
              createdAt: new Date('2026-06-08T00:00:00.000Z'),
            },
          ],
        },
      ],
    });

    const ledger = await withCtx(() => t.svc.getStudentLedger({ schoolId: SCHOOL, studentId: STUDENT }));
    const invoiceEntry = ledger.entries.find((e) => e.type === 'INVOICE');
    const fineEntry = ledger.entries.find((e) => e.type === 'FINE');
    expect(invoiceEntry).toBeDefined();
    expect(fineEntry).toBeDefined();
    // Invoice debit = total (1100) - fine-line (100) = 1000 (no double-counting).
    expect(invoiceEntry!.debit).toBe(1000);
    expect(fineEntry!.debit).toBe(100);
    // totalInvoiced sums INVOICE + FINE debits.
    expect(ledger.totals.totalInvoiced).toBe(1100);
    expect(ledger.totals.outstandingBalance).toBe(1100);
  });

  it('with academicYearId on, restricts invoices via where and filters payments to those touching in-set invoices', async () => {
    const t = makeService({
      invoices: [
        {
          id: 'inv-1',
          invoiceNo: 'INV-1',
          issueDate: new Date('2026-06-01T00:00:00.000Z'),
          total: 1000,
          status: 'PAID',
          lines: [],
        },
      ],
      payments: [
        {
          id: 'pay-keep',
          paymentNo: 'P1',
          method: 'CASH',
          amount: 1000,
          paidAt: new Date('2026-06-05T00:00:00.000Z'),
          status: 'CAPTURED',
          allocations: [{ id: 'a1', feeInvoiceId: 'inv-1' }],
        },
        {
          id: 'pay-drop',
          paymentNo: 'P2',
          method: 'CASH',
          amount: 500,
          paidAt: new Date('2026-06-06T00:00:00.000Z'),
          status: 'CAPTURED',
          allocations: [{ id: 'a2', feeInvoiceId: 'inv-other' }],
        },
      ],
    });

    const ledger = await withCtx(() =>
      t.svc.getStudentLedger({
        schoolId: SCHOOL,
        studentId: STUDENT,
        academicYearId: 'ay-1',
      }),
    );

    const invWhere = (t.client.feeInvoice.findMany.mock.calls as unknown as Array<
      [{ where: { academicYearId?: string } }]
    >)[0]![0].where;
    expect(invWhere.academicYearId).toBe('ay-1');

    // Only the payment touching inv-1 survives.
    const paymentEntries = ledger.entries.filter((e) => e.type === 'PAYMENT');
    expect(paymentEntries).toHaveLength(1);
    expect(paymentEntries[0]!.referenceId).toBe('pay-keep');
    expect(ledger.totals.totalPaid).toBe(1000);
  });
});
