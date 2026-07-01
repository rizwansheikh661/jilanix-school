/**
 * Sprint 7 — TimetableViewService derived-grid e2e (service-orchestration spec).
 *
 * Exercises sectionView, teacherView, roomView against a synthetic template
 * with BREAK rows that must be filtered out of the grid. Also covers the
 * version-not-found path.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { TimetableViewService } from '../../src/core/timetable/view/view.service';
import { TimetableVersionNotFoundError } from '../../src/core/timetable/timetable.errors';
import type {
  PeriodTemplatePeriodRow,
  PeriodTemplateWithPeriods,
  TimetableEntryRow,
  TimetableVersionRow,
} from '../../src/core/timetable/timetable.types';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const ACADEMIC_YEAR = 'ay-e2e';
const VERSION_ID = 'ver-1';
const TEMPLATE_ID = 'tpl-1';
const T0 = new Date(Date.UTC(2026, 0, 5));
const EFFECTIVE_FROM = new Date(Date.UTC(2026, 0, 12));

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
    status: 'ACTIVE',
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
    activatedAt: T0,
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 2,
    ...overrides,
  };
}

function makePeriod(overrides: Partial<PeriodTemplatePeriodRow> = {}): PeriodTemplatePeriodRow {
  return {
    id: 'p-x',
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

function makeTemplate(): PeriodTemplateWithPeriods {
  return {
    id: TEMPLATE_ID,
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: ACADEMIC_YEAR,
    name: 'Default',
    description: null,
    days: [1, 2, 3],
    isDefault: true,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    periods: [
      makePeriod({ id: 'p-1', index: 1, label: 'P1', type: 'TEACHING' }),
      makePeriod({ id: 'p-2', index: 2, label: 'BRK', type: 'BREAK', startTime: '08:50:00', endTime: '09:05:00' }),
      makePeriod({ id: 'p-3', index: 3, label: 'P3', type: 'TEACHING', startTime: '09:10:00', endTime: '09:55:00' }),
    ],
  };
}

function makeEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: 'ent-x',
    schoolId: SCHOOL,
    timetableVersionId: VERSION_ID,
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
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

function makeSvc(opts: {
  version?: TimetableVersionRow | null;
  template?: PeriodTemplateWithPeriods | null;
  sectionEntries?: readonly TimetableEntryRow[];
  staffEntries?: readonly TimetableEntryRow[];
  roomEntries?: readonly TimetableEntryRow[];
} = {}) {
  const version = opts.version === undefined ? makeVersion() : opts.version;
  const template = opts.template === undefined ? makeTemplate() : opts.template;

  const versionRepo = {
    findById: jest.fn(async () => version),
    findActive: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
  };
  const templateRepo = {
    findById: jest.fn(async () => template),
    findActiveByName: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    replacePeriods: jest.fn(),
    softDelete: jest.fn(),
    countActiveReferencingVersions: jest.fn(),
    findPeriodByIndex: jest.fn(),
  };
  const entryRepo = {
    findById: jest.fn(),
    findActiveBySectionSlot: jest.fn(),
    findActiveByStaffSlot: jest.fn(),
    findActiveByRoomSlot: jest.fn(),
    findActiveForStaff: jest.fn(async () => opts.staffEntries ?? []),
    findActiveForSection: jest.fn(async () => opts.sectionEntries ?? []),
    findActiveForRoom: jest.fn(async () => opts.roomEntries ?? []),
    findActiveForVersion: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const svc = new TimetableViewService(
    versionRepo as never,
    templateRepo as never,
    entryRepo as never,
  );
  return { svc, version, template, versionRepo, templateRepo, entryRepo };
}

describe('Sprint 7 e2e — timetable derived views', () => {
  it('section/teacher/room views project a TEACHING-only grid with the right occupancy', async () => {
    const sectionEntries: readonly TimetableEntryRow[] = [
      makeEntry({ id: 'e-1', sectionId: 'sec-1', dayOfWeek: 1, periodIndex: 1 }),
      makeEntry({ id: 'e-2', sectionId: 'sec-1', dayOfWeek: 2, periodIndex: 3 }),
    ];
    const staffEntries: readonly TimetableEntryRow[] = [
      makeEntry({ id: 'e-3', staffId: 'stf-1', dayOfWeek: 3, periodIndex: 1 }),
    ];
    const t = makeSvc({ sectionEntries, staffEntries, roomEntries: [] });

    const sectionView = await withCtx(() => t.svc.sectionView(VERSION_ID, 'sec-1'));
    const teacherView = await withCtx(() => t.svc.teacherView(VERSION_ID, 'stf-1'));
    const roomView = await withCtx(() => t.svc.roomView(VERSION_ID, 'rm-1'));

    // Each grid: 3 days × 2 TEACHING periods (BREAK index 2 filtered) = 6 cells.
    expect(sectionView.cells).toHaveLength(6);
    expect(teacherView.cells).toHaveLength(6);
    expect(roomView.cells).toHaveLength(6);

    // BREAK period (index 2) must not appear in any cell.
    for (const view of [sectionView, teacherView, roomView]) {
      expect(view.cells.every((c) => c.periodIndex !== 2)).toBe(true);
    }

    // Section view: 2 occupied, 4 null.
    expect(sectionView.cells.filter((c) => c.entry !== null)).toHaveLength(2);
    expect(sectionView.cells.filter((c) => c.entry === null)).toHaveLength(4);

    // Teacher view: 1 occupied, 5 null.
    expect(teacherView.cells.filter((c) => c.entry !== null)).toHaveLength(1);
    expect(teacherView.cells.filter((c) => c.entry === null)).toHaveLength(5);

    // Room view: 0 occupied (all nulls).
    expect(roomView.cells.every((c) => c.entry === null)).toBe(true);

    // Shared version reference + sorted days [1, 2, 3].
    expect(sectionView.version).toBe(t.version);
    expect(teacherView.version).toBe(t.version);
    expect(roomView.version).toBe(t.version);
    expect(sectionView.days).toEqual([1, 2, 3]);
    expect(teacherView.days).toEqual([1, 2, 3]);
    expect(roomView.days).toEqual([1, 2, 3]);
  });

  it('throws TimetableVersionNotFoundError when the version is missing', async () => {
    const t = makeSvc({ version: null });
    await expect(
      withCtx(() => t.svc.sectionView('missing-ver', 'sec-1')),
    ).rejects.toBeInstanceOf(TimetableVersionNotFoundError);
  });
});
