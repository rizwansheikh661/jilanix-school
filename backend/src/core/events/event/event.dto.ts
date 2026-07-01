/**
 * DTOs for `/events`. Shape + per-field validation; service enforces tenant
 * scope, state machine, cross-tenant FK guards, and duplicate-code checks.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  EVENT_CATEGORY_VALUES,
  EVENT_CODE_PATTERN,
  EVENT_REGISTRATION_TYPE_VALUES,
  EVENT_STATUS_VALUES,
  EVENT_TYPE_VALUES,
  MAX_MONEY_AMOUNT,
  MAX_REGISTRATION_CAPACITY,
  TIME_HHMM_PATTERN,
  type EventCategoryValue,
  type EventRegistrationTypeValue,
  type EventStatusValue,
  type EventTypeValue,
} from '../events.constants';
import type { EventRow } from '../events.types';

export class EventListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EVENT_STATUS_VALUES })
  @IsOptional() @IsEnum(EVENT_STATUS_VALUES)
  public readonly status?: EventStatusValue;

  @ApiPropertyOptional({ enum: EVENT_TYPE_VALUES })
  @IsOptional() @IsEnum(EVENT_TYPE_VALUES)
  public readonly eventType?: EventTypeValue;

  @ApiPropertyOptional({ enum: EVENT_CATEGORY_VALUES })
  @IsOptional() @IsEnum(EVENT_CATEGORY_VALUES)
  public readonly category?: EventCategoryValue;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ description: 'ISO date (inclusive) startDate lower bound.' })
  @IsOptional() @IsDateString()
  public readonly from?: string;

  @ApiPropertyOptional({ description: 'ISO date (inclusive) startDate upper bound.' })
  @IsOptional() @IsDateString()
  public readonly to?: string;
}

export class CreateEventDto {
  @ApiPropertyOptional({
    maxLength: 40,
    pattern: EVENT_CODE_PATTERN.source,
    description: 'Optional; defaults to auto-generated EVT-<seq>.',
  })
  @IsOptional() @IsString() @MaxLength(40) @Matches(EVENT_CODE_PATTERN)
  public readonly code?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @IsOptional() @IsString() @MaxLength(10_000)
  public readonly description?: string | null;

  @ApiProperty({ enum: EVENT_TYPE_VALUES })
  @IsEnum(EVENT_TYPE_VALUES)
  public readonly eventType!: EventTypeValue;

  @ApiProperty({ enum: EVENT_CATEGORY_VALUES })
  @IsEnum(EVENT_CATEGORY_VALUES)
  public readonly category!: EventCategoryValue;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional() @IsString() @MaxLength(80)
  public readonly subType?: string | null;

  @ApiProperty({ description: 'ISO date (YYYY-MM-DD).' })
  @IsISO8601()
  public readonly startDate!: string;

  @ApiProperty({ description: 'ISO date (YYYY-MM-DD).' })
  @IsISO8601()
  public readonly endDate!: string;

  @ApiPropertyOptional({ pattern: TIME_HHMM_PATTERN.source, nullable: true })
  @IsOptional() @Matches(TIME_HHMM_PATTERN)
  public readonly startTime?: string | null;

  @ApiPropertyOptional({ pattern: TIME_HHMM_PATTERN.source, nullable: true })
  @IsOptional() @Matches(TIME_HHMM_PATTERN)
  public readonly endTime?: string | null;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  public readonly timezone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @IsString() @MaxLength(200)
  public readonly venue?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly organizerStaffId?: string | null;

  @ApiPropertyOptional({ enum: EVENT_REGISTRATION_TYPE_VALUES })
  @IsOptional() @IsEnum(EVENT_REGISTRATION_TYPE_VALUES)
  public readonly registrationType?: EventRegistrationTypeValue;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_REGISTRATION_CAPACITY, nullable: true })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_REGISTRATION_CAPACITY)
  public readonly registrationCapacity?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  public readonly isFree?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly feeHeadId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly feeStructureId?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly feeAmount?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly estimatedCost?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly actualCost?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly sponsorshipAmount?: number | null;
}

export class UpdateEventDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @IsOptional() @IsString() @MaxLength(10_000)
  public readonly description?: string | null;

  @ApiPropertyOptional({ enum: EVENT_TYPE_VALUES })
  @IsOptional() @IsEnum(EVENT_TYPE_VALUES)
  public readonly eventType?: EventTypeValue;

  @ApiPropertyOptional({ enum: EVENT_CATEGORY_VALUES })
  @IsOptional() @IsEnum(EVENT_CATEGORY_VALUES)
  public readonly category?: EventCategoryValue;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional() @IsString() @MaxLength(80)
  public readonly subType?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsISO8601()
  public readonly startDate?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsISO8601()
  public readonly endDate?: string;

  @ApiPropertyOptional({ pattern: TIME_HHMM_PATTERN.source, nullable: true })
  @IsOptional() @Matches(TIME_HHMM_PATTERN)
  public readonly startTime?: string | null;

  @ApiPropertyOptional({ pattern: TIME_HHMM_PATTERN.source, nullable: true })
  @IsOptional() @Matches(TIME_HHMM_PATTERN)
  public readonly endTime?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @IsString() @MaxLength(200)
  public readonly venue?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly organizerStaffId?: string | null;

  @ApiPropertyOptional({ enum: EVENT_REGISTRATION_TYPE_VALUES })
  @IsOptional() @IsEnum(EVENT_REGISTRATION_TYPE_VALUES)
  public readonly registrationType?: EventRegistrationTypeValue;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_REGISTRATION_CAPACITY, nullable: true })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_REGISTRATION_CAPACITY)
  public readonly registrationCapacity?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isFree?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly feeHeadId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly feeStructureId?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly feeAmount?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly estimatedCost?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly actualCost?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY_AMOUNT, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY_AMOUNT)
  public readonly sponsorshipAmount?: number | null;
}

export class CancelEventDto {
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly reason?: string | null;
}

export class EventResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ enum: EVENT_TYPE_VALUES }) public readonly eventType!: EventTypeValue;
  @ApiProperty({ enum: EVENT_CATEGORY_VALUES }) public readonly category!: EventCategoryValue;
  @ApiPropertyOptional({ nullable: true }) public readonly subType!: string | null;
  @ApiProperty({ enum: EVENT_STATUS_VALUES }) public readonly status!: EventStatusValue;
  @ApiProperty() public readonly startDate!: string;
  @ApiProperty() public readonly endDate!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly startTime!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly endTime!: string | null;
  @ApiProperty() public readonly timezone!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly branchId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly venue!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly organizerStaffId!: string | null;
  @ApiProperty({ enum: EVENT_REGISTRATION_TYPE_VALUES })
  public readonly registrationType!: EventRegistrationTypeValue;
  @ApiProperty() public readonly registrationOpen!: boolean;
  @ApiPropertyOptional({ nullable: true }) public readonly registrationOpenAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly registrationClosedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly registrationCapacity!: number | null;
  @ApiProperty() public readonly isFree!: boolean;
  @ApiPropertyOptional({ nullable: true }) public readonly feeHeadId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly feeStructureId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly feeAmount!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly estimatedCost!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly actualCost!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly sponsorshipAmount!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly completedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancelledAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancellationReason!: string | null;
  @ApiProperty() public readonly registeredCount!: number;
  @ApiProperty() public readonly attendedCount!: number;
  @ApiProperty() public readonly absentCount!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: EventRow): EventResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      description: row.description,
      eventType: row.eventType,
      category: row.category,
      subType: row.subType,
      status: row.status,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      startTime: row.startTime === null ? null : row.startTime.toISOString().slice(11, 16),
      endTime: row.endTime === null ? null : row.endTime.toISOString().slice(11, 16),
      timezone: row.timezone,
      branchId: row.branchId,
      venue: row.venue,
      organizerStaffId: row.organizerStaffId,
      registrationType: row.registrationType,
      registrationOpen: row.registrationOpen,
      registrationOpenAt:
        row.registrationOpenAt === null ? null : row.registrationOpenAt.toISOString(),
      registrationClosedAt:
        row.registrationClosedAt === null ? null : row.registrationClosedAt.toISOString(),
      registrationCapacity: row.registrationCapacity,
      isFree: row.isFree,
      feeHeadId: row.feeHeadId,
      feeStructureId: row.feeStructureId,
      feeAmount: row.feeAmount,
      estimatedCost: row.estimatedCost,
      actualCost: row.actualCost,
      sponsorshipAmount: row.sponsorshipAmount,
      publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
      startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
      completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
      cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
      cancellationReason: row.cancellationReason,
      registeredCount: row.registeredCount,
      attendedCount: row.attendedCount,
      absentCount: row.absentCount,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class EventListResponseDto {
  @ApiProperty({ type: () => [EventResponseDto] })
  public readonly items!: readonly EventResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
