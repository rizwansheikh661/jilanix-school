import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';
import type { PrismaTx } from '../../infra/prisma/types';
import { NotFoundError } from '../errors/domain-error';
import { RequestContextRegistry } from '../request-context';
import {
  CalendarEventEndBeforeStartError,
  CalendarEventTimeRequiredError,
  HalfDaySessionRequiredError,
  HolidayCollisionError,
} from './calendar.errors';
import type {
  AttendanceTreatmentValue,
  SessionTypeValue,
} from './calendar.constants';
import type {
  CalendarEventRow,
  HolidayRow,
  WorkingDayResolution,
  WorkingDaysConfigurationRow,
} from './calendar.types';
import {
  CalendarEventRepository,
  type CalendarEventListFilter,
  type CreateCalendarEventInput,
  type UpdateCalendarEventInput,
} from './repositories/calendar-event.repository';
import {
  HolidayRepository,
  type CreateHolidayInput,
  type HolidayListFilter,
  type UpdateHolidayInput,
} from './repositories/holiday.repository';
import {
  WorkingDaysConfigurationRepository,
  type CreateWorkingDaysConfigurationInput,
} from './repositories/working-days.repository';

function normaliseDate(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return date;
}

function isoDow(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

@Injectable()
export class HolidayService {
  private readonly logger = new Logger(HolidayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HolidayRepository,
  ) {}

  public async list(filter: HolidayListFilter): Promise<readonly HolidayRow[]> {
    return this.repo.listAll(filter);
  }

  public async get(id: string): Promise<HolidayRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('Holiday', id);
    return row;
  }

  public async create(input: CreateHolidayInput): Promise<HolidayRow> {
    if (!input.isFullDay && (input.halfDaySession === null || input.halfDaySession === undefined)) {
      throw new HalfDaySessionRequiredError();
    }
    return this.prisma.transaction(async (tx) => {
      const collisions = await this.repo.findByDate(
        { branchId: input.branchId ?? null, date: input.date },
        tx,
      );
      const sameScope = collisions.filter((h) => h.branchId === (input.branchId ?? null));
      if (sameScope.length > 0) {
        throw new HolidayCollisionError({
          schoolId: sameScope[0]!.schoolId,
          branchId: input.branchId ?? null,
          date: input.date.toISOString().slice(0, 10),
        });
      }
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created Holiday ${row.id} (${row.name} on ${row.date.toISOString().slice(0, 10)}).`);
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateHolidayInput,
  ): Promise<HolidayRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Holiday', id);
      const isFullDay = input.isFullDay ?? existing.isFullDay;
      const halfDaySession = input.halfDaySession === undefined
        ? existing.halfDaySession
        : input.halfDaySession;
      if (!isFullDay && halfDaySession === null) {
        throw new HalfDaySessionRequiredError();
      }
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Holiday', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }
}

@Injectable()
export class CalendarEventService {
  private readonly logger = new Logger(CalendarEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: CalendarEventRepository,
  ) {}

  public async list(filter: CalendarEventListFilter): Promise<readonly CalendarEventRow[]> {
    return this.repo.listAll(filter);
  }

  public async get(id: string): Promise<CalendarEventRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('CalendarEvent', id);
    return row;
  }

  public async listUpcoming(args: {
    fromDate: Date;
    toDate: Date;
    branchId?: string;
  }): Promise<readonly CalendarEventRow[]> {
    return this.repo.listAll({
      branchId: args.branchId,
      fromDate: args.fromDate,
      toDate: args.toDate,
    });
  }

  public async create(input: CreateCalendarEventInput): Promise<CalendarEventRow> {
    this.validateTiming(input.startDate, input.endDate, input.allDay ?? true, input.startTime ?? null, input.endTime ?? null);
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created CalendarEvent ${row.id} (${row.title}).`);
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('CalendarEvent', id);
      const startDate = input.startDate ?? existing.startDate;
      const endDate = input.endDate ?? existing.endDate;
      const allDay = input.allDay ?? existing.allDay;
      const startTime = input.startTime === undefined ? existing.startTime : input.startTime;
      const endTime = input.endTime === undefined ? existing.endTime : input.endTime;
      this.validateTiming(startDate, endDate, allDay, startTime, endTime);
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('CalendarEvent', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }

  private validateTiming(
    startDate: Date,
    endDate: Date,
    allDay: boolean,
    startTime: Date | null,
    endTime: Date | null,
  ): void {
    if (endDate.getTime() < startDate.getTime()) throw new CalendarEventEndBeforeStartError();
    if (!allDay) {
      if (startTime === null || endTime === null) throw new CalendarEventTimeRequiredError();
      if (startTime.getTime() >= endTime.getTime()) throw new CalendarEventTimeRequiredError();
    }
  }
}

@Injectable()
export class WorkingDaysService {
  private readonly logger = new Logger(WorkingDaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkingDaysConfigurationRepository,
  ) {}

  public async listForBranch(args: {
    branchId: string | null;
    date?: Date;
  }): Promise<readonly WorkingDaysConfigurationRow[]> {
    return this.repo.listForBranch(args);
  }

  public async upsertPattern(input: CreateWorkingDaysConfigurationInput): Promise<WorkingDaysConfigurationRow> {
    return this.prisma.transaction(async (tx) => {
      const open = await this.repo.findOpenForKey(
        { branchId: input.branchId ?? null, dayOfWeek: input.dayOfWeek },
        tx,
      );
      if (open !== null) {
        const closeOn = new Date(input.effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
        await this.repo.closeOpenRow({ id: open.id, effectiveTo: closeOn }, tx);
      }
      const row = await this.repo.create(input, tx);
      this.logger.log(
        `Stored WorkingDaysConfiguration ${row.id} (branch=${row.branchId ?? 'school-wide'}, dow=${row.dayOfWeek}).`,
      );
      return row;
    });
  }
}

interface SchoolSettingsLite {
  workingDaysJson: unknown;
}

@Injectable()
export class WorkingDayResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wdcRepo: WorkingDaysConfigurationRepository,
    private readonly holidayRepo: HolidayRepository,
  ) {}

  public async resolve(args: {
    branchId: string | null;
    date: Date;
  }): Promise<WorkingDayResolution> {
    const date = normaliseDate(args.date);
    const dow = isoDow(date);

    return this.prisma.transaction(async (tx) => {
      const holidayHits = await this.holidayRepo.findByDate(
        { branchId: args.branchId, date },
        tx,
      );
      const branchHoliday = holidayHits.find((h) => h.branchId === args.branchId);
      const schoolHoliday = holidayHits.find((h) => h.branchId === null);
      const holiday = branchHoliday ?? schoolHoliday ?? null;
      if (holiday !== null && holiday.attendanceTreatment === ('HOLIDAY' satisfies AttendanceTreatmentValue)) {
        return {
          date,
          isWorking: false,
          sessionType: holiday.isFullDay ? 'FULL' : 'HALF',
          source: 'holiday',
          holidayId: holiday.id,
        };
      }

      if (args.branchId !== null) {
        const branchRow = await this.wdcRepo.findActive(
          { branchId: args.branchId, dayOfWeek: dow, date },
          tx,
        );
        if (branchRow !== null) {
          return {
            date,
            isWorking: branchRow.isWorking,
            sessionType: branchRow.sessionType,
            source: 'branch',
            holidayId: null,
          };
        }
      }

      const schoolRow = await this.wdcRepo.findActive(
        { branchId: null, dayOfWeek: dow, date },
        tx,
      );
      if (schoolRow !== null) {
        return {
          date,
          isWorking: schoolRow.isWorking,
          sessionType: schoolRow.sessionType,
          source: 'school',
          holidayId: null,
        };
      }

      const fallback = await this.fallbackFromSchoolSettings(dow, tx);
      return {
        date,
        isWorking: fallback,
        sessionType: 'FULL',
        source: 'fallback',
        holidayId: null,
      };
    });
  }

  private async fallbackFromSchoolSettings(dow: number, tx: PrismaTx): Promise<boolean> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) return false;
    const row = (await tx.schoolSettings.findFirst({
      where: { schoolId: ctx.schoolId },
    })) as SchoolSettingsLite | null;
    if (row === null) return false;
    const json = row.workingDaysJson;
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return false;
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const key = keys[dow - 1];
    if (key === undefined) return false;
    const value = (json as Record<string, unknown>)[key];
    return value === true;
  }
}

export type { SessionTypeValue };
