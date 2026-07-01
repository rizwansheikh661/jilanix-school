/**
 * TrialService unit spec — focuses on the extension cap, state-machine
 * gating, and the date arithmetic. Repositories + Prisma are stubbed so
 * the spec runs entirely in-memory.
 */
import {
  ProvisioningOutboxTopics,
  TRIAL_EXTENSION_MAX_COUNT,
} from '../provisioning.constants';
import {
  InvalidLifecycleTransitionError,
  TrialExtensionLimitError,
} from '../provisioning.errors';
import type { SchoolRootRow } from '../../school/school/school.types';
import { TrialService } from './trial.service';

function row(overrides: Partial<SchoolRootRow> = {}): SchoolRootRow {
  return {
    id: 's-1',
    slug: 'sunrise',
    legalName: 'Sunrise Public School',
    displayName: 'Sunrise',
    countryCode: 'IN',
    gstin: null,
    pan: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateCode: null,
    pincode: null,
    phone: null,
    email: null,
    website: null,
    timezone: 'Asia/Kolkata',
    localeDefault: 'en-IN',
    status: 'trial',
    onboardedAt: null,
    archivedAt: null,
    lifecycleStatus: 'TRIAL',
    trialStartDate: new Date('2026-06-01T00:00:00Z'),
    trialEndDate: new Date('2026-07-01T00:00:00Z'),
    trialExtendedCount: 0,
    planId: null,
    planAssignedAt: null,
    planExpiresAt: null,
    planStatus: null,
    suspendedAt: null,
    suspendedReason: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 5,
    ...overrides,
  };
}

function makeService(initial: SchoolRootRow) {
  let current = initial;

  const schools = {
    findById: jest.fn(async () => current),
    updateTrial: jest.fn(async (_id: string, _v: number, patch: Partial<SchoolRootRow>) => {
      current = { ...current, ...patch, version: current.version + 1 };
      return current;
    }),
    findExpiringTrials: jest.fn(async () => [] as SchoolRootRow[]),
  };

  const outbox = { publish: jest.fn(async () => ({})) };
  const audit = { record: jest.fn(async () => undefined) };

  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {},
  };

  const service = new TrialService(
    prisma as never,
    schools as never,
    outbox as never,
    audit as never,
  );
  return { service, schools, outbox, audit, getCurrent: () => current };
}

describe('TrialService.extend', () => {
  it('adds days to trialEndDate, increments trialExtendedCount, emits outbox', async () => {
    const { service, schools, outbox, audit, getCurrent } = makeService(row());

    const result = await service.extend({
      schoolId: 's-1',
      expectedVersion: 5,
      additionalDays: 7,
      reason: 'late onboarding',
    });

    expect(result.trialExtendedCount).toBe(1);
    expect(result.trialEndDate).toEqual(new Date('2026-07-08T00:00:00Z'));
    expect(schools.updateTrial).toHaveBeenCalledWith(
      's-1',
      5,
      expect.objectContaining({ trialExtendedCount: 1 }),
      expect.any(Object),
    );
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        topic: ProvisioningOutboxTopics.TRIAL_EXTENDED,
        payload: expect.objectContaining({ additionalDays: 7, reason: 'late onboarding' }),
      }),
    );
    expect(audit.record).toHaveBeenCalled();
    expect(getCurrent().version).toBe(6);
  });

  it('refuses extension on non-TRIAL schools', async () => {
    const { service } = makeService(row({ lifecycleStatus: 'ACTIVE' }));
    await expect(
      service.extend({ schoolId: 's-1', expectedVersion: 5, additionalDays: 7 }),
    ).rejects.toBeInstanceOf(InvalidLifecycleTransitionError);
  });

  it(`enforces the cap of ${String(TRIAL_EXTENSION_MAX_COUNT)} extensions`, async () => {
    const { service } = makeService(
      row({ trialExtendedCount: TRIAL_EXTENSION_MAX_COUNT }),
    );
    await expect(
      service.extend({ schoolId: 's-1', expectedVersion: 5, additionalDays: 7 }),
    ).rejects.toBeInstanceOf(TrialExtensionLimitError);
  });

  it('throws on non-positive additionalDays', async () => {
    const { service } = makeService(row());
    await expect(
      service.extend({ schoolId: 's-1', expectedVersion: 5, additionalDays: 0 }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      service.extend({ schoolId: 's-1', expectedVersion: 5, additionalDays: -1 }),
    ).rejects.toThrow(/positive integer/);
  });
});
