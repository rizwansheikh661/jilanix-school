/**
 * BillingAccountService unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - createAccount creates account + profile + address + tax + settings
 *     atomically; emits `billing.account.created` outbox row; appends a
 *     tenancy-category audit row.
 *   - createAccount with a duplicate schoolId fails the pre-check and throws
 *     BillingAccountAlreadyExistsError before opening the tx.
 */
import { withTestContext } from '../../src/core/request-context';
import { BillingAccountService } from '../../src/core/billing/account/billing-account.service';
import { BillingOutboxTopics } from '../../src/core/billing/billing.constants';
import { BillingAccountAlreadyExistsError } from '../../src/core/billing/billing.errors';
import type { BillingAccountRow } from '../../src/core/billing/billing.types';

function makeAccount(overrides: Partial<BillingAccountRow> = {}): BillingAccountRow {
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
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    client: {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    },
  };
  const repo = {
    findById: jest.fn(),
    findBySchoolId: jest.fn().mockResolvedValue(null),
    list: jest.fn(),
    createAccount: jest.fn(),
    upsertProfile: jest.fn(),
    upsertAddress: jest.fn(),
    upsertTax: jest.fn(),
    findProfile: jest.fn(),
    findAddress: jest.fn(),
    findTax: jest.fn(),
    updateProfile: jest.fn(),
    updateAddress: jest.fn(),
    updateTax: jest.fn(),
    incrementBalances: jest.fn(),
  };
  const settingsRepo = { create: jest.fn() };
  const sequences = { nextValue: jest.fn().mockResolvedValue(1) };
  const outbox = { publish: jest.fn().mockResolvedValue({ id: 'ob-1' }) };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'a-1', rowHash: 'h' }) };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };

  const svc = new BillingAccountService(
    prisma as never,
    repo as never,
    settingsRepo as never,
    sequences as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return { svc, prisma, repo, settingsRepo, sequences, outbox, audit, featureFlags };
}

const PROFILE_INPUT = {
  legalName: 'Acme Public School',
  contactEmail: 'billing@acme.test',
};
const ADDRESS_INPUT = {
  addressLine1: '1 MG Road',
  city: 'Bengaluru',
  stateCode: 'KA',
  stateName: 'Karnataka',
  pincode: '560001',
  countryCode: 'IN',
};
const TAX_INPUT = { placeOfSupply: 'KA', taxExempt: false };

describe('BillingAccountService.createAccount', () => {
  it('creates account + profile + address + tax + settings atomically, emits outbox + audit', async () => {
    const t = makeService();
    t.repo.findBySchoolId.mockResolvedValue(null);
    const account = makeAccount();
    t.repo.createAccount.mockResolvedValue(account);
    t.repo.upsertProfile.mockResolvedValue({ id: 'prof-1' });
    t.repo.upsertAddress.mockResolvedValue({ id: 'addr-1' });
    t.repo.upsertTax.mockResolvedValue({ id: 'tax-1' });

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.createAccount({
        schoolId: 'school-1',
        profile: PROFILE_INPUT as never,
        address: ADDRESS_INPUT as never,
        taxDetails: TAX_INPUT as never,
      }),
    );

    expect(out.account.id).toBe('acc-1');
    expect(t.sequences.nextValue).toHaveBeenCalled();
    expect(t.repo.createAccount).toHaveBeenCalled();
    expect(t.repo.upsertProfile).toHaveBeenCalled();
    expect(t.repo.upsertAddress).toHaveBeenCalled();
    expect(t.repo.upsertTax).toHaveBeenCalled();
    expect(t.settingsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', schoolId: 'school-1' }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: BillingOutboxTopics.ACCOUNT_CREATED,
        eventType: 'BillingAccountCreated',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.account.created',
        category: 'tenancy',
        resourceType: 'BillingAccount',
        resourceId: 'acc-1',
      }),
      expect.anything(),
    );
  });

  it('throws BillingAccountAlreadyExistsError on duplicate schoolId', async () => {
    const t = makeService();
    t.repo.findBySchoolId.mockResolvedValue(makeAccount());

    await expect(
      withTestContext({ schoolId: 'school-1' }, () =>
        t.svc.createAccount({
          schoolId: 'school-1',
          profile: PROFILE_INPUT as never,
          address: ADDRESS_INPUT as never,
          taxDetails: TAX_INPUT as never,
        }),
      ),
    ).rejects.toBeInstanceOf(BillingAccountAlreadyExistsError);
    expect(t.repo.createAccount).not.toHaveBeenCalled();
    expect(t.prisma.client.$transaction).not.toHaveBeenCalled();
  });
});
