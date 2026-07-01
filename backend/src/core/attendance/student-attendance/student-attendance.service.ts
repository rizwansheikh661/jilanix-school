/**
 * StudentAttendanceService — daily class attendance writes & reads.
 *
 * Gates applied to every mutation (in order):
 *   1. `module.attendance` feature flag.
 *   2. Future-date check — date must be ≤ today.
 *   3. Lock-window check — refuses if any active SCHOOL/BRANCH/SECTION
 *      lock covers the (branchId, sectionId, date) triple. Corrections
 *      are the escape hatch.
 *   4. Holiday check — if the date is a holiday and `holidayAutoMark`
 *      is on:
 *        - single-mark: explicit non-HOLIDAY status returns 409.
 *        - bulk-mark: status is coerced to HOLIDAY for every row.
 *
 * PATCH adds a 5th gate: `now - markedAt ≤ editWindowHours`. Out-of-window
 * edits are 409 `EDIT_WINDOW_EXPIRED` and the caller must use
 * `POST /attendance-corrections`.
 *
 * Every write inserts an `AttendanceStatusHistory` row + publishes one
 * outbox event in the same transaction.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  ATTENDANCE_BULK_MAX_ENTRIES,
  AttendanceFeatureFlags,
  AttendanceOutboxTopics,
  type AttendanceSourceValue,
  type AttendanceStatusValue,
} from '../attendance.constants';
import {
  AttendanceModuleDisabledError,
  AttendanceNotFoundError,
  BulkLimitExceededError,
  DuplicateAttendanceError,
  EditWindowExpiredError,
  FutureDateNotAllowedError,
  HolidayStatusConflictError,
} from '../attendance.errors';
import type { AttendanceDailyRow } from '../attendance.types';
import { AttendanceConfigService } from '../config/config.service';
import { HolidayLookupService } from '../holiday-lookup.service';
import { AttendanceLockWindowService } from '../lock-window/lock-window.service';
import { AttendanceStatusHistoryRepository } from '../status-history/status-history.repository';
import {
  AttendanceDailyRepository,
  type ListAttendanceDailyArgs,
  type UpdateAttendanceDailyInput,
} from './attendance-daily.repository';

export interface MarkAttendanceArgs {
  readonly branchId?: string | null;
  readonly academicYearId: string;
  readonly sectionId: string;
  readonly studentId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly checkInTime?: Date | null;
  readonly checkOutTime?: Date | null;
  readonly remarks?: string | null;
}

export interface BulkMarkAttendanceArgs {
  readonly branchId?: string | null;
  readonly academicYearId: string;
  readonly sectionId: string;
  readonly date: Date;
  readonly defaultStatus?: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly entries: readonly BulkMarkEntry[];
}

export interface BulkMarkEntry {
  readonly studentId: string;
  readonly status?: AttendanceStatusValue;
  readonly remarks?: string | null;
}

export interface BulkMarkResult {
  readonly studentId: string;
  readonly id: string | null;
  readonly status: AttendanceStatusValue | null;
  readonly error: string | null;
}

export interface UpdateAttendanceArgs {
  readonly status?: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly checkInTime?: Date | null;
  readonly checkOutTime?: Date | null;
  readonly remarks?: string | null;
}

@Injectable()
export class StudentAttendanceService {
  private readonly logger = new Logger(StudentAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AttendanceDailyRepository,
    private readonly historyRepo: AttendanceStatusHistoryRepository,
    private readonly configService: AttendanceConfigService,
    private readonly lockService: AttendanceLockWindowService,
    private readonly holidayService: HolidayLookupService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListAttendanceDailyArgs): Promise<{
    readonly items: readonly AttendanceDailyRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AttendanceDailyRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new AttendanceNotFoundError(id);
    return row;
  }

  public async mark(args: MarkAttendanceArgs): Promise<AttendanceDailyRow> {
    await this.assertModuleEnabled();
    const dateOnly = toDateOnly(args.date);
    assertNotFuture(dateOnly);
    const branchId = args.branchId ?? null;

    return this.prisma.transaction(async (tx) => {
      await this.lockService.assertNotLocked(branchId, args.sectionId, dateOnly, tx);
      const config = await this.configService.getEffective(branchId, tx);

      let status = args.status;
      const holiday = await this.holidayService.findHoliday(dateOnly, branchId, tx);
      if (holiday !== null && config.holidayAutoMark) {
        if (status !== 'HOLIDAY') {
          throw new HolidayStatusConflictError(dateOnly, status);
        }
        status = 'HOLIDAY';
      }

      const existing = await this.repo.findActive(args.studentId, dateOnly, tx);
      if (existing !== null) {
        throw new DuplicateAttendanceError(args.studentId, dateOnly);
      }

      const row = await this.repo.create(
        {
          branchId,
          academicYearId: args.academicYearId,
          sectionId: args.sectionId,
          studentId: args.studentId,
          date: dateOnly,
          status,
          source: args.source ?? 'MANUAL',
          markedAt: new Date(),
          checkInTime: args.checkInTime ?? null,
          checkOutTime: args.checkOutTime ?? null,
          remarks: args.remarks ?? null,
        },
        tx,
      );

      await this.historyRepo.append(
        {
          attendanceDailyId: row.id,
          previousStatus: null,
          newStatus: row.status,
          changeType: 'MARKED',
          reason: null,
          correctionId: null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.MARKED,
        eventType: 'AttendanceDailyMarked',
        aggregateType: 'AttendanceDaily',
        aggregateId: row.id,
        payload: {
          id: row.id,
          studentId: row.studentId,
          sectionId: row.sectionId,
          date: row.date.toISOString().slice(0, 10),
          status: row.status,
          source: row.source,
        },
      });

      await this.audit.record(
        {
          action: 'attendance_daily.mark',
          category: 'general',
          resourceType: 'AttendanceDaily',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAttendanceArgs,
  ): Promise<AttendanceDailyRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AttendanceNotFoundError(id);

      await this.lockService.assertNotLocked(current.branchId, current.sectionId, current.date, tx);

      const config = await this.configService.getEffective(current.branchId, tx);
      const now = new Date();
      const ageHours = (now.getTime() - current.markedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > config.editWindowHours) {
        throw new EditWindowExpiredError(current.markedAt, config.editWindowHours);
      }

      if (patch.status !== undefined && patch.status !== current.status) {
        const holiday = await this.holidayService.findHoliday(current.date, current.branchId, tx);
        if (holiday !== null && config.holidayAutoMark && patch.status !== 'HOLIDAY') {
          throw new HolidayStatusConflictError(current.date, patch.status);
        }
      }

      const input: UpdateAttendanceDailyInput = {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.checkInTime !== undefined ? { checkInTime: patch.checkInTime } : {}),
        ...(patch.checkOutTime !== undefined ? { checkOutTime: patch.checkOutTime } : {}),
        ...(patch.remarks !== undefined ? { remarks: patch.remarks } : {}),
      };
      const updated = await this.repo.update(id, expectedVersion, input, tx);

      if (patch.status !== undefined && patch.status !== current.status) {
        await this.historyRepo.append(
          {
            attendanceDailyId: id,
            previousStatus: current.status,
            newStatus: updated.status,
            changeType: 'EDITED',
            reason: null,
            correctionId: null,
          },
          tx,
        );
      }

      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.CHANGED,
        eventType: 'AttendanceDailyChanged',
        aggregateType: 'AttendanceDaily',
        aggregateId: id,
        payload: {
          id,
          previousStatus: current.status,
          newStatus: updated.status,
        },
      });

      await this.audit.record(
        {
          action: 'attendance_daily.update',
          category: 'general',
          resourceType: 'AttendanceDaily',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new AttendanceNotFoundError(id);
      await this.lockService.assertNotLocked(current.branchId, current.sectionId, current.date, tx);
      const config = await this.configService.getEffective(current.branchId, tx);
      const ageHours = (Date.now() - current.markedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > config.editWindowHours) {
        throw new EditWindowExpiredError(current.markedAt, config.editWindowHours);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.CHANGED,
        eventType: 'AttendanceDailyDeleted',
        aggregateType: 'AttendanceDaily',
        aggregateId: id,
        payload: { id },
      });
      await this.audit.record(
        {
          action: 'attendance_daily.delete',
          category: 'general',
          resourceType: 'AttendanceDaily',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  public async bulkMark(args: BulkMarkAttendanceArgs): Promise<{
    readonly results: readonly BulkMarkResult[];
    readonly created: number;
    readonly failed: number;
  }> {
    await this.assertModuleEnabled();
    if (args.entries.length === 0) {
      return { results: [], created: 0, failed: 0 };
    }
    if (args.entries.length > ATTENDANCE_BULK_MAX_ENTRIES) {
      throw new BulkLimitExceededError(ATTENDANCE_BULK_MAX_ENTRIES, args.entries.length);
    }
    const dateOnly = toDateOnly(args.date);
    assertNotFuture(dateOnly);
    const branchId = args.branchId ?? null;
    const defaultStatus = args.defaultStatus ?? 'PRESENT';

    return this.prisma.transaction(async (tx) => {
      await this.lockService.assertNotLocked(branchId, args.sectionId, dateOnly, tx);
      const config = await this.configService.getEffective(branchId, tx);
      const holiday = await this.holidayService.findHoliday(dateOnly, branchId, tx);
      const isHoliday = holiday !== null && config.holidayAutoMark;

      const results: BulkMarkResult[] = [];
      let created = 0;
      let failed = 0;

      for (const entry of args.entries) {
        const requested = entry.status ?? defaultStatus;
        // Holiday auto-mark: coerce silently.
        const finalStatus = isHoliday ? 'HOLIDAY' : requested;
        try {
          const existing = await this.repo.findActive(entry.studentId, dateOnly, tx);
          if (existing !== null) {
            results.push({
              studentId: entry.studentId,
              id: null,
              status: null,
              error: 'DUPLICATE',
            });
            failed += 1;
            continue;
          }
          const row = await this.repo.create(
            {
              branchId,
              academicYearId: args.academicYearId,
              sectionId: args.sectionId,
              studentId: entry.studentId,
              date: dateOnly,
              status: finalStatus,
              source: args.source ?? 'MANUAL',
              markedAt: new Date(),
              checkInTime: null,
              checkOutTime: null,
              remarks: entry.remarks ?? null,
            },
            tx,
          );
          await this.historyRepo.append(
            {
              attendanceDailyId: row.id,
              previousStatus: null,
              newStatus: row.status,
              changeType: 'MARKED',
              reason: null,
              correctionId: null,
            },
            tx,
          );
          results.push({
            studentId: entry.studentId,
            id: row.id,
            status: row.status,
            error: null,
          });
          created += 1;
        } catch (err) {
          results.push({
            studentId: entry.studentId,
            id: null,
            status: null,
            error: (err as Error).message,
          });
          failed += 1;
        }
      }

      // Single fan-out event for the bulk operation.
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.MARKED,
        eventType: 'AttendanceDailyBulkMarked',
        aggregateType: 'AttendanceDaily',
        aggregateId: args.sectionId,
        payload: {
          sectionId: args.sectionId,
          date: dateOnly.toISOString().slice(0, 10),
          created,
          failed,
        },
      });

      await this.audit.record(
        {
          action: 'attendance_daily.bulk_mark',
          category: 'general',
          resourceType: 'AttendanceDaily',
          resourceId: args.sectionId,
          after: { sectionId: args.sectionId, date: dateOnly, created, failed },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Bulk mark section=${args.sectionId} date=${dateOnly.toISOString().slice(0, 10)} created=${created} failed=${failed}.`,
      );

      return { results, created, failed };
    });
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(AttendanceFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) {
      throw new AttendanceModuleDisabledError();
    }
  }

  /** Allow other services (e.g. corrections) to fetch + apply a status. */
  public async applyCorrectedStatus(
    attendanceId: string,
    newStatus: AttendanceStatusValue,
    correctionId: string,
    reason: string,
    tx: PrismaTx,
  ): Promise<AttendanceDailyRow> {
    const current = await this.repo.findById(attendanceId, tx);
    if (current === null) throw new AttendanceNotFoundError(attendanceId);
    const updated = await this.repo.update(
      attendanceId,
      current.version,
      { status: newStatus },
      tx,
    );
    await this.historyRepo.append(
      {
        attendanceDailyId: attendanceId,
        previousStatus: current.status,
        newStatus,
        changeType: 'CORRECTED',
        reason,
        correctionId,
      },
      tx,
    );
    await this.outbox.publish(tx, {
      topic: AttendanceOutboxTopics.CORRECTED,
      eventType: 'AttendanceDailyCorrected',
      aggregateType: 'AttendanceDaily',
      aggregateId: attendanceId,
      payload: {
        id: attendanceId,
        previousStatus: current.status,
        newStatus,
        correctionId,
      },
    });
    return updated;
  }
}

function toDateOnly(date: Date): Date {
  const iso = date.toISOString().slice(0, 10);
  return new Date(iso + 'T00:00:00.000Z');
}

function assertNotFuture(date: Date): void {
  const today = toDateOnly(new Date());
  if (date.getTime() > today.getTime()) {
    throw new FutureDateNotAllowedError(date);
  }
}

export const __test__ = { toDateOnly, assertNotFuture };
