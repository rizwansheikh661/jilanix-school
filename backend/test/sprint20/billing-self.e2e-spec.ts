/**
 * Sprint 20 e2e — tenant /me/billing read surface through BillingSelfController.
 *
 * As a school user (tenant context with schoolId), the controller exposes
 * read-only paths under `/v1/me/billing`. This spec walks two of them:
 *
 *   1. GET /v1/me/billing/account             → 200 + the school's BillingAccount
 *   2. GET /v1/me/billing/invoices            → 200 + paginated invoices for
 *                                                this tenant only.
 *
 * The service stack is mocked at the constructor boundary; the
 * RequestContextRegistry binding is established via withTestContext so
 * `requireSchoolId()` resolves successfully.
 */
import { withTestContext } from '../../src/core/request-context';
import { BillingSelfController } from '../../src/core/billing/self/billing-self.controller';
import type {
  BillingAccountRow,
  InvoiceRow,
} from '../../src/core/billing/billing.types';

function makeAccount(): BillingAccountRow {
  return {
    id: 'acc-1',
    schoolId: 'school-1',
    accountNumber: 'BA-000001',
    currency: 'INR',
    balanceDue: 0,
    creditBalance: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    totalRefunded: 0,
    isActive: true,
    lastInvoiceAt: null,
    lastPaymentAt: null,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    version: 1,
  };
}

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    accountId: 'acc-1',
    schoolId: 'school-1',
    invoiceNumber: 'INV-2026-27-000001',
    status: 'PENDING',
    fiscalYear: '2026-27',
    subscriptionId: null,
    billingCycle: null,
    periodStart: null,
    periodEnd: null,
    issuedAt: new Date('2026-06-25T00:00:00Z'),
    dueDate: new Date('2026-07-09T00:00:00Z'),
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
    version: 2,
    ...overrides,
  };
}

function buildSuite() {
  const accountServiceStub = {
    getAccountBySchoolId: jest.fn(async () => makeAccount()),
    getProfile: jest.fn(),
    getAddress: jest.fn(),
    getTaxDetails: jest.fn(),
  };
  const settingsServiceStub = { getSettings: jest.fn() };
  const invoiceServiceStub = {
    list: jest.fn(async () => ({ items: [makeInvoice()], nextCursorId: null })),
    getWithLines: jest.fn(),
  };
  const paymentServiceStub = { list: jest.fn() };
  const refundServiceStub = { list: jest.fn() };

  const controller = new BillingSelfController(
    accountServiceStub as never,
    settingsServiceStub as never,
    invoiceServiceStub as never,
    paymentServiceStub as never,
    refundServiceStub as never,
  );
  return { controller, accountServiceStub, invoiceServiceStub };
}

describe('Sprint 20 e2e — /me/billing self surface (controller)', () => {
  it('GET /me/billing/account returns the calling tenant account', async () => {
    const s = buildSuite();

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      s.controller.getAccount(),
    );

    expect(out.id).toBe('acc-1');
    expect(out.schoolId).toBe('school-1');
    expect(s.accountServiceStub.getAccountBySchoolId).toHaveBeenCalledWith('school-1');
  });

  it('GET /me/billing/invoices returns paginated invoices for this tenant', async () => {
    const s = buildSuite();

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      s.controller.listInvoices({ limit: 25 } as never),
    );

    expect(out.items.length).toBe(1);
    expect(out.items[0]?.invoiceNumber).toBe('INV-2026-27-000001');
    expect(out.nextCursor).toBeNull();
    expect(s.invoiceServiceStub.list).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', limit: 25 }),
    );
  });
});
