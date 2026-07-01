/**
 * HomeworkService — orchestration for Homework header + lifecycle.
 *
 * Validation gates:
 *   1. `module.academic-content` feature flag.
 *   2. Date range validity (`dueDate >= assignedDate`).
 *   3. Duplicate-code guard (active rows only).
 *   4. Cross-tenant FK guard via shared `assertTenantRefs`.
 *   5. State-machine `assertHomeworkTransition` on every lifecycle endpoint.
 *   6. Field-editability whitelist (`HOMEWORK_EDITABLE_FIELDS_POST_DRAFT`).
 *   7. Soft-delete refused if PUBLISHED (cancel first).
 *
 * Every mutation publishes a `homework.*` outbox event + writes a general-
 * category audit row inside the same tx. Notification dispatch is invoked
 * AFTER the business tx commits (dispatcher opens its own tx). Sequence
 * allocation (`SEQ_NAMES.HOMEWORK`) shares the business tx so a rolled-back
 * create does NOT burn a number.
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
  ContentDateRangeInvalidError,
  HomeworkNotEditableError,
  HomeworkNotFoundError,
  DuplicateHomeworkCodeError,
} from '../academic-content.errors';
import type { HomeworkRow } from '../academic-content.types';
import {
  TERMINAL_CONTENT_STATUSES,
  assertHomeworkFieldEditable,
  assertHomeworkTransition,
} from '../state-machine';
import { assertTenantRefs } from '../tenant-refs';
import {
  HomeworkRepository,
  type CreateHomeworkInput,
  type ListHomeworkArgs,
  type UpdateHomeworkInput,
} from './homework.repository';

export interface CreateHomeworkArgs extends Omit<CreateHomeworkInput, 'code'> {
  readonly code?: string;
}

export type UpdateHomeworkArgs = UpdateHomeworkInput;

@Injectable()
export class HomeworkService {
  private readonly logger = new Logger(HomeworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HomeworkRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly dispatcher: NotificationEventDispatcherService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  public async list(args: ListHomeworkArgs): Promise<{
    readonly items: readonly HomeworkRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<HomeworkRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new HomeworkNotFoundError(id);
    return row;
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  public async create(args: CreateHomeworkArgs): Promise<HomeworkRow> {
    await this.assertModuleEnabled();
    this.assertDateRange(args.assignedDate, args.dueDate);

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
      if (dup !== null) throw new DuplicateHomeworkCodeError(code);

      const created = await this.repo.create({ ...args, code }, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.HOMEWORK_CREATED,
        eventType: 'HomeworkCreated',
        aggregateType: 'Homework',
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
          action: 'homework.create',
          category: 'general',
          resourceType: 'Homework',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Homework created id=${created.id} code="${created.code}".`);
      return created;
    });
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateHomeworkArgs,
  ): Promise<HomeworkRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new HomeworkNotFoundError(id);

      for (const key of Object.keys(args)) {
        const value = (args as Record<string, unknown>)[key];
        if (value === undefined) continue;
        assertHomeworkFieldEditable(id, current.status, key);
      }

      const assignedDate = args.assignedDate ?? current.assignedDate;
      const dueDate = args.dueDate ?? current.dueDate;
      this.assertDateRange(assignedDate, dueDate);

      const updated = await this.repo.update(id, expectedVersion, args, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.HOMEWORK_UPDATED,
        eventType: 'HomeworkUpdated',
        aggregateType: 'Homework',
        aggregateId: id,
        payload: { id, code: updated.code, title: updated.title },
      });

      await this.audit.record(
        {
          action: 'homework.update',
          category: 'general',
          resourceType: 'Homework',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle: publish (dispatches HOMEWORK_PUBLISHED notification)
  // -------------------------------------------------------------------------
  public async publish(id: string, expectedVersion: number): Promise<HomeworkRow> {
    await this.assertPublishAllowed();
    const result = await this.transitionStatus({
      id,
      expectedVersion,
      to: 'PUBLISHED',
      topic: AcademicContentOutboxTopics.HOMEWORK_PUBLISHED,
      action: 'homework.publish',
      patchExtra: { publishedAt: new Date() },
    });
    await this.dispatchLifecycleNotification(result, 'HOMEWORK_PUBLISHED');
    return result;
  }

  // -------------------------------------------------------------------------
  // Lifecycle: close (dispatches HOMEWORK_CLOSED notification)
  // -------------------------------------------------------------------------
  public async close(id: string, expectedVersion: number): Promise<HomeworkRow> {
    const result = await this.transitionStatus({
      id,
      expectedVersion,
      to: 'CLOSED',
      topic: AcademicContentOutboxTopics.HOMEWORK_CLOSED,
      action: 'homework.close',
      patchExtra: { closedAt: new Date() },
    });
    await this.dispatchLifecycleNotification(result, 'HOMEWORK_CLOSED');
    return result;
  }

  // -------------------------------------------------------------------------
  // Lifecycle: cancel (any non-terminal → CANCELLED). No notification fan-out
  // — cancellation is teacher-side housekeeping; students are not notified
  // until the future Portal sprint decides otherwise.
  // -------------------------------------------------------------------------
  public async cancel(
    id: string,
    expectedVersion: number,
    reason: string | null,
  ): Promise<HomeworkRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new HomeworkNotFoundError(id);
      if (TERMINAL_CONTENT_STATUSES.has(current.status)) {
        throw new HomeworkNotEditableError(id, current.status, '<cancel>');
      }
      assertHomeworkTransition(id, current.status, 'CANCELLED');

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
        topic: AcademicContentOutboxTopics.HOMEWORK_CANCELLED,
        eventType: 'HomeworkCancelled',
        aggregateType: 'Homework',
        aggregateId: id,
        payload: { id, code: updated.code, reason },
      });

      await this.audit.record(
        {
          action: 'homework.cancel',
          category: 'general',
          resourceType: 'Homework',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Homework cancelled id=${id}.`);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Soft-delete (refused if PUBLISHED — must cancel first)
  // -------------------------------------------------------------------------
  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new HomeworkNotFoundError(id);

      if (current.status === 'PUBLISHED') {
        throw new HomeworkNotEditableError(id, current.status, '<delete>');
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.HOMEWORK_DELETED,
        eventType: 'HomeworkDeleted',
        aggregateType: 'Homework',
        aggregateId: id,
        payload: { id, code: current.code },
      });

      await this.audit.record(
        {
          action: 'homework.delete',
          category: 'general',
          resourceType: 'Homework',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------------
  // Shared transition helper
  // -------------------------------------------------------------------------
  private async transitionStatus(opts: {
    readonly id: string;
    readonly expectedVersion: number;
    readonly to: ContentStatusValue;
    readonly topic: string;
    readonly action: string;
    readonly patchExtra?: Record<string, unknown>;
  }): Promise<HomeworkRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(opts.id, tx);
      if (current === null) throw new HomeworkNotFoundError(opts.id);
      assertHomeworkTransition(opts.id, current.status, opts.to);

      const updated = await this.repo.patchStatus(
        opts.id,
        opts.expectedVersion,
        { status: opts.to, ...(opts.patchExtra ?? {}) },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: opts.topic,
        eventType: this.outboxEventType(opts.to),
        aggregateType: 'Homework',
        aggregateId: opts.id,
        payload: { id: opts.id, code: updated.code, status: updated.status },
      });

      await this.audit.record(
        {
          action: opts.action,
          category: 'general',
          resourceType: 'Homework',
          resourceId: opts.id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Homework ${opts.id} transitioned ${current.status} → ${opts.to}.`,
      );
      return updated;
    });
  }

  private outboxEventType(to: ContentStatusValue): string {
    switch (to) {
      case 'PUBLISHED':
        return 'HomeworkPublished';
      case 'CLOSED':
        return 'HomeworkClosed';
      case 'CANCELLED':
        return 'HomeworkCancelled';
      default:
        return 'HomeworkUpdated';
    }
  }

  // -------------------------------------------------------------------------
  // Notification dispatch — invoked AFTER the business tx commits.
  // Recipients: all ACTIVE students in the target section. studentId is used
  // as userId placeholder until the Portal sprint wires real user accounts
  // (mirrors EventParticipantService's student→user mapping).
  // -------------------------------------------------------------------------
  private async dispatchLifecycleNotification(
    homework: HomeworkRow,
    key: keyof typeof AcademicContentNotificationEventKeys,
  ): Promise<void> {
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.NOTIFY_ON_LIFECYCLE,
      { schoolId: homework.schoolId },
    );
    if (!enabled) return;

    try {
      const students = await this.prisma.client.student.findMany({
        where: {
          schoolId: homework.schoolId,
          sectionId: homework.sectionId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (students.length === 0) {
        this.logger.debug(
          `Skipping lifecycle notification ${key} for homework=${homework.id}: no active students in section ${homework.sectionId}.`,
        );
        return;
      }

      await this.dispatcher.dispatch({
        eventKey: AcademicContentNotificationEventKeys[key],
        schoolId: homework.schoolId,
        recipients: students.map((s) => ({ userId: s.id })),
        variables: {
          homeworkId: homework.id,
          homeworkCode: homework.code,
          homeworkTitle: homework.title,
          sectionId: homework.sectionId,
          subjectId: homework.subjectId,
          dueDate: homework.dueDate.toISOString().slice(0, 10),
        },
        aggregateType: 'Homework',
        aggregateId: homework.id,
      });
    } catch (err) {
      this.logger.warn(
        `Lifecycle notification ${key} for homework=${homework.id} failed: ${(err as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.HOMEWORK, { tx });
    return `HW-${seq.toString().padStart(6, '0')}`;
  }

  private assertDateRange(assigned: Date | string, due: Date | string): void {
    const a = typeof assigned === 'string' ? new Date(assigned) : assigned;
    const d = typeof due === 'string' ? new Date(due) : due;
    if (d.getTime() < a.getTime()) {
      throw new ContentDateRangeInvalidError(
        'Homework',
        typeof assigned === 'string' ? assigned : a.toISOString().slice(0, 10),
        typeof due === 'string' ? due : d.toISOString().slice(0, 10),
      );
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('HomeworkService requires tenant scope.');
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
      AcademicContentFeatureFlags.ALLOW_HOMEWORK_PUBLISH,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new HomeworkNotEditableError('<n/a>', 'DRAFT', 'publish');
    }
  }
}

export type { CreateHomeworkInput, ListHomeworkArgs, UpdateHomeworkInput };
