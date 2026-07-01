/**
 * AssignmentService — orchestration for Assignment header + lifecycle.
 *
 * Mirrors HomeworkService with marks-specific validation:
 *   - `passingMarks <= maxMarks` enforced at create + update.
 *   - PATCH whitelist after publish: dueDate + description only.
 *   - Soft-delete refused if PUBLISHED (cancel first).
 *
 * Outbox + audit happen in the same business tx. Notification dispatch is
 * invoked AFTER commit (dispatcher opens its own tx). Sequence allocation
 * (`SEQ_NAMES.ASSIGNMENT`) shares the business tx so a rolled-back create
 * does NOT burn a number.
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
import { SEQ_NAMES, SequenceService } from '../../sequences';
import {
  AcademicContentFeatureFlags,
  AcademicContentNotificationEventKeys,
  AcademicContentOutboxTopics,
  type ContentStatusValue,
} from '../academic-content.constants';
import {
  AcademicContentModuleDisabledError,
  AssignmentMarksInvalidError,
  AssignmentNotEditableError,
  AssignmentNotFoundError,
  ContentDateRangeInvalidError,
  DuplicateAssignmentCodeError,
} from '../academic-content.errors';
import type { AssignmentRow } from '../academic-content.types';
import {
  TERMINAL_CONTENT_STATUSES,
  assertAssignmentFieldEditable,
  assertAssignmentTransition,
} from '../state-machine';
import { assertTenantRefs } from '../tenant-refs';
import {
  AssignmentRepository,
  type CreateAssignmentInput,
  type ListAssignmentArgs,
  type UpdateAssignmentInput,
} from './assignment.repository';

export interface CreateAssignmentArgs extends Omit<CreateAssignmentInput, 'code'> {
  readonly code?: string;
}

export type UpdateAssignmentArgs = UpdateAssignmentInput;

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AssignmentRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly dispatcher: NotificationEventDispatcherService,
  ) {}

  public async list(args: ListAssignmentArgs): Promise<{
    readonly items: readonly AssignmentRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AssignmentRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new AssignmentNotFoundError(id);
    return row;
  }

  public async create(args: CreateAssignmentArgs): Promise<AssignmentRow> {
    await this.assertModuleEnabled();
    this.assertDateRange(args.assignedDate, args.dueDate);
    this.assertMarks(args.maxMarks, args.passingMarks);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      await assertTenantRefs(tx, schoolId, {
        academicYearIds: [args.academicYearId],
        classIds: [args.classId],
        sectionIds: [args.sectionId],
        subjectIds: [args.subjectId],
        staffIds: [args.assignedByStaffId],
      });

      const code = args.code ?? (await this.allocateCode(tx));
      const dup = await this.repo.findActiveByCode(code, tx);
      if (dup !== null) throw new DuplicateAssignmentCodeError(code);

      const created = await this.repo.create({ ...args, code }, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.ASSIGNMENT_CREATED,
        eventType: 'AssignmentCreated',
        aggregateType: 'Assignment',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          title: created.title,
          sectionId: created.sectionId,
          subjectId: created.subjectId,
        },
      });

      await this.audit.record(
        {
          action: 'assignment.create',
          category: 'general',
          resourceType: 'Assignment',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Assignment created id=${created.id} code="${created.code}".`);
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateAssignmentArgs,
  ): Promise<AssignmentRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AssignmentNotFoundError(id);

      for (const key of Object.keys(args)) {
        const value = (args as Record<string, unknown>)[key];
        if (value === undefined) continue;
        assertAssignmentFieldEditable(id, current.status, key);
      }

      const assignedDate = args.assignedDate ?? current.assignedDate;
      const dueDate = args.dueDate ?? current.dueDate;
      this.assertDateRange(assignedDate, dueDate);

      const maxMarks = args.maxMarks ?? current.maxMarks;
      const passingMarks = args.passingMarks ?? current.passingMarks;
      this.assertMarks(maxMarks, passingMarks);

      const updated = await this.repo.update(id, expectedVersion, args, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.ASSIGNMENT_UPDATED,
        eventType: 'AssignmentUpdated',
        aggregateType: 'Assignment',
        aggregateId: id,
        payload: { id, code: updated.code, title: updated.title },
      });

      await this.audit.record(
        {
          action: 'assignment.update',
          category: 'general',
          resourceType: 'Assignment',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async publish(id: string, expectedVersion: number): Promise<AssignmentRow> {
    await this.assertPublishAllowed();
    const result = await this.transitionStatus({
      id,
      expectedVersion,
      to: 'PUBLISHED',
      topic: AcademicContentOutboxTopics.ASSIGNMENT_PUBLISHED,
      action: 'assignment.publish',
      patchExtra: { publishedAt: new Date() },
    });
    await this.dispatchLifecycleNotification(result, 'ASSIGNMENT_PUBLISHED');
    return result;
  }

  public async close(id: string, expectedVersion: number): Promise<AssignmentRow> {
    return this.transitionStatus({
      id,
      expectedVersion,
      to: 'CLOSED',
      topic: AcademicContentOutboxTopics.ASSIGNMENT_CLOSED,
      action: 'assignment.close',
      patchExtra: { closedAt: new Date() },
    });
  }

  public async cancel(
    id: string,
    expectedVersion: number,
    reason: string | null,
  ): Promise<AssignmentRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AssignmentNotFoundError(id);
      if (TERMINAL_CONTENT_STATUSES.has(current.status)) {
        throw new AssignmentNotEditableError(id, current.status, '<cancel>');
      }
      assertAssignmentTransition(id, current.status, 'CANCELLED');

      const updated = await this.repo.patchStatus(
        id,
        expectedVersion,
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.ASSIGNMENT_CANCELLED,
        eventType: 'AssignmentCancelled',
        aggregateType: 'Assignment',
        aggregateId: id,
        payload: { id, code: updated.code, reason },
      });

      await this.audit.record(
        {
          action: 'assignment.cancel',
          category: 'general',
          resourceType: 'Assignment',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Assignment cancelled id=${id}.`);
      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AssignmentNotFoundError(id);

      if (current.status === 'PUBLISHED') {
        throw new AssignmentNotEditableError(id, current.status, '<delete>');
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.ASSIGNMENT_DELETED,
        eventType: 'AssignmentDeleted',
        aggregateType: 'Assignment',
        aggregateId: id,
        payload: { id, code: current.code },
      });

      await this.audit.record(
        {
          action: 'assignment.delete',
          category: 'general',
          resourceType: 'Assignment',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  private async transitionStatus(opts: {
    readonly id: string;
    readonly expectedVersion: number;
    readonly to: ContentStatusValue;
    readonly topic: string;
    readonly action: string;
    readonly patchExtra?: Record<string, unknown>;
  }): Promise<AssignmentRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(opts.id, tx);
      if (current === null) throw new AssignmentNotFoundError(opts.id);
      assertAssignmentTransition(opts.id, current.status, opts.to);

      const updated = await this.repo.patchStatus(
        opts.id,
        opts.expectedVersion,
        { status: opts.to, ...(opts.patchExtra ?? {}) },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: opts.topic,
        eventType: this.outboxEventType(opts.to),
        aggregateType: 'Assignment',
        aggregateId: opts.id,
        payload: { id: opts.id, code: updated.code, status: updated.status },
      });

      await this.audit.record(
        {
          action: opts.action,
          category: 'general',
          resourceType: 'Assignment',
          resourceId: opts.id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Assignment ${opts.id} transitioned ${current.status} → ${opts.to}.`,
      );
      return updated;
    });
  }

  private outboxEventType(to: ContentStatusValue): string {
    switch (to) {
      case 'PUBLISHED':
        return 'AssignmentPublished';
      case 'CLOSED':
        return 'AssignmentClosed';
      case 'CANCELLED':
        return 'AssignmentCancelled';
      default:
        return 'AssignmentUpdated';
    }
  }

  private async dispatchLifecycleNotification(
    assignment: AssignmentRow,
    key: keyof typeof AcademicContentNotificationEventKeys,
  ): Promise<void> {
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.NOTIFY_ON_LIFECYCLE,
      { schoolId: assignment.schoolId },
    );
    if (!enabled) return;

    try {
      const students = await this.prisma.client.student.findMany({
        where: {
          schoolId: assignment.schoolId,
          sectionId: assignment.sectionId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (students.length === 0) {
        this.logger.debug(
          `Skipping lifecycle notification ${key} for assignment=${assignment.id}: no active students in section ${assignment.sectionId}.`,
        );
        return;
      }

      await this.dispatcher.dispatch({
        eventKey: AcademicContentNotificationEventKeys[key],
        schoolId: assignment.schoolId,
        recipients: students.map((s) => ({ userId: s.id })),
        variables: {
          assignmentId: assignment.id,
          assignmentCode: assignment.code,
          assignmentTitle: assignment.title,
          sectionId: assignment.sectionId,
          subjectId: assignment.subjectId,
          dueDate: assignment.dueDate.toISOString().slice(0, 10),
          maxMarks: assignment.maxMarks,
        },
        aggregateType: 'Assignment',
        aggregateId: assignment.id,
      });
    } catch (err) {
      this.logger.warn(
        `Lifecycle notification ${key} for assignment=${assignment.id} failed: ${(err as Error).message}`,
      );
    }
  }

  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.ASSIGNMENT, { tx });
    return `ASGN-${seq.toString().padStart(6, '0')}`;
  }

  private assertDateRange(assigned: Date | string, due: Date | string): void {
    const a = typeof assigned === 'string' ? new Date(assigned) : assigned;
    const d = typeof due === 'string' ? new Date(due) : due;
    if (d.getTime() < a.getTime()) {
      throw new ContentDateRangeInvalidError(
        'Assignment',
        typeof assigned === 'string' ? assigned : a.toISOString().slice(0, 10),
        typeof due === 'string' ? due : d.toISOString().slice(0, 10),
      );
    }
  }

  private assertMarks(maxMarks: number, passingMarks: number): void {
    if (passingMarks > maxMarks) {
      throw new AssignmentMarksInvalidError(maxMarks, passingMarks);
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AssignmentService requires tenant scope.');
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

  private async assertPublishAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.ALLOW_ASSIGNMENT_PUBLISH,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new AssignmentNotEditableError('<n/a>', 'DRAFT', 'publish');
    }
  }
}

export type { CreateAssignmentInput, ListAssignmentArgs, UpdateAssignmentInput };
