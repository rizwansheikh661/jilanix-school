/**
 * DTOs for `/attendance/config`. Single-row read + idempotent upsert keyed
 * by `(schoolId, branchId)` with `branchId=null` being the school-wide
 * default applied to every branch lacking an override.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  ATTENDANCE_SOURCE_VALUES,
  type AttendanceSourceValue,
} from '../attendance.constants';
import type { AttendanceConfigRow } from '../attendance.types';

export class AttendanceConfigQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;
}

export class UpsertAttendanceConfigDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Null for school-wide default.' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 720 })
  @IsOptional() @IsInt() @Min(0) @Max(720)
  public readonly editWindowHours?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 240 })
  @IsOptional() @IsInt() @Min(0) @Max(240)
  public readonly lateThresholdMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly correctionsRequireApproval?: boolean;

  @ApiPropertyOptional({ isArray: true, enum: ATTENDANCE_SOURCE_VALUES as unknown as string[] })
  @IsOptional() @IsArray() @ArrayUnique()
  @IsEnum(ATTENDANCE_SOURCE_VALUES as unknown as object, { each: true })
  public readonly allowedSources?: AttendanceSourceValue[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly holidayAutoMark?: boolean;
}

export class AttendanceConfigResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly branchId!: string | null;
  @ApiProperty() public readonly editWindowHours!: number;
  @ApiProperty() public readonly lateThresholdMinutes!: number;
  @ApiProperty() public readonly correctionsRequireApproval!: boolean;
  @ApiProperty({ isArray: true, enum: ATTENDANCE_SOURCE_VALUES as unknown as string[] })
  public readonly allowedSources!: readonly AttendanceSourceValue[];
  @ApiProperty() public readonly holidayAutoMark!: boolean;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: AttendanceConfigRow): AttendanceConfigResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      editWindowHours: row.editWindowHours,
      lateThresholdMinutes: row.lateThresholdMinutes,
      correctionsRequireApproval: row.correctionsRequireApproval,
      allowedSources: row.allowedSources,
      holidayAutoMark: row.holidayAutoMark,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class AttendanceConfigListResponseDto {
  @ApiProperty({ type: () => [AttendanceConfigResponseDto] })
  public readonly items!: readonly AttendanceConfigResponseDto[];
}
