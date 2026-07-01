/**
 * Sprint 8 e2e — Marks edit lifecycle.
 *
 * Service-orchestration spec (no Testcontainers, no real DB). Real
 * ExamMarksService is wired with stubbed repos + outbox + audit + flags.
 *
 * Flow:
 *   1. upsert() new marks row → history appended with ENTERED.
 *   2. upsert() same (student, subject) again → row replaced with EDITED
 *      history entry, version bumped.
 *   3. upsert() against a row whose `enteredAt` is older than the
 *      scheme.marksEditWindowDays → ExamMarksEditWindowExpiredError.
 *   4. bulkUpsert() with body.version stale vs max(existing.version) →
 *      ExamMarksVersionConflictError.
 *   5. bulkUpsert() with body.version matching max → success, second
 *      history entry per row.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import {
  ExamMarksEditWindowExpiredError,
  ExamMarksVersionConflictError,
} from '../../src/core/examination/examination.errors';
import { ExamMarksService } from '../../src/core/examination/exam-marks/exam-marks.service';
import type {
  ExamMarksRow,
  ExamSchemeWithBands,
  ExamWithMaps,
} from '../../src/core/examination/examination.types';

const SCHOOL = 'sch-edit8';
const EXAM = 'ex-edit8';
const SECTION = 'sec-edit8';
const SUBJECT = 'sub-edit8';
const SCHEME = 'sc-edit8';
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
    academicYearId: 'ay-edit8',
    academicTermId: null,
    examSchemeId: SCHEME,
    name: 'Half-Yearly',
    type: 'HALF_YEARLY',
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

function makeScheme(windowDays = 14): ExamSchemeWithBands {
  return {
    id: SCHEME,
    schoolId: SCHOOL,
    name: 'Default',
    boardType: null,
    passingPct: 33,
    marksEditWindowDays: windowDays,
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

describe('Sprint 8 e2e — marks edit lifecycle', () => {
  it('enter → in-window edit appends history → out-of-window refused → bulk version conflict → bulk version match succeeds', async () => {
    const rows: ExamMarksRow[] = [];
    const history: Array<{
      examMarksId: string;
      changeType: string;
      previousMarks: number | null;
      newMarks: number | null;
    }> = [];

    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    const featureFlags = {
      isEnabled: jest.fn(async (key: string) => key === 'module.examination'),
    };
    const outbox = { publish: jest.fn(async () => undefined) };
    const audit = {
      record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })),
    };

    const marksRepo = {
      list: jest.fn(
        async (args: { examId: string; sectionId?: string; subjectId?: string }) =>
          rows.filter(
            (r) =>
              r.examId === args.examId &&
              (args.sectionId === undefined || r.sectionId === args.sectionId) &&
              (args.subjectId === undefined || r.subjectId === args.subjectId),
          ),
      ),
      findById: jest.fn(),
      findActiveBySlot: jest.fn(
        async (_e: string, studentId: string, subjectId: string) =>
          rows.find(
            (r) => r.studentId === studentId && r.subjectId === subjectId,
          ) ?? null,
      ),
      create: jest.fn(async (input) => {
        const row: ExamMarksRow = {
          id: `mk-${rows.length + 1}`,
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
        rows.push(row);
        return row;
      }),
      update: jest.fn(
        async (id: string, expected: number, input: { marksObtained?: number | null; isAbsent?: boolean }) => {
          const idx = rows.findIndex((r) => r.id === id);
          if (idx < 0) throw new Error('not found');
          const cur = rows[idx]!;
          if (cur.version !== expected) throw new Error('version conflict');
          const next: ExamMarksRow = {
            ...cur,
            marksObtained:
              input.marksObtained === undefined
                ? cur.marksObtained
                : input.marksObtained,
            isAbsent: input.isAbsent ?? cur.isAbsent,
            version: cur.version + 1,
          };
          rows[idx] = next;
          return next;
        },
      ),
      softDelete: jest.fn(),
    };
    const historyRepo = {
      append: jest.fn(async (input) => {
        history.push({
          examMarksId: input.examMarksId,
          changeType: input.changeType,
          previousMarks: input.previousMarks,
          newMarks: input.newMarks,
        });
        return { id: `h-${history.length}`, changedAt: NOW };
      }),
      listForMarks: jest.fn(),
    };
    const examRepo = { findById: jest.fn(async () => makeExam()) };
    const schemeRepo = { findById: jest.fn(async () => makeScheme(14)) };
    const scheduleRepo = { findActiveBySlot: jest.fn(async () => null) };

    const svc = new ExamMarksService(
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

    // 1. Initial entry.
    const created = await withCtx(() =>
      svc.upsert(EXAM, {
        studentId: 'st-1',
        subjectId: SUBJECT,
        sectionId: SECTION,
        marksObtained: 50,
        isAbsent: false,
      }),
    );
    expect(created.marksObtained).toBe(50);
    expect(rows).toHaveLength(1);
    expect(history.at(-1)?.changeType).toBe('ENTERED');

    // 2. In-window edit.
    const edited = await withCtx(() =>
      svc.upsert(EXAM, {
        studentId: 'st-1',
        subjectId: SUBJECT,
        sectionId: SECTION,
        marksObtained: 75,
        isAbsent: false,
      }),
    );
    expect(edited.marksObtained).toBe(75);
    expect(edited.version).toBe(2);
    const lastEdit = history.at(-1)!;
    expect(lastEdit.changeType).toBe('EDITED');
    expect(lastEdit.previousMarks).toBe(50);
    expect(lastEdit.newMarks).toBe(75);

    // 3. Out-of-window edit — backdate the row's enteredAt then attempt.
    rows[0] = { ...rows[0]!, enteredAt: new Date('2025-01-01T00:00:00.000Z') };
    await expect(
      withCtx(() =>
        svc.upsert(EXAM, {
          studentId: 'st-1',
          subjectId: SUBJECT,
          sectionId: SECTION,
          marksObtained: 80,
          isAbsent: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksEditWindowExpiredError);
    // No new history written by the rejected attempt.
    expect(history.at(-1)?.changeType).toBe('EDITED');

    // Restore enteredAt so bulk path can edit (still within window).
    rows[0] = { ...rows[0]!, enteredAt: NOW };

    // 4. Bulk PUT with stale version (current max is 2, body says 0).
    await expect(
      withCtx(() =>
        svc.bulkUpsert(EXAM, {
          sectionId: SECTION,
          subjectId: SUBJECT,
          version: 0,
          entries: [
            { studentId: 'st-1', marksObtained: 90, isAbsent: false },
            { studentId: 'st-2', marksObtained: 60, isAbsent: false },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ExamMarksVersionConflictError);

    // 5. Bulk PUT with correct max version succeeds; st-1 updated, st-2 created.
    const bulk = await withCtx(() =>
      svc.bulkUpsert(EXAM, {
        sectionId: SECTION,
        subjectId: SUBJECT,
        version: 2,
        entries: [
          { studentId: 'st-1', marksObtained: 90, isAbsent: false },
          { studentId: 'st-2', marksObtained: 60, isAbsent: false },
        ],
      }),
    );
    expect(bulk.entries).toHaveLength(2);
    expect(rows).toHaveLength(2);
    const st1 = rows.find((r) => r.studentId === 'st-1')!;
    const st2 = rows.find((r) => r.studentId === 'st-2')!;
    expect(st1.marksObtained).toBe(90);
    expect(st1.version).toBe(3);
    expect(st2.marksObtained).toBe(60);
    expect(st2.version).toBe(1);

    // Two more history entries: EDITED (st-1) + ENTERED (st-2).
    const lastTwo = history.slice(-2).map((h) => h.changeType).sort();
    expect(lastTwo).toEqual(['EDITED', 'ENTERED']);
  });
});
