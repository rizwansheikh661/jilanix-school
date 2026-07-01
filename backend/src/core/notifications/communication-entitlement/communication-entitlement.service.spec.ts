/**
 * CommunicationEntitlementService unit specs — singleton lazy-create,
 * idempotent reads, quota engine (channel-disabled, quota-exceeded with
 * outbox), monthly period rollover, super-admin update and reset-usage.
 *
 * Times that flow through `_rollPeriodIfStale` are locked with
 * `jest.setSystemTime` so the assertions are deterministic.
 */
import { RequestContextRegistry } from '../../request-context';
import { NotificationsOutboxTopics } from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationQuotaExceededError,
} from '../notifications.errors';
import type { SchoolCommunicationEntitlementRow } from '../notifications.types';
import {
  CommunicationEntitlementService,
  startOfMonth,
  startOfNextMonth,
} from './communication-entitlement.service';

const SCHOOL = 'school-1';
const FROZEN_NOW = new Date('2026-06-22T12:00:00.000Z');

function makeRow(
  overrides: Partial<SchoolCommunicationEntitlementRow> = {},
): SchoolCommunicationEntitlementRow {
  return {
    id: 'ent-1',
    schoolId: SCHOOL,
    emailEnabled: true,
    smsEnabled: false,
    whatsappEnabled: false,
    inAppEnabled: true,
    emailMonthlyLimit: null,
    smsMonthlyLimit: null,
    whatsappMonthlyLimit: null,
    emailUsedThisPeriod: 0,
    smsUsedThisPeriod: 0,
    whatsappUsedThisPeriod: 0,
    usagePeriodStart: startOfMonth(FROZEN_NOW),
    usagePeriodEnd: startOfNextMonth(FROZEN_NOW),
    isTrial: false,
    trialExpiresAt: null,
    createdAt: FROZEN_NOW,
    updatedAt: FROZEN_NOW,
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as unknown as SchoolCommunicationEntitlementRow;
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {},
  };
  const repo = {
    findBySchool: jest.fn(),
    findByIdForAdmin: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    incrementUsage: jest.fn(),
    resetUsage: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new CommunicationEntitlementService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, featureFlags, outbox, audit };
}

function withTenant<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: 'user-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function withPlatform<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    userId: 'admin-1',
    actorScope: 'global',
  });
  return RequestContextRegistry.run(ctx, fn);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CommunicationEntitlementService.getOrCreateForCurrentSchool', () => {
  it('lazy-creates singleton with email+inApp on, sms+whatsapp off, null limits, zero counters', async () => {
    const t = makeService();
    t.repo.findBySchool.mockResolvedValue(null);
    t.repo.create.mockImplementation(async (_tx: unknown, data: Record<string, unknown>) =>
      makeRow(data),
    );

    const out = await withTenant(() => t.svc.getOrCreateForCurrentSchool());

    expect(out.emailEnabled).toBe(true);
    expect(out.inAppEnabled).toBe(true);
    expect(out.smsEnabled).toBe(false);
    expect(out.whatsappEnabled).toBe(false);
    expect(out.emailMonthlyLimit).toBeNull();
    expect(out.smsMonthlyLimit).toBeNull();
    expect(out.whatsappMonthlyLimit).toBeNull();
    expect(out.emailUsedThisPeriod).toBe(0);
    expect(out.smsUsedThisPeriod).toBe(0);
    expect(out.whatsappUsedThisPeriod).toBe(0);
    expect(out.usagePeriodStart.toISOString()).toBe(
      startOfMonth(FROZEN_NOW).toISOString(),
    );
    expect(out.usagePeriodEnd.toISOString()).toBe(
      startOfNextMonth(FROZEN_NOW).toISOString(),
    );
  });

  it('returns the existing row on second call without creating', async () => {
    const t = makeService();
    const existing = makeRow();
    t.repo.findBySchool.mockResolvedValue(existing);

    const out = await withTenant(() => t.svc.getOrCreateForCurrentSchool());

    expect(out).toBe(existing);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('CommunicationEntitlementService.assertAndIncrement', () => {
  it('increments emailUsedThisPeriod on EMAIL channel', async () => {
    const t = makeService();
    t.repo.findBySchool.mockResolvedValue(makeRow());
    const incremented = makeRow({ emailUsedThisPeriod: 1 });
    t.repo.incrementUsage.mockResolvedValue(incremented);

    const out = await withTenant(() =>
      t.svc.assertAndIncrement({} as never, SCHOOL, 'EMAIL'),
    );

    expect(out.emailUsedThisPeriod).toBe(1);
    const args = (t.repo.incrementUsage.mock.calls as unknown as Array<
      [unknown, string, string, string]
    >)[0]!;
    expect(args[3]).toBe('EMAIL');
  });

  it('throws CommunicationChannelDisabledError when smsEnabled=false', async () => {
    const t = makeService();
    t.repo.findBySchool.mockResolvedValue(makeRow({ smsEnabled: false }));

    let caught: unknown;
    await withTenant(async () => {
      try {
        await t.svc.assertAndIncrement({} as never, SCHOOL, 'SMS');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(CommunicationChannelDisabledError);
    const details = (caught as CommunicationChannelDisabledError).details as {
      reason: string;
      channel: string;
      gate: string;
    };
    expect(details.gate).toBe('ENTITLEMENT_CHANNEL_DISABLED');
    expect(details.channel).toBe('SMS');
    expect(t.repo.incrementUsage).not.toHaveBeenCalled();
  });

  it('throws CommunicationQuotaExceededError and emits comms.quota.exhausted when over limit', async () => {
    const t = makeService();
    t.repo.findBySchool.mockResolvedValue(
      makeRow({ smsEnabled: true, smsMonthlyLimit: 100, smsUsedThisPeriod: 100 }),
    );
    t.repo.incrementUsage.mockResolvedValue(
      makeRow({ smsEnabled: true, smsMonthlyLimit: 100, smsUsedThisPeriod: 101 }),
    );

    let caught: unknown;
    await withTenant(async () => {
      try {
        await t.svc.assertAndIncrement({} as never, SCHOOL, 'SMS');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(CommunicationQuotaExceededError);
    expect(t.outbox.publish).toHaveBeenCalledTimes(1);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.QUOTA_EXHAUSTED,
        eventType: 'CommunicationQuotaExhausted',
      }),
    );
  });

  it('rolls the period when now > usagePeriodEnd: counters reset to 0 and period advances', async () => {
    const t = makeService();
    const stale = makeRow({
      usagePeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      usagePeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
      emailUsedThisPeriod: 42,
      version: 7,
    });
    t.repo.findBySchool.mockResolvedValue(stale);
    const rolled = makeRow({
      version: 8,
      emailUsedThisPeriod: 0,
      smsUsedThisPeriod: 0,
      whatsappUsedThisPeriod: 0,
      usagePeriodStart: startOfMonth(FROZEN_NOW),
      usagePeriodEnd: startOfNextMonth(FROZEN_NOW),
    });
    t.repo.resetUsage.mockResolvedValue(rolled);
    t.repo.incrementUsage.mockResolvedValue(
      makeRow({
        version: 8,
        emailUsedThisPeriod: 1,
        usagePeriodStart: startOfMonth(FROZEN_NOW),
        usagePeriodEnd: startOfNextMonth(FROZEN_NOW),
      }),
    );

    const out = await withTenant(() =>
      t.svc.assertAndIncrement({} as never, SCHOOL, 'EMAIL'),
    );

    expect(t.repo.resetUsage).toHaveBeenCalledTimes(1);
    const resetArgs = (t.repo.resetUsage.mock.calls as unknown as Array<
      [unknown, string, string, number, Date, Date]
    >)[0]!;
    expect(resetArgs[3]).toBe(7); // expectedVersion from stale row
    expect(resetArgs[4].toISOString()).toBe(startOfMonth(FROZEN_NOW).toISOString());
    expect(resetArgs[5].toISOString()).toBe(startOfNextMonth(FROZEN_NOW).toISOString());
    expect(out.emailUsedThisPeriod).toBe(1);
  });
});

describe('CommunicationEntitlementService.update (super-admin)', () => {
  it('flips flags + limits, bumps version, emits comms.entitlement.updated and audits', async () => {
    const t = makeService();
    t.repo.findByIdForAdmin.mockResolvedValue(makeRow({ version: 1 }));
    const updated = makeRow({
      version: 2,
      smsEnabled: true,
      smsMonthlyLimit: 1000,
      whatsappEnabled: true,
      whatsappMonthlyLimit: 500,
    });
    t.repo.update.mockResolvedValue(updated);

    const out = await withPlatform(() =>
      t.svc.update(SCHOOL, 1, {
        smsEnabled: true,
        smsMonthlyLimit: 1000,
        whatsappEnabled: true,
        whatsappMonthlyLimit: 500,
      }),
    );

    expect(out.version).toBe(2);
    expect(out.smsEnabled).toBe(true);
    expect(out.smsMonthlyLimit).toBe(1000);

    const updateArgs = (t.repo.update.mock.calls as unknown as Array<
      [unknown, string, string, number, Record<string, unknown>]
    >)[0]!;
    expect(updateArgs[3]).toBe(1);
    expect(updateArgs[4]).toEqual(
      expect.objectContaining({
        smsEnabled: true,
        smsMonthlyLimit: 1000,
        whatsappEnabled: true,
        whatsappMonthlyLimit: 500,
      }),
    );

    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.ENTITLEMENT_UPDATED,
        eventType: 'CommunicationEntitlementUpdated',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledTimes(1);
  });
});

describe('CommunicationEntitlementService.resetUsage (super-admin)', () => {
  it('zeros counters and rolls period to the current month', async () => {
    const t = makeService();
    t.repo.findByIdForAdmin.mockResolvedValue(
      makeRow({
        version: 5,
        emailUsedThisPeriod: 99,
        smsUsedThisPeriod: 50,
        whatsappUsedThisPeriod: 10,
      }),
    );
    const after = makeRow({
      version: 6,
      emailUsedThisPeriod: 0,
      smsUsedThisPeriod: 0,
      whatsappUsedThisPeriod: 0,
      usagePeriodStart: startOfMonth(FROZEN_NOW),
      usagePeriodEnd: startOfNextMonth(FROZEN_NOW),
    });
    t.repo.resetUsage.mockResolvedValue(after);

    const out = await withPlatform(() => t.svc.resetUsage(SCHOOL, 5));

    expect(out.emailUsedThisPeriod).toBe(0);
    expect(out.smsUsedThisPeriod).toBe(0);
    expect(out.whatsappUsedThisPeriod).toBe(0);
    expect(out.usagePeriodStart.toISOString()).toBe(
      startOfMonth(FROZEN_NOW).toISOString(),
    );

    const resetArgs = (t.repo.resetUsage.mock.calls as unknown as Array<
      [unknown, string, string, number, Date, Date]
    >)[0]!;
    expect(resetArgs[3]).toBe(5);
    expect(resetArgs[4].toISOString()).toBe(startOfMonth(FROZEN_NOW).toISOString());
    expect(resetArgs[5].toISOString()).toBe(startOfNextMonth(FROZEN_NOW).toISOString());

    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.ENTITLEMENT_UPDATED,
        eventType: 'CommunicationEntitlementUsageReset',
      }),
    );
  });
});
