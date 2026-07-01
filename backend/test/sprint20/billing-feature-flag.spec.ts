/**
 * Billing feature-flag enforcement unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - InvoiceService.createDraft throws BillingModuleDisabledError when
 *     `module.billing` is off.
 *   - RazorpayService.createOrderForInvoice throws RazorpayDisabledError when
 *     `billing.razorpay_enabled` is off.
 */
import { withTestContext } from '../../src/core/request-context';
import { InvoiceService } from '../../src/core/billing/invoice/invoice.service';
import { RazorpayService } from '../../src/core/billing/razorpay/razorpay.service';
import {
  BillingFeatureFlags,
} from '../../src/core/billing/billing.constants';
import {
  BillingModuleDisabledError,
  RazorpayDisabledError,
} from '../../src/core/billing/billing.errors';

function makeInvoiceService(flagState: (key: string) => boolean) {
  const prisma = { client: { $transaction: jest.fn() } };
  const repo = { findById: jest.fn() };
  const accountRepo = { findById: jest.fn().mockResolvedValue({ id: 'acc-1', schoolId: 'school-1', currency: 'INR' }) };
  const accountService = { incrementBalances: jest.fn() };
  const settingsRepo = { findByAccountId: jest.fn() };
  const sequences = { nextValue: jest.fn() };
  const outbox = { publish: jest.fn() };
  const audit = { record: jest.fn() };
  const featureFlags = { isEnabled: jest.fn(async (key: string) => flagState(key)) };

  const svc = new InvoiceService(
    prisma as never,
    repo as never,
    accountRepo as never,
    accountService as never,
    settingsRepo as never,
    sequences as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return { svc, featureFlags };
}

function makeRazorpayService(flagState: (key: string) => boolean) {
  const prisma = { client: { $transaction: jest.fn() } };
  const gateway = { createOrder: jest.fn() };
  const paymentSourceService = { getActiveRazorpaySource: jest.fn(), getDecryptedSecrets: jest.fn() };
  const paymentService = { recordRazorpay: jest.fn() };
  const paymentRepo = { findByGatewayOrder: jest.fn() };
  const invoiceRepo = {
    findById: jest.fn().mockResolvedValue({
      id: 'inv-1',
      accountId: 'acc-1',
      schoolId: 'school-1',
      invoiceNumber: 'INV-2026-27-000001',
      amountDue: 1180,
      currency: 'INR',
    }),
  };
  const outbox = { publish: jest.fn() };
  const featureFlags = { isEnabled: jest.fn(async (key: string) => flagState(key)) };

  const svc = new RazorpayService(
    prisma as never,
    gateway as never,
    paymentSourceService as never,
    paymentService as never,
    paymentRepo as never,
    invoiceRepo as never,
    outbox as never,
    featureFlags as never,
  );
  return { svc, featureFlags };
}

describe('Billing feature-flag enforcement', () => {
  it('InvoiceService.createDraft throws BillingModuleDisabledError when module.billing is off', async () => {
    const { svc } = makeInvoiceService((key) => key !== BillingFeatureFlags.MODULE);

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        svc.createDraft({
          accountId: 'acc-1',
          schoolId: 'school-1',
          fiscalYear: '2026-27',
          lines: [
            {
              lineType: 'SUBSCRIPTION',
              description: 'plan',
              quantity: 1,
              unitPrice: 1000,
              amount: 1000,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BillingModuleDisabledError);
  });

  it('RazorpayService.createOrderForInvoice throws RazorpayDisabledError when billing.razorpay_enabled is off', async () => {
    const { svc } = makeRazorpayService((key) => key !== BillingFeatureFlags.RAZORPAY_ENABLED);

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        svc.createOrderForInvoice({ invoiceId: 'inv-1' }),
      ),
    ).rejects.toBeInstanceOf(RazorpayDisabledError);
  });
});
