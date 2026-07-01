/**
 * BillingSubscriptionIntegrationService unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - generateInvoiceForRenewal calls SubscriptionService.getById (NEVER the
 *     SubscriptionRepository or the Prisma `subscription` client). It then
 *     creates a DRAFT invoice via InvoiceService.createDraft and issues it
 *     via InvoiceService.issue.
 *
 * Constraint: this test deliberately omits SubscriptionRepository and the
 * Prisma subscription client from the mock graph. If the integration service
 * ever bypasses SubscriptionService, the resulting reference error fails the
 * test loudly.
 */
import { withTestContext } from '../../src/core/request-context';
import { BillingSubscriptionIntegrationService } from '../../src/core/billing/subscription-integration/billing-subscription-integration.service';
import type { SubscriptionRow } from '../../src/core/subscription/subscription.types';

function makeSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    schoolId: 'school-1',
    planId: 'plan-pro',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    currency: 'INR',
    monthlyPrice: 1000,
    yearlyPrice: 10000,
    assignedBy: null,
    assignedAt: new Date('2026-06-01T00:00:00Z'),
    startedAt: new Date('2026-06-01T00:00:00Z'),
    expiryDate: new Date('2027-06-01T00:00:00Z'),
    cancelledAt: null,
    cancellationReason: null,
    trialEndsAt: null,
    lastRenewedAt: new Date('2026-06-01T00:00:00Z'),
    nextRenewalAt: new Date('2026-07-01T00:00:00Z'),
    autoRenew: true,
    version: 3,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeService() {
  const subscriptionService = {
    getById: jest.fn(),
    renew: jest.fn(),
    suspend: jest.fn(),
  };
  const invoiceService = {
    get: jest.fn(),
    createDraft: jest.fn(),
    issue: jest.fn(),
  };
  const accountService = { getAccountBySchoolId: jest.fn() };
  const settingsService = { getSettings: jest.fn() };

  const svc = new BillingSubscriptionIntegrationService(
    subscriptionService as never,
    invoiceService as never,
    accountService as never,
    settingsService as never,
  );
  return { svc, subscriptionService, invoiceService, accountService, settingsService };
}

describe('BillingSubscriptionIntegrationService.generateInvoiceForRenewal', () => {
  it('reads via SubscriptionService.getById and never touches a Prisma subscription client', async () => {
    const t = makeService();
    const sub = makeSubscription();
    t.subscriptionService.getById.mockResolvedValue(sub);
    t.accountService.getAccountBySchoolId.mockResolvedValue({
      id: 'acc-1',
      schoolId: 'school-1',
      currency: 'INR',
    });
    t.settingsService.getSettings.mockResolvedValue({
      billingLeadDays: 7,
      gracePeriodDays: 7,
    });
    const draft = {
      invoice: { id: 'inv-1', version: 1 },
      lines: [],
    };
    t.invoiceService.createDraft.mockResolvedValue(draft);
    t.invoiceService.issue.mockResolvedValue({ id: 'inv-1', status: 'PENDING', version: 2 });

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.generateInvoiceForRenewal({ schoolId: 'school-1', subscriptionId: 'sub-1' }),
    );

    expect(out.id).toBe('inv-1');
    expect(t.subscriptionService.getById).toHaveBeenCalledWith('school-1', 'sub-1');
    expect(t.invoiceService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        schoolId: 'school-1',
        subscriptionId: 'sub-1',
        billingCycle: 'MONTHLY',
        currency: 'INR',
        lines: expect.arrayContaining([
          expect.objectContaining({ lineType: 'SUBSCRIPTION', amount: 1000 }),
        ]),
      }),
    );
    expect(t.invoiceService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', expectedVersion: 1 }),
    );
  });
});
