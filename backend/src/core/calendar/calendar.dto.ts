import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  ATTENDANCE_TREATMENT_VALUES,
  CALENDAR_AUDIENCE_VALUES,
  CALENDAR_EVENT_TYPE_VALUES,
  HALF_DAY_SESSION_VALUES,
  HOLIDAY_TYPE_VALUES,
  SESSION_TYPE_VALUES,
  type AttendanceTreatmentValue,
  type CalendarAudienceValue,
  type CalendarEventTypeValue,
  type HalfDaySessionValue,
  type HolidayTypeValue,
  type SessionTypeValue,
} from './calendar.constants';
import type {
  CalendarEventRow,
  HolidayRow,
  WorkingDayResolution,
  WorkingDaysConfigurationRow,
} from './calendar.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// ---------- Holiday ----------

export class CreateHolidayDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly date!: Date;

  @ApiProperty({ enum: HOLIDAY_TYPE_VALUES })
  @IsEnum(HOLIDAY_TYPE_VALUES as unknown as object)
  public readonly type!: HolidayTypeValue;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isFullDay?: boolean;

  @ApiPropertyOptional({ enum: HALF_DAY_SESSION_VALUES, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEnum(HALF_DAY_SESSION_VALUES as unknown as object)
  public readonly halfDaySession?: HalfDaySessionValue | null;

  @ApiPropertyOptional({ enum: ATTENDANCE_TREATMENT_VALUES })
  @IsOptional() @IsEnum(ATTENDANCE_TREATMENT_VALUES as unknown as object)
  public readonly attendanceTreatment?: AttendanceTreatmentValue;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly notes?: string | null;
}

export class UpdateHolidayDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @Type(() => Date) @IsDate()
  public readonly date?: Date;

  @ApiPropertyOptional({ enum: HOLIDAY_TYPE_VALUES })
  @IsOptional() @IsEnum(HOLIDAY_TYPE_VALUES as unknown as object)
  public readonly type?: HolidayTypeValue;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isFullDay?: boolean;

  @ApiPropertyOptional({ enum: HALF_DAY_SESSION_VALUES, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEnum(HALF_DAY_SESSION_VALUES as unknown as object)
  public readonly halfDaySession?: HalfDaySessionValue | null;

  @ApiPropertyOptional({ enum: ATTENDANCE_TREATMENT_VALUES })
  @IsOptional() @IsEnum(ATTENDANCE_TREATMENT_VALUES as unknown as object)
  public readonly attendanceTreatment?: AttendanceTreatmentValue;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly notes?: string | null;
}

export class HolidayListQueryDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly fromDate?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly toDate?: Date;

  @IsOptional() @IsEnum(HOLIDAY_TYPE_VALUES as unknown as object)
  public readonly type?: HolidayTypeValue;
}

export class HolidayResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly branchId!: string | null;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ format: 'date-time' }) public readonly date!: string;
  @ApiProperty({ enum: HOLIDAY_TYPE_VALUES }) public readonly type!: HolidayTypeValue;
  @ApiProperty() public readonly isFullDay!: boolean;
  @ApiProperty({ enum: HALF_DAY_SESSION_VALUES, nullable: true })
  public readonly halfDaySession!: HalfDaySessionValue | null;
  @ApiProperty({ enum: ATTENDANCE_TREATMENT_VALUES })
  public readonly attendanceTreatment!: AttendanceTreatmentValue;
  @ApiProperty({ nullable: true }) public readonly notes!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: HolidayRow): HolidayResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      name: row.name,
      date: row.date.toISOString(),
      type: row.type,
      isFullDay: row.isFullDay,
      halfDaySession: row.halfDaySession,
      attendanceTreatment: row.attendanceTreatment,
      notes: row.notes,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class HolidayListResponseDto {
  @ApiProperty({ type: [HolidayResponseDto] })
  public readonly items!: readonly HolidayResponseDto[];
}

// ---------- CalendarEvent ----------

export class CreateCalendarEventDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly academicYearId?: string | null;

  @ApiProperty({ enum: CALENDAR_EVENT_TYPE_VALUES })
  @IsEnum(CALENDAR_EVENT_TYPE_VALUES as unknown as object)
  public readonly type!: CalendarEventTypeValue;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200)
  public readonly title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString()
  public readonly description?: string | null;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly startDate!: Date;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly endDate!: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly allDay?: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Date) @IsDate()
  public readonly startTime?: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Date) @IsDate()
  public readonly endTime?: Date | null;

  @ApiPropertyOptional({ enum: CALENDAR_AUDIENCE_VALUES, isArray: true, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsArray()
  @IsEnum(CALENDAR_AUDIENCE_VALUES as unknown as object, { each: true })
  public readonly audienceJson?: CalendarAudienceValue[] | null;

  @ApiPropertyOptional({ pattern: HEX_PATTERN.source, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @Matches(HEX_PATTERN)
  public readonly colorHex?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isRecurring?: boolean;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(200)
  public readonly recurrenceRule?: string | null;
}

export class UpdateCalendarEventDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly academicYearId?: string | null;

  @ApiPropertyOptional({ enum: CALENDAR_EVENT_TYPE_VALUES })
  @IsOptional() @IsEnum(CALENDAR_EVENT_TYPE_VALUES as unknown as object)
  public readonly type?: CalendarEventTypeValue;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200)
  public readonly title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString()
  public readonly description?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @Type(() => Date) @IsDate()
  public readonly startDate?: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @Type(() => Date) @IsDate()
  public readonly endDate?: Date;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly allDay?: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Date) @IsDate()
  public readonly startTime?: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Date) @IsDate()
  public readonly endTime?: Date | null;

  @ApiPropertyOptional({ enum: CALENDAR_AUDIENCE_VALUES, isArray: true, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsArray()
  @IsEnum(CALENDAR_AUDIENCE_VALUES as unknown as object, { each: true })
  public readonly audienceJson?: CalendarAudienceValue[] | null;

  @ApiPropertyOptional({ pattern: HEX_PATTERN.source, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @Matches(HEX_PATTERN)
  public readonly colorHex?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  public readonly isRecurring?: boolean;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(200)
  public readonly recurrenceRule?: string | null;
}

export class CalendarEventListQueryDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @IsOptional() @IsEnum(CALENDAR_EVENT_TYPE_VALUES as unknown as object)
  public readonly type?: CalendarEventTypeValue;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly fromDate?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly toDate?: Date;
}

export class UpcomingCalendarEventQueryDto {
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly fromDate?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly toDate?: Date;
}

export class CalendarEventResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly branchId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly academicYearId!: string | null;
  @ApiProperty({ enum: CALENDAR_EVENT_TYPE_VALUES }) public readonly type!: CalendarEventTypeValue;
  @ApiProperty() public readonly title!: string;
  @ApiProperty({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly startDate!: string;
  @ApiProperty({ format: 'date-time' }) public readonly endDate!: string;
  @ApiProperty() public readonly allDay!: boolean;
  @ApiProperty({ format: 'date-time', nullable: true }) public readonly startTime!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) public readonly endTime!: string | null;
  @ApiProperty({ enum: CALENDAR_AUDIENCE_VALUES, isArray: true, nullable: true })
  public readonly audienceJson!: readonly CalendarAudienceValue[] | null;
  @ApiProperty({ nullable: true }) public readonly colorHex!: string | null;
  @ApiProperty() public readonly isRecurring!: boolean;
  @ApiProperty({ nullable: true }) public readonly recurrenceRule!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: CalendarEventRow): CalendarEventResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      academicYearId: row.academicYearId,
      type: row.type,
      title: row.title,
      description: row.description,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      allDay: row.allDay,
      startTime: row.startTime === null ? null : row.startTime.toISOString(),
      endTime: row.endTime === null ? null : row.endTime.toISOString(),
      audienceJson: row.audienceJson,
      colorHex: row.colorHex,
      isRecurring: row.isRecurring,
      recurrenceRule: row.recurrenceRule,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class CalendarEventListResponseDto {
  @ApiProperty({ type: [CalendarEventResponseDto] })
  public readonly items!: readonly CalendarEventResponseDto[];
}

// ---------- WorkingDays ----------

export class UpsertWorkingDaysDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @ApiProperty({ minimum: 1, maximum: 7, description: '1=Mon..7=Sun' })
  @IsInt() @Min(1) @Max(7)
  public readonly dayOfWeek!: number;

  @ApiProperty()
  @Transform(toBool) @IsBoolean()
  public readonly isWorking!: boolean;

  @ApiPropertyOptional({ enum: SESSION_TYPE_VALUES, default: 'FULL' })
  @IsOptional() @IsEnum(SESSION_TYPE_VALUES as unknown as object)
  public readonly sessionType?: SessionTypeValue;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly effectiveFrom!: Date;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly note?: string | null;
}

export class WorkingDaysQueryDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @IsOptional() @Type(() => Date) @IsDate()
  public readonly date?: Date;
}

export class WorkingDaysResolveQueryDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  public readonly branchId?: string | null;

  @Type(() => Date) @IsDate()
  public readonly date!: Date;
}

export class WorkingDaysConfigurationResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly branchId!: string | null;
  @ApiProperty() public readonly dayOfWeek!: number;
  @ApiProperty() public readonly isWorking!: boolean;
  @ApiProperty({ enum: SESSION_TYPE_VALUES }) public readonly sessionType!: SessionTypeValue;
  @ApiProperty({ format: 'date-time' }) public readonly effectiveFrom!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) public readonly effectiveTo!: string | null;
  @ApiProperty({ nullable: true }) public readonly note!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: WorkingDaysConfigurationRow): WorkingDaysConfigurationResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      dayOfWeek: row.dayOfWeek,
      isWorking: row.isWorking,
      sessionType: row.sessionType,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo === null ? null : row.effectiveTo.toISOString(),
      note: row.note,
      version: row.version,
    };
  }
}

export class WorkingDaysConfigurationListResponseDto {
  @ApiProperty({ type: [WorkingDaysConfigurationResponseDto] })
  public readonly items!: readonly WorkingDaysConfigurationResponseDto[];
}

export class WorkingDayResolutionResponseDto {
  @ApiProperty({ format: 'date-time' }) public readonly date!: string;
  @ApiProperty() public readonly isWorking!: boolean;
  @ApiProperty({ enum: SESSION_TYPE_VALUES }) public readonly sessionType!: SessionTypeValue;
  @ApiProperty({ enum: ['holiday', 'branch', 'school', 'fallback'] })
  public readonly source!: WorkingDayResolution['source'];
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly holidayId!: string | null;

  public static from(r: WorkingDayResolution): WorkingDayResolutionResponseDto {
    return {
      date: r.date.toISOString(),
      isWorking: r.isWorking,
      sessionType: r.sessionType,
      source: r.source,
      holidayId: r.holidayId,
    };
  }
}
