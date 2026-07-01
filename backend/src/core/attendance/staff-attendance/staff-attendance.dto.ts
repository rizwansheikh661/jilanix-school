/**
 * DTOs for `/staff-attendance`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  ATTENDANCE_BULK_MAX_ENTRIES,
  ATTENDANCE_SOURCE_VALUES,
  ATTENDANCE_STATUS_VALUES,
  type AttendanceSourceValue,
  type AttendanceStatusValue,
} from '../attendance.constants';
import type { StaffAttendanceRow } from '../attendance.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const USER_STATUS_VALUES = ATTENDANCE_STATUS_VALUES.filter((s) => s !== 'HOLIDAY');

export class MarkStaffAttendanceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly staffId!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly date!: string;

  @ApiProperty({ enum: USER_STATUS_VALUES as unknown as string[] })
  @IsEnum(USER_STATUS_VALUES as unknown as object)
  public readonly status!: AttendanceStatusValue;

  @ApiPropertyOptional({ enum: ATTENDANCE_SOURCE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ATTENDANCE_SOURCE_VALUES as unknown as object)
  public readonly source?: AttendanceSourceValue;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  public readonly checkInTime?: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  public readonly checkOutTime?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly remarks?: string;
}

export class BulkStaffAttendanceEntryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID()
  public readonly staffId!: string;

  @ApiPropertyOptional({ enum: USER_STATUS_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(USER_STATUS_VALUES as unknown as object)
  public readonly status?: AttendanceStatusValue;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly remarks?: string;
}

export class BulkStaffAttendanceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiProperty({ format: 'date' }) @IsDateString()
  public readonly date!: string;

  @ApiPropertyOptional({ enum: USER_STATUS_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(USER_STATUS_VALUES as unknown as object)
  public readonly defaultStatus?: AttendanceStatusValue;

  @ApiPropertyOptional({ enum: ATTENDANCE_SOURCE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ATTENDANCE_SOURCE_VALUES as unknown as object)
  public readonly source?: AttendanceSourceValue;

  @ApiProperty({ type: () => [BulkStaffAttendanceEntryDto], maxItems: ATTENDANCE_BULK_MAX_ENTRIES })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(ATTENDANCE_BULK_MAX_ENTRIES)
  @ValidateNested({ each: true }) @Type(() => BulkStaffAttendanceEntryDto)
  public readonly entries!: BulkStaffAttendanceEntryDto[];
}

export class UpdateStaffAttendanceDto {
  @ApiPropertyOptional({ enum: USER_STATUS_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(USER_STATUS_VALUES as unknown as object)
  public readonly status?: AttendanceStatusValue;

  @ApiPropertyOptional({ enum: ATTENDANCE_SOURCE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ATTENDANCE_SOURCE_VALUES as unknown as object)
  public readonly source?: AttendanceSourceValue;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  public readonly checkInTime?: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  public readonly checkOutTime?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly remarks?: string;
}

export class StaffAttendanceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly staffId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly dateTo?: string;

  @ApiPropertyOptional({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ATTENDANCE_STATUS_VALUES as unknown as object)
  public readonly status?: AttendanceStatusValue;
}

export class StaffAttendanceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly branchId!: string | null;
  @ApiProperty() public readonly staffId!: string;
  @ApiProperty({ format: 'date' }) public readonly date!: string;
  @ApiProperty({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly status!: AttendanceStatusValue;
  @ApiProperty({ enum: ATTENDANCE_SOURCE_VALUES as unknown as string[] })
  public readonly source!: AttendanceSourceValue;
  @ApiProperty() public readonly markedAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly markedBy!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly checkInTime!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly checkOutTime!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly remarks!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: StaffAttendanceRow): StaffAttendanceResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      staffId: row.staffId,
      date: row.date.toISOString().slice(0, 10),
      status: row.status,
      source: row.source,
      markedAt: row.markedAt.toISOString(),
      markedBy: row.markedBy,
      checkInTime: row.checkInTime === null ? null : row.checkInTime.toISOString(),
      checkOutTime: row.checkOutTime === null ? null : row.checkOutTime.toISOString(),
      remarks: row.remarks,
      version: row.version,
    };
  }
}

export class StaffAttendanceListResponseDto {
  @ApiProperty({ type: () => [StaffAttendanceResponseDto] })
  public readonly items!: readonly StaffAttendanceResponseDto[];
  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class BulkStaffAttendanceResultDto {
  @ApiProperty() public readonly staffId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly id!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly status!: AttendanceStatusValue | null;
  @ApiPropertyOptional({ nullable: true }) public readonly error!: string | null;
}

export class BulkStaffAttendanceResponseDto {
  @ApiProperty() public readonly created!: number;
  @ApiProperty() public readonly failed!: number;
  @ApiProperty({ type: () => [BulkStaffAttendanceResultDto] })
  public readonly results!: readonly BulkStaffAttendanceResultDto[];
}
