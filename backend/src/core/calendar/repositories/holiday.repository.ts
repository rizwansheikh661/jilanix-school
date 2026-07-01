import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AttendanceTreatmentValue,
  HalfDaySessionValue,
  HolidayTypeValue,
} from '../calendar.constants';
import type { HolidayRow } from '../calendar.types';

export interface CreateHolidayInput {
  readonly branchId?: string | null;
  readonly name: string;
  readonly date: Date;
  readonly type: HolidayTypeValue;
  readonly isFullDay: boolean;
  readonly halfDaySession?: HalfDaySessionValue | null;
  readonly attendanceTreatment?: AttendanceTreatmentValue;
  readonly notes?: string | null;
}

export interface UpdateHolidayInput {
  readonly branchId?: string | null;
  readonly name?: string;
  readonly date?: Date;
  readonly type?: HolidayTypeValue;
  readonly isFullDay?: boolean;
  readonly halfDaySession?: HalfDaySessionValue | null;
  readonly attendanceTreatment?: AttendanceTreatmentValue;
  readonly notes?: string | null;
}

export interface HolidayListFilter {
  readonly branchId?: string | null;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly type?: HolidayTypeValue;
}

@Injectable()
export class HolidayRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('HolidayRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<HolidayRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.holiday.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(filter: HolidayListFilter, tx?: PrismaTx): Promise<readonly HolidayRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.branchId !== undefined) where.branchId = filter.branchId;
    if (filter.type !== undefined) where.type = filter.type;
    if (filter.fromDate !== undefined || filter.toDate !== undefined) {
      const range: Record<string, Date> = {};
      if (filter.fromDate !== undefined) range.gte = filter.fromDate;
      if (filter.toDate !== undefined) range.lte = filter.toDate;
      where.date = range;
    }
    const rows = await reader.holiday.findMany({
      where,
      orderBy: [{ date: 'asc' }],
    });
    return rows.map(map);
  }

  public async findByDate(
    args: { branchId: string | null; date: Date },
    tx?: PrismaTx,
  ): Promise<readonly HolidayRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const branchClause = args.branchId === null ? [{ branchId: null }] : [
      { branchId: args.branchId },
      { branchId: null },
    ];
    const rows = await reader.holiday.findMany({
      where: {
        schoolId,
        deletedAt: null,
        date: args.date,
        OR: branchClause,
      },
      orderBy: [{ branchId: 'desc' }],
    });
    return rows.map(map);
  }

  public async create(input: CreateHolidayInput, tx?: PrismaTx): Promise<HolidayRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.holiday.create({
      data: {
        schoolId,
        branchId: input.branchId ?? null,
        name: input.name,
        date: input.date,
        type: input.type,
        isFullDay: input.isFullDay,
        halfDaySession: input.halfDaySession ?? null,
        attendanceTreatment: input.attendanceTreatment ?? 'HOLIDAY',
        notes: input.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateHolidayInput,
    tx?: PrismaTx,
  ): Promise<HolidayRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateHolidayInput> = [
      'branchId', 'name', 'date', 'type', 'isFullDay', 'halfDaySession', 'attendanceTreatment', 'notes',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.holiday.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('Holiday', id, expectedVersion);
    const row = await writer.holiday.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Holiday', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.holiday.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('Holiday', id, expectedVersion);
  }
}

interface RawHoliday {
  id: string;
  schoolId: string;
  branchId: string | null;
  name: string;
  date: Date;
  type: HolidayTypeValue;
  isFullDay: boolean;
  halfDaySession: HalfDaySessionValue | null;
  attendanceTreatment: AttendanceTreatmentValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawHoliday): HolidayRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    name: row.name,
    date: row.date,
    type: row.type,
    isFullDay: row.isFullDay,
    halfDaySession: row.halfDaySession,
    attendanceTreatment: row.attendanceTreatment,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
