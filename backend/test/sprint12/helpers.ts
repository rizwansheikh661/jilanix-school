/**
 * Sprint 12 e2e helpers — service-orchestration harness for the academic-
 * content module. Wires real HomeworkService / HomeworkAttachmentService /
 * AssignmentService / AssignmentSubmissionService / SyllabusService against
 * in-memory repo fakes + mocked external services (FileAssetService,
 * NotificationEventDispatcherService, SequenceService).
 *
 * Why service-orchestration (no real DB) — mirrors sprint10/sprint11 helpers:
 *   - Tests lock to the public service contract, not Prisma internals.
 *   - Avoids spinning Testcontainers MySQL for the e2e tier.
 */
import { AssignmentSubmissionService } from '../../src/core/academic-content/assignment-submission/assignment-submission.service';
import { AssignmentService } from '../../src/core/academic-content/assignment/assignment.service';
import { HomeworkAttachmentService } from '../../src/core/academic-content/homework-attachment/homework-attachment.service';
import { HomeworkService } from '../../src/core/academic-content/homework/homework.service';
import { SyllabusService } from '../../src/core/academic-content/syllabus/syllabus.service';
import type {
  AssignmentRow,
  AssignmentSubmissionRow,
  HomeworkAttachmentRow,
  HomeworkRow,
  SyllabusNodeRow,
  SyllabusRow,
} from '../../src/core/academic-content/academic-content.types';
import { RequestContextRegistry } from '../../src/core/request-context';

const SCHOOL = 'school-1';
const USER = 'user-admin';
const NOW = new Date('2026-06-22T12:00:00.000Z');

let idSeq = 0;
const id = (p: string) => `${p}-${(++idSeq).toString().padStart(4, '0')}`;

export interface Sprint12Harness {
  readonly homeworkService: HomeworkService;
  readonly homeworkAttachmentService: HomeworkAttachmentService;
  readonly assignmentService: AssignmentService;
  readonly assignmentSubmissionService: AssignmentSubmissionService;
  readonly syllabusService: SyllabusService;
  readonly outbox: { publish: jest.Mock };
  readonly audit: { record: jest.Mock };
  readonly featureFlags: { isEnabled: jest.Mock };
  readonly dispatcher: { dispatch: jest.Mock };
  readonly fileAssetService: { upload: jest.Mock; softDelete: jest.Mock };
  readonly state: HarnessState;
  outboxTopics(): string[];
  withCtx<T>(fn: () => Promise<T>): Promise<T>;
  seedStudents(items: ReadonlyArray<{ id: string; sectionId: string }>): void;
}

interface HarnessState {
  homework: Map<string, HomeworkRow>;
  homeworkAttachments: Map<string, HomeworkAttachmentRow>;
  assignments: Map<string, AssignmentRow>;
  submissions: Map<string, AssignmentSubmissionRow>;
  syllabi: Map<string, SyllabusRow>;
  syllabusNodes: Map<string, SyllabusNodeRow>;
  students: Array<{ id: string; sectionId: string; status: string }>;
}

export interface HarnessOpts {
  readonly featureFlags?: Record<string, boolean>;
}

export function createSprint12Harness(opts: HarnessOpts = {}): Sprint12Harness {
  const state: HarnessState = {
    homework: new Map(),
    homeworkAttachments: new Map(),
    assignments: new Map(),
    submissions: new Map(),
    syllabi: new Map(),
    syllabusNodes: new Map(),
    students: [],
  };

  // ---- Outbox + audit ---------------------------------------------------
  const outboxCalls: Array<{ topic: string }> = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, p: { topic: string }) => {
      outboxCalls.push({ topic: p.topic });
    }),
  };
  const audit = {
    record: jest.fn(async () => ({ id: id('audit'), rowHash: 'h' })),
  };

  // ---- Feature flags ----------------------------------------------------
  const flagsMap: Record<string, boolean> = {
    'module.academic-content': true,
    'academic-content.allow_homework_publish': true,
    'academic-content.allow_assignment_publish': true,
    'academic-content.allow_submissions': true,
    'academic-content.notify_on_lifecycle': true,
    ...(opts.featureFlags ?? {}),
  };
  const featureFlags = {
    isEnabled: jest.fn(async (key: string) => flagsMap[key] ?? false),
  };

  // ---- External services ------------------------------------------------
  const dispatcher = {
    dispatch: jest.fn(async () => undefined),
  };
  const fileAssetService = {
    upload: jest.fn(async (input: { fileName: string; mimeType: string }) => ({
      id: id('asset'),
      storageKey: `k/${input.fileName}`,
      mimeType: input.mimeType,
    })),
    softDelete: jest.fn(async () => undefined),
  };

  // ---- Sequences --------------------------------------------------------
  let seqVal = 0;
  const sequences = { nextValue: jest.fn(async () => ++seqVal) };

  // ---- Prisma stub ------------------------------------------------------
  // Services call `assertTenantRefs(tx, schoolId, { academicYearIds, classIds,
  // sectionIds, subjectIds, studentIds, staffIds, fileAssetIds })` — pass
  // through any provided ids so the guard always succeeds in e2e.
  const passThroughFindMany = (args: {
    where: { id?: { in?: string[] } };
  }) => {
    const ids = args.where.id?.in ?? [];
    return Promise.resolve(ids.map((rid) => ({ id: rid })));
  };

  // For lifecycle notifications, HomeworkService / AssignmentService read
  // active students in the section via prisma.client.student.findMany. Echo
  // back the seeded student list.
  const studentFindManyForLifecycle = (args: {
    where: { sectionId?: string; status?: string };
  }) =>
    Promise.resolve(
      state.students
        .filter(
          (s) =>
            (args.where.sectionId === undefined ||
              s.sectionId === args.where.sectionId) &&
            (args.where.status === undefined || s.status === args.where.status),
        )
        .map((s) => ({ id: s.id })),
    );

  const txStub = {
    academicYear: { findMany: jest.fn(passThroughFindMany) },
    class: { findMany: jest.fn(passThroughFindMany) },
    section: { findMany: jest.fn(passThroughFindMany) },
    subject: { findMany: jest.fn(passThroughFindMany) },
    student: { findMany: jest.fn(passThroughFindMany) },
    staff: { findMany: jest.fn(passThroughFindMany) },
    fileAsset: { findMany: jest.fn(passThroughFindMany) },
  };
  const prismaClient = {
    student: { findMany: jest.fn(studentFindManyForLifecycle) },
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txStub),
    ),
    client: prismaClient,
  };

  // ---- Homework repo ----------------------------------------------------
  const homeworkRepo = {
    findById: jest.fn(async (hid: string) => state.homework.get(hid) ?? null),
    findActiveByCode: jest.fn(async (code: string) => {
      for (const h of state.homework.values()) {
        if (h.code === code && h.deletedAt === null) return h;
      }
      return null;
    }),
    list: jest.fn(async () => ({
      rows: [...state.homework.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: HomeworkRow = {
        id: id('hw'),
        schoolId: SCHOOL,
        code: input.code as string,
        title: input.title as string,
        description: (input.description as string | null) ?? null,
        instructions: (input.instructions as string | null) ?? null,
        academicYearId: input.academicYearId as string,
        classId: input.classId as string,
        sectionId: input.sectionId as string,
        subjectId: input.subjectId as string,
        assignedByStaffId: input.assignedByStaffId as string,
        assignedDate: input.assignedDate as Date,
        dueDate: input.dueDate as Date,
        priority: (input.priority as HomeworkRow['priority']) ?? 'MEDIUM',
        status: 'DRAFT',
        publishedAt: null,
        closedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        attachmentCount: 0,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.homework.set(row.id, row);
      return row;
    }),
    update: jest.fn(
      async (hid: string, _v: number, patch: Partial<HomeworkRow>) => {
        const cur = state.homework.get(hid);
        if (!cur) throw new Error(`homework ${hid} not found`);
        const next: HomeworkRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.homework.set(hid, next);
        return next;
      },
    ),
    patchStatus: jest.fn(
      async (hid: string, _v: number, patch: Partial<HomeworkRow>) => {
        const cur = state.homework.get(hid);
        if (!cur) throw new Error(`homework ${hid} not found`);
        const next: HomeworkRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.homework.set(hid, next);
        return next;
      },
    ),
    softDelete: jest.fn(async (hid: string, _v: number) => {
      const cur = state.homework.get(hid);
      if (!cur) return;
      state.homework.set(hid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
    bumpAttachmentCount: jest.fn(async (hid: string, delta: number) => {
      const cur = state.homework.get(hid);
      if (!cur) return 0;
      state.homework.set(hid, {
        ...cur,
        attachmentCount: cur.attachmentCount + delta,
      });
      return 1;
    }),
  };

  // ---- Homework attachment repo ----------------------------------------
  const homeworkAttachmentRepo = {
    findById: jest.fn(
      async (aid: string) => state.homeworkAttachments.get(aid) ?? null,
    ),
    list: jest.fn(async (args: { homeworkId: string }) => ({
      rows: [...state.homeworkAttachments.values()].filter(
        (a) => a.homeworkId === args.homeworkId && a.deletedAt === null,
      ),
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: HomeworkAttachmentRow = {
        id: id('hwa'),
        schoolId: SCHOOL,
        homeworkId: input.homeworkId as string,
        fileAssetId: input.fileAssetId as string,
        attachmentType:
          input.attachmentType as HomeworkAttachmentRow['attachmentType'],
        title: input.title as string,
        uploadedByStaffId: (input.uploadedByStaffId as string | null) ?? null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.homeworkAttachments.set(row.id, row);
      return row;
    }),
    softDelete: jest.fn(async (aid: string, _v: number) => {
      const cur = state.homeworkAttachments.get(aid);
      if (!cur) return;
      state.homeworkAttachments.set(aid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
  };

  // ---- Assignment repo --------------------------------------------------
  const assignmentRepo = {
    findById: jest.fn(async (aid: string) => state.assignments.get(aid) ?? null),
    findActiveByCode: jest.fn(async (code: string) => {
      for (const a of state.assignments.values()) {
        if (a.code === code && a.deletedAt === null) return a;
      }
      return null;
    }),
    list: jest.fn(async () => ({
      rows: [...state.assignments.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: AssignmentRow = {
        id: id('asgn'),
        schoolId: SCHOOL,
        code: input.code as string,
        title: input.title as string,
        description: (input.description as string | null) ?? null,
        academicYearId: input.academicYearId as string,
        classId: input.classId as string,
        sectionId: input.sectionId as string,
        subjectId: input.subjectId as string,
        assignedByStaffId: input.assignedByStaffId as string,
        assignedDate: input.assignedDate as Date,
        dueDate: input.dueDate as Date,
        maxMarks: input.maxMarks as number,
        passingMarks: input.passingMarks as number,
        status: 'DRAFT',
        publishedAt: null,
        closedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        submissionCount: 0,
        evaluatedCount: 0,
        lateCount: 0,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.assignments.set(row.id, row);
      return row;
    }),
    update: jest.fn(
      async (aid: string, _v: number, patch: Partial<AssignmentRow>) => {
        const cur = state.assignments.get(aid);
        if (!cur) throw new Error(`assignment ${aid} not found`);
        const next: AssignmentRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.assignments.set(aid, next);
        return next;
      },
    ),
    patchStatus: jest.fn(
      async (aid: string, _v: number, patch: Partial<AssignmentRow>) => {
        const cur = state.assignments.get(aid);
        if (!cur) throw new Error(`assignment ${aid} not found`);
        const next: AssignmentRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.assignments.set(aid, next);
        return next;
      },
    ),
    softDelete: jest.fn(async (aid: string, _v: number) => {
      const cur = state.assignments.get(aid);
      if (!cur) return;
      state.assignments.set(aid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
    bumpCounters: jest.fn(
      async (
        aid: string,
        delta: {
          submission?: number;
          evaluated?: number;
          late?: number;
        },
      ) => {
        const cur = state.assignments.get(aid);
        if (!cur) return 0;
        state.assignments.set(aid, {
          ...cur,
          submissionCount: cur.submissionCount + (delta.submission ?? 0),
          evaluatedCount: cur.evaluatedCount + (delta.evaluated ?? 0),
          lateCount: cur.lateCount + (delta.late ?? 0),
        });
        return 1;
      },
    ),
  };

  // ---- Submission repo --------------------------------------------------
  const submissionRepo = {
    findById: jest.fn(async (sid: string) => state.submissions.get(sid) ?? null),
    findActiveForStudent: jest.fn(
      async (aid: string, stid: string) => {
        for (const s of state.submissions.values()) {
          if (
            s.assignmentId === aid &&
            s.studentId === stid &&
            s.deletedAt === null
          ) {
            return s;
          }
        }
        return null;
      },
    ),
    list: jest.fn(async () => ({
      rows: [...state.submissions.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: AssignmentSubmissionRow = {
        id: id('sub'),
        schoolId: SCHOOL,
        assignmentId: input.assignmentId as string,
        studentId: input.studentId as string,
        submittedAt: input.submittedAt as Date,
        isLate: input.isLate as boolean,
        status: input.status as AssignmentSubmissionRow['status'],
        recordedByStaffId: (input.recordedByStaffId as string | null) ?? null,
        remarks: (input.remarks as string | null) ?? null,
        marksObtained: null,
        evaluatedAt: null,
        evaluatedByStaffId: null,
        evaluationRemarks: null,
        rubricSnapshot: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.submissions.set(row.id, row);
      return row;
    }),
    update: jest.fn(
      async (
        sid: string,
        _v: number,
        patch: Partial<AssignmentSubmissionRow>,
      ) => {
        const cur = state.submissions.get(sid);
        if (!cur) throw new Error(`submission ${sid} not found`);
        const next: AssignmentSubmissionRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.submissions.set(sid, next);
        return next;
      },
    ),
  };

  // ---- Syllabus repo ----------------------------------------------------
  const syllabusRepo = {
    findById: jest.fn(async (sid: string) => state.syllabi.get(sid) ?? null),
    findActive: jest.fn(
      async (ayId: string, classId: string, subjectId: string) => {
        for (const s of state.syllabi.values()) {
          if (
            s.academicYearId === ayId &&
            s.classId === classId &&
            s.subjectId === subjectId &&
            s.deletedAt === null
          ) {
            return s;
          }
        }
        return null;
      },
    ),
    list: jest.fn(async () => ({
      rows: [...state.syllabi.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: SyllabusRow = {
        id: id('syl'),
        schoolId: SCHOOL,
        academicYearId: input.academicYearId as string,
        classId: input.classId as string,
        subjectId: input.subjectId as string,
        status: 'NOT_STARTED',
        plannedCompletionDate: (input.plannedCompletionDate as Date | null) ?? null,
        actualCompletionDate: null,
        completionPercent: 0,
        ownedByStaffId: (input.ownedByStaffId as string | null) ?? null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.syllabi.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (sid: string, _v: number, patch: Partial<SyllabusRow>) => {
      const cur = state.syllabi.get(sid);
      if (!cur) throw new Error(`syllabus ${sid} not found`);
      const next: SyllabusRow = {
        ...cur,
        ...patch,
        version: cur.version + 1,
        updatedAt: NOW,
      };
      state.syllabi.set(sid, next);
      return next;
    }),
    softDelete: jest.fn(async (sid: string, _v: number) => {
      const cur = state.syllabi.get(sid);
      if (!cur) return;
      state.syllabi.set(sid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
    recomputeCompletion: jest.fn(
      async (
        sid: string,
        percent: number,
        status: SyllabusRow['status'],
        actualCompletionDate: Date | null,
      ) => {
        const cur = state.syllabi.get(sid);
        if (!cur) return null;
        const next: SyllabusRow = {
          ...cur,
          completionPercent: percent,
          status,
          actualCompletionDate,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.syllabi.set(sid, next);
        return next;
      },
    ),
    findNodeById: jest.fn(
      async (nid: string) => state.syllabusNodes.get(nid) ?? null,
    ),
    listNodes: jest.fn(async (sid: string) =>
      [...state.syllabusNodes.values()].filter(
        (n) => n.syllabusId === sid && n.deletedAt === null,
      ),
    ),
    countTopics: jest.fn(async (sid: string) => {
      const nodes = [...state.syllabusNodes.values()].filter(
        (n) =>
          n.syllabusId === sid && n.nodeType === 'TOPIC' && n.deletedAt === null,
      );
      const completed = nodes.filter((n) => n.status === 'COMPLETED').length;
      return { total: nodes.length, completed };
    }),
    createNode: jest.fn(async (input: Record<string, unknown>) => {
      const row: SyllabusNodeRow = {
        id: id('node'),
        schoolId: SCHOOL,
        syllabusId: input.syllabusId as string,
        parentNodeId: (input.parentNodeId as string | null) ?? null,
        nodeType: input.nodeType as SyllabusNodeRow['nodeType'],
        name: input.name as string,
        sequence: input.sequence as number,
        plannedCompletionDate:
          (input.plannedCompletionDate as Date | null) ?? null,
        actualCompletionDate: null,
        status: 'NOT_STARTED',
        completedByStaffId: null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.syllabusNodes.set(row.id, row);
      return row;
    }),
    updateNode: jest.fn(
      async (
        nid: string,
        _v: number,
        patch: Partial<SyllabusNodeRow>,
      ) => {
        const cur = state.syllabusNodes.get(nid);
        if (!cur) throw new Error(`node ${nid} not found`);
        const next: SyllabusNodeRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.syllabusNodes.set(nid, next);
        return next;
      },
    ),
    softDeleteNode: jest.fn(async (nid: string, _v: number) => {
      const cur = state.syllabusNodes.get(nid);
      if (!cur) return;
      state.syllabusNodes.set(nid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
  };

  // ---- Compose services -------------------------------------------------
  const homeworkService = new HomeworkService(
    prisma as never,
    homeworkRepo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  const homeworkAttachmentService = new HomeworkAttachmentService(
    prisma as never,
    homeworkAttachmentRepo as never,
    homeworkRepo as never,
    fileAssetService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  const assignmentService = new AssignmentService(
    prisma as never,
    assignmentRepo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  const assignmentSubmissionService = new AssignmentSubmissionService(
    prisma as never,
    submissionRepo as never,
    assignmentRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  const syllabusService = new SyllabusService(
    prisma as never,
    syllabusRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );

  function withCtx<T>(fn: () => Promise<T>): Promise<T> {
    const ctx = RequestContextRegistry.makeSystemContext({
      schoolId: SCHOOL,
      userId: USER,
      actorScope: 'tenant',
    });
    return RequestContextRegistry.run(ctx, fn);
  }

  return {
    homeworkService,
    homeworkAttachmentService,
    assignmentService,
    assignmentSubmissionService,
    syllabusService,
    outbox,
    audit,
    featureFlags,
    dispatcher,
    fileAssetService,
    state,
    outboxTopics(): string[] {
      return outboxCalls.map((c) => c.topic);
    },
    withCtx,
    seedStudents(items) {
      for (const it of items) {
        state.students.push({
          id: it.id,
          sectionId: it.sectionId,
          status: 'ACTIVE',
        });
      }
    },
  };
}

export const TEST_SCHOOL = SCHOOL;
export const TEST_USER = USER;
export const TEST_NOW = NOW;
