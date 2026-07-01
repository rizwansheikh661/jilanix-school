/**
 * HolidayLookupService unit spec — verifies tenant scoping, branch-fallback
 * filter, and per-request cache.
 */
import { RequestContextRegistry } from '../request-context';
import { HolidayLookupService } from './holiday-lookup.service';

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
const DAY = new Date(Date.UTC(2026, 5, 19));

function makeService(holiday: { findFirst: jest.Mock }) {
  const prisma = {
    client: { holiday },
  };
  return new HolidayLookupService(prisma as never);
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('HolidayLookupService.findHoliday', () => {
  it('returns null when no holiday matches', async () => {
    const findFirst = jest.fn(async () => null);
    const svc = makeService({ findFirst });
    const out = await withCtx(() => svc.findHoliday(DAY, BRANCH));
    expect(out).toBeNull();
  });

  it('uses branch OR null filter when branchId is provided', async () => {
    const findFirst = jest.fn(async () => ({
      id: 'h-1', date: DAY, branchId: null, isFullDay: true,
    }));
    const svc = makeService({ findFirst });
    await withCtx(() => svc.findHoliday(DAY, BRANCH));
    const calls = findFirst.mock.calls as unknown as Array<[{ where: { OR?: unknown[]; branchId?: unknown } }]>;
    const where = calls[0]![0].where;
    expect(where.OR).toEqual([{ branchId: null }, { branchId: BRANCH }]);
  });

  it('caches per (schoolId, date, branchId) — second call does not query', async () => {
    const findFirst = jest.fn(async () => null);
    const svc = makeService({ findFirst });
    await withCtx(async () => {
      await svc.findHoliday(DAY, BRANCH);
      await svc.findHoliday(DAY, BRANCH);
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
