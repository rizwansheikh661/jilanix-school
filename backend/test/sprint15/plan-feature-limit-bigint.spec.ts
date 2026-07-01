/**
 * Hotfix 15.0.2 — PlanFeature limit BigInt boundary.
 *
 * Asserts:
 *   1. Repository persists a >INT-MAX storage_bytes value as bigint and
 *      returns it back as a JS number safely (100 GiB = 107,374,182,400).
 *   2. Repository preserves null (UNLIMITED) on round-trip and accepts
 *      ordinary INT-sized limits (e.g. student_count = 500) unchanged.
 */
import { PlanFeatureRepository } from '../../src/core/subscription/plan-feature/plan-feature.repository';

interface CapturedCreate {
  data: Record<string, unknown>;
}

function makeRepo() {
  const captured: CapturedCreate[] = [];
  const stored = new Map<string, Record<string, unknown>>();
  const client = {
    planFeature: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        captured.push({ data });
        const row = {
          ...data,
          version: 1,
          createdAt: new Date('2026-06-29T00:00:00Z'),
          updatedAt: new Date('2026-06-29T00:00:00Z'),
          deletedAt: null,
        };
        stored.set(data.id as string, row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        stored.get(where.id) ?? null,
      ),
    },
  };
  const prisma = { client } as never;
  return { repo: new PlanFeatureRepository(prisma), captured, stored };
}

describe('Hotfix 15.0.2 — PlanFeature limit BigInt boundary', () => {
  it('persists a >INT-MAX storage_bytes limit as bigint and reads it back as a JS number', async () => {
    const { repo, captured } = makeRepo();
    const HUNDRED_GIB = 100 * 1024 * 1024 * 1024; // 107,374,182,400 > INT MAX

    const created = await repo.create({
      planId: 'plan-growth',
      featureKey: 'storage_bytes',
      featureType: 'LIMIT',
      mode: 'LIMITED',
      limit: HUNDRED_GIB,
    });

    // Repo MUST send a bigint to Prisma (BigInt column rejects raw numbers).
    expect(typeof captured[0]?.data.limit).toBe('bigint');
    expect(captured[0]?.data.limit).toBe(BigInt(HUNDRED_GIB));

    // Read path narrows bigint -> number for callers (safe; well under 2^53).
    expect(typeof created.limit).toBe('number');
    expect(created.limit).toBe(HUNDRED_GIB);

    const reloaded = await repo.findById(created.id);
    expect(reloaded?.limit).toBe(HUNDRED_GIB);
  });

  it('preserves null for UNLIMITED and forwards small INT-sized limits unchanged', async () => {
    const { repo, captured } = makeRepo();

    const unlimited = await repo.create({
      planId: 'plan-enterprise',
      featureKey: 'storage_bytes',
      featureType: 'LIMIT',
      mode: 'UNLIMITED',
      limit: null,
    });
    expect(captured[0]?.data.limit).toBeNull();
    expect(unlimited.limit).toBeNull();

    const small = await repo.create({
      planId: 'plan-starter',
      featureKey: 'student_count',
      featureType: 'LIMIT',
      mode: 'LIMITED',
      limit: 500,
    });
    expect(captured[1]?.data.limit).toBe(BigInt(500));
    expect(small.limit).toBe(500);
  });
});
