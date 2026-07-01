/**
 * Sprint 4.5 — WorkingDayResolutionService precedence spec.
 *
 * Real-MySQL e2e infrastructure (Testcontainers) is not yet wired in this
 * project. Until then, this spec exercises the resolver's four-source
 * precedence (holiday > branch override > school-wide > school_settings
 * fallback) by constructing the service with mocked repositories and a
 * stubbed Prisma client. The contract verified mirrors what a real HTTP
 * test would assert against `GET /working-days/resolve`.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { WorkingDayResolutionService } from '../../src/core/calendar/calendar.service';
import type { HolidayRepository } from '../../src/core/calendar/repositories/holiday.repository';
import type { WorkingDaysConfigurationRepository } from '../../src/core/calendar/repositories/working-days.repository';
import type {
  HolidayRow,
  WorkingDaysConfigurationRow,
} from '../../src/core/calendar/calendar.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
// 2026-08-15 is a Saturday (UTC) — dow=6
const TARGET = new Date(Date.UTC(2026, 7, 15));

function makeHoliday(overrides: Partial<HolidayRow> = {}): HolidayRow {
  return {
    id: 'hol-1',
    schoolId: SCHOOL,
    branchId: null,
    name: 'Independence Day',
    date: TARGET,
    type: 'NATIONAL',
    isFullDay: true,
    halfDaySession: null,
    attendanceTreatment: 'HOLIDAY',
    notes: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeWdc(overrides: Partial<WorkingDaysConfigurationRow> = {}): WorkingDaysConfigurationRow {
  return {
    id: 'wdc-1',
    schoolId: SCHOOL,
    branchId: null,
    dayOfWeek: 6,
    isWorking: true,
    sessionType: 'FULL',
    effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
    effectiveTo: null,
    note: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService(opts: { workingDaysJson?: unknown } = {}) {
  const schoolSettings = {
    findFirst: jest.fn(async () => (opts.workingDaysJson === undefined ? null : { workingDaysJson: opts.workingDaysJson })),
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ schoolSettings })),
  };
  const wdcRepo: Mocked<WorkingDaysConfigurationRepository> = {
    listForBranch: jest.fn(),
    findActive: jest.fn(),
    findOpenForKey: jest.fn(),
    closeOpenRow: jest.fn(),
    create: jest.fn(),
  } as unknown as Mocked<WorkingDaysConfigurationRepository>;
  const holidayRepo: Mocked<HolidayRepository> = {
    findById: jest.fn(),
    listAll: jest.fn(),
    findByDate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<HolidayRepository>;
  const svc = new WorkingDayResolutionService(prisma as never, wdcRepo as never, holidayRepo as never);
  return { svc, prisma, wdcRepo, holidayRepo, schoolSettings };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 4.5 — WorkingDayResolutionService.resolve', () => {
  it('source=holiday — branch-scoped holiday wins over working-day rows', async () => {
    const t = makeService();
    t.holidayRepo.findByDate.mockResolvedValue([makeHoliday({ branchId: BRANCH })]);

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.isWorking).toBe(false);
    expect(out.source).toBe('holiday');
    expect(out.holidayId).toBe('hol-1');
    expect(t.wdcRepo.findActive).not.toHaveBeenCalled();
  });

  it('source=holiday — school-wide holiday matches when no branch-scoped row exists', async () => {
    const t = makeService();
    t.holidayRepo.findByDate.mockResolvedValue([makeHoliday({ branchId: null })]);

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.source).toBe('holiday');
    expect(out.isWorking).toBe(false);
  });

  it('source=branch — branch-override row matches when no holiday exists', async () => {
    const t = makeService();
    t.holidayRepo.findByDate.mockResolvedValue([]);
    t.wdcRepo.findActive.mockImplementation(async (args) => {
      if (args.branchId === BRANCH) return makeWdc({ branchId: BRANCH, isWorking: true, sessionType: 'HALF' });
      return null;
    });

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.source).toBe('branch');
    expect(out.isWorking).toBe(true);
    expect(out.sessionType).toBe('HALF');
  });

  it('source=school — school-wide row matches when branch row is absent', async () => {
    const t = makeService();
    t.holidayRepo.findByDate.mockResolvedValue([]);
    t.wdcRepo.findActive.mockImplementation(async (args) => {
      if (args.branchId === BRANCH) return null;
      if (args.branchId === null) return makeWdc({ branchId: null, isWorking: false });
      return null;
    });

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.source).toBe('school');
    expect(out.isWorking).toBe(false);
  });

  it('source=fallback — school_settings.working_days_json is consulted last', async () => {
    const t = makeService({ workingDaysJson: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false } });
    t.holidayRepo.findByDate.mockResolvedValue([]);
    t.wdcRepo.findActive.mockResolvedValue(null);

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.source).toBe('fallback');
    expect(out.isWorking).toBe(true);
    expect(out.sessionType).toBe('FULL');
  });

  it('source=fallback returns isWorking=false when school_settings has no row', async () => {
    const t = makeService();
    t.holidayRepo.findByDate.mockResolvedValue([]);
    t.wdcRepo.findActive.mockResolvedValue(null);

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.source).toBe('fallback');
    expect(out.isWorking).toBe(false);
  });

  it('holiday with attendanceTreatment=WORKING_DAY does NOT mark as non-working', async () => {
    const t = makeService();
    t.holidayRepo.findByDate.mockResolvedValue([
      makeHoliday({ branchId: BRANCH, attendanceTreatment: 'WORKING_DAY' }),
    ]);
    t.wdcRepo.findActive.mockResolvedValue(makeWdc({ branchId: BRANCH, isWorking: true }));

    const out = await withCtx(() => t.svc.resolve({ branchId: BRANCH, date: TARGET }));

    expect(out.source).toBe('branch');
    expect(out.isWorking).toBe(true);
  });
});
