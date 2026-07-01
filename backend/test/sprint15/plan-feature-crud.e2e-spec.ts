/**
 * Sprint 15 e2e — PlanFeature CRUD + bulkReplace orchestration.
 *
 * Walks the matrix through create -> update -> bulkReplace (with prune) and
 * asserts the outbox + audit footprint at each step.
 */
import { PlanFeatureService } from '../../src/core/subscription/plan-feature/plan-feature.service';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import { makePlanFeatureRow } from './helpers';

describe('Sprint 15 e2e — PlanFeature CRUD + bulkReplace', () => {
  it('walks create -> update -> bulkReplace and records the outbox + audit footprint', async () => {
    const captured: Array<{ topic: string; eventType: string }> = [];
    const outbox = {
      publish: jest.fn(async (_tx: unknown, e: { topic: string; eventType: string }) => {
        captured.push({ topic: e.topic, eventType: e.eventType });
      }),
    };
    const audit = { record: jest.fn(async () => undefined) };
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      client: {},
    };

    // Repo state — a single in-memory map keyed by id.
    const rows = new Map<string, ReturnType<typeof makePlanFeatureRow>>();
    let seq = 0;
    const repo = {
      findById: jest.fn(async (id: string) => rows.get(id) ?? null),
      findActiveByKey: jest.fn(async (planId: string, featureKey: string) => {
        for (const r of rows.values()) {
          if (r.planId === planId && r.featureKey === featureKey && r.deletedAt === null) return r;
        }
        return null;
      }),
      listByPlan: jest.fn(async (planId: string) =>
        [...rows.values()].filter((r) => r.planId === planId && r.deletedAt === null),
      ),
      create: jest.fn(async (input: { planId: string; featureKey: string; featureType: 'LIMIT' | 'TOGGLE'; mode: 'LIMITED' | 'UNLIMITED' | 'DISABLED' | 'ENABLED'; limit?: number | null; sortOrder?: number; description?: string | null }) => {
        seq += 1;
        const row = makePlanFeatureRow({
          id: `pf-${seq.toString()}`,
          planId: input.planId,
          featureKey: input.featureKey,
          featureType: input.featureType,
          mode: input.mode,
          limit: input.limit ?? null,
          sortOrder: input.sortOrder ?? 0,
          description: input.description ?? null,
        });
        rows.set(row.id, row);
        return row;
      }),
      update: jest.fn(async (id: string, ev: number, patch: { mode?: 'LIMITED' | 'UNLIMITED' | 'DISABLED' | 'ENABLED'; limit?: number | null }) => {
        const cur = rows.get(id);
        if (!cur) throw new Error('not found');
        if (cur.version !== ev) throw new Error('version conflict');
        const next = { ...cur, ...patch, version: cur.version + 1 };
        rows.set(id, next);
        return next;
      }),
      softDelete: jest.fn(async (id: string) => {
        const cur = rows.get(id);
        if (!cur) return;
        rows.set(id, { ...cur, deletedAt: new Date() });
      }),
      upsertByKey: jest.fn(async (input: { planId: string; featureKey: string; featureType: 'LIMIT' | 'TOGGLE'; mode: 'LIMITED' | 'UNLIMITED' | 'DISABLED' | 'ENABLED'; limit?: number | null; sortOrder?: number }) => {
        for (const r of rows.values()) {
          if (r.planId === input.planId && r.featureKey === input.featureKey && r.deletedAt === null) {
            const next = { ...r, mode: input.mode, limit: input.limit ?? null, version: r.version + 1 };
            rows.set(r.id, next);
            return next;
          }
        }
        seq += 1;
        const row = makePlanFeatureRow({
          id: `pf-${seq.toString()}`,
          planId: input.planId,
          featureKey: input.featureKey,
          featureType: input.featureType,
          mode: input.mode,
          limit: input.limit ?? null,
          sortOrder: input.sortOrder ?? 0,
        });
        rows.set(row.id, row);
        return row;
      }),
    };

    const service = new PlanFeatureService(
      prisma as never,
      repo as never,
      outbox as never,
      audit as never,
    );

    // Step 1 — create LIMIT.
    const created = await service.create({
      planId: 'plan-growth',
      featureKey: 'student_count',
      featureType: 'LIMIT',
      mode: 'LIMITED',
      limit: 1000,
    });
    expect(created.featureKey).toBe('student_count');
    expect(captured[0]?.topic).toBe(SubscriptionOutboxTopics.PLAN_FEATURE_CHANGED);
    expect(captured[0]?.eventType).toBe('PlanFeatureCreated');

    // Step 2 — update its limit.
    const updated = await service.update(created.id, created.version, { limit: 2500 });
    expect(updated.limit).toBe(2500);
    expect(updated.version).toBe(2);
    expect(captured[1]?.eventType).toBe('PlanFeatureUpdated');

    // Step 3 — bulkReplace: keep student_count (new limit 500), drop nothing
    // (still only one row), add payroll TOGGLE.
    const replaced = await service.bulkReplace('plan-growth', [
      { featureKey: 'student_count', featureType: 'LIMIT', mode: 'LIMITED', limit: 500 },
      { featureKey: 'payroll', featureType: 'TOGGLE', mode: 'ENABLED' },
    ]);
    expect(replaced).toHaveLength(2);
    expect(replaced.find((r) => r.featureKey === 'student_count')?.limit).toBe(500);
    expect(replaced.find((r) => r.featureKey === 'payroll')?.mode).toBe('ENABLED');
    // bulkReplace publishes one PlanFeatureBulkReplaced event.
    expect(captured[captured.length - 1]?.eventType).toBe('PlanFeatureBulkReplaced');

    // Audit: 1 create + 1 update + 1 bulkReplace = 3 records.
    expect(audit.record).toHaveBeenCalledTimes(3);
  });
});
