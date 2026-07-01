/**
 * AttendanceDailyRepository — persistence for student daily attendance.
 *
 * Soft-delete + version-checked update via `updateMany`. Filters by tenant
 * (schoolId) on every read; never trusts caller-supplied tenant.
 *
 * `findActive` collapses the (schoolId, studentId, date) lookup used to
 * detect duplicates in single-mark + bulk paths.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AttendanceSourceValue,
  AttendanceStatusValue,
} from '../attendance.constants';
import type { AttendanceDailyRow } from '../attendance.types';

export interface CreateAttendanceDailyInput {
  readonly branchId: string | null;
  readonly academicYearId: string;
  readonly sectionId: string;
  readonly studentId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
  readonly source: AttendanceSourceValue;
  readonly markedAt: Date;
  readonly checkInTime: Date | null;
  readonly checkOutTime: Date | null;
  readonly remarks: string | null;
}

export interface UpdateAttendanceDailyInput {
  readonly status?: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly checkInTime?: Date | null;
  readonly checkOutTime?: Date | null;
  readonly remarks?: string | null;
}

export interface ListAttendanceDailyArgs {
  readonly sectionId?: string;
  readonly studentId?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly status?: AttendanceStatusValue;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class AttendanceDailyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AttendanceDailyRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<AttendanceDailyRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.attendanceDaily.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async findActive(
    studentId: string,
    date: Date,
    tx?: PrismaTx,
  ): Promise<AttendanceDailyRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.attendanceDaily.findFirst({
      where: { schoolId, studentId, date, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async list(
    args: ListAttendanceDailyArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly AttendanceDailyRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.status !== undefined) where.status = args.status;
    if (args.dateFrom !== undefined || args.dateTo !== undefined) {
      const dateFilter: Record<string, Date> = {};
      if (args.dateFrom !== undefined) dateFilter.gte = args.dateFrom;
      if (args.dateTo !== undefined) dateFilter.lte = args.dateTo;
      where.date = dateFilter;
    }
    const rows = await reader.attendanceDaily.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId = rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(map), nextCursorId };
  }

  public async create(
    input: CreateAttendanceDailyInput,
    tx?: PrismaTx,
  ): Promise<AttendanceDailyRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.attendanceDaily.create({
      data: {
        schoolId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        sectionId: input.sectionId,
        studentId: input.studentId,
        date: input.date,
        status: input.status,
        source: input.source,
        markedAt: input.markedAt,
        markedBy: userId ?? null,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        remarks: input.remarks,
        mode: 'DAILY',
        periodNumber: null,
        subjectId: null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateAttendanceDailyInput,
    tx?: PrismaTx,
  ): Promise<AttendanceDailyRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.status !== undefined) data.status = input.status;
    if (input.source !== undefined) data.source = input.source;
    if (input.checkInTime !== undefined) data.checkInTime = input.checkInTime;
    if (input.checkOutTime !== undefined) data.checkOutTime = input.checkOutTime;
    if (input.remarks !== undefined) data.remarks = input.remarks;
    const result = await writer.attendanceDaily.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('AttendanceDaily', id, expectedVersion);
    }
    const reloaded = await writer.attendanceDaily.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('AttendanceDaily', id, expectedVersion);
    }
    return map(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.attendanceDaily.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('AttendanceDaily', id, expectedVersion);
    }
  }
}

interface RawAttendanceDaily {
  id: string;
  schoolId: string;
  branchId: string | null;
  academicYearId: string;
  sectionId: string;
  studentId: string;
  date: Date;
  status: AttendanceStatusValue;
  source: AttendanceSourceValue;
  markedAt: Date;
  markedBy: string | null;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  remarks: string | null;
  mode: 'DAILY' | 'PERIOD';
  periodNumber: number | null;
  subjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawAttendanceDaily): AttendanceDailyRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    academicYearId: row.academicYearId,
    sectionId: row.sectionId,
    studentId: row.studentId,
    date: row.date,
    status: row.status,
    source: row.source,
    markedAt: row.markedAt,
    markedBy: row.markedBy,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    remarks: row.remarks,
    mode: row.mode,
    periodNumber: row.periodNumber,
    subjectId: row.subjectId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
