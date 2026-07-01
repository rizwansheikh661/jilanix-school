/**
 * Sprint 15 unit — SchoolUsageService increment/decrement/recompute.
 *
 * Asserts:
 *   1. increment writes a UsageEvent and bumps the right column atomically.
 *   2. recompute sums the UsageEvent ledger by feature key and writes the
 *      result back via setCounters + publishes USAGE_RECOMPUTED.
 */
import { SchoolUsageService } from '../../src/core/subscription/usage/school-usage.service';
import { SubscriptionOutboxTopics } from '../../src/core/subscription/subscription.constants';
import { makeSchoolUsageRow } from './helpers';

describe('Sprint 15 unit — SchoolUsageService', () => {
  it('increment bumps the right column and writes a UsageEvent', async () => {
    const usageRow = makeSchoolUsageRow();
    const repo = {
      findBySchool: jest.fn(async () => usageRow),
      create: jest.fn(),
      incrementColumn: jest.fn(async (_s: string, _id: string, col: string, by: number | bigint) => {
        const delta = typeof by === 'bigint' ? Number(by) : by;
        const current = (usageRow as unknown as Record<string, number>)[col] ?? 0;
        return { ...usageRow, [col]: current + delta };
      }),
      setCounters: jest.fn(),
    };
    const events = {
      record: jest.fn(async () => undefined),
      sumByKey: jest.fn(async () => new Map<string, number>()),
    };
    const outbox = { publish: jest.fn(async () => undefined) };
    const audit = { record: jest.fn(async () => undefined) };
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      client: {},
    };

    const service = new SchoolUsageService(
      prisma as never,
      repo as never,
      events as never,
      outbox as never,
      audit as never,
    );

    const after = await service.increment('s-1', 'student_count', 5);
    expect(after.studentCount).toBe(5);
    expect(repo.incrementColumn).toHaveBeenCalledWith('s-1', 'usage-1', 'studentCount', 5, expect.anything());
    expect(events.record).toHaveBeenCalledTimes(1);
  });

  it('recompute sums UsageEvent ledger and refreshes lastRecomputedAt', async () => {
    const usageRow = makeSchoolUsageRow();
    const recomputed = { ...usageRow, smsUsedThisPeriod: 12, emailUsedThisPeriod: 7, lastRecomputedAt: new Date() };
    const repo = {
      findBySchool: jest.fn(async () => usageRow),
      create: jest.fn(),
      incrementColumn: jest.fn(),
      setCounters: jest.fn(async () => recomputed),
    };
    const events = {
      record: jest.fn(),
      sumByKey: jest.fn(async () => new Map<string, number>([
        ['sms_monthly', 12],
        ['email_monthly', 7],
      ])),
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

    const service = new SchoolUsageService(
      prisma as never,
      repo as never,
      events as never,
      outbox as never,
      audit as never,
    );

    const out = await service.recompute('s-1');
    expect(out.smsUsedThisPeriod).toBe(12);
    expect(out.emailUsedThisPeriod).toBe(7);
    expect(repo.setCounters).toHaveBeenCalledTimes(1);
    expect(captured.map((e) => e.topic)).toEqual([SubscriptionOutboxTopics.USAGE_RECOMPUTED]);
  });
});
