/**
 * TimetableViewService unit specs — pivots `TimetableEntry` rows into a
 * day × period grid, filters BREAK periods out of `cells`, sorts days
 * ascending, and binds entries by (dayOfWeek, periodIndex).
 */
import { TimetableViewService } from './view.service';
import { TimetableVersionNotFoundError } from '../timetable.errors';
import type {
  PeriodTemplatePeriodRow,
  PeriodTemplateWithPeriods,
  TimetableEntryRow,
  TimetableVersionRow,
} from '../timetable.types';
import type { PeriodTypeValue } from '../timetable.constants';

const SCHOOL = 'sch-1';
const NOW = new Date(Date.UTC(2026, 0, 5));

function makeVersion(overrides: Partial<TimetableVersionRow> = {}): TimetableVersionRow {
  return {
    id: 'ver-1',
    schoolId: SCHOOL,
    branchId: 'br-1',
    academicYearId: 'ay-1',
    periodTemplateId: 'tpl-1',
    name: 'V1',
    status: 'ACTIVE',
    effectiveFrom: NOW,
    effectiveTo: null,
    activatedAt: NOW,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makePeriod(
  index: number,
  type: PeriodTypeValue,
): PeriodTemplatePeriodRow {
  return {
    id: `pp-${index}`,
    schoolId: SCHOOL,
    periodTemplateId: 'tpl-1',
    index,
    label: `P${index}`,
    type,
    startTime: '09:00:00',
    endTime: '09:45:00',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    version: 1,
  };
}

function makeTemplate(
  periods: readonly PeriodTemplatePeriodRow[],
  days: readonly number[],
): PeriodTemplateWithPeriods {
  return {
    id: 'tpl-1',
    schoolId: SCHOOL,
    branchId: 'br-1',
    academicYearId: 'ay-1',
    name: 'Default',
    description: null,
    days,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    periods,
  };
}

function makeEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: 'ent-1',
    schoolId: SCHOOL,
    timetableVersionId: 'ver-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
    roomId: null,
    dayOfWeek: 1,
    periodIndex: 1,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const versionRepo = { findById: jest.fn() };
  const templateRepo = { findById: jest.fn() };
  const entryRepo = {
    findActiveForSection: jest.fn(async () => [] as readonly TimetableEntryRow[]),
    findActiveForStaff: jest.fn(async () => [] as readonly TimetableEntryRow[]),
    findActiveForRoom: jest.fn(async () => [] as readonly TimetableEntryRow[]),
  };
  const svc = new TimetableViewService(
    versionRepo as never,
    templateRepo as never,
    entryRepo as never,
  );
  return { svc, versionRepo, templateRepo, entryRepo };
}

describe('TimetableViewService.sectionView — not-found', () => {
  it('throws TimetableVersionNotFoundError when version is absent', async () => {
    const t = makeService();
    t.versionRepo.findById.mockResolvedValue(null);
    await expect(t.svc.sectionView('ver-1', 'sec-1')).rejects.toBeInstanceOf(
      TimetableVersionNotFoundError,
    );
  });

  it('throws TimetableVersionNotFoundError when template is absent', async () => {
    const t = makeService();
    t.versionRepo.findById.mockResolvedValue(makeVersion());
    t.templateRepo.findById.mockResolvedValue(null);
    await expect(t.svc.sectionView('ver-1', 'sec-1')).rejects.toBeInstanceOf(
      TimetableVersionNotFoundError,
    );
  });
});

describe('TimetableViewService — pivot semantics', () => {
  it('TEACHING-only filter: BREAK periods excluded from cells', async () => {
    const t = makeService();
    t.versionRepo.findById.mockResolvedValue(makeVersion());
    t.templateRepo.findById.mockResolvedValue(
      makeTemplate(
        [
          makePeriod(1, 'TEACHING'),
          makePeriod(2, 'BREAK'),
          makePeriod(3, 'TEACHING'),
        ],
        [1, 2],
      ),
    );
    const view = await t.svc.sectionView('ver-1', 'sec-1');
    // 2 days × 2 TEACHING periods = 4 cells, not 6
    expect(view.cells.length).toBe(4);
    for (const cell of view.cells) {
      expect([1, 3]).toContain(cell.periodIndex);
    }
  });

  it('days sorted ascending: input [3,1,2] iterates day 1,2,3', async () => {
    const t = makeService();
    t.versionRepo.findById.mockResolvedValue(makeVersion());
    t.templateRepo.findById.mockResolvedValue(
      makeTemplate([makePeriod(1, 'TEACHING')], [3, 1, 2]),
    );
    const view = await t.svc.sectionView('ver-1', 'sec-1');
    expect(view.days).toEqual([1, 2, 3]);
    expect(view.cells.map((c) => c.dayOfWeek)).toEqual([1, 2, 3]);
  });

  it('entry bound to (day=2, period=1); other cells null', async () => {
    const t = makeService();
    t.versionRepo.findById.mockResolvedValue(makeVersion());
    t.templateRepo.findById.mockResolvedValue(
      makeTemplate([makePeriod(1, 'TEACHING')], [1, 2]),
    );
    const entry = makeEntry({ dayOfWeek: 2, periodIndex: 1 });
    t.entryRepo.findActiveForSection.mockResolvedValue([entry]);
    const view = await t.svc.sectionView('ver-1', 'sec-1');
    const bound = view.cells.find((c) => c.dayOfWeek === 2 && c.periodIndex === 1);
    expect(bound?.entry?.id).toBe('ent-1');
    const others = view.cells.filter((c) => !(c.dayOfWeek === 2 && c.periodIndex === 1));
    for (const o of others) expect(o.entry).toBeNull();
  });

  it('version and unfiltered periods flow through to the result', async () => {
    const t = makeService();
    const periods = [makePeriod(1, 'TEACHING'), makePeriod(2, 'BREAK')];
    t.versionRepo.findById.mockResolvedValue(makeVersion());
    t.templateRepo.findById.mockResolvedValue(makeTemplate(periods, [1]));
    const view = await t.svc.sectionView('ver-1', 'sec-1');
    expect(view.version.id).toBe('ver-1');
    expect(view.periods.length).toBe(2);
    expect(view.periods.map((p) => p.type)).toEqual(['TEACHING', 'BREAK']);
  });
});
