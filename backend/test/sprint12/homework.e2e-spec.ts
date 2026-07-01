/**
 * Sprint 12 e2e — Homework lifecycle + attachments.
 *
 * Walks the full DRAFT → PUBLISHED → CLOSED path: code allocation, attachment
 * upload (×2) updates the denorm counter, PATCH whitelist rejects `title` post-
 * publish, and lifecycle notifications fan out to seeded students.
 */
import {
  AcademicContentOutboxTopics,
  type AttachmentTypeValue,
  type HomeworkPriorityValue,
} from '../../src/core/academic-content/academic-content.constants';
import { HomeworkNotEditableError } from '../../src/core/academic-content/academic-content.errors';
import { createSprint12Harness } from './helpers';

describe('Sprint 12 — Homework lifecycle e2e', () => {
  it('DRAFT → 2 attachments → PUBLISHED → CLOSED dispatches notifications and bubbles counters', async () => {
    const h = createSprint12Harness();
    h.seedStudents([
      { id: 'stu-A', sectionId: 'sec-1' },
      { id: 'stu-B', sectionId: 'sec-1' },
      { id: 'stu-C', sectionId: 'sec-1' },
    ]);

    // -- Create DRAFT --------------------------------------------------------
    const created = await h.withCtx(() =>
      h.homeworkService.create({
        title: 'Chapter 5 reading',
        academicYearId: 'ay-1',
        classId: 'cls-1',
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        assignedByStaffId: 'staff-1',
        assignedDate: new Date('2026-07-01'),
        dueDate: new Date('2026-07-08'),
        priority: 'MEDIUM' as HomeworkPriorityValue,
      }),
    );
    expect(created.code).toBe('HW-000001');
    expect(created.status).toBe('DRAFT');

    // -- Attach 2 files ------------------------------------------------------
    await h.withCtx(() =>
      h.homeworkAttachmentService.upload({
        homeworkId: created.id,
        attachmentType: 'PDF' as AttachmentTypeValue,
        title: 'reading.pdf',
        uploadedByStaffId: 'staff-1',
        fileName: 'reading.pdf',
        mimeType: 'application/pdf',
        body: Buffer.from('pdf-bytes'),
      }),
    );
    await h.withCtx(() =>
      h.homeworkAttachmentService.upload({
        homeworkId: created.id,
        attachmentType: 'WORKSHEET' as AttachmentTypeValue,
        title: 'worksheet.pdf',
        uploadedByStaffId: 'staff-1',
        fileName: 'worksheet.pdf',
        mimeType: 'application/pdf',
        body: Buffer.from('ws-bytes'),
      }),
    );

    const afterAttach = await h.withCtx(() =>
      h.homeworkService.getById(created.id),
    );
    expect(afterAttach.attachmentCount).toBe(2);

    // -- Publish -------------------------------------------------------------
    const published = await h.withCtx(() =>
      h.homeworkService.publish(created.id, afterAttach.version),
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeInstanceOf(Date);

    // Lifecycle notification fired with 3 recipients.
    expect(h.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'HOMEWORK_PUBLISHED',
        recipients: [
          { userId: 'stu-A' },
          { userId: 'stu-B' },
          { userId: 'stu-C' },
        ],
      }),
    );

    // -- PATCH after publish: title is NOT in the whitelist ------------------
    await expect(
      h.withCtx(() =>
        h.homeworkService.update(created.id, published.version, {
          title: 'renamed',
        } as never),
      ),
    ).rejects.toBeInstanceOf(HomeworkNotEditableError);

    // -- PATCH after publish: dueDate IS in the whitelist --------------------
    const patched = await h.withCtx(() =>
      h.homeworkService.update(created.id, published.version, {
        dueDate: new Date('2026-07-15'),
      } as never),
    );
    expect(patched.dueDate.toISOString().slice(0, 10)).toBe('2026-07-15');

    // -- Close ---------------------------------------------------------------
    const closed = await h.withCtx(() =>
      h.homeworkService.close(created.id, patched.version),
    );
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).toBeInstanceOf(Date);

    // HOMEWORK_CLOSED notification also dispatched.
    expect(h.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'HOMEWORK_CLOSED' }),
    );
    expect(h.dispatcher.dispatch).toHaveBeenCalledTimes(2);

    // -- Outbox topics in order ----------------------------------------------
    expect(h.outboxTopics()).toEqual([
      AcademicContentOutboxTopics.HOMEWORK_CREATED,
      AcademicContentOutboxTopics.HOMEWORK_ATTACHMENT_UPLOADED,
      AcademicContentOutboxTopics.HOMEWORK_ATTACHMENT_UPLOADED,
      AcademicContentOutboxTopics.HOMEWORK_PUBLISHED,
      AcademicContentOutboxTopics.HOMEWORK_UPDATED,
      AcademicContentOutboxTopics.HOMEWORK_CLOSED,
    ]);

    // -- Soft-delete refused while CLOSED is allowed (PUBLISHED would refuse).
    await h.withCtx(() => h.homeworkService.softDelete(created.id, closed.version));
    const deleted = h.state.homework.get(created.id)!;
    expect(deleted.deletedAt).not.toBeNull();
  });
});
