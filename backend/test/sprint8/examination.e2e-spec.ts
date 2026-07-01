/**
 * Sprint 8 e2e — Examination foundation full lifecycle.
 *
 * Service-orchestration spec (no Testcontainers, no real DB, no Nest
 * TestingModule). Real services are wired together with stubbed repos.
 *
 * Flow:
 *   1. ExamSchemeService.create()          → outbox: scheme.created
 *   2. ExamDefinitionService.create()      → outbox: exam.created, DRAFT
 *   3. ExamDefinitionService.publish()     → outbox: exam.published
 *   4. ExamScheduleService.bulkCreate()    → outbox: schedule.bulk_created
 *   5. ExamMarksService.bulkUpsert()       → outbox: marks.bulk_updated +
 *                                              history append per entry
 *   6. ExamResultService.compute()         → outbox: result.computed,
 *                                              results persisted via
 *                                              repo.replaceForExam
 *   7. ExamDefinitionService.archive()     → outbox: exam.archived
 *   8. ExamMarksService.upsert() on ARCHIVED → ExamArchivedError
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import {
  ExamArchivedError,
} from '../../src/core/examination/examination.errors';
import { ExamSchemeService } from '../../src/core/examination/exam-scheme/exam-scheme.service';
import { ExamDefinitionService } from '../../src/core/examination/exam-definition/exam-definition.service';
import { ExamScheduleService } from '../../src/core/examination/exam-schedule/exam-schedule.service';
import { ExamMarksService } from '../../src/core/examination/exam-marks/exam-marks.service';
import { ExamResultService } from '../../src/core/examination/exam-result/exam-result.service';
import type {
  ExamMarksRow,
  ExamResultWithSubjects,
  ExamScheduleRow,
  ExamSchemeWithBands,
  ExamWithMaps,
} from '../../src/core/examination/examination.types';
import type { ComputedResultInput } from '../../src/core/examination/exam-result/exam-result.repository';

const SCHOOL = 'sch-e2e8';
const ACADEMIC_YEAR = 'ay-e2e8';
const SCHEME_ID = 'sc-e2e8';
const EXAM_ID = 'ex-e2e8';
const SECTION_ID = 'sec-e2e8';
const SUB_MATH = 'sub-math-e2e8';
const SUB_ENG = 'sub-eng-e2e8';
const CLASS_ID = 'cls-e2e8';

const NOW = new Date('2026-06-20T00:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makeScheme(): ExamSchemeWithBands {
  return {
    id: SCHEME_ID,
    schoolId: SCHOOL,
    name: 'AY26 Default',
    boardType: 'CBSE',
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
      { id: 'b1', schoolId: SCHOOL, examSchemeId: SCHEME_ID, gradeLetter: 'A', gradePoint: 4, minPct: 80, maxPct: 100, ordering: 1, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b2', schoolId: SCHOOL, examSchemeId: SCHEME_ID, gradeLetter: 'B', gradePoint: 3, minPct: 60, maxPct: 79.99, ordering: 2, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b3', schoolId: SCHOOL, examSchemeId: SCHEME_ID, gradeLetter: 'C', gradePoint: 2, minPct: 33, maxPct: 59.99, ordering: 3, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
      { id: 'b4', schoolId: SCHOOL, examSchemeId: SCHEME_ID, gradeLetter: 'F', gradePoint: 0, minPct: 0, maxPct: 32.99, ordering: 4, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null, version: 1 },
    ],
  };
}

function makeExam(overrides: Partial<ExamWithMaps> = {}): ExamWithMaps {
  return {
    id: EXAM_ID,
    schoolId: SCHOOL,
    branchId: null,
    academicYearId: ACADEMIC_YEAR,
    academicTermId: null,
    examSchemeId: SCHEME_ID,
    name: 'Annual',
    type: 'ANNUAL',
    status: 'DRAFT',
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
    classIds: [CLASS_ID],
    sectionIds: [SECTION_ID],
    ...overrides,
  };
}

describe('Sprint 8 e2e — examination foundation full lifecycle', () => {
  it('scheme → exam (DRAFT→PUBLISHED) → schedule bulk → marks bulk → results compute → archive blocks marks', async () => {
    // ----- shared state captured by mock repos -----
    let schemeState: ExamSchemeWithBands = makeScheme();
    let examState: ExamWithMaps = makeExam();
    const scheduleRows: ExamScheduleRow[] = [];
    const marksRows: ExamMarksRow[] = [];
    const persistedResults: ExamResultWithSubjects[] = [];

    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    const featureFlags = {
      isEnabled: jest.fn(async (key: string) =>
        key === 'module.examination' ? true : false,
      ),
    };
    const outbox = { publish: jest.fn(async () => undefined) };
    const audit = {
      record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })),
    };

    // ----- ExamSchemeService -----
    const schemeRepo = {
      list: jest.fn(),
      findById: jest.fn(async () => schemeState),
      findActiveByName: jest.fn(async () => null),
      create: jest.fn(async () => schemeState),
      update: jest.fn(),
      replaceBands: jest.fn(),
      softDelete: jest.fn(),
      findReferencingExam: jest.fn(async () => null),
    };
    const schemeSvc = new ExamSchemeService(
      prisma as never,
      schemeRepo as never,
      featureFlags as never,
      outbox as never,
      audit as never,
    );

    const scheme = await withCtx(() =>
      schemeSvc.create({
        name: schemeState.name,
        passingPct: schemeState.passingPct,
        marksEditWindowDays: schemeState.marksEditWindowDays,
        bands: schemeState.bands.map((b) => ({
          gradeLetter: b.gradeLetter,
          gradePoint: b.gradePoint,
          minPct: b.minPct,
          maxPct: b.maxPct,
          ordering: b.ordering,
        })),
      }),
    );
    expect(scheme.id).toBe(SCHEME_ID);
    expect(scheme.bands).toHaveLength(4);

    // ----- ExamDefinitionService -----
    const examRepo = {
      list: jest.fn(),
      findById: jest.fn(async () => examState),
      findActiveByYearName: jest.fn(async () => null),
      create: jest.fn(async () => examState),
      updateHeader: jest.fn(),
      replaceClassMaps: jest.fn(),
      replaceSectionMaps: jest.fn(),
      setStatus: jest.fn(async (_id, _v, status, ts) => {
        examState = {
          ...examState,
          status,
          publishedAt: ts.publishedAt ?? examState.publishedAt,
          archivedAt: ts.archivedAt ?? examState.archivedAt,
          version: examState.version + 1,
        };
        return examState;
      }),
      softDelete: jest.fn(),
      validateClassIds: jest.fn(async (ids: readonly string[]) => [...ids]),
      validateSectionIds: jest.fn(async (ids: readonly string[]) => [...ids]),
    };
    const examSvc = new ExamDefinitionService(
      prisma as never,
      examRepo as never,
      schemeRepo as never,
      featureFlags as never,
      outbox as never,
      audit as never,
    );

    const exam = await withCtx(() =>
      examSvc.create({
        academicYearId: ACADEMIC_YEAR,
        examSchemeId: SCHEME_ID,
        name: 'Annual',
        type: 'ANNUAL',
        startDate: examState.startDate,
        endDate: examState.endDate,
        classIds: [CLASS_ID],
        sectionIds: [SECTION_ID],
      }),
    );
    expect(exam.status).toBe('DRAFT');

    const published = await withCtx(() => examSvc.publish(EXAM_ID, 1));
    expect(published.status).toBe('PUBLISHED');
    expect(examState.status).toBe('PUBLISHED');

    // ----- ExamScheduleService — bulk create 2 rows -----
    const scheduleRepo = {
      list: jest.fn(async () => scheduleRows),
      findById: jest.fn(),
      findActiveBySlot: jest.fn(
        async (_e: string, subjectId: string, sectionId: string) =>
          scheduleRows.find(
            (r) => r.subjectId === subjectId && r.sectionId === sectionId,
          ) ?? null,
      ),
      create: jest.fn(async (input) => {
        const row: ExamScheduleRow = {
          id: `sch-${scheduleRows.length + 1}`,
          schoolId: SCHOOL,
          examId: EXAM_ID,
          subjectId: input.subjectId,
          sectionId: input.sectionId,
          roomId: input.roomId ?? null,
          invigilatorStaffId: input.invigilatorStaffId ?? null,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          maxMarks: input.maxMarks,
          passMarks: input.passMarks,
          instructions: input.instructions ?? null,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: null,
          updatedBy: null,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        };
        scheduleRows.push(row);
        return row;
      }),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const scheduleSvc = new ExamScheduleService(
      prisma as never,
      scheduleRepo as never,
      examRepo as never,
      featureFlags as never,
      outbox as never,
      audit as never,
    );

    const bulkSchedule = await withCtx(() =>
      scheduleSvc.bulkCreate(EXAM_ID, [
        {
          subjectId: SUB_MATH,
          sectionId: SECTION_ID,
          date: new Date('2026-05-10'),
          startTime: '09:00:00',
          endTime: '12:00:00',
          maxMarks: 100,
          passMarks: 33,
        },
        {
          subjectId: SUB_ENG,
          sectionId: SECTION_ID,
          date: new Date('2026-05-12'),
          startTime: '09:00:00',
          endTime: '12:00:00',
          maxMarks: 100,
          passMarks: 33,
        },
      ]),
    );
    expect(bulkSchedule.created).toHaveLength(2);
    expect(bulkSchedule.failed).toHaveLength(0);

    // ----- ExamMarksService — bulk upsert (math + english) for 2 students -----
    const marksRepo = {
      list: jest.fn(
        async (args: { examId: string; sectionId?: string; subjectId?: string; studentId?: string }) =>
          marksRows.filter(
            (r) =>
              r.examId === args.examId &&
              (args.sectionId === undefined || r.sectionId === args.sectionId) &&
              (args.subjectId === undefined || r.subjectId === args.subjectId) &&
              (args.studentId === undefined || r.studentId === args.studentId),
          ),
      ),
      findById: jest.fn(),
      findActiveBySlot: jest.fn(
        async (_e: string, studentId: string, subjectId: string) =>
          marksRows.find(
            (r) => r.studentId === studentId && r.subjectId === subjectId,
          ) ?? null,
      ),
      create: jest.fn(async (input) => {
        const row: ExamMarksRow = {
          id: `mk-${marksRows.length + 1}`,
          schoolId: SCHOOL,
          examId: input.examId,
          studentId: input.studentId,
          subjectId: input.subjectId,
          sectionId: input.sectionId,
          marksObtained: input.marksObtained,
          isAbsent: input.isAbsent,
          remarks: input.remarks ?? null,
          enteredAt: input.enteredAt,
          enteredBy: input.enteredBy,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: null,
          updatedBy: null,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        };
        marksRows.push(row);
        return row;
      }),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const historyRepo = {
      append: jest.fn(async () => ({ id: 'h', changedAt: NOW })),
      listForMarks: jest.fn(),
    };
    const marksSvc = new ExamMarksService(
      prisma as never,
      marksRepo as never,
      historyRepo as never,
      examRepo as never,
      schemeRepo as never,
      scheduleRepo as never,
      featureFlags as never,
      outbox as never,
      audit as never,
    );

    const mathBulk = await withCtx(() =>
      marksSvc.bulkUpsert(EXAM_ID, {
        sectionId: SECTION_ID,
        subjectId: SUB_MATH,
        version: 0,
        entries: [
          { studentId: 'st-1', marksObtained: 90, isAbsent: false },
          { studentId: 'st-2', marksObtained: 25, isAbsent: false },
        ],
      }),
    );
    expect(mathBulk.entries).toHaveLength(2);
    expect(historyRepo.append).toHaveBeenCalledTimes(2);

    const engBulk = await withCtx(() =>
      marksSvc.bulkUpsert(EXAM_ID, {
        sectionId: SECTION_ID,
        subjectId: SUB_ENG,
        version: 0,
        entries: [
          { studentId: 'st-1', marksObtained: 70, isAbsent: false },
          { studentId: 'st-2', marksObtained: 60, isAbsent: false },
        ],
      }),
    );
    expect(engBulk.entries).toHaveLength(2);
    expect(marksRows).toHaveLength(4);

    // ----- ExamResultService.compute() -----
    const resultRepo = {
      findByStudent: jest.fn(),
      listByExam: jest.fn(),
      replaceForExam: jest.fn(
        async (eid: string, rows: readonly ComputedResultInput[]) => {
          persistedResults.length = 0;
          rows.forEach((r, i) => {
            persistedResults.push({
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
          return persistedResults;
        },
      ),
    };
    const resultSvc = new ExamResultService(
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

    const summary = await withCtx(() => resultSvc.compute(EXAM_ID));
    expect(summary.resultCount).toBe(2);
    expect(summary.passCount).toBe(1); // st-1 passes everything, st-2 fails math (25/100 < 33)
    expect(summary.failCount).toBe(1);

    const st1 = summary.results.find((r) => r.studentId === 'st-1')!;
    expect(st1.isPassed).toBe(true);
    expect(st1.percentage).toBeCloseTo(80, 1); // 160/200 = 80
    expect(st1.gradeLetter).toBe('A'); // exactly on band A's minPct

    const st2 = summary.results.find((r) => r.studentId === 'st-2')!;
    expect(st2.isPassed).toBe(false);

    // ----- archive exam → marks mutations now blocked -----
    const archived = await withCtx(() => examSvc.archive(EXAM_ID, 2));
    expect(archived.status).toBe('ARCHIVED');

    await expect(
      withCtx(() =>
        marksSvc.upsert(EXAM_ID, {
          studentId: 'st-3',
          subjectId: SUB_MATH,
          sectionId: SECTION_ID,
          marksObtained: 50,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamArchivedError);

    // ----- outbox fan-out assertions -----
    type OutboxCall = [unknown, { topic: string }];
    const topics = (outbox.publish.mock.calls as unknown as OutboxCall[]).map((c) => c[1].topic);
    expect(topics).toEqual(
      expect.arrayContaining([
        'examination.scheme.created',
        'examination.exam.created',
        'examination.exam.published',
        'examination.schedule.bulk_created',
        'examination.marks.bulk_updated',
        'examination.result.computed',
        'examination.exam.archived',
      ]),
    );
  });
});
