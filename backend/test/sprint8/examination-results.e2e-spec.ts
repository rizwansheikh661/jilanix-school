/**
 * Sprint 8 e2e — Result compute: idempotency + grade-band lookup + absent handling.
 *
 * Service-orchestration spec. Two sequential `compute()` calls against the
 * same captured marks/schedule fixture must produce identical row shapes
 * (idempotent recompute via repo.replaceForExam — soft-delete + create
 * inside one tx).
 *
 * Also verifies:
 *   - 90/75/40 across 3 subjects → A/B/C subject grades, exam band B,
 *     percentage ≈ 68.33, isPassed=true.
 *   - 1 absent + 1 present subject → totalMaxMarks counts the absent
 *     subject's max, percentage excludes absent marks from numerator,
 *     forces overall fail.
 *   - resultCount is the count of distinct students with at least one
 *     marks row.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { ExamResultService } from '../../src/core/examination/exam-result/exam-result.service';
import type {
  ExamMarksRow,
  ExamResultWithSubjects,
  ExamScheduleRow,
  ExamSchemeWithBands,
  ExamWithMaps,
} from '../../src/core/examination/examination.types';
import type { ComputedResultInput } from '../../src/core/examination/exam-result/exam-result.repository';

const SCHOOL = 'sch-res8';
const EXAM = 'ex-res8';
const SECTION = 'sec-res8';
const SCHEME = 'sc-res8';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makeExam(): ExamWithMaps {
  return {
    id: EXAM,
    schoolId: SCHOOL,
    branchId: null,
    academicYearId: 'ay-res8',
    academicTermId: null,
    examSchemeId: SCHEME,
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
    sectionIds: [SECTION],
  };
}

function makeScheme(): ExamSchemeWithBands {
  return {
    id: SCHEME,
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
    bands: [
      { id: 'b1', schoolId: SCHOOL, examSchemeId: SCHEME, gradeLetter: 'A', gradePoint: 4, minPct: 80, maxPct: 100, ordering: 1, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b2', schoolId: SCHOOL, examSchemeId: SCHEME, gradeLetter: 'B', gradePoint: 3, minPct: 60, maxPct: 79.99, ordering: 2, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b3', schoolId: SCHOOL, examSchemeId: SCHEME, gradeLetter: 'C', gradePoint: 2, minPct: 33, maxPct: 59.99, ordering: 3, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b4', schoolId: SCHOOL, examSchemeId: SCHEME, gradeLetter: 'F', gradePoint: 0, minPct: 0, maxPct: 32.99, ordering: 4, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
    ],
  };
}

function makeSchedule(subjectId: string, idx: number): ExamScheduleRow {
  return {
    id: `sch-${idx}`,
    schoolId: SCHOOL,
    examId: EXAM,
    subjectId,
    sectionId: SECTION,
    roomId: null,
    invigilatorStaffId: null,
    date: new Date('2026-05-10'),
    startTime: '09:00:00',
    endTime: '12:00:00',
    maxMarks: 100,
    passMarks: 33,
    instructions: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  };
}

function makeMarks(
  studentId: string,
  subjectId: string,
  marksObtained: number | null,
  isAbsent = false,
  idx = 0,
): ExamMarksRow {
  return {
    id: `mk-${studentId}-${subjectId}-${idx}`,
    schoolId: SCHOOL,
    examId: EXAM,
    studentId,
    subjectId,
    sectionId: SECTION,
    marksObtained,
    isAbsent,
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
  };
}

function makeService(
  schedules: readonly ExamScheduleRow[],
  marks: readonly ExamMarksRow[],
) {
  const persisted: ExamResultWithSubjects[] = [];
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const examRepo = { findById: jest.fn(async () => makeExam()) };
  const schemeRepo = { findById: jest.fn(async () => makeScheme()) };
  const scheduleRepo = { list: jest.fn(async () => schedules) };
  const marksRepo = { list: jest.fn(async () => marks) };
  const resultRepo = {
    findByStudent: jest.fn(),
    listByExam: jest.fn(),
    replaceForExam: jest.fn(
      async (eid: string, rows: readonly ComputedResultInput[]) => {
        persisted.length = 0;
        rows.forEach((r, i) => {
          persisted.push({
            id: `res-${i}`,
            schoolId: SCHOOL,
            examId: eid,
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
              id: `sr-${i}-${j}`,
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
          });
        });
        return persisted;
      },
    ),
  };
  const featureFlags = {
    isEnabled: jest.fn(async (key: string) => key === 'module.examination'),
  };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })) };

  const svc = new ExamResultService(
    prisma as never,
    resultRepo as never,
    examRepo as never,
    schemeRepo as never,
    scheduleRepo as never,
    marksRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, resultRepo, outbox, audit };
}

describe('Sprint 8 e2e — result compute idempotency + grading', () => {
  it('produces correct grade bands and pass/fail for 90/75/40 across 3 subjects', async () => {
    const subjects = ['sub-math', 'sub-eng', 'sub-sci'];
    const schedules = subjects.map((s, i) => makeSchedule(s, i));
    const marks: readonly ExamMarksRow[] = [
      makeMarks('st-1', 'sub-math', 90, false, 0),
      makeMarks('st-1', 'sub-eng', 75, false, 1),
      makeMarks('st-1', 'sub-sci', 40, false, 2),
    ];
    const { svc } = makeService(schedules, marks);

    const out = await withCtx(() => svc.compute(EXAM));
    expect(out.resultCount).toBe(1);
    expect(out.passCount).toBe(1);
    const r = out.results[0]!;
    expect(r.percentage).toBeCloseTo(68.33, 1);
    expect(r.gradeLetter).toBe('B');
    expect(r.isPassed).toBe(true);
    const math = r.subjects.find((s) => s.subjectId === 'sub-math')!;
    const eng = r.subjects.find((s) => s.subjectId === 'sub-eng')!;
    const sci = r.subjects.find((s) => s.subjectId === 'sub-sci')!;
    expect(math.gradeLetter).toBe('A');
    expect(eng.gradeLetter).toBe('B');
    expect(sci.gradeLetter).toBe('C');
    expect(math.isPassed).toBe(true);
    expect(sci.isPassed).toBe(true);
  });

  it('absent subject excluded from numerator, kept in denominator, forces overall fail', async () => {
    const schedules = [
      makeSchedule('sub-math', 0),
      makeSchedule('sub-eng', 1),
    ];
    const marks: readonly ExamMarksRow[] = [
      makeMarks('st-1', 'sub-math', 90, false, 0),
      makeMarks('st-1', 'sub-eng', null, true, 1),
    ];
    const { svc } = makeService(schedules, marks);

    const out = await withCtx(() => svc.compute(EXAM));
    const r = out.results[0]!;
    expect(r.totalMarksObtained).toBe(90);
    expect(r.totalMaxMarks).toBe(200);
    expect(r.percentage).toBeCloseTo(45, 1);
    expect(r.isPassed).toBe(false);
    const eng = r.subjects.find((s) => s.subjectId === 'sub-eng')!;
    expect(eng.isAbsent).toBe(true);
    expect(eng.marksObtained).toBeNull();
    expect(eng.percentage).toBeNull();
  });

  it('two sequential compute() calls produce identical row shapes (idempotent recompute)', async () => {
    const schedules = [makeSchedule('sub-math', 0)];
    const marks: readonly ExamMarksRow[] = [
      makeMarks('st-1', 'sub-math', 88, false, 0),
      makeMarks('st-2', 'sub-math', 30, false, 1),
    ];
    const { svc, resultRepo, outbox, audit } = makeService(schedules, marks);

    const a = await withCtx(() => svc.compute(EXAM));
    const b = await withCtx(() => svc.compute(EXAM));

    expect(resultRepo.replaceForExam).toHaveBeenCalledTimes(2);
    expect(a.resultCount).toBe(b.resultCount);
    expect(a.passCount).toBe(b.passCount);
    expect(a.failCount).toBe(b.failCount);

    const shapeOf = (out: typeof a) =>
      out.results
        .slice()
        .sort((x, y) => x.studentId.localeCompare(y.studentId))
        .map((r) => ({
          studentId: r.studentId,
          totalMarksObtained: r.totalMarksObtained,
          totalMaxMarks: r.totalMaxMarks,
          percentage: r.percentage,
          gradeLetter: r.gradeLetter,
          isPassed: r.isPassed,
          subjects: r.subjects.map((s) => ({
            subjectId: s.subjectId,
            marksObtained: s.marksObtained,
            isPassed: s.isPassed,
            gradeLetter: s.gradeLetter,
          })),
        }));

    expect(shapeOf(a)).toEqual(shapeOf(b));
    // Outbox + audit emitted once per compute call.
    expect(outbox.publish).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });
});
