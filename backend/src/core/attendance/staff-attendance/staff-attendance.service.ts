/**
 * StaffAttendanceService — daily attendance for staff. Same shape as
 * StudentAttendanceService but section/academic-year removed and no
 * status-history table — staff attendance changes are tracked only in
 * audit. Gates: feature flag, future-date, lock-window, edit-window.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
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
  BulkLimitExceededError,
  DuplicateStaffAttendanceError,
  EditWindowExpiredError,
  FutureDateNotAllowedError,
  StaffAttendanceNotFoundError,
} from '../attendance.errors';
import type { StaffAttendanceRow } from '../attendance.types';
import { AttendanceConfigService } from '../config/config.service';
import { AttendanceLockWindowService } from '../lock-window/lock-window.service';
import {
  ListStaffAttendanceArgs,
  StaffAttendanceRepository,
  type UpdateStaffAttendanceInput,
} from './staff-attendance.repository';

export interface MarkStaffAttendanceArgs {
  readonly branchId?: string | null;
  readonly staffId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly checkInTime?: Date | null;
  readonly checkOutTime?: Date | null;
  readonly remarks?: string | null;
}

export interface BulkMarkStaffEntry {
  readonly staffId: string;
  readonly status?: AttendanceStatusValue;
  readonly remarks?: string | null;
}

export interface BulkMarkStaffArgs {
  readonly branchId?: string | null;
  readonly date: Date;
  readonly defaultStatus?: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly entries: readonly BulkMarkStaffEntry[];
}

export interface BulkMarkStaffResult {
  readonly staffId: string;
  readonly id: string | null;
  readonly status: AttendanceStatusValue | null;
  readonly error: string | null;
}

export interface UpdateStaffAttendanceArgs {
  readonly status?: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly checkInTime?: Date | null;
  readonly checkOutTime?: Date | null;
  readonly remarks?: string | null;
}

@Injectable()
export class StaffAttendanceService {
  private readonly logger = new Logger(StaffAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StaffAttendanceRepository,
    private readonly configService: AttendanceConfigService,
    private readonly lockService: AttendanceLockWindowService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListStaffAttendanceArgs): Promise<{
    readonly items: readonly StaffAttendanceRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<StaffAttendanceRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new StaffAttendanceNotFoundError(id);
    return row;
  }

  public async mark(args: MarkStaffAttendanceArgs): Promise<StaffAttendanceRow> {
    await this.assertModuleEnabled();
    const dateOnly = toDateOnly(args.date);
    assertNotFuture(dateOnly);
    const branchId = args.branchId ?? null;

    return this.prisma.transaction(async (tx) => {
      // Staff locks check at branch+null section.
      await this.lockService.assertNotLocked(branchId, null, dateOnly, tx);

      const existing = await this.repo.findActive(args.staffId, dateOnly, tx);
      if (existing !== null) {
        throw new DuplicateStaffAttendanceError(args.staffId, dateOnly);
      }

      const row = await this.repo.create(
        {
          branchId,
          staffId: args.staffId,
          date: dateOnly,
          status: args.status,
          source: args.source ?? 'MANUAL',
          markedAt: new Date(),
          checkInTime: args.checkInTime ?? null,
          checkOutTime: args.checkOutTime ?? null,
          remarks: args.remarks ?? null,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.STAFF_MARKED,
        eventType: 'StaffAttendanceMarked',
        aggregateType: 'StaffAttendance',
        aggregateId: row.id,
        payload: {
          id: row.id,
          staffId: row.staffId,
          date: row.date.toISOString().slice(0, 10),
          status: row.status,
        },
      });
      await this.audit.record(
        {
          action: 'staff_attendance.mark',
          category: 'general',
          resourceType: 'StaffAttendance',
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
    patch: UpdateStaffAttendanceArgs,
  ): Promise<StaffAttendanceRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new StaffAttendanceNotFoundError(id);
      await this.lockService.assertNotLocked(current.branchId, null, current.date, tx);
      const config = await this.configService.getEffective(current.branchId, tx);
      const ageHours = (Date.now() - current.markedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > config.editWindowHours) {
        throw new EditWindowExpiredError(current.markedAt, config.editWindowHours);
      }
      const input: UpdateStaffAttendanceInput = {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.checkInTime !== undefined ? { checkInTime: patch.checkInTime } : {}),
        ...(patch.checkOutTime !== undefined ? { checkOutTime: patch.checkOutTime } : {}),
        ...(patch.remarks !== undefined ? { remarks: patch.remarks } : {}),
      };
      const updated = await this.repo.update(id, expectedVersion, input, tx);
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.STAFF_CHANGED,
        eventType: 'StaffAttendanceChanged',
        aggregateType: 'StaffAttendance',
        aggregateId: id,
        payload: {
          id,
          previousStatus: current.status,
          newStatus: updated.status,
        },
      });
      await this.audit.record(
        {
          action: 'staff_attendance.update',
          category: 'general',
          resourceType: 'StaffAttendance',
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
      if (current === null) throw new StaffAttendanceNotFoundError(id);
      await this.lockService.assertNotLocked(current.branchId, null, current.date, tx);
      const config = await this.configService.getEffective(current.branchId, tx);
      const ageHours = (Date.now() - current.markedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > config.editWindowHours) {
        throw new EditWindowExpiredError(current.markedAt, config.editWindowHours);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.STAFF_CHANGED,
        eventType: 'StaffAttendanceDeleted',
        aggregateType: 'StaffAttendance',
        aggregateId: id,
        payload: { id },
      });
      await this.audit.record(
        {
          action: 'staff_attendance.delete',
          category: 'general',
          resourceType: 'StaffAttendance',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  public async bulkMark(args: BulkMarkStaffArgs): Promise<{
    readonly results: readonly BulkMarkStaffResult[];
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
      await this.lockService.assertNotLocked(branchId, null, dateOnly, tx);

      const results: BulkMarkStaffResult[] = [];
      let created = 0;
      let failed = 0;
      for (const entry of args.entries) {
        const status = entry.status ?? defaultStatus;
        try {
          const existing = await this.repo.findActive(entry.staffId, dateOnly, tx);
          if (existing !== null) {
            results.push({ staffId: entry.staffId, id: null, status: null, error: 'DUPLICATE' });
            failed += 1;
            continue;
          }
          const row = await this.repo.create(
            {
              branchId,
              staffId: entry.staffId,
              date: dateOnly,
              status,
              source: args.source ?? 'MANUAL',
              markedAt: new Date(),
              checkInTime: null,
              checkOutTime: null,
              remarks: entry.remarks ?? null,
            },
            tx,
          );
          results.push({ staffId: entry.staffId, id: row.id, status: row.status, error: null });
          created += 1;
        } catch (err) {
          results.push({
            staffId: entry.staffId,
            id: null,
            status: null,
            error: (err as Error).message,
          });
          failed += 1;
        }
      }

      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.STAFF_MARKED,
        eventType: 'StaffAttendanceBulkMarked',
        aggregateType: 'StaffAttendance',
        aggregateId: branchId ?? 'school',
        payload: {
          branchId,
          date: dateOnly.toISOString().slice(0, 10),
          created,
          failed,
        },
      });
      await this.audit.record(
        {
          action: 'staff_attendance.bulk_mark',
          category: 'general',
          resourceType: 'StaffAttendance',
          resourceId: branchId ?? 'school',
          after: { branchId, date: dateOnly, created, failed },
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Staff bulk mark date=${dateOnly.toISOString().slice(0, 10)} created=${created} failed=${failed}.`,
      );
      return { results, created, failed };
    });
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(AttendanceFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new AttendanceModuleDisabledError();
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
