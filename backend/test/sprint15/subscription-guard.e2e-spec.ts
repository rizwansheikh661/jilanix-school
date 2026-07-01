/**
 * Sprint 15 e2e — SubscriptionGuardService gate + consume saga.
 *
 * Drives the guard through:
 *   - Initial check on an unset school -> SubscriptionInactiveError.
 *   - Allowed consume below cap -> usage bumps, no threshold event.
 *   - Consume that crosses 80% -> single USAGE_THRESHOLD_REACHED event.
 *   - Consume that exceeds the cap -> USAGE_LIMIT_EXCEEDED +
 *     FeatureLimitExceededError.
 *   - Same-band second consume after the crossing -> NO repeat event.
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

describe('Sprint 15 e2e — SubscriptionGuard gate-and-consume saga', () => {
  it('walks an inactive -> active -> crossing -> over-limit guard path', async () => {
    // Mutable mock state — flipped by individual test steps.
    let subscription: ReturnType<typeof makeSubscriptionRow> | null = null;
    const feature = makePlanFeatureRow({
      id: 'pf-1', featureKey: 'student_count', mode: 'LIMITED', limit: 100,
    });
    const usageRow = makeSchoolUsageRow();
    let thresholdRow = makeThresholdRow();
    type Band = 'THRESHOLD_80' | 'THRESHOLD_90' | 'LIMIT_REACHED';
    const captured: Array<{ topic: string }> = [];

    const subs = {
      findActiveBySchool: jest.fn(async () => subscription),
    };
    const features = {
      findActiveByKey: jest.fn(async () => feature),
    };
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
    const thresholds = {
      tryAdvanceBand: jest.fn(async (
        _schoolId: string,
        _featureKey: string,
        newBand: Band,
      ) => {
        const RANK: Record<Band, number> = { THRESHOLD_80: 80, THRESHOLD_90: 90, LIMIT_REACHED: 100 };
        const curRank = thresholdRow.lastNotifiedThreshold === null
          ? 0
          : RANK[thresholdRow.lastNotifiedThreshold];
        if (RANK[newBand] > curRank) {
          thresholdRow = { ...thresholdRow, lastNotifiedThreshold: newBand };
          return { row: thresholdRow, crossed: true };
        }
        return { row: thresholdRow, crossed: false };
      }),
    };
    const featureFlags = { isEnabled: jest.fn(async () => true) };
    const outbox = {
      publish: jest.fn(async (_tx: unknown, e: { topic: string }) => {
        captured.push({ topic: e.topic });
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

    // Step 1 — no subscription yet.
    await expect(guard.checkPlanStatus('s-1')).rejects.toBeInstanceOf(SubscriptionInactiveError);

    // Step 2 — assign an ACTIVE subscription. Consume 50 of 100 — no events.
    subscription = makeSubscriptionRow({ id: 'sub-1', status: 'ACTIVE' });
    const r1 = await guard.assertAndConsume('s-1', 'student_count', 50);
    expect(r1.newPercent).toBe(50);
    expect(r1.bandCrossed).toBe(false);

    // Step 3 — consume 30 more (used=80) -> crosses THRESHOLD_80.
    const r2 = await guard.assertAndConsume('s-1', 'student_count', 30);
    expect(r2.newPercent).toBe(80);
    expect(r2.bandCrossed).toBe(true);
    expect(captured.map((e) => e.topic)).toContain(
      SubscriptionOutboxTopics.USAGE_THRESHOLD_REACHED,
    );

    // Step 4 — consume 5 more (used=85) -> still THRESHOLD_80, no new event.
    const before = captured.filter((e) => e.topic === SubscriptionOutboxTopics.USAGE_THRESHOLD_REACHED).length;
    const r3 = await guard.assertAndConsume('s-1', 'student_count', 5);
    expect(r3.bandCrossed).toBe(false);
    const after = captured.filter((e) => e.topic === SubscriptionOutboxTopics.USAGE_THRESHOLD_REACHED).length;
    expect(after).toBe(before);

    // Step 5 — consume 20 more (projected=105 > 100) -> throws + USAGE_LIMIT_EXCEEDED.
    await expect(guard.assertAndConsume('s-1', 'student_count', 20)).rejects.toBeInstanceOf(
      FeatureLimitExceededError,
    );
    expect(captured.map((e) => e.topic)).toContain(
      SubscriptionOutboxTopics.USAGE_LIMIT_EXCEEDED,
    );
  });
});
