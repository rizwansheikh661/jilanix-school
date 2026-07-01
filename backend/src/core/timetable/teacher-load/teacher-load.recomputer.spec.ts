/**
 * TeacherLoadRecomputer unit specs — covers the math:
 * periodsPerWeek, maxConsecutive runs, dailyCounts + subjectMix
 * aggregation, and the outbox publish on recompute.
 */
import type { PrismaTx } from '../../../infra/prisma/types';
import { TeacherLoadRecomputer } from './teacher-load.recomputer';
import type { TimetableEntryRow } from '../timetable.types';

const NOW = new Date(Date.UTC(2026, 0, 5));
const TX = {} as PrismaTx;

function makeEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: 'ent-1',
    schoolId: 'sch-1',
    timetableVersionId: 'ver-1',
    sectionId: 'sec-1',
    subjectId: 'subjA',
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

function makeHarness() {
  const entryRepo = { findActiveForStaff: jest.fn(async () => [] as readonly TimetableEntryRow[]) };
  const loadRepo = { upsert: jest.fn(async () => undefined) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const recomputer = new TeacherLoadRecomputer(
    entryRepo as never,
    loadRepo as never,
    outbox as never,
  );
  return { recomputer, entryRepo, loadRepo, outbox };
}

describe('TeacherLoadRecomputer.recompute', () => {
  it('empty entries → zeroed metrics', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.loadRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        periodsPerWeek: 0,
        maxConsecutive: 0,
        dailyCounts: {},
        subjectMix: {},
      }),
      TX,
    );
  });

  it('single entry → periodsPerWeek=1, maxConsecutive=1', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([makeEntry()]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.loadRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ periodsPerWeek: 1, maxConsecutive: 1 }),
      TX,
    );
  });

  it('three consecutive periods on same day → maxConsecutive=3', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([
      makeEntry({ id: 'a', dayOfWeek: 1, periodIndex: 1 }),
      makeEntry({ id: 'b', dayOfWeek: 1, periodIndex: 2 }),
      makeEntry({ id: 'c', dayOfWeek: 1, periodIndex: 3 }),
    ]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.loadRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ periodsPerWeek: 3, maxConsecutive: 3 }),
      TX,
    );
  });

  it('non-consecutive on same day [1,3,5] → maxConsecutive=1', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([
      makeEntry({ id: 'a', dayOfWeek: 1, periodIndex: 1 }),
      makeEntry({ id: 'b', dayOfWeek: 1, periodIndex: 3 }),
      makeEntry({ id: 'c', dayOfWeek: 1, periodIndex: 5 }),
    ]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.loadRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ maxConsecutive: 1 }),
      TX,
    );
  });

  it('run with gap [1,2,3,5,6] → maxConsecutive=3 (best of two runs)', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([
      makeEntry({ id: 'a', dayOfWeek: 1, periodIndex: 1 }),
      makeEntry({ id: 'b', dayOfWeek: 1, periodIndex: 2 }),
      makeEntry({ id: 'c', dayOfWeek: 1, periodIndex: 3 }),
      makeEntry({ id: 'd', dayOfWeek: 1, periodIndex: 5 }),
      makeEntry({ id: 'e', dayOfWeek: 1, periodIndex: 6 }),
    ]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.loadRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ maxConsecutive: 3 }),
      TX,
    );
  });

  it('dailyCounts + subjectMix aggregate per day and per subject', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([
      makeEntry({ id: 'a', dayOfWeek: 1, periodIndex: 1, subjectId: 'subjA' }),
      makeEntry({ id: 'b', dayOfWeek: 1, periodIndex: 2, subjectId: 'subjA' }),
      makeEntry({ id: 'c', dayOfWeek: 2, periodIndex: 1, subjectId: 'subjB' }),
    ]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.loadRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyCounts: { '1': 2, '2': 1 },
        subjectMix: { subjA: 2, subjB: 1 },
      }),
      TX,
    );
  });

  it('publishes timetable.teacher_load.recomputed with metrics in payload', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveForStaff.mockResolvedValue([
      makeEntry({ id: 'a', dayOfWeek: 1, periodIndex: 1 }),
      makeEntry({ id: 'b', dayOfWeek: 1, periodIndex: 2 }),
    ]);
    await h.recomputer.recompute('ver-1', 'stf-1', TX);
    expect(h.outbox.publish).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        topic: 'timetable.teacher_load.recomputed',
        payload: expect.objectContaining({ periodsPerWeek: 2, maxConsecutive: 2 }),
      }),
    );
  });
});
