/**
 * Sprint 12 e2e — Assignment lifecycle.
 *
 * Verifies create with marks validation, publish dispatches notification, close
 * does NOT dispatch (per service contract — only publish fans out), and the
 * full outbox topic sequence.
 */
import {
  AcademicContentOutboxTopics,
} from '../../src/core/academic-content/academic-content.constants';
import {
  AssignmentMarksInvalidError,
  AssignmentNotEditableError,
} from '../../src/core/academic-content/academic-content.errors';
import { createSprint12Harness } from './helpers';

describe('Sprint 12 — Assignment lifecycle e2e', () => {
  it('rejects passingMarks > maxMarks on create', async () => {
    const h = createSprint12Harness();
    await expect(
      h.withCtx(() =>
        h.assignmentService.create({
          title: 'Bad marks',
          academicYearId: 'ay-1',
          classId: 'cls-1',
          sectionId: 'sec-1',
          subjectId: 'sub-1',
          assignedByStaffId: 'staff-1',
          assignedDate: new Date('2026-07-01'),
          dueDate: new Date('2026-07-08'),
          maxMarks: 50,
          passingMarks: 60,
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentMarksInvalidError);
  });

  it('DRAFT → PUBLISHED → CLOSED dispatches publish-time notification only', async () => {
    const h = createSprint12Harness();
    h.seedStudents([
      { id: 'stu-1', sectionId: 'sec-1' },
      { id: 'stu-2', sectionId: 'sec-1' },
    ]);

    const created = await h.withCtx(() =>
      h.assignmentService.create({
        title: 'Algebra worksheet',
        academicYearId: 'ay-1',
        classId: 'cls-1',
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        assignedByStaffId: 'staff-1',
        assignedDate: new Date('2026-07-01'),
        dueDate: new Date('2026-07-08'),
        maxMarks: 100,
        passingMarks: 40,
      }),
    );
    expect(created.code).toBe('ASGN-000001');
    expect(created.status).toBe('DRAFT');
    expect(created.submissionCount).toBe(0);

    // PATCH free in DRAFT.
    const draftPatched = await h.withCtx(() =>
      h.assignmentService.update(created.id, created.version, {
        title: 'Algebra worksheet v2',
      } as never),
    );
    expect(draftPatched.title).toBe('Algebra worksheet v2');

    // Publish.
    const published = await h.withCtx(() =>
      h.assignmentService.publish(created.id, draftPatched.version),
    );
    expect(published.status).toBe('PUBLISHED');

    expect(h.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'ASSIGNMENT_PUBLISHED',
        recipients: [{ userId: 'stu-1' }, { userId: 'stu-2' }],
      }),
    );

    // After publish, title edits refused.
    await expect(
      h.withCtx(() =>
        h.assignmentService.update(created.id, published.version, {
          title: 'should-fail',
        } as never),
      ),
    ).rejects.toBeInstanceOf(AssignmentNotEditableError);

    // dueDate IS in the whitelist.
    const patched = await h.withCtx(() =>
      h.assignmentService.update(created.id, published.version, {
        dueDate: new Date('2026-07-15'),
      } as never),
    );

    // Close — no notification dispatch per AssignmentService contract.
    const closed = await h.withCtx(() =>
      h.assignmentService.close(created.id, patched.version),
    );
    expect(closed.status).toBe('CLOSED');
    expect(h.dispatcher.dispatch).toHaveBeenCalledTimes(1);

    // Outbox sequence.
    expect(h.outboxTopics()).toEqual([
      AcademicContentOutboxTopics.ASSIGNMENT_CREATED,
      AcademicContentOutboxTopics.ASSIGNMENT_UPDATED,
      AcademicContentOutboxTopics.ASSIGNMENT_PUBLISHED,
      AcademicContentOutboxTopics.ASSIGNMENT_UPDATED,
      AcademicContentOutboxTopics.ASSIGNMENT_CLOSED,
    ]);

    // Soft-delete allowed in CLOSED (PUBLISHED would refuse).
    await h.withCtx(() => h.assignmentService.softDelete(created.id, closed.version));
    expect(h.state.assignments.get(created.id)!.deletedAt).not.toBeNull();
  });
});
