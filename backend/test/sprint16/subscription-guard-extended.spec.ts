/**
 * Sprint 16 unit — SubscriptionGuardService extensions.
 *
 * Asserts:
 *   1. assertMutationAllowed throws SubscriptionInactiveError for EXPIRED /
 *      SUSPENDED / CANCELLED, passes for TRIAL / ACTIVE / EXPIRING.
 *   2. releaseUsage decrements the counter and appends a negative-delta
 *      UsageEvent. Blocks on inactive status.
 *   3. assertAndConsume(..., tx) joins the caller's tx — no wrapping
 *      prisma.transaction call.
 */
import { SubscriptionGuardService } from '../../src/core/subscription/guard/subscription-guard.service';
import { SubscriptionInactiveError } from '../../src/core/subscription/subscription.errors';
import {
  makePlanFeatureRow,
  makeSchoolUsageRow,
  makeSubscriptionRow,
  makeThresholdRow,
} from '../sprint15/helpers';

type Status = 'TRIAL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';

interface BuildOpts {
  subscription: ReturnType<typeof makeSubscriptionRow> | null;
  feature?: ReturnType<typeof makePlanFeatureRow> | null;
  usage?: ReturnType<typeof makeSchoolUsageRow>;
}

function buildHarness(opts: BuildOpts) {
  const usageRow = opts.usage ?? makeSchoolUsageRow();
  const recorded: Array<{ delta: number; featureKey: string }> = [];
  const incrementCalls: Array<{ column: string; by: number | bigint }> = [];
  let txOpened = 0;

  const outbox = { publish: jest.fn(async () => undefined) };
  const subs = { findActiveBySchool: jest.fn(async () => opts.subscription) };
  const features = { findActiveByKey: jest.fn(async () => opts.feature ?? null) };

  const usageMock = {
    findBySchool: jest.fn(async () => usageRow),
    create: jest.fn(async () => usageRow),
    incrementColumn: jest.fn(
      async (
        _s: string,
        _id: string,
        column: string,
        by: number | bigint,
      ) => {
        incrementCalls.push({ column, by });
        const delta = typeof by === 'bigint' ? Number(by) : by;
        const target = usageRow as unknown as Record<string, number>;
        target[column] = (target[column] ?? 0) + delta;
        return { ...usageRow };
      },
    ),
  };
  const events = {
    record: jest.fn(async (input: { delta: number; featureKey: string }) => {
      recorded.push({ delta: input.delta, featureKey: input.featureKey });
    }),
  };

  let thresholdRow = makeThresholdRow();
  const thresholds = {
    tryAdvanceBand: jest.fn(async () => ({ row: thresholdRow, crossed: false })),
  };

  const featureFlags = { isEnabled: jest.fn(async () => true) };

  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      txOpened += 1;
      return fn({});
    }),
    client: {},
  };

  const guard = new SubscriptionGuardService(
    prisma as never,
    subs as never,
    features as never,
    usageMock as never,
    events as never,
    thresholds as never,
    featureFlags as never,
    outbox as never,
  );

  return {
    guard,
    recorded,
    incrementCalls,
    txOpenedAfter: () => txOpened,
    setThresholdRow: (r: typeof thresholdRow) => {
      thresholdRow = r;
    },
  };
}

describe('Sprint 16 unit — SubscriptionGuardService extensions', () => {
  it('assertMutationAllowed passes for usable statuses, throws for inactive statuses', async () => {
    const usable: Status[] = ['TRIAL', 'ACTIVE', 'EXPIRING'];
    const inactive: Status[] = ['EXPIRED', 'SUSPENDED', 'CANCELLED'];

    for (const status of usable) {
      const h = buildHarness({
        subscription: makeSubscriptionRow({ id: 'sub-1', status }),
      });
      await expect(h.guard.assertMutationAllowed('s-1')).resolves.toBeUndefined();
    }

    for (const status of inactive) {
      const h = buildHarness({
        subscription: makeSubscriptionRow({ id: 'sub-1', status }),
      });
      await expect(h.guard.assertMutationAllowed('s-1')).rejects.toBeInstanceOf(
        SubscriptionInactiveError,
      );
    }

    const empty = buildHarness({ subscription: null });
    await expect(empty.guard.assertMutationAllowed('s-1')).rejects.toBeInstanceOf(
      SubscriptionInactiveError,
    );
  });

  it('releaseUsage decrements the counter, appends a negative-delta UsageEvent, and blocks on inactive status', async () => {
    const ok = buildHarness({
      subscription: makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' }),
      feature: makePlanFeatureRow({ id: 'pf-1', featureKey: 'student_count', mode: 'LIMITED', limit: 100 }),
      usage: makeSchoolUsageRow({ studentCount: 5 }),
    });

    await ok.guard.releaseUsage('s-1', 'student_count', 2, 'student:abc');

    expect(ok.incrementCalls).toEqual([{ column: 'studentCount', by: -2 }]);
    expect(ok.recorded).toEqual([{ delta: -2, featureKey: 'student_count' }]);

    const expired = buildHarness({
      subscription: makeSubscriptionRow({ id: 'sub-2', status: 'EXPIRED' }),
      usage: makeSchoolUsageRow({ studentCount: 5 }),
    });
    await expect(
      expired.guard.releaseUsage('s-1', 'student_count', 1, 'student:abc'),
    ).rejects.toBeInstanceOf(SubscriptionInactiveError);
    expect(expired.incrementCalls).toHaveLength(0);
    expect(expired.recorded).toHaveLength(0);
  });

  it('assertAndConsume(..., tx) uses the caller tx without opening a new prisma.transaction', async () => {
    const h = buildHarness({
      subscription: makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' }),
      feature: makePlanFeatureRow({ id: 'pf-1', featureKey: 'student_count', mode: 'LIMITED', limit: 100 }),
      usage: makeSchoolUsageRow({ studentCount: 0 }),
    });

    const callerTx = {} as never;
    await h.guard.assertAndConsume('s-1', 'student_count', 1, null, callerTx);

    expect(h.txOpenedAfter()).toBe(0);
    expect(h.incrementCalls).toEqual([{ column: 'studentCount', by: 1 }]);
  });
});
