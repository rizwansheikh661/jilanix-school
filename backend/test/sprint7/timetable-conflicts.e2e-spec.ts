/**
 * Sprint 7 — Conflict detector + append-only ledger e2e
 * (service-orchestration spec).
 *
 * Drives TimetableConflictDetectorService.scanVersion / .validate with
 * real service code paths and stubbed repositories. Three synthetic
 * entries each fail a distinct gate so the byType breakdown shows
 * SECTION_DOUBLE_BOOKED, PERIOD_OUT_OF_TEMPLATE, NON_WORKING_DAY.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { TimetableConflictDetectorService } from '../../src/core/timetable/entry/conflict-detector.service';
import type {
  PeriodTemplatePeriodRow,
  TimetableEntryRow,
  TimetableVersionRow,
} from '../../src/core/timetable/timetable.types';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const ACADEMIC_YEAR = 'ay-e2e';
const VERSION_ID = 'ver-1';
const TEMPLATE_ID = 'tpl-1';
const T0 = new Date(Date.UTC(2026, 0, 5));
const EFFECTIVE_FROM = new Date(Date.UTC(2026, 0, 5)); // Monday (ISO dow=1)

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makeVersion(overrides: Partial<TimetableVersionRow> = {}): TimetableVersionRow {
  return {
    id: VERSION_ID,
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: ACADEMIC_YEAR,
    periodTemplateId: TEMPLATE_ID,
    name: 'AY26 v1',
    status: 'DRAFT',
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
    activatedAt: null,
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makePeriod(overrides: Partial<PeriodTemplatePeriodRow> = {}): PeriodTemplatePeriodRow {
  return {
    id: 'p-1',
    schoolId: SCHOOL,
    periodTemplateId: TEMPLATE_ID,
    index: 1,
    label: 'P1',
    type: 'TEACHING',
    startTime: '08:00:00',
    endTime: '08:45:00',
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: 'ent-x',
    schoolId: SCHOOL,
    timetableVersionId: VERSION_ID,
    sectionId: 'sec-x',
    subjectId: 'sub-1',
    staffId: 'stf-x',
    roomId: null,
    dayOfWeek: 1,
    periodIndex: 1,
    notes: null,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeDeps(opts: {
  entries?: readonly TimetableEntryRow[];
  findPeriodByIndex?: jest.Mock;
  resolveWorkingDay?: jest.Mock;
  findActiveBySectionSlot?: jest.Mock;
  findActiveByStaffSlot?: jest.Mock;
  findActiveByRoomSlot?: jest.Mock;
}) {
  const tx = {};
  const txClient = tx;
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    client: txClient,
  };

  const versionRepo = {
    findById: jest.fn(async (id: string) => (id === VERSION_ID ? makeVersion() : null)),
    findActive: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
  };

  const templateRepo = {
    findById: jest.fn(),
    findActiveByName: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    replacePeriods: jest.fn(),
    softDelete: jest.fn(),
    countActiveReferencingVersions: jest.fn(),
    findPeriodByIndex:
      opts.findPeriodByIndex ?? jest.fn(async () => makePeriod()),
  };

  const entryRepo = {
    findById: jest.fn(),
    findActiveBySectionSlot:
      opts.findActiveBySectionSlot ?? jest.fn(async () => null),
    findActiveByStaffSlot:
      opts.findActiveByStaffSlot ?? jest.fn(async () => null),
    findActiveByRoomSlot:
      opts.findActiveByRoomSlot ?? jest.fn(async () => null),
    findActiveForStaff: jest.fn(),
    findActiveForSection: jest.fn(),
    findActiveForRoom: jest.fn(),
    findActiveForVersion: jest.fn(async () => opts.entries ?? []),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const conflictRepo = {
    create: jest.fn(async (input) => ({
      id: `c-${Math.random().toString(36).slice(2, 8)}`,
      schoolId: SCHOOL,
      timetableVersionId: VERSION_ID,
      ...input,
      detectedAt: T0,
      detectedBy: null,
    })),
    createMany: jest.fn(),
    list: jest.fn(),
  };

  const workingDay = {
    resolve:
      opts.resolveWorkingDay ??
      jest.fn(async (_args: { branchId: string | null; date: Date }) => ({
        date: _args.date,
        isWorking: true,
        sessionType: 'FULL' as const,
        source: 'default' as const,
      })),
  };

  const availability = {
    isAvailable: jest.fn(async () => true),
  };

  const featureFlags = { isEnabled: jest.fn(async () => true) };

  const svc = new TimetableConflictDetectorService(
    prisma as never,
    versionRepo as never,
    templateRepo as never,
    entryRepo as never,
    conflictRepo as never,
    workingDay as never,
    availability as never,
    featureFlags as never,
  );

  return {
    svc,
    prisma,
    versionRepo,
    templateRepo,
    entryRepo,
    conflictRepo,
    workingDay,
    availability,
    featureFlags,
  };
}

describe('Sprint 7 e2e — timetable conflict detector + ledger', () => {
  it('scanVersion writes ledger rows grouped by conflict type', async () => {
    const e1 = makeEntry({
      id: 'ent-1',
      sectionId: 's-1',
      staffId: 'stf-1',
      dayOfWeek: 1,
      periodIndex: 1,
    });
    const e2 = makeEntry({
      id: 'ent-2',
      sectionId: 's-2',
      staffId: 'stf-2',
      dayOfWeek: 1,
      periodIndex: 2, // unknown period in template → PERIOD_OUT_OF_TEMPLATE
    });
    const e3 = makeEntry({
      id: 'ent-3',
      sectionId: 's-3',
      staffId: 'stf-3',
      dayOfWeek: 3, // workingDay false → NON_WORKING_DAY
      periodIndex: 1,
    });

    // Period 1 is TEACHING; period 2 missing.
    const findPeriodByIndex = jest.fn(async (_tpl: string, idx: number) =>
      idx === 1 ? makePeriod({ index: 1, type: 'TEACHING' }) : null,
    );

    // Working day: ISO dow 3 (Wed) is non-working; all others working.
    const resolveWorkingDay = jest.fn(
      async (args: { branchId: string | null; date: Date }) => {
        const js = args.date.getUTCDay();
        const iso = js === 0 ? 7 : js;
        return {
          date: args.date,
          isWorking: iso !== 3,
          sessionType: 'FULL' as const,
          source: 'default' as const,
        };
      },
    );

    // Section dup only for sec-1 — different existing-entry id triggers conflict.
    const findActiveBySectionSlot = jest.fn(
      async (_vid: string, sectionId: string) =>
        sectionId === 's-1' ? makeEntry({ id: 'other-section-dup', sectionId }) : null,
    );

    const t = makeDeps({
      entries: [e1, e2, e3],
      findPeriodByIndex,
      resolveWorkingDay,
      findActiveBySectionSlot,
    });

    const result = await withCtx(() => t.svc.scanVersion(VERSION_ID));

    expect(result.versionId).toBe(VERSION_ID);
    expect(result.totalEntries).toBe(3);
    expect(result.conflictsCreated).toBeGreaterThanOrEqual(2);
    expect(result.byType.SECTION_DOUBLE_BOOKED).toBe(1);
    expect(result.byType.PERIOD_OUT_OF_TEMPLATE).toBe(1);
    expect(result.byType.NON_WORKING_DAY).toBe(1);

    const distinctTypes = Object.values(result.byType).filter((n) => n > 0).length;
    expect(distinctTypes).toBeGreaterThanOrEqual(2);

    expect(t.conflictRepo.create.mock.calls.length).toBe(result.conflictsCreated);
    for (const call of t.conflictRepo.create.mock.calls) {
      const input = call[0] as { contextJson: Record<string, unknown> };
      expect(input.contextJson).toEqual(
        expect.objectContaining({
          entryId: expect.any(String),
          sectionId: expect.any(String),
          staffId: expect.any(String),
          dayOfWeek: expect.any(Number),
          periodIndex: expect.any(Number),
        }),
      );
    }
  });

  it('validate() resolves on the happy path when every gate is clear', async () => {
    const t = makeDeps({});
    await expect(
      withCtx(() =>
        t.svc.validate({
          timetableVersionId: VERSION_ID,
          sectionId: 'sec-1',
          subjectId: 'sub-1',
          staffId: 'stf-1',
          roomId: null,
          dayOfWeek: 1,
          periodIndex: 1,
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
