/**
 * Sprint 15 unit — SubscriptionGuardService gate + consume.
 *
 * Asserts:
 *   1. checkPlanStatus throws SubscriptionInactiveError when no active row
 *      exists.
 *   2. assertAndConsume throws FeatureLimitExceededError once the projected
 *      usage exceeds the cap (with ENFORCE_LIMITS on).
 *   3. assertAndConsume crosses the 80% band once: first crossing fires the
 *      threshold outbox event, a second consume at the same band does NOT.
 */
import { SubscriptionGuardService } from '../../src/core/subscription/guard/subscription-guard.service';
import {
  FeatureLimitExceededError,
  SubscriptionInactiveError,
} from '../../src/core/subscription/subscription.errors';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import {
  makePlanFeatureRow,
  makeSchoolUsageRow,
  makeSubscriptionRow,
  makeThresholdRow,
} from './helpers';

interface GuardHarness {
  guard: SubscriptionGuardService;
  outboxTopics: () => string[];
}

function buildGuard(opts: {
  subscription: ReturnType<typeof makeSubscriptionRow> | null;
  feature: ReturnType<typeof makePlanFeatureRow> | null;
  usage: ReturnType<typeof makeSchoolUsageRow>;
  enforce?: boolean;
  notify?: boolean;
}): GuardHarness {
  const captured: Array<{ topic: string }> = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, e: { topic: string }) => {
      captured.push({ topic: e.topic });
    }),
  };
  const subs = {
    findActiveBySchool: jest.fn(async () => opts.subscription),
  };
  const features = {
    findActiveByKey: jest.fn(async () => opts.feature),
  };
  const usageRow = { ...opts.usage };
  const usage = {
    findBySchool: jest.fn(async () => usageRow),
    create: jest.fn(async () => usageRow),
    incrementColumn: jest.fn(async (_s: string, _id: string, col: string, by: number | bigint) => {
      const delta = typeof by === 'bigint' ? Number(by) : by;
      const target = usageRow as unknown as Record<string, number>;
      target[col] = (target[col] ?? 0) + delta;
      return { ...usageRow };
    }),
  };
  const events = { record: jest.fn(async () => undefined) };

  let thresholdRow = makeThresholdRow();
  type Band = 'THRESHOLD_80' | 'THRESHOLD_90' | 'LIMIT_REACHED';
  const thresholds = {
    tryAdvanceBand: jest.fn(async (
      _schoolId: string,
      _featureKey: string,
      newBand: Band,
      _pct: number,
    ) => {
      const rank: Record<Band, number> = { THRESHOLD_80: 80, THRESHOLD_90: 90, LIMIT_REACHED: 100 };
      const curRank = thresholdRow.lastNotifiedThreshold === null
        ? 0
        : rank[thresholdRow.lastNotifiedThreshold];
      if (rank[newBand] > curRank) {
        thresholdRow = { ...thresholdRow, lastNotifiedThreshold: newBand };
        return { row: thresholdRow, crossed: true };
      }
      return { row: thresholdRow, crossed: false };
    }),
  };

  const featureFlags = {
    isEnabled: jest.fn(async (key: string) => {
      if (key.endsWith('enforce_limits')) return opts.enforce ?? true;
      if (key.endsWith('notify_thresholds')) return opts.notify ?? true;
      return true;
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

  return { guard, outboxTopics: () => captured.map((e) => e.topic) };
}

describe('Sprint 15 unit — SubscriptionGuardService', () => {
  it('checkPlanStatus throws SubscriptionInactiveError when no active subscription exists', async () => {
    const h = buildGuard({
      subscription: null,
      feature: null,
      usage: makeSchoolUsageRow(),
    });
    await expect(h.guard.checkPlanStatus('s-1')).rejects.toBeInstanceOf(
      SubscriptionInactiveError,
    );
  });

  it('assertAndConsume throws FeatureLimitExceededError once the projected usage exceeds the cap', async () => {
    const h = buildGuard({
      subscription: makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' }),
      feature: makePlanFeatureRow({ id: 'pf-1', featureKey: 'student_count', mode: 'LIMITED', limit: 100 }),
      usage: makeSchoolUsageRow({ studentCount: 99 }),
    });
    // 99 + 2 = 101 > 100 -> reject.
    await expect(h.guard.assertAndConsume('s-1', 'student_count', 2)).rejects.toBeInstanceOf(
      FeatureLimitExceededError,
    );
    expect(h.outboxTopics()).toContain(SubscriptionOutboxTopics.USAGE_LIMIT_EXCEEDED);
  });

  it('assertAndConsume fires the threshold event exactly once per band crossing', async () => {
    const h = buildGuard({
      subscription: makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' }),
      feature: makePlanFeatureRow({ id: 'pf-1', featureKey: 'student_count', mode: 'LIMITED', limit: 100 }),
      usage: makeSchoolUsageRow({ studentCount: 79 }),
    });
    // 79 + 1 = 80% -> crosses THRESHOLD_80.
    await h.guard.assertAndConsume('s-1', 'student_count', 1);
    // 80 + 1 = 81% -> same band, no second notify.
    await h.guard.assertAndConsume('s-1', 'student_count', 1);
    const reaches = h.outboxTopics().filter(
      (t) => t === SubscriptionOutboxTopics.USAGE_THRESHOLD_REACHED,
    );
    expect(reaches).toHaveLength(1);
  });
});
