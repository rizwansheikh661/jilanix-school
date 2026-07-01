/**
 * AttendanceCorrectionService — approval workflow over status edits.
 *
 *   POST /attendance-corrections            — create a PENDING request.
 *   POST /attendance-corrections/:id/approve — apply newStatus to the
 *     AttendanceDaily row in the same tx, append a CORRECTED history row,
 *     publish `attendance.corrected`.
 *   POST /attendance-corrections/:id/reject — close request, no row change.
 *
 * The "out-of-window edit only via correction" rule is enforced at the
 * service edge (`PATCH /attendance/:id` throws EDIT_WINDOW_EXPIRED when
 * the caller is too late). Inside the edit window, callers MAY still use
 * the correction endpoint — useful for changes that policy requires to
 * go through approval (e.g. principal-only).
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import {
  AttendanceOutboxTopics,
  type AttendanceCorrectionStatusValue,
  type AttendanceStatusValue,
} from '../attendance.constants';
import {
  AttendanceCorrectionNotFoundError,
  AttendanceNotFoundError,
  CorrectionAlreadyDecidedError,
} from '../attendance.errors';
import type { AttendanceCorrectionRow } from '../attendance.types';
import { AttendanceDailyRepository } from '../student-attendance/attendance-daily.repository';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service';
import {
  AttendanceCorrectionRepository,
  type ListCorrectionArgs,
} from './correction.repository';

export interface CreateCorrectionArgs {
  readonly attendanceDailyId: string;
  readonly newStatus: AttendanceStatusValue;
  readonly reason: string;
  readonly supportingFileId?: string | null;
}

@Injectable()
export class AttendanceCorrectionService {
  private readonly logger = new Logger(AttendanceCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AttendanceCorrectionRepository,
    private readonly attendanceRepo: AttendanceDailyRepository,
    private readonly studentAttendance: StudentAttendanceService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListCorrectionArgs): Promise<{
    readonly items: readonly AttendanceCorrectionRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AttendanceCorrectionRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new AttendanceCorrectionNotFoundError(id);
    return row;
  }

  public async create(args: CreateCorrectionArgs): Promise<AttendanceCorrectionRow> {
    return this.prisma.transaction(async (tx) => {
      const target = await this.attendanceRepo.findById(args.attendanceDailyId, tx);
      if (target === null) throw new AttendanceNotFoundError(args.attendanceDailyId);
      const row = await this.repo.create(
        {
          attendanceDailyId: args.attendanceDailyId,
          previousStatus: target.status,
          newStatus: args.newStatus,
          reason: args.reason,
          supportingFileId: args.supportingFileId ?? null,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'attendance_correction.create',
          category: 'general',
          resourceType: 'AttendanceCorrection',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Correction requested id=${row.id} attendance=${args.attendanceDailyId} ${target.status}→${args.newStatus}.`,
      );
      return row;
    });
  }

  public async approve(
    id: string,
    expectedVersion: number,
    decisionReason: string | null,
  ): Promise<AttendanceCorrectionRow> {
    return this.decide(id, expectedVersion, 'APPROVED', decisionReason);
  }

  public async reject(
    id: string,
    expectedVersion: number,
    decisionReason: string | null,
  ): Promise<AttendanceCorrectionRow> {
    return this.decide(id, expectedVersion, 'REJECTED', decisionReason);
  }

  private async decide(
    id: string,
    expectedVersion: number,
    decision: 'APPROVED' | 'REJECTED',
    decisionReason: string | null,
  ): Promise<AttendanceCorrectionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AttendanceCorrectionNotFoundError(id);
      if (current.status !== 'PENDING') {
        throw new CorrectionAlreadyDecidedError(
          id,
          current.status as AttendanceCorrectionStatusValue,
        );
      }
      const updated = await this.repo.decide(
        id,
        expectedVersion,
        { status: decision, decisionReason },
        tx,
      );
      if (decision === 'APPROVED') {
        await this.studentAttendance.applyCorrectedStatus(
          current.attendanceDailyId,
          current.newStatus,
          id,
          current.reason,
          tx,
        );
      } else {
        await this.outbox.publish(tx, {
          topic: AttendanceOutboxTopics.CORRECTED,
          eventType: 'AttendanceCorrectionRejected',
          aggregateType: 'AttendanceCorrection',
          aggregateId: id,
          payload: {
            id,
            attendanceDailyId: current.attendanceDailyId,
            decisionReason,
          },
        });
      }
      await this.audit.record(
        {
          action: `attendance_correction.${decision.toLowerCase()}`,
          category: 'general',
          resourceType: 'AttendanceCorrection',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`Correction ${id} ${decision} by request handler.`);
      return updated;
    });
  }
}
