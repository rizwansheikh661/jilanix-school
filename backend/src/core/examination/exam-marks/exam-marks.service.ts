/**
 * ExamMarksService — single + bulk marks entry with the full rule set:
 *
 *   1. `module.examination` flag gate.
 *   2. Exam must exist and not be ARCHIVED.
 *   3. Marks bounds: 0 <= marksObtained <= scheduleMaxMarks
 *      (or exam.defaultMaxMarks when no schedule row exists for the
 *      (subject, section)). Bypassed when `examination.allow_overscore`
 *      feature flag is enabled.
 *   4. Absent invariant: `isAbsent=true` → `marksObtained === null`.
 *   5. Edit window: now - row.enteredAt > scheme.marksEditWindowDays
 *      → 409 EDIT_WINDOW_EXPIRED. Window read from Exam's scheme.
 *   6. Append-only history written in same tx for every mutation
 *      (create/update/delete).
 *   7. Bulk PUT: optimistic-lock on the latest row version for the
 *      (section, subject) batch — mismatch = 409 VERSION_CONFLICT.
 *      Bulk cap 500 entries.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import {
  EXAM_MARKS_BULK_MAX,
  ExaminationFeatureFlags,
  ExaminationOutboxTopics,
} from '../examination.constants';
import {
  BulkLimitExceededError,
  ExamArchivedError,
  ExamMarksAbsentInvariantError,
  ExamMarksEditWindowExpiredError,
  ExamMarksNotFoundError,
  ExamMarksOutOfRangeError,
  ExamMarksVersionConflictError,
  ExamNotFoundError,
  ExamSchemeNotFoundError,
  ExaminationModuleDisabledError,
} from '../examination.errors';
import type { ExamMarksRow } from '../examination.types';
import { ExamDefinitionRepository } from '../exam-definition/exam-definition.repository';
import { ExamScheduleRepository } from '../exam-schedule/exam-schedule.repository';
import { ExamSchemeRepository } from '../exam-scheme/exam-scheme.repository';
import { ExamMarksHistoryRepository } from '../exam-marks-history/exam-marks-history.repository';
import { ExamMarksRepository } from './exam-marks.repository';

export interface UpsertMarksArgs {
  readonly studentId: string;
  readonly subjectId: string;
  readonly sectionId: string;
  readonly marksObtained: number | null;
  readonly isAbsent: boolean;
  readonly remarks?: string | null;
}

export interface BulkMarksEntryArgs {
  readonly studentId: string;
  readonly marksObtained: number | null;
  readonly isAbsent: boolean;
  readonly remarks?: string | null;
}

export interface BulkMarksArgs {
  readonly sectionId: string;
  readonly subjectId: string;
  readonly version: number;
  readonly entries: readonly BulkMarksEntryArgs[];
}

export interface MarksListArgs {
  readonly sectionId?: string;
  readonly subjectId?: string;
  readonly studentId?: string;
}

@Injectable()
export class ExamMarksService {
  private readonly logger = new Logger(ExamMarksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ExamMarksRepository,
    private readonly historyRepo: ExamMarksHistoryRepository,
    private readonly examRepo: ExamDefinitionRepository,
    private readonly schemeRepo: ExamSchemeRepository,
    private readonly scheduleRepo: ExamScheduleRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(
    examId: string,
    args: MarksListArgs,
  ): Promise<readonly ExamMarksRow[]> {
    return this.repo.list({
      examId,
      ...(args.sectionId !== undefined ? { sectionId: args.sectionId } : {}),
      ...(args.subjectId !== undefined ? { subjectId: args.subjectId } : {}),
      ...(args.studentId !== undefined ? { studentId: args.studentId } : {}),
    });
  }

  public async upsert(examId: string, args: UpsertMarksArgs): Promise<ExamMarksRow> {
    await this.assertModuleEnabled();
    this.assertAbsentInvariant(args.marksObtained, args.isAbsent);

    const ctx = RequestContextRegistry.require();
    const userId = ctx.userId ?? null;

    return this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);

      const maxMarks = await this.resolveMaxMarks(
        examId,
        args.subjectId,
        args.sectionId,
        exam.defaultMaxMarks,
        tx,
      );
      await this.assertMarksBounds(args.marksObtained, maxMarks, ctx.schoolId ?? null);

      const existing = await this.repo.findActiveBySlot(
        examId,
        args.studentId,
        args.subjectId,
        tx,
      );

      const now = new Date();
      if (existing === null) {
        const created = await this.repo.create(
          {
            examId,
            studentId: args.studentId,
            subjectId: args.subjectId,
            sectionId: args.sectionId,
            marksObtained: args.marksObtained,
            isAbsent: args.isAbsent,
            remarks: args.remarks ?? null,
            enteredAt: now,
            enteredBy: userId,
          },
          tx,
        );
        await this.historyRepo.append(
          {
            examMarksId: created.id,
            previousMarks: null,
            newMarks: created.marksObtained,
            previousIsAbsent: false,
            newIsAbsent: created.isAbsent,
            changeType: 'ENTERED',
            changedBy: userId,
            changedAt: now,
            reason: null,
          },
          tx,
        );
        await this.publishMarksEvent(tx, examId, created, 'entered');
        await this.audit.record(
          {
            action: 'exam_marks.create',
            category: 'general',
            resourceType: 'ExamMarks',
            resourceId: created.id,
            after: created,
          },
          { tx: tx as unknown as AuditTxLike },
        );
        return created;
      }

      await this.assertEditWindow(existing.enteredAt, exam.examSchemeId, tx);
      const updated = await this.repo.update(
        existing.id,
        existing.version,
        {
          marksObtained: args.marksObtained,
          isAbsent: args.isAbsent,
          remarks: args.remarks ?? null,
        },
        tx,
      );
      await this.historyRepo.append(
        {
          examMarksId: updated.id,
          previousMarks: existing.marksObtained,
          newMarks: updated.marksObtained,
          previousIsAbsent: existing.isAbsent,
          newIsAbsent: updated.isAbsent,
          changeType: 'EDITED',
          changedBy: userId,
          changedAt: now,
          reason: null,
        },
        tx,
      );
      await this.publishMarksEvent(tx, examId, updated, 'updated');
      await this.audit.record(
        {
          action: 'exam_marks.update',
          category: 'general',
          resourceType: 'ExamMarks',
          resourceId: updated.id,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  /**
   * Bulk-replace marks for (sectionId, subjectId). Body carries the
   * latest known `version` of any marks row in that batch — if the actual
   * max-version on disk differs, we treat that as a stale read and refuse.
   */
  public async bulkUpsert(
    examId: string,
    args: BulkMarksArgs,
  ): Promise<{ readonly entries: readonly ExamMarksRow[] }> {
    await this.assertModuleEnabled();
    if (args.entries.length > EXAM_MARKS_BULK_MAX) {
      throw new BulkLimitExceededError(EXAM_MARKS_BULK_MAX, args.entries.length);
    }

    const ctx = RequestContextRegistry.require();
    const userId = ctx.userId ?? null;

    return this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);

      // Optimistic-lock: ensure no row in this batch has been updated past
      // the supplied version. Treat `version` in body as the max version
      // the client believes exists.
      const existingRows = await this.repo.list(
        { examId, sectionId: args.sectionId, subjectId: args.subjectId },
        tx,
      );
      const currentMaxVersion = existingRows.reduce(
        (acc, r) => (r.version > acc ? r.version : acc),
        0,
      );
      if (existingRows.length > 0 && currentMaxVersion !== args.version) {
        throw new ExamMarksVersionConflictError(
          examId,
          args.sectionId,
          args.subjectId,
        );
      }

      const maxMarks = await this.resolveMaxMarks(
        examId,
        args.subjectId,
        args.sectionId,
        exam.defaultMaxMarks,
        tx,
      );
      const out: ExamMarksRow[] = [];
      const now = new Date();
      const byStudent = new Map<string, ExamMarksRow>();
      for (const r of existingRows) byStudent.set(r.studentId, r);

      for (const entry of args.entries) {
        this.assertAbsentInvariant(entry.marksObtained, entry.isAbsent);
        await this.assertMarksBounds(
          entry.marksObtained,
          maxMarks,
          ctx.schoolId ?? null,
        );

        const existing = byStudent.get(entry.studentId);
        if (existing === undefined) {
          const created = await this.repo.create(
            {
              examId,
              studentId: entry.studentId,
              subjectId: args.subjectId,
              sectionId: args.sectionId,
              marksObtained: entry.marksObtained,
              isAbsent: entry.isAbsent,
              remarks: entry.remarks ?? null,
              enteredAt: now,
              enteredBy: userId,
            },
            tx,
          );
          await this.historyRepo.append(
            {
              examMarksId: created.id,
              previousMarks: null,
              newMarks: created.marksObtained,
              previousIsAbsent: false,
              newIsAbsent: created.isAbsent,
              changeType: 'ENTERED',
              changedBy: userId,
              changedAt: now,
              reason: null,
            },
            tx,
          );
          out.push(created);
        } else {
          await this.assertEditWindow(existing.enteredAt, exam.examSchemeId, tx);
          const updated = await this.repo.update(
            existing.id,
            existing.version,
            {
              marksObtained: entry.marksObtained,
              isAbsent: entry.isAbsent,
              remarks: entry.remarks ?? null,
            },
            tx,
          );
          await this.historyRepo.append(
            {
              examMarksId: updated.id,
              previousMarks: existing.marksObtained,
              newMarks: updated.marksObtained,
              previousIsAbsent: existing.isAbsent,
              newIsAbsent: updated.isAbsent,
              changeType: 'EDITED',
              changedBy: userId,
              changedAt: now,
              reason: null,
            },
            tx,
          );
          out.push(updated);
        }
      }

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.MARKS_BULK_UPDATED,
        eventType: 'ExamMarksBulkUpdated',
        aggregateType: 'Exam',
        aggregateId: examId,
        payload: {
          examId,
          sectionId: args.sectionId,
          subjectId: args.subjectId,
          count: out.length,
        },
      });
      await this.audit.record(
        {
          action: 'exam_marks.bulk_update',
          category: 'general',
          resourceType: 'Exam',
          resourceId: examId,
          after: {
            examId,
            sectionId: args.sectionId,
            subjectId: args.subjectId,
            count: out.length,
          } as unknown as Record<string, unknown>,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Bulk marks examId=${examId} section=${args.sectionId} subject=${args.subjectId} count=${out.length}.`,
      );
      return { entries: out };
    });
  }

  public async softDelete(
    examId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    const ctx = RequestContextRegistry.require();
    const userId = ctx.userId ?? null;
    await this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamMarksNotFoundError(id);
      if (current.examId !== examId) throw new ExamMarksNotFoundError(id);

      await this.assertEditWindow(current.enteredAt, exam.examSchemeId, tx);

      await this.repo.softDelete(id, expectedVersion, tx);
      const now = new Date();
      await this.historyRepo.append(
        {
          examMarksId: id,
          previousMarks: current.marksObtained,
          newMarks: null,
          previousIsAbsent: current.isAbsent,
          newIsAbsent: false,
          changeType: 'DELETED',
          changedBy: userId,
          changedAt: now,
          reason: null,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.MARKS_DELETED,
        eventType: 'ExamMarksDeleted',
        aggregateType: 'ExamMarks',
        aggregateId: id,
        payload: { id, examId },
      });
      await this.audit.record(
        {
          action: 'exam_marks.delete',
          category: 'general',
          resourceType: 'ExamMarks',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private async resolveMaxMarks(
    examId: string,
    subjectId: string,
    sectionId: string,
    fallback: number,
    tx: PrismaTx,
  ): Promise<number> {
    const schedule = await this.scheduleRepo.findActiveBySlot(
      examId,
      subjectId,
      sectionId,
      tx,
    );
    return schedule === null ? fallback : schedule.maxMarks;
  }

  private async assertMarksBounds(
    value: number | null,
    maxMarks: number,
    schoolId: string | null,
  ): Promise<void> {
    if (value === null) return;
    if (!Number.isFinite(value) || value < 0) {
      throw new ExamMarksOutOfRangeError(`marksObtained must be >= 0; got ${value}`);
    }
    if (value > maxMarks) {
      const allowOverscore = await this.featureFlags.isEnabled(
        ExaminationFeatureFlags.ALLOW_OVERSCORE,
        { schoolId },
      );
      if (!allowOverscore) {
        throw new ExamMarksOutOfRangeError(
          `marksObtained ${value} exceeds maxMarks ${maxMarks}`,
        );
      }
    }
  }

  private assertAbsentInvariant(value: number | null, isAbsent: boolean): void {
    if (isAbsent && value !== null) {
      throw new ExamMarksAbsentInvariantError();
    }
  }

  private async assertEditWindow(
    enteredAt: Date,
    examSchemeId: string,
    tx: PrismaTx,
  ): Promise<void> {
    const scheme = await this.schemeRepo.findById(examSchemeId, tx);
    if (scheme === null) throw new ExamSchemeNotFoundError(examSchemeId);
    const windowMs = scheme.marksEditWindowDays * 24 * 60 * 60 * 1000;
    const delta = Date.now() - enteredAt.getTime();
    if (delta > windowMs) {
      throw new ExamMarksEditWindowExpiredError(enteredAt, scheme.marksEditWindowDays);
    }
  }

  private async publishMarksEvent(
    tx: PrismaTx,
    examId: string,
    row: ExamMarksRow,
    kind: 'entered' | 'updated',
  ): Promise<void> {
    const topic =
      kind === 'entered'
        ? ExaminationOutboxTopics.MARKS_ENTERED
        : ExaminationOutboxTopics.MARKS_UPDATED;
    const eventType = kind === 'entered' ? 'ExamMarksEntered' : 'ExamMarksUpdated';
    await this.outbox.publish(tx, {
      topic,
      eventType,
      aggregateType: 'ExamMarks',
      aggregateId: row.id,
      payload: {
        id: row.id,
        examId,
        studentId: row.studentId,
        subjectId: row.subjectId,
        sectionId: row.sectionId,
      },
    });
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ExaminationFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ExaminationModuleDisabledError();
  }
}
