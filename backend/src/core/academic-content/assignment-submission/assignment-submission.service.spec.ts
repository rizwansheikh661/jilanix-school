/**
 * AssignmentSubmissionService unit specs — submit (on-time/late),
 * duplicate refusal, evaluate marks-range, reject, and DRAFT-assignment
 * submission refusal.
 */
import {
  AcademicContentOutboxTopics,
  type SubmissionStatusValue,
} from '../academic-content.constants';
import {
  AssignmentNotAcceptingSubmissionsError,
  AssignmentSubmissionMarksOutOfRangeError,
  AssignmentSubmissionNotEvaluableError,
  DuplicateAssignmentSubmissionError,
} from '../academic-content.errors';
import type {
  AssignmentRow,
  AssignmentSubmissionRow,
} from '../academic-content.types';
import {
  TEST_NOW,
  TEST_SCHOOL_ID,
  makeFakeAudit,
  makeFakeDispatcher,
  makeFakeFeatureFlags,
  makeFakeOutbox,
  makeFakePrisma,
  withTenantCtx,
} from '../__test__/test-harness';
import { AssignmentSubmissionService } from './assignment-submission.service';

function makeAssignment(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: 'asgn-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'ASGN-000001',
    title: 'A1',
    description: null,
    academicYearId: 'ay-1',
    classId: 'cls-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    assignedByStaffId: 'staff-1',
    assignedDate: new Date('2026-07-01'),
    dueDate: new Date('2026-07-08T23:59:59.000Z'),
    maxMarks: 100,
    passingMarks: 40,
    status: 'PUBLISHED',
    publishedAt: TEST_NOW,
    closedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    submissionCount: 0,
    evaluatedCount: 0,
    lateCount: 0,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    createdBy: 'user-1',
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeSubmission(
  overrides: Partial<AssignmentSubmissionRow> = {},
): AssignmentSubmissionRow {
  return {
    id: 'sub-1',
    schoolId: TEST_SCHOOL_ID,
    assignmentId: 'asgn-1',
    studentId: 'stu-1',
    submittedAt: new Date('2026-07-05'),
    isLate: false,
    status: 'SUBMITTED' as SubmissionStatusValue,
    recordedByStaffId: 'staff-1',
    remarks: null,
    marksObtained: null,
    evaluatedAt: null,
    evaluatedByStaffId: null,
    evaluationRemarks: null,
    rubricSnapshot: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    createdBy: 'user-1',
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeHarness() {
  const { prisma } = makeFakePrisma();
  const submissionRepo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveForStudent: jest.fn<Promise<AssignmentSubmissionRow | null>, [string, string, unknown?]>(
      async () => null,
    ),
    create: jest.fn(
      async (input: {
        assignmentId: string;
        studentId: string;
        isLate: boolean;
        status: SubmissionStatusValue;
      }) =>
        makeSubmission({
          id: 'sub-new',
          assignmentId: input.assignmentId,
          studentId: input.studentId,
          isLate: input.isLate,
          status: input.status,
        }),
    ),
    update: jest.fn(
      async (
        id: string,
        _v: number,
        input: { status?: SubmissionStatusValue; marksObtained?: number | null },
      ) =>
        makeSubmission({
          id,
          status: (input.status ?? 'SUBMITTED') as SubmissionStatusValue,
          marksObtained: input.marksObtained ?? null,
        }),
    ),
  };
  const assignmentRepo = {
    findById: jest.fn(async () => makeAssignment()),
    bumpCounters: jest.fn(async () => 1),
  };
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const dispatcher = makeFakeDispatcher();
  const svc = new AssignmentSubmissionService(
    prisma as never,
    submissionRepo as never,
    assignmentRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  return { svc, submissionRepo, assignmentRepo, outbox, audit, dispatcher };
}

describe('AssignmentSubmissionService.submit', () => {
  it('on-time submission has isLate=false, status=SUBMITTED, bumps submissionCount only', async () => {
    const t = makeHarness();
    const result = await withTenantCtx(() =>
      t.svc.submit({
        assignmentId: 'asgn-1',
        studentId: 'stu-1',
        submittedAt: new Date('2026-07-05'),
        recordedByStaffId: 'staff-1',
      }),
    );
    expect(result.submission.isLate).toBe(false);
    expect(result.submission.status).toBe('SUBMITTED');
    expect(t.assignmentRepo.bumpCounters).toHaveBeenCalledWith(
      'asgn-1',
      { submission: 1, late: 0 },
      expect.anything(),
    );
  });

  it('late submission flagged LATE_SUBMITTED, bumps late counter', async () => {
    const t = makeHarness();
    const result = await withTenantCtx(() =>
      t.svc.submit({
        assignmentId: 'asgn-1',
        studentId: 'stu-1',
        submittedAt: new Date('2026-07-10'),
        recordedByStaffId: 'staff-1',
      }),
    );
    expect(result.submission.isLate).toBe(true);
    expect(result.submission.status).toBe('LATE_SUBMITTED');
    expect(t.assignmentRepo.bumpCounters).toHaveBeenCalledWith(
      'asgn-1',
      { submission: 1, late: 1 },
      expect.anything(),
    );
  });

  it('refuses when assignment is DRAFT', async () => {
    const t = makeHarness();
    t.assignmentRepo.findById.mockResolvedValueOnce(
      makeAssignment({ status: 'DRAFT' }),
    );
    await expect(
      withTenantCtx(() =>
        t.svc.submit({
          assignmentId: 'asgn-1',
          studentId: 'stu-1',
          submittedAt: new Date('2026-07-05'),
          recordedByStaffId: 'staff-1',
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentNotAcceptingSubmissionsError);
  });

  it('refuses duplicate active submission for (assignment, student)', async () => {
    const t = makeHarness();
    t.submissionRepo.findActiveForStudent.mockResolvedValueOnce(makeSubmission());
    await expect(
      withTenantCtx(() =>
        t.svc.submit({
          assignmentId: 'asgn-1',
          studentId: 'stu-1',
          submittedAt: new Date('2026-07-05'),
          recordedByStaffId: 'staff-1',
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateAssignmentSubmissionError);
  });
});

describe('AssignmentSubmissionService.evaluate', () => {
  it('happy path emits SUBMISSION_EVALUATED + bumps evaluatedCount', async () => {
    const t = makeHarness();
    t.submissionRepo.findById.mockResolvedValueOnce(makeSubmission());
    await withTenantCtx(() =>
      t.svc.evaluate('sub-1', 1, {
        marksObtained: 80,
        evaluatedByStaffId: 'staff-1',
      }),
    );
    const topics = t.outbox.publish.mock.calls.map(
      (c) => (c[1] as { topic: string }).topic,
    );
    expect(topics).toContain(AcademicContentOutboxTopics.SUBMISSION_EVALUATED);
    expect(t.assignmentRepo.bumpCounters).toHaveBeenCalledWith(
      'asgn-1',
      { evaluated: 1 },
      expect.anything(),
    );
  });

  it('rejects marksObtained > maxMarks', async () => {
    const t = makeHarness();
    t.submissionRepo.findById.mockResolvedValueOnce(makeSubmission());
    await expect(
      withTenantCtx(() =>
        t.svc.evaluate('sub-1', 1, {
          marksObtained: 150,
          evaluatedByStaffId: 'staff-1',
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentSubmissionMarksOutOfRangeError);
  });

  it('refuses re-evaluation of already EVALUATED', async () => {
    const t = makeHarness();
    t.submissionRepo.findById.mockResolvedValueOnce(
      makeSubmission({ status: 'EVALUATED' as SubmissionStatusValue }),
    );
    await expect(
      withTenantCtx(() =>
        t.svc.evaluate('sub-1', 1, {
          marksObtained: 50,
          evaluatedByStaffId: 'staff-1',
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentSubmissionNotEvaluableError);
  });
});

describe('AssignmentSubmissionService.reject', () => {
  it('marks REJECTED and emits topic', async () => {
    const t = makeHarness();
    t.submissionRepo.findById.mockResolvedValueOnce(makeSubmission());
    await withTenantCtx(() =>
      t.svc.reject('sub-1', 1, {
        evaluatedByStaffId: 'staff-1',
        rejectionReason: 'illegible scan',
      }),
    );
    const topics = t.outbox.publish.mock.calls.map(
      (c) => (c[1] as { topic: string }).topic,
    );
    expect(topics).toContain(AcademicContentOutboxTopics.SUBMISSION_REJECTED);
  });
});
