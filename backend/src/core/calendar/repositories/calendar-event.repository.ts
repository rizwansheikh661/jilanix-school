import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  CalendarAudienceValue,
  CalendarEventTypeValue,
} from '../calendar.constants';
import type { CalendarEventRow } from '../calendar.types';

export interface CreateCalendarEventInput {
  readonly branchId?: string | null;
  readonly academicYearId?: string | null;
  readonly type: CalendarEventTypeValue;
  readonly title: string;
  readonly description?: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly allDay?: boolean;
  readonly startTime?: Date | null;
  readonly endTime?: Date | null;
  readonly audienceJson?: readonly CalendarAudienceValue[] | null;
  readonly colorHex?: string | null;
  readonly isRecurring?: boolean;
  readonly recurrenceRule?: string | null;
}

export interface UpdateCalendarEventInput {
  readonly branchId?: string | null;
  readonly academicYearId?: string | null;
  readonly type?: CalendarEventTypeValue;
  readonly title?: string;
  readonly description?: string | null;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly allDay?: boolean;
  readonly startTime?: Date | null;
  readonly endTime?: Date | null;
  readonly audienceJson?: readonly CalendarAudienceValue[] | null;
  readonly colorHex?: string | null;
  readonly isRecurring?: boolean;
  readonly recurrenceRule?: string | null;
}

export interface CalendarEventListFilter {
  readonly branchId?: string | null;
  readonly academicYearId?: string;
  readonly type?: CalendarEventTypeValue;
  readonly fromDate?: Date;
  readonly toDate?: Date;
}

@Injectable()
export class CalendarEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('CalendarEventRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<CalendarEventRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.calendarEvent.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(
    filter: CalendarEventListFilter,
    tx?: PrismaTx,
  ): Promise<readonly CalendarEventRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.branchId !== undefined) where.branchId = filter.branchId;
    if (filter.academicYearId !== undefined) where.academicYearId = filter.academicYearId;
    if (filter.type !== undefined) where.type = filter.type;
    if (filter.fromDate !== undefined || filter.toDate !== undefined) {
      const range: Record<string, Date> = {};
      if (filter.fromDate !== undefined) range.gte = filter.fromDate;
      if (filter.toDate !== undefined) range.lte = filter.toDate;
      where.startDate = range;
    }
    const rows = await reader.calendarEvent.findMany({
      where,
      orderBy: [{ startDate: 'asc' }],
    });
    return rows.map(map);
  }

  public async create(
    input: CreateCalendarEventInput,
    tx?: PrismaTx,
  ): Promise<CalendarEventRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.calendarEvent.create({
      data: {
        schoolId,
        branchId: input.branchId ?? null,
        academicYearId: input.academicYearId ?? null,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        allDay: input.allDay ?? true,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        audienceJson: input.audienceJson === null || input.audienceJson === undefined
          ? Prisma.JsonNull
          : (input.audienceJson as unknown as Prisma.InputJsonValue),
        colorHex: input.colorHex ?? null,
        isRecurring: input.isRecurring ?? false,
        recurrenceRule: input.recurrenceRule ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateCalendarEventInput,
    tx?: PrismaTx,
  ): Promise<CalendarEventRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateCalendarEventInput> = [
      'branchId', 'academicYearId', 'type', 'title', 'description',
      'startDate', 'endDate', 'allDay', 'startTime', 'endTime',
      'colorHex', 'isRecurring', 'recurrenceRule',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    if (input.audienceJson !== undefined) {
      data.audienceJson = input.audienceJson === null
        ? Prisma.JsonNull
        : (input.audienceJson as unknown as Prisma.InputJsonValue);
    }
    const result = await writer.calendarEvent.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('CalendarEvent', id, expectedVersion);
    const row = await writer.calendarEvent.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('CalendarEvent', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.calendarEvent.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('CalendarEvent', id, expectedVersion);
  }
}

interface RawEvent {
  id: string;
  schoolId: string;
  branchId: string | null;
  academicYearId: string | null;
  type: CalendarEventTypeValue;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  startTime: Date | null;
  endTime: Date | null;
  audienceJson: unknown;
  colorHex: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawEvent): CalendarEventRow {
  let audience: readonly CalendarAudienceValue[] | null = null;
  if (Array.isArray(row.audienceJson)) {
    audience = row.audienceJson.filter((v): v is CalendarAudienceValue =>
      v === 'STUDENT' || v === 'PARENT' || v === 'STAFF',
    );
  }
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    academicYearId: row.academicYearId,
    type: row.type,
    title: row.title,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    allDay: row.allDay,
    startTime: row.startTime,
    endTime: row.endTime,
    audienceJson: audience,
    colorHex: row.colorHex,
    isRecurring: row.isRecurring,
    recurrenceRule: row.recurrenceRule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
