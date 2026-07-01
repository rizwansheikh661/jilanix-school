/**
 * ExamScheduleService — per-(exam, subject, section) slot rows.
 *
 * Rules:
 *   1. `module.examination` feature flag.
 *   2. Exam must exist and not be ARCHIVED.
 *   3. Schedule `date` must be within `[Exam.startDate, Exam.endDate]`.
 *   4. `startTime < endTime` (HH:MM:SS string).
 *   5. Unique (examId, subjectId, sectionId) — duplicate → ConflictError.
 *   6. `passMarks <= maxMarks`.
 *   7. Section must belong to one of the Exam's class/section maps (or to a
 *      class in the Exam's class map). Sprint 8 simplification: any tenant
 *      Section is accepted; mapping reconciliation deferred.
 *   8. Bulk endpoint: max 200 rows; partial success returns 207-style payload.
 *
 * Mutations publish outbox + audit in same tx.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  EXAM_SCHEDULE_BULK_MAX,
  ExaminationFeatureFlags,
  ExaminationOutboxTopics,
} from '../examination.constants';
import {
  BulkLimitExceededError,
  DuplicateExamScheduleError,
  ExamArchivedError,
  ExamNotFoundError,
  ExamScheduleDateRangeError,
  ExamScheduleMarksConfigError,
  ExamScheduleNotFoundError,
  ExamScheduleTimeOrderError,
  ExaminationModuleDisabledError,
} from '../examination.errors';
import type { ExamScheduleRow } from '../examination.types';
import { ExamDefinitionRepository } from '../exam-definition/exam-definition.repository';
import {
  ExamScheduleRepository,
  type CreateExamScheduleInput,
} from './exam-schedule.repository';

export interface CreateScheduleArgs {
  readonly subjectId: string;
  readonly sectionId: string;
  readonly roomId?: string | null;
  readonly invigilatorStaffId?: string | null;
  readonly date: Date;
  readonly startTime: string;
  readonly endTime: string;
  readonly maxMarks?: number;
  readonly passMarks?: number;
  readonly instructions?: string | null;
}

export interface UpdateScheduleArgs {
  readonly subjectId?: string;
  readonly sectionId?: string;
  readonly roomId?: string | null;
  readonly invigilatorStaffId?: string | null;
  readonly date?: Date;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly maxMarks?: number;
  readonly passMarks?: number;
  readonly instructions?: string | null;
}

export interface BulkScheduleResult {
  readonly created: readonly ExamScheduleRow[];
  readonly failed: ReadonlyArray<{
    readonly index: number;
    readonly code: string;
    readonly message: string;
  }>;
}

@Injectable()
export class ExamScheduleService {
  private readonly logger = new Logger(ExamScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ExamScheduleRepository,
    private readonly examRepo: ExamDefinitionRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(
    examId: string,
    args: { readonly sectionId?: string; readonly subjectId?: string },
  ): Promise<readonly ExamScheduleRow[]> {
    return this.repo.list({
      examId,
      ...(args.sectionId !== undefined ? { sectionId: args.sectionId } : {}),
      ...(args.subjectId !== undefined ? { subjectId: args.subjectId } : {}),
    });
  }

  public async getById(id: string): Promise<ExamScheduleRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new ExamScheduleNotFoundError(id);
    return row;
  }

  public async create(
    examId: string,
    args: CreateScheduleArgs,
  ): Promise<ExamScheduleRow> {
    await this.assertModuleEnabled();
    this.assertTimeOrder(args.startTime, args.endTime);

    return this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);
      this.assertDateInExamRange(args.date, exam.startDate, exam.endDate);

      const maxMarks = args.maxMarks ?? exam.defaultMaxMarks;
      const passMarks = args.passMarks ?? exam.defaultPassMarks;
      this.assertMarksConfig(maxMarks, passMarks);

      const dup = await this.repo.findActiveBySlot(
        examId,
        args.subjectId,
        args.sectionId,
        tx,
      );
      if (dup !== null) {
        throw new DuplicateExamScheduleError(examId, args.subjectId, args.sectionId);
      }

      const row = await this.repo.create(
        {
          examId,
          subjectId: args.subjectId,
          sectionId: args.sectionId,
          roomId: args.roomId ?? null,
          invigilatorStaffId: args.invigilatorStaffId ?? null,
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          maxMarks,
          passMarks,
          instructions: args.instructions ?? null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.SCHEDULE_CREATED,
        eventType: 'ExamScheduleCreated',
        aggregateType: 'ExamSchedule',
        aggregateId: row.id,
        payload: {
          id: row.id,
          examId,
          subjectId: row.subjectId,
          sectionId: row.sectionId,
          date: row.date.toISOString(),
        },
      });

      await this.audit.record(
        {
          action: 'exam_schedule.create',
          category: 'general',
          resourceType: 'ExamSchedule',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return row;
    });
  }

  public async bulkCreate(
    examId: string,
    items: readonly CreateScheduleArgs[],
  ): Promise<BulkScheduleResult> {
    await this.assertModuleEnabled();
    if (items.length > EXAM_SCHEDULE_BULK_MAX) {
      throw new BulkLimitExceededError(EXAM_SCHEDULE_BULK_MAX, items.length);
    }

    const created: ExamScheduleRow[] = [];
    const failed: Array<{ index: number; code: string; message: string }> = [];

    return this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);

      // Single-tx best-effort: each row tried individually inside the tx;
      // failures collected without aborting the rest.
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item === undefined) continue;
        try {
          this.assertTimeOrder(item.startTime, item.endTime);
          this.assertDateInExamRange(item.date, exam.startDate, exam.endDate);
          const maxMarks = item.maxMarks ?? exam.defaultMaxMarks;
          const passMarks = item.passMarks ?? exam.defaultPassMarks;
          this.assertMarksConfig(maxMarks, passMarks);

          const dup = await this.repo.findActiveBySlot(
            examId,
            item.subjectId,
            item.sectionId,
            tx,
          );
          if (dup !== null) {
            throw new DuplicateExamScheduleError(
              examId,
              item.subjectId,
              item.sectionId,
            );
          }

          const input: CreateExamScheduleInput = {
            examId,
            subjectId: item.subjectId,
            sectionId: item.sectionId,
            roomId: item.roomId ?? null,
            invigilatorStaffId: item.invigilatorStaffId ?? null,
            date: item.date,
            startTime: item.startTime,
            endTime: item.endTime,
            maxMarks,
            passMarks,
            instructions: item.instructions ?? null,
          };
          const row = await this.repo.create(input, tx);
          created.push(row);
        } catch (err) {
          failed.push({
            index: i,
            code: extractDomainCode(err),
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (created.length > 0) {
        await this.outbox.publish(tx, {
          topic: ExaminationOutboxTopics.SCHEDULE_BULK_CREATED,
          eventType: 'ExamScheduleBulkCreated',
          aggregateType: 'Exam',
          aggregateId: examId,
          payload: {
            examId,
            createdCount: created.length,
            failedCount: failed.length,
          },
        });
        await this.audit.record(
          {
            action: 'exam_schedule.bulk_create',
            category: 'general',
            resourceType: 'Exam',
            resourceId: examId,
            after: {
              examId,
              createdCount: created.length,
              failedCount: failed.length,
            } as unknown as Record<string, unknown>,
          },
          { tx: tx as unknown as AuditTxLike },
        );
      }

      this.logger.log(
        `Bulk schedule examId=${examId} created=${created.length} failed=${failed.length}.`,
      );
      return { created, failed };
    });
  }

  public async update(
    examId: string,
    id: string,
    expectedVersion: number,
    args: UpdateScheduleArgs,
  ): Promise<ExamScheduleRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamScheduleNotFoundError(id);
      if (current.examId !== examId) throw new ExamScheduleNotFoundError(id);

      const finalStart = args.startTime ?? current.startTime;
      const finalEnd = args.endTime ?? current.endTime;
      this.assertTimeOrder(finalStart, finalEnd);

      const finalDate = args.date ?? current.date;
      this.assertDateInExamRange(finalDate, exam.startDate, exam.endDate);

      const finalMax = args.maxMarks ?? current.maxMarks;
      const finalPass = args.passMarks ?? current.passMarks;
      this.assertMarksConfig(finalMax, finalPass);

      // Slot uniqueness if subjectId or sectionId changed.
      const finalSubject = args.subjectId ?? current.subjectId;
      const finalSection = args.sectionId ?? current.sectionId;
      if (finalSubject !== current.subjectId || finalSection !== current.sectionId) {
        const dup = await this.repo.findActiveBySlot(
          examId,
          finalSubject,
          finalSection,
          tx,
        );
        if (dup !== null && dup.id !== id) {
          throw new DuplicateExamScheduleError(examId, finalSubject, finalSection);
        }
      }

      const updated = await this.repo.update(id, expectedVersion, args, tx);

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.SCHEDULE_UPDATED,
        eventType: 'ExamScheduleUpdated',
        aggregateType: 'ExamSchedule',
        aggregateId: id,
        payload: { id, examId },
      });

      await this.audit.record(
        {
          action: 'exam_schedule.update',
          category: 'general',
          resourceType: 'ExamSchedule',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async softDelete(
    examId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);
      if (exam.status === 'ARCHIVED') throw new ExamArchivedError(examId);

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamScheduleNotFoundError(id);
      if (current.examId !== examId) throw new ExamScheduleNotFoundError(id);

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.SCHEDULE_DELETED,
        eventType: 'ExamScheduleDeleted',
        aggregateType: 'ExamSchedule',
        aggregateId: id,
        payload: { id, examId },
      });

      await this.audit.record(
        {
          action: 'exam_schedule.delete',
          category: 'general',
          resourceType: 'ExamSchedule',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // ---------------------------------------------------------------------
  // Validators
  // ---------------------------------------------------------------------

  private assertTimeOrder(start: string, end: string): void {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      throw new ExamScheduleDateRangeError(
        `invalid time format start="${start}" end="${end}"`,
      );
    }
    if (s >= e) {
      throw new ExamScheduleTimeOrderError();
    }
  }

  private assertDateInExamRange(date: Date, start: Date, end: Date): void {
    const d = stripTime(date).getTime();
    if (d < stripTime(start).getTime() || d > stripTime(end).getTime()) {
      throw new ExamScheduleDateRangeError(
        `date ${date.toISOString()} not in exam range [${start.toISOString()}..${end.toISOString()}]`,
      );
    }
  }

  private assertMarksConfig(maxMarks: number, passMarks: number): void {
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      throw new ExamScheduleMarksConfigError(`maxMarks must be > 0; got ${maxMarks}`);
    }
    if (!Number.isFinite(passMarks) || passMarks < 0) {
      throw new ExamScheduleMarksConfigError(`passMarks must be >= 0; got ${passMarks}`);
    }
    if (passMarks > maxMarks) {
      throw new ExamScheduleMarksConfigError(
        `passMarks ${passMarks} cannot exceed maxMarks ${maxMarks}`,
      );
    }
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

function parseTimeToMinutes(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (m === null) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] !== undefined ? Number(m[3]) : 0;
  return h * 3600 + min * 60 + s;
}

function stripTime(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function extractDomainCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return 'INTERNAL_ERROR';
}

export const __test__ = { parseTimeToMinutes, stripTime };
