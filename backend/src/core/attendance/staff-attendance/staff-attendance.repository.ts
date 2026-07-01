/**
 * StaffAttendanceRepository — daily attendance for staff. Same shape as
 * `AttendanceDailyRepository` but without academicYear/section/student
 * coupling; keyed by `(schoolId, staffId, date)`.
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
import type { StaffAttendanceRow } from '../attendance.types';

export interface CreateStaffAttendanceInput {
  readonly branchId: string | null;
  readonly staffId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
  readonly source: AttendanceSourceValue;
  readonly markedAt: Date;
  readonly checkInTime: Date | null;
  readonly checkOutTime: Date | null;
  readonly remarks: string | null;
}

export interface UpdateStaffAttendanceInput {
  readonly status?: AttendanceStatusValue;
  readonly source?: AttendanceSourceValue;
  readonly checkInTime?: Date | null;
  readonly checkOutTime?: Date | null;
  readonly remarks?: string | null;
}

export interface ListStaffAttendanceArgs {
  readonly staffId?: string;
  readonly branchId?: string;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly status?: AttendanceStatusValue;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class StaffAttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StaffAttendanceRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<StaffAttendanceRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.staffAttendance.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async findActive(
    staffId: string,
    date: Date,
    tx?: PrismaTx,
  ): Promise<StaffAttendanceRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.staffAttendance.findFirst({
      where: { schoolId, staffId, date, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async list(
    args: ListStaffAttendanceArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly StaffAttendanceRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.staffId !== undefined) where.staffId = args.staffId;
    if (args.branchId !== undefined) where.branchId = args.branchId;
    if (args.status !== undefined) where.status = args.status;
    if (args.dateFrom !== undefined || args.dateTo !== undefined) {
      const dateFilter: Record<string, Date> = {};
      if (args.dateFrom !== undefined) dateFilter.gte = args.dateFrom;
      if (args.dateTo !== undefined) dateFilter.lte = args.dateTo;
      where.date = dateFilter;
    }
    const rows = await reader.staffAttendance.findMany({
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
    input: CreateStaffAttendanceInput,
    tx?: PrismaTx,
  ): Promise<StaffAttendanceRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.staffAttendance.create({
      data: {
        schoolId,
        branchId: input.branchId,
        staffId: input.staffId,
        date: input.date,
        status: input.status,
        source: input.source,
        markedAt: input.markedAt,
        markedBy: userId ?? null,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        remarks: input.remarks,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateStaffAttendanceInput,
    tx?: PrismaTx,
  ): Promise<StaffAttendanceRow> {
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
    const result = await writer.staffAttendance.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('StaffAttendance', id, expectedVersion);
    }
    const reloaded = await writer.staffAttendance.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('StaffAttendance', id, expectedVersion);
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
    const result = await writer.staffAttendance.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('StaffAttendance', id, expectedVersion);
    }
  }
}

interface RawStaffAttendance {
  id: string;
  schoolId: string;
  branchId: string | null;
  staffId: string;
  date: Date;
  status: AttendanceStatusValue;
  source: AttendanceSourceValue;
  markedAt: Date;
  markedBy: string | null;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawStaffAttendance): StaffAttendanceRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    staffId: row.staffId,
    date: row.date,
    status: row.status,
    source: row.source,
    markedAt: row.markedAt,
    markedBy: row.markedBy,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
