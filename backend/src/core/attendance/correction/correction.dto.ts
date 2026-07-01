/**
 * DTOs for `/attendance-corrections`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  ATTENDANCE_CORRECTION_STATUS_VALUES,
  ATTENDANCE_STATUS_VALUES,
  type AttendanceCorrectionStatusValue,
  type AttendanceStatusValue,
} from '../attendance.constants';
import type { AttendanceCorrectionRow } from '../attendance.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const USER_STATUS_VALUES = ATTENDANCE_STATUS_VALUES.filter((s) => s !== 'HOLIDAY');

export class CreateCorrectionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly attendanceDailyId!: string;

  @ApiProperty({ enum: USER_STATUS_VALUES as unknown as string[] })
  @IsEnum(USER_STATUS_VALUES as unknown as object)
  public readonly newStatus!: AttendanceStatusValue;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500)
  public readonly reason!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly supportingFileId?: string;
}

export class DecideCorrectionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly decisionReason?: string;
}

export class CorrectionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ATTENDANCE_CORRECTION_STATUS_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ATTENDANCE_CORRECTION_STATUS_VALUES as unknown as object)
  public readonly status?: AttendanceCorrectionStatusValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly attendanceDailyId?: string;
}

export class CorrectionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly attendanceDailyId!: string;
  @ApiProperty() public readonly requestedBy!: string;
  @ApiProperty() public readonly requestedAt!: string;
  @ApiProperty({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly previousStatus!: AttendanceStatusValue;
  @ApiProperty({ enum: ATTENDANCE_STATUS_VALUES as unknown as string[] })
  public readonly newStatus!: AttendanceStatusValue;
  @ApiProperty() public readonly reason!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly supportingFileId!: string | null;
  @ApiProperty({ enum: ATTENDANCE_CORRECTION_STATUS_VALUES as unknown as string[] })
  public readonly status!: AttendanceCorrectionStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly decidedBy!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly decidedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly decisionReason!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: AttendanceCorrectionRow): CorrectionResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      attendanceDailyId: row.attendanceDailyId,
      requestedBy: row.requestedBy,
      requestedAt: row.requestedAt.toISOString(),
      previousStatus: row.previousStatus,
      newStatus: row.newStatus,
      reason: row.reason,
      supportingFileId: row.supportingFileId,
      status: row.status,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString(),
      decisionReason: row.decisionReason,
      version: row.version,
    };
  }
}

export class CorrectionListResponseDto {
  @ApiProperty({ type: () => [CorrectionResponseDto] })
  public readonly items!: readonly CorrectionResponseDto[];
  @ApiPropertyOptional({ nullable: true }) public readonly nextCursor!: string | null;
}
