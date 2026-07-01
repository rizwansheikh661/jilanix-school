/**
 * ExamResultService unit specs — focused on the compute math:
 *   - grade-band lookup (boundary cases incl. exact-edge).
 *   - subject pass/fail using schedule.passMarks or exam.defaultPassMarks.
 *   - overall pass = every-subject-pass AND scheme.passingPct met.
 *   - absent students: subject row written (isPassed=false, percentage=null);
 *     a student with ONLY absent rows is still emitted but cannot pass.
 *   - students with zero marks rows are not emitted.
 *   - idempotent recompute via repo.replaceForExam (soft-delete + create).
 *   - module-flag-disabled refuses compute.
 */
import { RequestContextRegistry } from '../../request-context';
import {
  ExaminationModuleDisabledError,
  ExamNotFoundError,
  ExamSchemeNotFoundError,
} from '../examination.errors';
import type {
  ExamMarksRow,
  ExamResultWithSubjects,
  ExamRow,
  ExamScheduleRow,
  ExamSchemeWithBands,
  ExamWithMaps,
} from '../examination.types';
import { ExamResultService, __test__ } from './exam-result.service';
import type { ComputedResultInput } from './exam-result.repository';

const SCHOOL = 'sch-1';
const EXAM = 'ex-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeExam(overrides: Partial<ExamRow> = {}): ExamWithMaps {
  const base: ExamRow = {
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
  };
  return { ...base, ...overrides, classIds: [], sectionIds: [] };
}

function makeScheme(): ExamSchemeWithBands {
  return {
    id: 'sc-1',
    schoolId: SCHOOL,
    name: 'Default Scheme',
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
    bands: [
      { id: 'b1', schoolId: SCHOOL, examSchemeId: 'sc-1', gradeLetter: 'A', gradePoint: 4, minPct: 80, maxPct: 100, ordering: 1, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b2', schoolId: SCHOOL, examSchemeId: 'sc-1', gradeLetter: 'B', gradePoint: 3, minPct: 60, maxPct: 79.99, ordering: 2, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b3', schoolId: SCHOOL, examSchemeId: 'sc-1', gradeLetter: 'C', gradePoint: 2, minPct: 33, maxPct: 59.99, ordering: 3, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b4', schoolId: SCHOOL, examSchemeId: 'sc-1', gradeLetter: 'F', gradePoint: 0, minPct: 0, maxPct: 32.99, ordering: 4, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
    ],
  };
}

function makeMarks(rows: Array<Partial<ExamMarksRow> & { studentId: string; subjectId: string; sectionId: string }>): readonly ExamMarksRow[] {
  return rows.map((r, i) => ({
    id: `m-${i}`,
    schoolId: SCHOOL,
    examId: EXAM,
    marksObtained: r.marksObtained ?? null,
    isAbsent: r.isAbsent ?? false,
    remarks: null,
    enteredAt: NOW,
    enteredBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...r,
  }));
}

function makeSchedule(rows: Array<Partial<ExamScheduleRow> & { subjectId: string; sectionId: string; maxMarks: number; passMarks: number }>): readonly ExamScheduleRow[] {
  return rows.map((r, i) => ({
    id: `sch-${i}`,
    schoolId: SCHOOL,
    examId: EXAM,
    roomId: null,
    invigilatorStaffId: null,
    date: new Date('2026-05-10'),
    startTime: '09:00:00',
    endTime: '12:00:00',
    instructions: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...r,
  }));
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    findByStudent: jest.fn(),
    listByExam: jest.fn(),
    replaceForExam: jest.fn(),
  };
  const examRepo = { findById: jest.fn() };
  const schemeRepo = { findById: jest.fn() };
  const scheduleRepo = { list: jest.fn() };
  const marksRepo = { list: jest.fn() };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new ExamResultService(
    prisma as never,
    repo as never,
    examRepo as never,
    schemeRepo as never,
    scheduleRepo as never,
    marksRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, examRepo, schemeRepo, scheduleRepo, marksRepo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

function fakePersist(rows: readonly ComputedResultInput[]): readonly ExamResultWithSubjects[] {
  return rows.map((r, i) => ({
    id: `res-${i}`,
    schoolId: SCHOOL,
    examId: EXAM,
    studentId: r.studentId,
    sectionId: r.sectionId,
    totalMarksObtained: r.totalMarksObtained,
    totalMaxMarks: r.totalMaxMarks,
    percentage: r.percentage,
    gradeLetter: r.gradeLetter,
    gradePoint: r.gradePoint,
    status: r.status,
    isPassed: r.isPassed,
    computedAt: r.computedAt,
    computedBy: r.computedBy,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    subjects: r.subjects.map((s, j) => ({
      id: `sub-${i}-${j}`,
      schoolId: SCHOOL,
      examResultId: `res-${i}`,
      subjectId: s.subjectId,
      marksObtained: s.marksObtained,
      maxMarks: s.maxMarks,
      percentage: s.percentage,
      isAbsent: s.isAbsent,
      isPassed: s.isPassed,
      gradeLetter: s.gradeLetter,
      gradePoint: s.gradePoint,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    })),
  }));
}

describe('ExamResultService.compute — grade-band lookup', () => {
  it('maps 90/75/40 (avg ≈68.33) into A/B/C subjects and band B overall', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue(
      makeSchedule([
        { subjectId: 'su-math', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
        { subjectId: 'su-eng', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
        { subjectId: 'su-sci', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
      ]),
    );
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 90 },
        { studentId: 'st-1', subjectId: 'su-eng', sectionId: 'sec-1', marksObtained: 75 },
        { studentId: 'st-1', subjectId: 'su-sci', sectionId: 'sec-1', marksObtained: 40 },
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    const out = await withCtx(() => t.svc.compute(EXAM));

    expect(out.resultCount).toBe(1);
    expect(out.passCount).toBe(1);
    const r = out.results[0]!;
    expect(r.gradeLetter).toBe('B'); // 68.33 in [60, 79.99]
    expect(r.isPassed).toBe(true);
    expect(r.percentage).toBeCloseTo(68.33, 1);
    const math = r.subjects.find((s) => s.subjectId === 'su-math')!;
    const sci = r.subjects.find((s) => s.subjectId === 'su-sci')!;
    expect(math.gradeLetter).toBe('A');
    expect(sci.gradeLetter).toBe('C');
  });

  it('exact-boundary 80.00 lands on band A (minPct inclusive)', () => {
    const scheme = makeScheme();
    const band = __test__.lookupBand(scheme.bands, 80);
    expect(band?.gradeLetter).toBe('A');
  });

  it('exact-boundary 79.99 lands on band B (maxPct inclusive)', () => {
    const scheme = makeScheme();
    const band = __test__.lookupBand(scheme.bands, 79.99);
    expect(band?.gradeLetter).toBe('B');
  });

  it('0% maps to band F', () => {
    const scheme = makeScheme();
    expect(__test__.lookupBand(scheme.bands, 0)?.gradeLetter).toBe('F');
  });
});

describe('ExamResultService.compute — pass/fail', () => {
  it('failing one subject (below schedule.passMarks) sets exam isPassed=false', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue(
      makeSchedule([
        { subjectId: 'su-math', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
        { subjectId: 'su-sci', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
      ]),
    );
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 90 },
        { studentId: 'st-1', subjectId: 'su-sci', sectionId: 'sec-1', marksObtained: 20 }, // <33
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    const out = await withCtx(() => t.svc.compute(EXAM));
    expect(out.failCount).toBe(1);
    expect(out.results[0]!.isPassed).toBe(false);
    const sci = out.results[0]!.subjects.find((s) => s.subjectId === 'su-sci')!;
    expect(sci.isPassed).toBe(false);
  });

  it('uses exam.defaultPassMarks when no schedule row matches', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam({ defaultPassMarks: 50, defaultMaxMarks: 100 }));
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue([]);
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 45 }, // <50 default
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    const out = await withCtx(() => t.svc.compute(EXAM));
    const sub = out.results[0]!.subjects[0]!;
    expect(sub.maxMarks).toBe(100);
    expect(sub.isPassed).toBe(false);
  });

  it('scheme.passingPct overrides per-subject passing — overall fail if pct < passingPct', async () => {
    const t = makeService();
    const scheme = makeScheme();
    (scheme as { passingPct: number }).passingPct = 70; // very high
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(scheme);
    t.scheduleRepo.list.mockResolvedValue(
      makeSchedule([
        { subjectId: 'su-math', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
      ]),
    );
    // 60% — subject pass, but below scheme.passingPct=70
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 60 },
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    const out = await withCtx(() => t.svc.compute(EXAM));
    expect(out.results[0]!.isPassed).toBe(false);
  });
});

describe('ExamResultService.compute — absent handling', () => {
  it('absent subject excludes marks from numerator but counts in denominator and forces overall fail', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue(
      makeSchedule([
        { subjectId: 'su-math', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
        { subjectId: 'su-eng', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
      ]),
    );
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 90 },
        { studentId: 'st-1', subjectId: 'su-eng', sectionId: 'sec-1', isAbsent: true, marksObtained: null },
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    const out = await withCtx(() => t.svc.compute(EXAM));
    const r = out.results[0]!;
    expect(r.totalMarksObtained).toBe(90);
    expect(r.totalMaxMarks).toBe(200);
    expect(r.percentage).toBeCloseTo(45, 1);
    expect(r.isPassed).toBe(false); // forced fail by absent subject
    const eng = r.subjects.find((s) => s.subjectId === 'su-eng')!;
    expect(eng.isAbsent).toBe(true);
    expect(eng.marksObtained).toBeNull();
    expect(eng.percentage).toBeNull();
  });

  it('all-absent student is emitted but isPassed=false', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue(
      makeSchedule([
        { subjectId: 'su-math', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
      ]),
    );
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', isAbsent: true, marksObtained: null },
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    const out = await withCtx(() => t.svc.compute(EXAM));
    expect(out.resultCount).toBe(1);
    expect(out.results[0]!.isPassed).toBe(false);
  });
});

describe('ExamResultService.compute — idempotent recompute', () => {
  it('repo.replaceForExam is called exactly once per compute, with the same shape on a second call', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue(
      makeSchedule([
        { subjectId: 'su-math', sectionId: 'sec-1', maxMarks: 100, passMarks: 33 },
      ]),
    );
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 90 },
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    await withCtx(() => t.svc.compute(EXAM));
    const first = t.repo.replaceForExam.mock.calls[0]![1];
    await withCtx(() => t.svc.compute(EXAM));
    const second = t.repo.replaceForExam.mock.calls[1]![1];

    expect(t.repo.replaceForExam).toHaveBeenCalledTimes(2);
    // Shape stable between runs (ignoring computedAt timestamp).
    expect((first as readonly ComputedResultInput[]).length).toBe((second as readonly ComputedResultInput[]).length);
    expect((first as readonly ComputedResultInput[])[0]!.percentage).toBe(
      (second as readonly ComputedResultInput[])[0]!.percentage,
    );
  });

  it('publishes RESULT_COMPUTED outbox + audit on success', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(makeScheme());
    t.scheduleRepo.list.mockResolvedValue([]);
    t.marksRepo.list.mockResolvedValue(
      makeMarks([
        { studentId: 'st-1', subjectId: 'su-math', sectionId: 'sec-1', marksObtained: 90 },
      ]),
    );
    t.repo.replaceForExam.mockImplementation(async (_eid, rows) => fakePersist(rows));

    await withCtx(() => t.svc.compute(EXAM));
    expect(t.outbox.publish).toHaveBeenCalledTimes(1);
    expect(t.audit.record).toHaveBeenCalledTimes(1);
  });
});

describe('ExamResultService.compute — guards', () => {
  it('throws ExaminationModuleDisabledError when flag is off', async () => {
    const t = makeService();
    t.featureFlags.isEnabled.mockResolvedValue(false);
    await expect(withCtx(() => t.svc.compute(EXAM))).rejects.toBeInstanceOf(
      ExaminationModuleDisabledError,
    );
  });

  it('throws ExamNotFoundError when exam is missing', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(null);
    await expect(withCtx(() => t.svc.compute(EXAM))).rejects.toBeInstanceOf(
      ExamNotFoundError,
    );
  });

  it('throws ExamSchemeNotFoundError when scheme is missing', async () => {
    const t = makeService();
    t.examRepo.findById.mockResolvedValue(makeExam());
    t.schemeRepo.findById.mockResolvedValue(null);
    await expect(withCtx(() => t.svc.compute(EXAM))).rejects.toBeInstanceOf(
      ExamSchemeNotFoundError,
    );
  });
});

describe('ExamResultService.round2', () => {
  it('rounds halves up', () => {
    expect(__test__.round2(33.335)).toBe(33.34);
  });

  it('passes integers through', () => {
    expect(__test__.round2(100)).toBe(100);
  });
});
