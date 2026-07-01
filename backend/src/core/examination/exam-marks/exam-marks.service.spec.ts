/**
 * ExamMarksService unit specs — bounds, absent invariant, edit-window,
 * optimistic-lock, allow_overscore flag bypass, module gate.
 *
 * Persistence is fully mocked; we only assert the service's rule layer.
 */
import { RequestContextRegistry } from '../../request-context';
import {
  BulkLimitExceededError,
  ExamArchivedError,
  ExamMarksAbsentInvariantError,
  ExamMarksEditWindowExpiredError,
  ExamMarksOutOfRangeError,
  ExamMarksVersionConflictError,
  ExamNotFoundError,
  ExaminationModuleDisabledError,
} from '../examination.errors';
import type { ExamMarksRow, ExamSchemeWithBands, ExamWithMaps } from '../examination.types';
import { ExamMarksService } from './exam-marks.service';

const SCHOOL = 'sch-1';
const EXAM = 'ex-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeExam(overrides: Partial<ExamWithMaps> = {}): ExamWithMaps {
  return {
    id: EXAM,
    schoolId: SCHOOL,
    branchId: null,
    academicYearId: 'ay-1',
    academicTermId: null,
    examSchemeId: 'sc-1',
    name: 'Annual',
    type: 'ANNUAL',
    status: 'PUBLISHED',
    startDate: new Date('2026-05-01'),
    endDate: new Date('2026-05-30'),
    defaultMaxMarks: 100,
    defaultPassMarks: 33,
    description: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    classIds: [],
    sectionIds: [],
    ...overrides,
  };
}

function makeScheme(): ExamSchemeWithBands {
  return {
    id: 'sc-1',
    schoolId: SCHOOL,
    name: 'Default',
    boardType: null,
    passingPct: 33,
    marksEditWindowDays: 14,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    bands: [],
  };
}

function makeMarksRow(overrides: Partial<ExamMarksRow> = {}): ExamMarksRow {
  return {
    id: 'mk-1',
    schoolId: SCHOOL,
    examId: EXAM,
    studentId: 'st-1',
    subjectId: 'su-math',
    sectionId: 'sec-1',
    marksObtained: 80,
    isAbsent: false,
    remarks: null,
    enteredAt: new Date('2026-06-19T00:00:00.000Z'), // 1 day ago — inside 14d window
    enteredBy: null,
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
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveBySlot: jest.fn(),
    create: jest.fn(async (input: { marksObtained: number | null }) => makeMarksRow({ marksObtained: input.marksObtained })),
    update: jest.fn(async (id: string, _v: number, input: { marksObtained?: number | null }) =>
      makeMarksRow({ id, marksObtained: input.marksObtained ?? null, version: 2 }),
    ),
    softDelete: jest.fn(),
  };
  const historyRepo = { append: jest.fn() };
  const examRepo = { findById: jest.fn() };
  const schemeRepo = { findById: jest.fn(async () => makeScheme()) };
  const scheduleRepo = { findActiveBySlot: jest.fn(async () => null) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new ExamMarksService(
    prisma as never,
    repo as never,
    historyRepo as never,
    examRepo as never,
    schemeRepo as never,
    scheduleRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, historyRepo, examRepo, schemeRepo, scheduleRepo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('ExamMarksService.upsert — invariants', () => {
  it('rejects isAbsent=true with non-null marks', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 50,
          isAbsent: true,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksAbsentInvariantError);
  });

  it('rejects negative marks', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.repo.findActiveBySlot.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: -1,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksOutOfRangeError);
  });

  it('rejects marks above maxMarks when allow_overscore is off', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam({ defaultMaxMarks: 100 }));
    t.repo.findActiveBySlot.mockResolvedValue(null);
    t.featureFlags.isEnabled.mockImplementation((async (key: string) =>
      key === 'module.examination' ? true : false) as never);
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 101,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksOutOfRangeError);
  });

  it('allow_overscore flag permits marks above maxMarks', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam({ defaultMaxMarks: 100 }));
    t.repo.findActiveBySlot.mockResolvedValue(null);
    t.featureFlags.isEnabled.mockResolvedValue(true);
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 105,
          isAbsent: false,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('refuses on ARCHIVED exam', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam({ status: 'ARCHIVED' }));
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 80,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamArchivedError);
  });

  it('throws ExamNotFoundError when exam missing', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 80,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamNotFoundError);
  });

  it('module-disabled flag blocks upsert', async () => {
    const t = makeService();
    t.featureFlags.isEnabled.mockResolvedValue(false);
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 80,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExaminationModuleDisabledError);
  });

  it('appends history with changeType=ENTERED on create', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.repo.findActiveBySlot.mockResolvedValue(null);
    await withCtx(() =>
      t.svc.upsert(EXAM, {
        studentId: 'st-1',
        subjectId: 'su-math',
        sectionId: 'sec-1',
        marksObtained: 80,
        isAbsent: false,
      }),
    );
    expect(t.historyRepo.append).toHaveBeenCalledTimes(1);
    expect(t.historyRepo.append.mock.calls[0]![0].changeType).toBe('ENTERED');
  });

  it('refuses edits past the scheme.marksEditWindowDays', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.repo.findActiveBySlot.mockResolvedValue(
      makeMarksRow({ enteredAt: new Date('2025-01-01T00:00:00.000Z') }),
    );
    await expect(
      withCtx(() =>
        t.svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: 'su-math',
          sectionId: 'sec-1',
          marksObtained: 85,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksEditWindowExpiredError);
  });
});

describe('ExamMarksService.bulkUpsert — optimistic lock & cap', () => {
  it('rejects when entries exceed cap', async () => {
    const t = makeService();
    const entries = Array.from({ length: 501 }, (_v, i) => ({
      studentId: `st-${i}`,
      marksObtained: 50,
      isAbsent: false,
    }));
    await expect(
      withCtx(() =>
        t.svc.bulkUpsert(EXAM, {
          sectionId: 'sec-1',
          subjectId: 'su-math',
          version: 0,
          entries,
        }),
      ),
    ).rejects.toBeInstanceOf(BulkLimitExceededError);
  });

  it('throws VersionConflict when body.version != max(existing.version)', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.repo.list.mockResolvedValue([makeMarksRow({ version: 5 })]);
    await expect(
      withCtx(() =>
        t.svc.bulkUpsert(EXAM, {
          sectionId: 'sec-1',
          subjectId: 'su-math',
          version: 2, // stale
          entries: [{ studentId: 'st-1', marksObtained: 60, isAbsent: false }],
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksVersionConflictError);
  });

  it('accepts when body.version matches max(existing.version)', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.repo.list.mockResolvedValue([makeMarksRow({ version: 3 })]);
    await expect(
      withCtx(() =>
        t.svc.bulkUpsert(EXAM, {
          sectionId: 'sec-1',
          subjectId: 'su-math',
          version: 3,
          entries: [{ studentId: 'st-1', marksObtained: 70, isAbsent: false }],
        }),
      ),
    ).resolves.toBeDefined();
  });
});
