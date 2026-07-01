/**
 * Sprint 16 e2e — limit enforcement saga across StudentService.create wiring.
 *
 * Drives the StudentService against an in-memory subscription with
 * student_count limit = 100, calls create 100 times successfully, and
 * confirms the 101st call rolls back the row insert AND publishes a
 * USAGE_LIMIT_EXCEEDED outbox event with FeatureLimitExceededError.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { StudentService } from '../../src/core/student/student/student.service';
import { SubscriptionGuardService } from '../../src/core/subscription/guard/subscription-guard.service';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import { FeatureLimitExceededError } from '../../src/core/subscription/subscription.errors';
import {
  makePlanFeatureRow,
  makeSchoolUsageRow,
  makeSubscriptionRow,
  makeThresholdRow,
} from '../sprint15/helpers';

const sampleCreate = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('2010-01-01'),
  gender: 'FEMALE' as const,
  admissionNo: 'A-001',
  academicYearId: 'year-1',
  classId: 'class-1',
  sectionId: 'section-1',
  admittedOn: new Date('2026-04-01'),
  emergencyContacts: [{ name: 'Mum', phone: '+1 555 0100', relation: 'Mother' as const }],
};

function inTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: 's-1',
    userId: 'u-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function buildWiredGuard(limit: number) {
  const subscription = makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' });
  const feature = makePlanFeatureRow({
    id: 'pf-1',
    featureKey: 'student_count',
    mode: 'LIMITED',
    limit,
  });
  const usageRow = makeSchoolUsageRow();
  const captured: Array<{ topic: string; payload: Record<string, unknown> }> = [];

  const subs = { findActiveBySchool: jest.fn(async () => subscription) };
  const features = { findActiveByKey: jest.fn(async () => feature) };
  const usage = {
    findBySchool: jest.fn(async () => usageRow),
    create: jest.fn(async () => usageRow),
    incrementColumn: jest.fn(
      async (_s: string, _id: string, col: string, by: number | bigint) => {
        const delta = typeof by === 'bigint' ? Number(by) : by;
        const target = usageRow as unknown as Record<string, number>;
        target[col] = (target[col] ?? 0) + delta;
        return { ...usageRow };
      },
    ),
  };
  const events = { record: jest.fn(async () => undefined) };
  let thresholdRow = makeThresholdRow();
  type Band = 'THRESHOLD_80' | 'THRESHOLD_90' | 'LIMIT_REACHED';
  const RANK: Record<Band, number> = {
    THRESHOLD_80: 80,
    THRESHOLD_90: 90,
    LIMIT_REACHED: 100,
  };
  const thresholds = {
    tryAdvanceBand: jest.fn(async (_s: string, _f: string, newBand: Band) => {
      const cur = thresholdRow.lastNotifiedThreshold === null
        ? 0
        : RANK[thresholdRow.lastNotifiedThreshold];
      if (RANK[newBand] > cur) {
        thresholdRow = { ...thresholdRow, lastNotifiedThreshold: newBand };
        return { row: thresholdRow, crossed: true };
      }
      return { row: thresholdRow, crossed: false };
    }),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = {
    publish: jest.fn(async (_tx: unknown, ev: { topic: string; payload: Record<string, unknown> }) => {
      captured.push({ topic: ev.topic, payload: ev.payload });
    }),
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {},
  };

  const guard = new SubscriptionGuardService(
    prisma as never,
    subs as never,
    features as never,
    usage as never,
    events as never,
    thresholds as never,
    featureFlags as never,
    outbox as never,
  );

  return { guard, prisma, captured, usageRow };
}

describe('Sprint 16 e2e — student_count enforcement saga', () => {
  it('rolls back the row insert and publishes USAGE_LIMIT_EXCEEDED on the 101st create', async () => {
    const LIMIT = 100;
    const { guard, prisma, captured, usageRow } = buildWiredGuard(LIMIT);

    let nextId = 1;
    let lastTx: unknown = null;
    const repo = {
      findByAdmissionNo: jest.fn(async () => null),
      findRollClash: jest.fn(async () => null),
      academicYearExists: jest.fn(async () => true),
      classExists: jest.fn(async () => true),
      sectionBelongsToClass: jest.fn(async () => 'ok'),
      create: jest.fn(async (_input: unknown, tx: unknown) => {
        lastTx = tx;
        return { id: `stu-${nextId++}` };
      }),
      findById: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      setStatus: jest.fn(),
      setRollNo: jest.fn(),
      softDelete: jest.fn(),
    };
    const crypto = {
      sealString: jest.fn((s: string) => `sealed:${s}`),
      openString: jest.fn((s: string) => s),
      last4: jest.fn((s: string) => s.slice(-4)),
      mask: jest.fn((s: string) => `XXXX-${s.slice(-4)}`),
    };

    const svc = new StudentService(prisma as never, repo as never, crypto as never, guard);

    for (let i = 0; i < LIMIT; i += 1) {
      await inTenantCtx(() => svc.create(sampleCreate));
    }
    expect(repo.create).toHaveBeenCalledTimes(LIMIT);
    expect(usageRow.studentCount).toBe(LIMIT);

    const overLimit = inTenantCtx(() => svc.create(sampleCreate));
    await expect(overLimit).rejects.toBeInstanceOf(FeatureLimitExceededError);

    expect(repo.create).toHaveBeenCalledTimes(LIMIT + 1);
    expect(lastTx).not.toBeNull();
    expect(usageRow.studentCount).toBe(LIMIT);
    expect(captured.some((e) => e.topic === SubscriptionOutboxTopics.USAGE_LIMIT_EXCEEDED)).toBe(true);
  });
});
