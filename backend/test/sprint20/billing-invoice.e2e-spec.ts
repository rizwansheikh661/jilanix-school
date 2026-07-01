/**
 * Sprint 20 e2e — invoice lifecycle through the InvoiceController layer.
 *
 * Drives InvoiceController against in-memory stubs of the service stack:
 *
 *   1. POST   /v1/platform/billing/invoices            (controller.create)
 *      → InvoiceService.createDraft returns a DRAFT invoice.
 *   2. POST   /v1/platform/billing/invoices/:id/issue  (controller.issue)
 *      with `If-Match: "1"` → InvoiceService.issue transitions DRAFT → PENDING.
 *   3. GET    /v1/platform/billing/invoices/:id        (controller.get)
 *      → returns the issued invoice with `status: PENDING`.
 *
 * The InvoiceService is mocked at the constructor boundary; we exercise the
 * full controller pipeline including If-Match parsing and DTO mapping.
 */
import { InvoiceController } from '../../src/core/billing/invoice/invoice.controller';
import type {
  InvoiceLineRow,
  InvoiceRow,
} from '../../src/core/billing/billing.types';

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    accountId: 'acc-1',
    schoolId: 'school-1',
    invoiceNumber: 'DRAFT-AB12',
    status: 'DRAFT',
    fiscalYear: '2026-27',
    subscriptionId: null,
    billingCycle: null,
    periodStart: null,
    periodEnd: null,
    issuedAt: null,
    dueDate: null,
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
    version: 1,
    ...overrides,
  };
}

function makeLine(overrides: Partial<InvoiceLineRow> = {}): InvoiceLineRow {
  return {
    id: 'line-1',
    invoiceId: '11111111-1111-4111-8111-111111111111',
    lineType: 'SUBSCRIPTION',
    description: 'Plan: pro (MONTHLY)',
    quantity: 1,
    unitPrice: 1000,
    amount: 1000,
    taxCode: null,
    taxRate: null,
    taxAmount: 180,
    metadata: null,
    sortOrder: 0,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    ...overrides,
  };
}

function buildSuite() {
  let invoice: InvoiceRow = makeInvoice();
  const lines: InvoiceLineRow[] = [makeLine()];

  const serviceStub = {
    createDraft: jest.fn(async () => {
      invoice = makeInvoice({ status: 'DRAFT', version: 1 });
      return { invoice, lines };
    }),
    issue: jest.fn(async (args: { invoiceId: string; expectedVersion: number }) => {
      invoice = makeInvoice({
        id: args.invoiceId,
        invoiceNumber: 'INV-2026-27-000001',
        status: 'PENDING',
        issuedAt: new Date('2026-06-25T01:00:00Z'),
        dueDate: new Date('2026-07-09T00:00:00Z'),
        version: args.expectedVersion + 1,
      });
      return invoice;
    }),
    getWithLines: jest.fn(async () => ({ invoice, lines })),
    list: jest.fn(),
    listHistory: jest.fn(),
    void: jest.fn(),
    writeOff: jest.fn(),
    markOverdue: jest.fn(),
  };

  const controller = new InvoiceController(serviceStub as never);
  return { controller, serviceStub };
}

describe('Sprint 20 e2e — invoice lifecycle (controller)', () => {
  it('admin creates a draft, issues it, then reads back PENDING', async () => {
    const s = buildSuite();

    // Step 1 — create draft.
    const draft = await s.controller.create({
      accountId: 'acc-1',
      schoolId: 'school-1',
      fiscalYear: '2026-27',
      lines: [
        {
          lineType: 'SUBSCRIPTION',
          description: 'Plan: pro (MONTHLY)',
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
        },
      ],
    } as never);
    expect(draft.invoice.status).toBe('DRAFT');
    expect(draft.invoice.version).toBe(1);
    expect(s.serviceStub.createDraft).toHaveBeenCalled();

    // Step 2 — issue with If-Match.
    const issued = await s.controller.issue(
      '11111111-1111-4111-8111-111111111111',
      '"1"',
      {} as never,
    );
    expect(issued.status).toBe('PENDING');
    expect(s.serviceStub.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: '11111111-1111-4111-8111-111111111111',
        expectedVersion: 1,
      }),
    );

    // Step 3 — get returns the PENDING invoice.
    const got = await s.controller.get('11111111-1111-4111-8111-111111111111');
    expect(got.invoice.status).toBe('PENDING');
    expect(got.invoice.invoiceNumber).toBe('INV-2026-27-000001');
  });
});
