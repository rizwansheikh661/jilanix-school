/**
 * Sprint 12 e2e — Assignment submission lifecycle.
 *
 * Records 3 student submissions (2 on-time + 1 late), then evaluates 1 and
 * rejects 1. Asserts counter math, late detection, duplicate guard, and that
 * ASSIGNMENT_SUBMITTED + ASSIGNMENT_EVALUATED notifications fire.
 */
import { AcademicContentOutboxTopics } from '../../src/core/academic-content/academic-content.constants';
import {
  AssignmentSubmissionMarksOutOfRangeError,
  AssignmentSubmissionNotEvaluableError,
  DuplicateAssignmentSubmissionError,
} from '../../src/core/academic-content/academic-content.errors';
import { createSprint12Harness } from './helpers';

describe('Sprint 12 — Assignment submission e2e', () => {
  it('3 submissions (2 on-time + 1 late) → evaluate 1, reject 1, counters consistent', async () => {
    const h = createSprint12Harness();

    const asgn = await h.withCtx(() =>
      h.assignmentService.create({
        title: 'Geometry quiz',
        academicYearId: 'ay-1',
        classId: 'cls-1',
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        assignedByStaffId: 'staff-teacher',
        assignedDate: new Date('2026-07-01'),
        dueDate: new Date('2026-07-08T23:59:59.000Z'),
        maxMarks: 100,
        passingMarks: 40,
      }),
    );
    const published = await h.withCtx(() =>
      h.assignmentService.publish(asgn.id, asgn.version),
    );
    expect(published.status).toBe('PUBLISHED');

    // -- On-time submission 1 ----------------------------------------------
    const sub1 = await h.withCtx(() =>
      h.assignmentSubmissionService.submit({
        assignmentId: asgn.id,
        studentId: 'stu-1',
        submittedAt: new Date('2026-07-05T10:00:00.000Z'),
        recordedByStaffId: 'staff-teacher',
      }),
    );
    expect(sub1.submission.isLate).toBe(false);
    expect(sub1.submission.status).toBe('SUBMITTED');
    expect(sub1.assignment.submissionCount).toBe(1);
    expect(sub1.assignment.lateCount).toBe(0);

    // -- On-time submission 2 ----------------------------------------------
    const sub2 = await h.withCtx(() =>
      h.assignmentSubmissionService.submit({
        assignmentId: asgn.id,
        studentId: 'stu-2',
        submittedAt: new Date('2026-07-06T09:00:00.000Z'),
        recordedByStaffId: 'staff-teacher',
      }),
    );
    expect(sub2.submission.isLate).toBe(false);
    expect(sub2.assignment.submissionCount).toBe(2);

    // -- Late submission ---------------------------------------------------
    const sub3 = await h.withCtx(() =>
      h.assignmentSubmissionService.submit({
        assignmentId: asgn.id,
        studentId: 'stu-3',
        submittedAt: new Date('2026-07-10T00:00:00.000Z'),
        recordedByStaffId: 'staff-teacher',
      }),
    );
    expect(sub3.submission.isLate).toBe(true);
    expect(sub3.submission.status).toBe('LATE_SUBMITTED');
    expect(sub3.assignment.submissionCount).toBe(3);
    expect(sub3.assignment.lateCount).toBe(1);

    // ASSIGNMENT_SUBMITTED dispatched to the assigning teacher per submission.
    const submitDispatches = h.dispatcher.dispatch.mock.calls.filter(
      ([arg]) => (arg as { eventKey: string }).eventKey === 'ASSIGNMENT_SUBMITTED',
    );
    expect(submitDispatches).toHaveLength(3);
    expect(
      (submitDispatches[0]![0] as { recipients: ReadonlyArray<{ userId: string }> })
        .recipients,
    ).toEqual([{ userId: 'staff-teacher' }]);

    // -- Duplicate refused -------------------------------------------------
    await expect(
      h.withCtx(() =>
        h.assignmentSubmissionService.submit({
          assignmentId: asgn.id,
          studentId: 'stu-1',
          submittedAt: new Date('2026-07-07T10:00:00.000Z'),
          recordedByStaffId: 'staff-teacher',
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateAssignmentSubmissionError);

    // -- Evaluate sub1 -----------------------------------------------------
    const evaluated = await h.withCtx(() =>
      h.assignmentSubmissionService.evaluate(sub1.submission.id, sub1.submission.version, {
        marksObtained: 78,
        evaluatedByStaffId: 'staff-teacher',
        evaluationRemarks: 'good work',
      }),
    );
    expect(evaluated.status).toBe('EVALUATED');
    expect(evaluated.marksObtained).toBe(78);

    const asgnAfterEval = h.state.assignments.get(asgn.id)!;
    expect(asgnAfterEval.evaluatedCount).toBe(1);

    // ASSIGNMENT_EVALUATED → student.
    const evalDispatch = h.dispatcher.dispatch.mock.calls.find(
      ([arg]) => (arg as { eventKey: string }).eventKey === 'ASSIGNMENT_EVALUATED',
    );
    expect(evalDispatch).toBeDefined();
    expect(
      (evalDispatch![0] as { recipients: ReadonlyArray<{ userId: string }> })
        .recipients,
    ).toEqual([{ userId: 'stu-1' }]);

    // Re-evaluation refused.
    await expect(
      h.withCtx(() =>
        h.assignmentSubmissionService.evaluate(evaluated.id, evaluated.version, {
          marksObtained: 90,
          evaluatedByStaffId: 'staff-teacher',
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentSubmissionNotEvaluableError);

    // marks > maxMarks refused.
    await expect(
      h.withCtx(() =>
        h.assignmentSubmissionService.evaluate(sub2.submission.id, sub2.submission.version, {
          marksObtained: 150,
          evaluatedByStaffId: 'staff-teacher',
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentSubmissionMarksOutOfRangeError);

    // -- Reject sub3 -------------------------------------------------------
    const rejected = await h.withCtx(() =>
      h.assignmentSubmissionService.reject(sub3.submission.id, sub3.submission.version, {
        evaluatedByStaffId: 'staff-teacher',
        rejectionReason: 'illegible scan',
      }),
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('illegible scan');

    // -- Outbox topics include submission lifecycle ------------------------
    const topics = h.outboxTopics();
    expect(topics.filter((t) => t === AcademicContentOutboxTopics.SUBMISSION_SUBMITTED))
      .toHaveLength(3);
    expect(topics).toContain(AcademicContentOutboxTopics.SUBMISSION_EVALUATED);
    expect(topics).toContain(AcademicContentOutboxTopics.SUBMISSION_REJECTED);
  });
});
