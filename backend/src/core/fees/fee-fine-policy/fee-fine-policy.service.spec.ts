/**
 * FeeLateFinePolicyService unit specs — validation gates (value/grace),
 * outbox + finance audit, and in-use guard.
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  DiscountValueInvalidError,
  FeesInUseError,
} from '../fees.errors';
import type { FeeLateFinePolicyRow } from '../fees.types';
import { FeeLateFinePolicyService } from './fee-fine-policy.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makePolicy(overrides: Partial<FeeLateFinePolicyRow> = {}): FeeLateFinePolicyRow {
  return {
    id: 'fp-1',
    schoolId: SCHOOL,
    code: 'LATE-FLAT',
    name: 'Flat per day',
    type: 'FLAT_PER_DAY',
    value: 50,
    gracePeriodDays: 5,
    capAmount: null,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn(),
    create: jest.fn(
      async (input: { code: string; name: string; type: string; value: number; gracePeriodDays: number }) =>
        makePolicy({
          id: 'fp-new',
          code: input.code,
          name: input.name,
          type: input.type as never,
          value: input.value,
          gracePeriodDays: input.gracePeriodDays,
        }),
    ),
    update: jest.fn(),
    softDelete: jest.fn(),
    countActiveStructureLineRefs: jest.fn(async () => 0),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new FeeLateFinePolicyService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, userId: 'user-1', actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('FeeLateFinePolicyService.create', () => {
  it('creates FLAT_PER_DAY policy and publishes outbox + finance audit', async () => {
    const t = makeService();
    t.repo.findActiveByCode.mockResolvedValue(null);
    const row = await withCtx(() =>
      t.svc.create({
        code: 'LATE-FLAT',
        name: 'Flat per day',
        type: 'FLAT_PER_DAY',
        value: 50,
        gracePeriodDays: 5,
      }),
    );
    expect(row.value).toBe(50);
    expect(row.gracePeriodDays).toBe(5);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.FINE_POLICY_CREATED,
        eventType: 'FeeLateFinePolicyCreated',
      }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ action: 'fee_fine_policy.create', category: 'finance' }),
    );
  });

  it('rejects PERCENT_PER_DAY value > 100 with DiscountValueInvalidError', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          code: 'LATE-PCT',
          name: 'Pct per day',
          type: 'PERCENT_PER_DAY',
          value: 150,
          gracePeriodDays: 3,
        }),
      ),
    ).rejects.toBeInstanceOf(DiscountValueInvalidError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('rejects gracePeriodDays > 365 with DiscountValueInvalidError', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          code: 'LATE-X',
          name: 'X',
          type: 'FLAT_PER_DAY',
          value: 10,
          gracePeriodDays: 366,
        }),
      ),
    ).rejects.toBeInstanceOf(DiscountValueInvalidError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('FeeLateFinePolicyService.softDelete', () => {
  it('refuses when active structure line refs exist (FeesInUseError)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makePolicy());
    t.repo.countActiveStructureLineRefs.mockResolvedValue(1);
    await expect(withCtx(() => t.svc.softDelete('fp-1', 1))).rejects.toBeInstanceOf(
      FeesInUseError,
    );
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });
});
