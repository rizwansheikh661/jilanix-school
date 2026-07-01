/**
 * Sprint 15 unit — PlanFeatureService CRUD orchestration.
 *
 * Asserts:
 *   1. create rejects mode/type mismatches (PlanFeatureInvalidModeError) and
 *      refuses duplicate (planId, featureKey) tuples.
 *   2. bulkReplace upserts each incoming key and soft-deletes keys not
 *      present in the new set.
 */
import { PlanFeatureService } from '../../src/core/subscription/plan-feature/plan-feature.service';
import {
  PlanFeatureDuplicateError,
  PlanFeatureInvalidModeError,
} from '../../src/core/subscription/subscription.errors';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import { buildPlanFeatureService, makePlanFeatureRow } from './helpers';

describe('Sprint 15 unit — PlanFeatureService', () => {
  it('create rejects invalid mode/type pairings and duplicates', async () => {
    const h = buildPlanFeatureService();
    // LIMIT feature with TOGGLE-only mode "ENABLED" -> invalid.
    await expect(
      h.service.create({
        planId: 'plan-growth',
        featureKey: 'student_count',
        featureType: 'LIMIT',
        mode: 'ENABLED',
      }),
    ).rejects.toBeInstanceOf(PlanFeatureInvalidModeError);

    // Now seed an existing row so the next create raises a duplicate.
    const h2 = buildPlanFeatureService({
      existing: makePlanFeatureRow({ id: 'pf-1', featureKey: 'student_count' }),
    });
    await expect(
      h2.service.create({
        planId: 'plan-growth',
        featureKey: 'student_count',
        featureType: 'LIMIT',
        mode: 'LIMITED',
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(PlanFeatureDuplicateError);
  });

  it('bulkReplace upserts incoming keys, prunes missing ones, and emits PLAN_FEATURE_CHANGED', async () => {
    // Pre-existing matrix has student_count + parent_portal. New set drops
    // parent_portal and changes student_count's limit, adds payroll.
    const existing = [
      makePlanFeatureRow({
        id: 'pf-a', featureKey: 'student_count', featureType: 'LIMIT', mode: 'LIMITED', limit: 200,
      }),
      makePlanFeatureRow({
        id: 'pf-b', featureKey: 'parent_portal', featureType: 'TOGGLE', mode: 'ENABLED', limit: null,
      }),
    ];
    const upserted: ReturnType<typeof makePlanFeatureRow>[] = [];
    const softDeleted: string[] = [];

    const repo = {
      listByPlan: jest.fn(async () => existing),
      upsertByKey: jest.fn(async (input: { featureKey: string; featureType: 'LIMIT' | 'TOGGLE'; mode: 'LIMITED' | 'UNLIMITED' | 'DISABLED' | 'ENABLED'; limit?: number | null; sortOrder?: number }) => {
        const row = makePlanFeatureRow({
          id: `pf-${input.featureKey}`,
          featureKey: input.featureKey,
          featureType: input.featureType,
          mode: input.mode,
          limit: input.limit ?? null,
          sortOrder: input.sortOrder ?? 0,
        });
        upserted.push(row);
        return row;
      }),
      softDelete: jest.fn(async (id: string) => {
        softDeleted.push(id);
      }),
    };
    const captured: Array<{ topic: string }> = [];
    const outbox = {
      publish: jest.fn(async (_tx: unknown, e: { topic: string }) => {
        captured.push({ topic: e.topic });
      }),
    };
    const audit = { record: jest.fn(async () => undefined) };
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      client: {},
    };

    const service = new PlanFeatureService(
      prisma as never,
      repo as never,
      outbox as never,
      audit as never,
    );

    const result = await service.bulkReplace('plan-growth', [
      { featureKey: 'student_count', featureType: 'LIMIT', mode: 'LIMITED', limit: 500 },
      { featureKey: 'payroll', featureType: 'TOGGLE', mode: 'ENABLED' },
    ]);

    expect(result).toHaveLength(2);
    expect(upserted.map((r) => r.featureKey).sort()).toEqual(['payroll', 'student_count']);
    expect(softDeleted).toEqual(['pf-b']); // parent_portal pruned.
    expect(captured.map((e) => e.topic)).toEqual([
      SubscriptionOutboxTopics.PLAN_FEATURE_CHANGED,
    ]);
  });
});
