/**
 * DTOs for `/events/{id}/attendance`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  BULK_ATTENDANCE_MAX,
  EVENT_ATTENDANCE_METHOD_VALUES,
  EVENT_ATTENDANCE_STATUS_VALUES,
  type EventAttendanceMethodValue,
  type EventAttendanceStatusValue,
} from '../events.constants';
import type { EventAttendanceRow } from '../events.types';

export class EventAttendanceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly participantId?: string;

  @ApiPropertyOptional({ enum: EVENT_ATTENDANCE_STATUS_VALUES })
  @IsOptional() @IsEnum(EVENT_ATTENDANCE_STATUS_VALUES)
  public readonly status?: EventAttendanceStatusValue;
}

export class MarkAttendanceDto {
  @ApiProperty()
  @IsUUID()
  public readonly participantId!: string;

  @ApiProperty({ enum: EVENT_ATTENDANCE_STATUS_VALUES })
  @IsEnum(EVENT_ATTENDANCE_STATUS_VALUES)
  public readonly status!: EventAttendanceStatusValue;

  @ApiPropertyOptional({ enum: EVENT_ATTENDANCE_METHOD_VALUES, default: 'MANUAL' })
  @IsOptional() @IsEnum(EVENT_ATTENDANCE_METHOD_VALUES)
  public readonly method?: EventAttendanceMethodValue;

  @ApiPropertyOptional()
  @IsOptional() @IsISO8601()
  public readonly occurredAt?: string;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional() @IsString() @MaxLength(80)
  public readonly deviceRef?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class BulkMarkAttendanceDto {
  @ApiProperty({ type: () => [MarkAttendanceDto], maxItems: BULK_ATTENDANCE_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_ATTENDANCE_MAX)
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  public readonly entries!: readonly MarkAttendanceDto[];
}

export class EventAttendanceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly eventId!: string;
  @ApiProperty() public readonly participantId!: string;
  @ApiProperty({ enum: EVENT_ATTENDANCE_STATUS_VALUES })
  public readonly status!: EventAttendanceStatusValue;
  @ApiProperty({ enum: EVENT_ATTENDANCE_METHOD_VALUES })
  public readonly method!: EventAttendanceMethodValue;
  @ApiProperty() public readonly occurredAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly markedBy!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly deviceRef!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly notes!: string | null;
  @ApiProperty() public readonly createdAt!: string;

  public static from(row: EventAttendanceRow): EventAttendanceResponseDto {
    return {
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      status: row.status,
      method: row.method,
      occurredAt: row.occurredAt.toISOString(),
      markedBy: row.markedBy,
      deviceRef: row.deviceRef,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export class EventAttendanceListResponseDto {
  @ApiProperty({ type: () => [EventAttendanceResponseDto] })
  public readonly items!: readonly EventAttendanceResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class BulkMarkResponseDto {
  @ApiProperty() public readonly marked!: number;
  @ApiProperty() public readonly skipped!: number;

  public static of(marked: number, skipped: number): BulkMarkResponseDto {
    return Object.assign(new BulkMarkResponseDto(), { marked, skipped });
  }
}
