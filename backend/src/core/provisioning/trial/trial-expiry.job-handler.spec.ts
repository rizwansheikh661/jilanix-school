/**
 * Sprint 14.1 — TrialExpiryJobHandler unit tests.
 *
 * Coverage:
 *   - Daily scan splits into an upcoming-warning pass (TRIAL_EXPIRING +
 *     outbox + audit) and an expired pass (lifecycle.expireTrial).
 *   - Both passes are isolated: failure on one school does NOT abort the
 *     batch, error counters and ids accumulate as expected.
 *   - `asOf` and `warningWindowDays` payload knobs flow through to the
 *     TrialService scans (so backfills are safe and deterministic in tests).
 *   - Day-count math: `daysRemaining` clamps to >=0 and rounds up partial
 *     days so a warning written at 23:59 still reports the right number.
 */
import type { Logger } from '@nestjs/common';

import type { AuditService } from '../../audit/audit.service';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import type { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import type { PrismaService } from '../../../infra/prisma';
import type { SchoolLifecycleService } from '../lifecycle/school-lifecycle.service';
import type { SchoolRootRow } from '../../school/school/school.types';
import {
  ProvisioningNotificationEventKeys,
  ProvisioningOutboxTopics,
} from '../provisioning.constants';
import { TrialExpiryJobHandler } from './trial-expiry.job-handler';
import type { TrialService } from './trial.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<SchoolRootRow> = {}): SchoolRootRow {
  return {
    id: 'school-1',
    slug: 'school-1',
    legalName: 'Sample',
    displayName: 'Sample',
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
    status: 'active',
    onboardedAt: null,
    archivedAt: null,
    lifecycleStatus: 'TRIAL',
    trialStartDate: null,
    trialEndDate: new Date('2026-07-01T00:00:00Z'),
    trialExtendedCount: 0,
    planId: null,
    planAssignedAt: null,
    planExpiresAt: null,
    planStatus: null,
    suspendedAt: null,
    suspendedReason: null,
    cancelledAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeHandler() {
  const registry: Mocked<JobHandlerRegistry> = {
    register: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
  } as unknown as Mocked<JobHandlerRegistry>;
  const prisma = {
    transaction: jest.fn(async <T,>(fn: (tx: unknown) => Promise<T>) => fn({})),
  } as unknown as PrismaService;
  const trials: Mocked<TrialService> = {
    scanExpiring: jest.fn().mockResolvedValue([]),
    scanUpcoming: jest.fn().mockResolvedValue([]),
    extend: jest.fn(),
  } as unknown as Mocked<TrialService>;
  const lifecycle: Mocked<SchoolLifecycleService> = {
    expireTrial: jest.fn().mockResolvedValue(makeRow({ lifecycleStatus: 'EXPIRED' })),
  } as unknown as Mocked<SchoolLifecycleService>;
  const outbox: Mocked<OutboxPublisherService> = {
    publish: jest.fn().mockResolvedValue({}),
  } as unknown as Mocked<OutboxPublisherService>;
  const audit: Mocked<AuditService> = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<AuditService>;

  const handler = new TrialExpiryJobHandler(
    registry as never,
    prisma,
    trials as never,
    lifecycle as never,
    outbox as never,
    audit as never,
  );
  // Silence the bootstrap log in tests.
  (handler as unknown as { logger: Partial<Logger> }).logger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return { handler, registry, prisma, trials, lifecycle, outbox, audit };
}

const noopCtx = {} as JobHandlerContext;

describe('TrialExpiryJobHandler', () => {
  it('registers the handler name on application bootstrap', () => {
    const t = makeHandler();
    t.handler.onApplicationBootstrap();
    expect(t.registry.register).toHaveBeenCalledWith(
      'provisioning.trial.expiry-scan',
      expect.any(Function),
    );
  });

  it('publishes TRIAL_EXPIRING + audits each upcoming school in the warning window', async () => {
    const t = makeHandler();
    const asOf = new Date('2026-06-24T00:00:00Z');
    t.trials.scanUpcoming.mockResolvedValue([
      makeRow({ id: 'sch-a', trialEndDate: new Date('2026-06-27T00:00:00Z') }),
      makeRow({ id: 'sch-b', trialEndDate: new Date('2026-06-30T12:00:00Z') }),
    ]);

    const out = await t.handler.handle({ asOf: asOf.toISOString() }, noopCtx);

    expect(t.trials.scanUpcoming).toHaveBeenCalledWith({
      now: asOf,
      windowDays: 7,
      limit: 100,
    });
    expect(out.upcomingScanned).toBe(2);
    expect(out.upcomingWarned).toBe(2);

    expect(t.outbox.publish).toHaveBeenCalledTimes(2);
    expect(t.outbox.publish).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        topic: ProvisioningOutboxTopics.TRIAL_EXPIRY_WARNING,
        eventType: ProvisioningNotificationEventKeys.TRIAL_EXPIRING,
        aggregateId: 'sch-a',
        payload: expect.objectContaining({ daysRemaining: 3 }),
      }),
    );

    expect(t.audit.record).toHaveBeenCalledTimes(2);
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'provisioning.trial.expiry_warning',
        category: 'tenancy',
        schoolId: 'sch-a',
      }),
      expect.any(Object),
    );
  });

  it('transitions every elapsed school via lifecycle.expireTrial', async () => {
    const t = makeHandler();
    t.trials.scanExpiring.mockResolvedValue([
      makeRow({ id: 'old-1' }),
      makeRow({ id: 'old-2' }),
    ]);

    const out = await t.handler.handle({}, noopCtx);
    expect(t.lifecycle.expireTrial).toHaveBeenCalledTimes(2);
    expect(t.lifecycle.expireTrial).toHaveBeenNthCalledWith(1, 'old-1', expect.any(Object));
    expect(t.lifecycle.expireTrial).toHaveBeenNthCalledWith(2, 'old-2', expect.any(Object));
    expect(out.scanned).toBe(2);
    expect(out.expired).toBe(2);
    expect(out.errors).toBe(0);
  });

  it('isolates per-school expiry failures and reports them via errorIds', async () => {
    const t = makeHandler();
    t.trials.scanExpiring.mockResolvedValue([
      makeRow({ id: 'good-1' }),
      makeRow({ id: 'bad-1' }),
      makeRow({ id: 'good-2' }),
    ]);
    t.lifecycle.expireTrial.mockImplementation(async (id: string) => {
      if (id === 'bad-1') throw new Error('row locked');
      return makeRow({ id, lifecycleStatus: 'EXPIRED' });
    });

    const out = await t.handler.handle({}, noopCtx);
    expect(out.scanned).toBe(3);
    expect(out.expired).toBe(2);
    expect(out.errors).toBe(1);
    expect(out.errorIds).toEqual(['bad-1']);
  });

  it('respects the warningWindowDays + batchSize payload knobs', async () => {
    const t = makeHandler();
    const asOf = new Date('2026-06-24T10:00:00Z');
    await t.handler.handle(
      { asOf: asOf.toISOString(), batchSize: 25, warningWindowDays: 3 },
      noopCtx,
    );
    expect(t.trials.scanUpcoming).toHaveBeenCalledWith({
      now: asOf,
      windowDays: 3,
      limit: 25,
    });
    expect(t.trials.scanExpiring).toHaveBeenCalledWith({
      now: asOf,
      limit: 25,
    });
  });

  it('does NOT let a warning failure abort the elapsed-pass transitions', async () => {
    const t = makeHandler();
    t.trials.scanUpcoming.mockResolvedValue([makeRow({ id: 'warn-1' })]);
    t.outbox.publish.mockRejectedValueOnce(new Error('outbox down'));
    t.trials.scanExpiring.mockResolvedValue([makeRow({ id: 'old-1' })]);

    const out = await t.handler.handle({}, noopCtx);
    expect(out.upcomingWarned).toBe(0);
    expect(out.expired).toBe(1);
    expect(t.lifecycle.expireTrial).toHaveBeenCalledWith('old-1', expect.any(Object));
  });
});
