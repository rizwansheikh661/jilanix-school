/**
 * AssignmentSubmissionService — orchestrates teacher-mediated student
 * submissions on an Assignment plus the evaluate/reject lifecycle.
 *
 * Key rules:
 *   - Parent Assignment must be PUBLISHED or CLOSED to accept new submissions.
 *     DRAFT/CANCELLED are refused (AssignmentNotAcceptingSubmissionsError).
 *   - One active submission per `(assignmentId, studentId)` enforced via
 *     STORED `deleted_at_key` partial unique; a soft-deleted submission frees
 *     the slot.
 *   - `isLate` = submittedAt >= assignment.dueDate; status defaults to
 *     LATE_SUBMITTED in that case, else SUBMITTED. Counter bumps mirror
 *     the status: submissionCount += 1 always, lateCount += 1 when late.
 *   - Evaluate: marksObtained must be in [0, maxMarks]; status → EVALUATED;
 *     evaluatedCount += 1.
 *   - Reject: status → REJECTED; no counter change beyond the original
 *     submissionCount (rejected submissions still count as "received").
 *   - Notification dispatch (ASSIGNMENT_SUBMITTED / ASSIGNMENT_EVALUATED)
 *     happens AFTER commit, gated by NOTIFY_ON_LIFECYCLE flag.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { NotificationEventDispatcherService } from '../../notifications/notification-event-dispatcher/notification-event-dispatcher.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  AcademicContentFeatureFlags,
  AcademicContentNotificationEventKeys,
  AcademicContentOutboxTopics,
  type SubmissionStatusValue,
} from '../academic-content.constants';
import {
  AcademicContentModuleDisabledError,
  AssignmentNotAcceptingSubmissionsError,
  AssignmentNotFoundError,
  AssignmentSubmissionMarksOutOfRangeError,
  AssignmentSubmissionNotFoundError,
  DuplicateAssignmentSubmissionError,
} from '../academic-content.errors';
import type {
  AssignmentRow,
  AssignmentSubmissionRow,
} from '../academic-content.types';
import { AssignmentRepository } from '../assignment/assignment.repository';
import { assertSubmissionTransition } from '../state-machine';
import { assertTenantRefs } from '../tenant-refs';
import {
  AssignmentSubmissionRepository,
  type ListSubmissionArgs,
} from './assignment-submission.repository';

export interface SubmitArgs {
  readonly assignmentId: string;
  readonly studentId: string;
  readonly submittedAt?: Date;
  readonly recordedByStaffId?: string | null;
  readonly remarks?: string | null;
}

export interface EvaluateArgs {
  readonly marksObtained: number;
  readonly evaluatedByStaffId: string;
  readonly evaluationRemarks?: string | null;
}

export interface RejectArgs {
  readonly evaluatedByStaffId: string;
  readonly rejectionReason: string;
}

@Injectable()
export class AssignmentSubmissionService {
  private readonly logger = new Logger(AssignmentSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AssignmentSubmissionRepository,
    private readonly assignmentRepo: AssignmentRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly dispatcher: NotificationEventDispatcherService,
  ) {}

  public async list(args: ListSubmissionArgs): Promise<{
    readonly items: readonly AssignmentSubmissionRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AssignmentSubmissionRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new AssignmentSubmissionNotFoundError(id);
    return row;
  }

  public async submit(args: SubmitArgs): Promise<{
    readonly submission: AssignmentSubmissionRow;
    readonly assignment: AssignmentRow;
  }> {
    await this.assertModuleEnabled();

    const result = await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const assignment = await this.assignmentRepo.findById(args.assignmentId, tx);
      if (assignment === null) throw new AssignmentNotFoundError(args.assignmentId);
      if (assignment.status !== 'PUBLISHED' && assignment.status !== 'CLOSED') {
        throw new AssignmentNotAcceptingSubmissionsError(
          assignment.id,
          assignment.status,
        );
      }

      await assertTenantRefs(tx, schoolId, {
        studentIds: [args.studentId],
        ...(args.recordedByStaffId
          ? { staffIds: [args.recordedByStaffId] }
          : {}),
      });

      const existing = await this.repo.findActiveForStudent(
        args.assignmentId,
        args.studentId,
        tx,
      );
      if (existing !== null) {
        throw new DuplicateAssignmentSubmissionError(
          args.assignmentId,
          args.studentId,
        );
      }

      const submittedAt = args.submittedAt ?? new Date();
      const isLate = submittedAt.getTime() >= assignment.dueDate.getTime();
      const status: SubmissionStatusValue = isLate ? 'LATE_SUBMITTED' : 'SUBMITTED';

      const created = await this.repo.create(
        {
          assignmentId: args.assignmentId,
          studentId: args.studentId,
          submittedAt,
          isLate,
          status,
          recordedByStaffId: args.recordedByStaffId ?? null,
          remarks: args.remarks ?? null,
        },
        tx,
      );

      await this.assignmentRepo.bumpCounters(
        args.assignmentId,
        { submission: 1, late: isLate ? 1 : 0 },
        tx,
      );

      const refreshed = await this.assignmentRepo.findById(args.assignmentId, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SUBMISSION_SUBMITTED,
        eventType: 'AssignmentSubmissionSubmitted',
        aggregateType: 'AssignmentSubmission',
        aggregateId: created.id,
        payload: {
          id: created.id,
          assignmentId: args.assignmentId,
          studentId: args.studentId,
          isLate,
          status,
        },
      });

      await this.audit.record(
        {
          action: 'assignment-submission.create',
          category: 'general',
          resourceType: 'AssignmentSubmission',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Submission created id=${created.id} assignment=${args.assignmentId} student=${args.studentId} late=${isLate}.`,
      );

      return { submission: created, assignment: refreshed ?? assignment };
    });

    await this.dispatchLifecycleNotification(
      result.submission,
      result.assignment,
      'ASSIGNMENT_SUBMITTED',
    );

    return result;
  }

  public async evaluate(
    id: string,
    expectedVersion: number,
    args: EvaluateArgs,
  ): Promise<AssignmentSubmissionRow> {
    await this.assertModuleEnabled();

    const result = await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AssignmentSubmissionNotFoundError(id);

      const assignment = await this.assignmentRepo.findById(current.assignmentId, tx);
      if (assignment === null) {
        throw new AssignmentNotFoundError(current.assignmentId);
      }

      if (args.marksObtained < 0 || args.marksObtained > assignment.maxMarks) {
        throw new AssignmentSubmissionMarksOutOfRangeError(
          args.marksObtained,
          assignment.maxMarks,
        );
      }

      assertSubmissionTransition(id, current.status, 'EVALUATED');

      await assertTenantRefs(tx, current.schoolId, {
        staffIds: [args.evaluatedByStaffId],
      });

      const evaluatedAt = new Date();
      const updated = await this.repo.update(
        id,
        expectedVersion,
        {
          status: 'EVALUATED',
          marksObtained: args.marksObtained,
          evaluatedAt,
          evaluatedByStaffId: args.evaluatedByStaffId,
          evaluationRemarks: args.evaluationRemarks ?? null,
        },
        tx,
      );

      await this.assignmentRepo.bumpCounters(
        current.assignmentId,
        { evaluated: 1 },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SUBMISSION_EVALUATED,
        eventType: 'AssignmentSubmissionEvaluated',
        aggregateType: 'AssignmentSubmission',
        aggregateId: id,
        payload: {
          id,
          assignmentId: current.assignmentId,
          studentId: current.studentId,
          marksObtained: args.marksObtained,
          maxMarks: assignment.maxMarks,
        },
      });

      await this.audit.record(
        {
          action: 'assignment-submission.evaluate',
          category: 'general',
          resourceType: 'AssignmentSubmission',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return { submission: updated, assignment };
    });

    await this.dispatchLifecycleNotification(
      result.submission,
      result.assignment,
      'ASSIGNMENT_EVALUATED',
    );

    return result.submission;
  }

  public async reject(
    id: string,
    expectedVersion: number,
    args: RejectArgs,
  ): Promise<AssignmentSubmissionRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AssignmentSubmissionNotFoundError(id);

      assertSubmissionTransition(id, current.status, 'REJECTED');

      await assertTenantRefs(tx, current.schoolId, {
        staffIds: [args.evaluatedByStaffId],
      });

      const rejectedAt = new Date();
      const updated = await this.repo.update(
        id,
        expectedVersion,
        {
          status: 'REJECTED',
          rejectedAt,
          rejectionReason: args.rejectionReason,
          evaluatedByStaffId: args.evaluatedByStaffId,
          evaluatedAt: rejectedAt,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SUBMISSION_REJECTED,
        eventType: 'AssignmentSubmissionRejected',
        aggregateType: 'AssignmentSubmission',
        aggregateId: id,
        payload: {
          id,
          assignmentId: current.assignmentId,
          studentId: current.studentId,
          reason: args.rejectionReason,
        },
      });

      await this.audit.record(
        {
          action: 'assignment-submission.reject',
          category: 'general',
          resourceType: 'AssignmentSubmission',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Submission ${id} rejected.`);
      return updated;
    });
  }

  private async dispatchLifecycleNotification(
    submission: AssignmentSubmissionRow,
    assignment: AssignmentRow,
    key: keyof typeof AcademicContentNotificationEventKeys,
  ): Promise<void> {
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.NOTIFY_ON_LIFECYCLE,
      { schoolId: submission.schoolId },
    );
    if (!enabled) return;

    try {
      if (key === 'ASSIGNMENT_SUBMITTED') {
        // Notify the staff who teaches the section's subject — for v1, ping
        // the assignment's assignedByStaffId.
        await this.dispatcher.dispatch({
          eventKey: AcademicContentNotificationEventKeys.ASSIGNMENT_SUBMITTED,
          schoolId: submission.schoolId,
          recipients: [{ userId: assignment.assignedByStaffId }],
          variables: {
            assignmentId: assignment.id,
            assignmentCode: assignment.code,
            assignmentTitle: assignment.title,
            studentId: submission.studentId,
            submissionId: submission.id,
            isLate: submission.isLate,
          },
          aggregateType: 'AssignmentSubmission',
          aggregateId: submission.id,
        });
      } else if (key === 'ASSIGNMENT_EVALUATED') {
        // Notify the student.
        await this.dispatcher.dispatch({
          eventKey: AcademicContentNotificationEventKeys.ASSIGNMENT_EVALUATED,
          schoolId: submission.schoolId,
          recipients: [{ userId: submission.studentId }],
          variables: {
            assignmentId: assignment.id,
            assignmentCode: assignment.code,
            assignmentTitle: assignment.title,
            submissionId: submission.id,
            marksObtained: submission.marksObtained ?? 0,
            maxMarks: assignment.maxMarks,
          },
          aggregateType: 'AssignmentSubmission',
          aggregateId: submission.id,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Lifecycle notification ${key} for submission=${submission.id} failed: ${(err as Error).message}`,
      );
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AssignmentSubmissionService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new AcademicContentModuleDisabledError();
  }
}
