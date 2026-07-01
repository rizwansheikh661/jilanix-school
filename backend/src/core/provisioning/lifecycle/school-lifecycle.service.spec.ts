/**
 * SchoolLifecycleService unit spec — exercises the state-machine guards
 * (cancelled is terminal, activate requires plan), plus session revocation
 * on suspend/cancel.
 */
import {
  InvalidLifecycleTransitionError,
  PlanNotAssignedError,
  SchoolAlreadyCancelledError,
} from '../provisioning.errors';
import { ProvisioningOutboxTopics } from '../provisioning.constants';
import type { SchoolRootRow } from '../../school/school/school.types';
import { SchoolLifecycleService } from './school-lifecycle.service';

function row(overrides: Partial<SchoolRootRow> = {}): SchoolRootRow {
  return {
    id: 's-1',
    slug: 'sunrise',
    legalName: 'Sunrise Public School',
    displayName: 'Sunrise',
    countryCode: 'IN',
    gstin: null, pan: null,
    addressLine1: null, addressLine2: null, city: null, stateCode: null, pincode: null,
    phone: null, email: null, website: null,
    timezone: 'Asia/Kolkata', localeDefault: 'en-IN',
    status: 'trial',
    onboardedAt: null, archivedAt: null,
    lifecycleStatus: 'TRIAL',
    trialStartDate: new Date('2026-06-01T00:00:00Z'),
    trialEndDate: new Date('2026-07-01T00:00:00Z'),
    trialExtendedCount: 0,
    planId: 'plan-1', planAssignedAt: new Date(), planExpiresAt: null, planStatus: 'ASSIGNED',
    suspendedAt: null, suspendedReason: null, cancelledAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    createdBy: null, updatedBy: null,
    deletedAt: null, deletedBy: null,
    version: 5,
    ...overrides,
  };
}

function makeService(initial: SchoolRootRow) {
  let current = initial;
  const updateMany = jest.fn(async () => ({ count: 3 }));

  const schools = {
    findById: jest.fn(async () => current),
    updateLifecycle: jest.fn(async (_id: string, _v: number, patch: Partial<SchoolRootRow>) => {
      current = { ...current, ...patch, version: current.version + 1 };
      return current;
    }),
  };

  const outbox = { publish: jest.fn(async () => ({})) };
  const audit = { record: jest.fn(async () => undefined) };

  const tx = { userSession: { updateMany } } as unknown;

  const prisma = {
    transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    client: {},
  };

  const service = new SchoolLifecycleService(
    prisma as never,
    schools as never,
    outbox as never,
    audit as never,
  );
  return { service, schools, outbox, audit, updateMany, getCurrent: () => current };
}

describe('SchoolLifecycleService.activate', () => {
  it('moves TRIAL → ACTIVE when a plan is assigned and emits SCHOOL_ACTIVATED', async () => {
    const { service, outbox, getCurrent } = makeService(row());
    const result = await service.activate('s-1', 5);
    expect(result.lifecycleStatus).toBe('ACTIVE');
    expect(result.status).toBe('active');
    expect(getCurrent().planStatus).toBe('ACTIVE');
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ topic: ProvisioningOutboxTopics.SCHOOL_ACTIVATED }),
    );
  });

  it('throws PlanNotAssignedError when planId is null', async () => {
    const { service } = makeService(row({ planId: null, planStatus: null }));
    await expect(service.activate('s-1', 5)).rejects.toBeInstanceOf(PlanNotAssignedError);
  });

  it('refuses to move CANCELLED → ACTIVE (cancellation is terminal)', async () => {
    const { service } = makeService(row({ lifecycleStatus: 'CANCELLED' }));
    await expect(service.activate('s-1', 5)).rejects.toBeInstanceOf(SchoolAlreadyCancelledError);
  });
});

describe('SchoolLifecycleService.suspend', () => {
  it('moves ACTIVE → SUSPENDED, revokes sessions, emits SCHOOL_SUSPENDED', async () => {
    const { service, outbox, updateMany, getCurrent } = makeService(
      row({ lifecycleStatus: 'ACTIVE', status: 'active' }),
    );
    const result = await service.suspend('s-1', 5, 'Non-payment');
    expect(result.lifecycleStatus).toBe('SUSPENDED');
    expect(getCurrent().suspendedReason).toBe('Non-payment');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: 's-1', revokedAt: null }),
        data: expect.objectContaining({ revokedReason: 'admin' }),
      }),
    );
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        topic: ProvisioningOutboxTopics.SCHOOL_SUSPENDED,
        payload: expect.objectContaining({ revokedSessions: 3, reason: 'Non-payment' }),
      }),
    );
  });

  it('refuses SUSPENDED on a TRIAL school', async () => {
    const { service } = makeService(row({ lifecycleStatus: 'TRIAL' }));
    await expect(service.suspend('s-1', 5, 'x')).rejects.toBeInstanceOf(
      InvalidLifecycleTransitionError,
    );
  });
});

describe('SchoolLifecycleService.cancel', () => {
  it('moves any non-CANCELLED state to CANCELLED and revokes sessions', async () => {
    const { service, updateMany, outbox, getCurrent } = makeService(
      row({ lifecycleStatus: 'ACTIVE', status: 'active' }),
    );
    const result = await service.cancel('s-1', 5, 'Customer request');
    expect(result.lifecycleStatus).toBe('CANCELLED');
    expect(getCurrent().cancelledAt).not.toBeNull();
    expect(getCurrent().planStatus).toBe('CANCELLED');
    expect(updateMany).toHaveBeenCalled();
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ topic: ProvisioningOutboxTopics.SCHOOL_CANCELLED }),
    );
  });

  it('refuses re-cancellation', async () => {
    const { service } = makeService(row({ lifecycleStatus: 'CANCELLED' }));
    await expect(service.cancel('s-1', 5, 'x')).rejects.toBeInstanceOf(
      SchoolAlreadyCancelledError,
    );
  });
});

describe('SchoolLifecycleService.expireTrial', () => {
  it('moves TRIAL → EXPIRED idempotently', async () => {
    const { service } = makeService(row({ lifecycleStatus: 'TRIAL' }));
    const result = await service.expireTrial('s-1', {} as never);
    expect(result.lifecycleStatus).toBe('EXPIRED');
  });

  it('is a no-op if the school has already left TRIAL', async () => {
    const { service, schools } = makeService(row({ lifecycleStatus: 'ACTIVE' }));
    const result = await service.expireTrial('s-1', {} as never);
    expect(result.lifecycleStatus).toBe('ACTIVE');
    expect(schools.updateLifecycle).not.toHaveBeenCalled();
  });
});
