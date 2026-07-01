/**
 * DTOs for `/attendance/lock-windows`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import {
  ATTENDANCE_LOCK_SCOPE_VALUES,
  type AttendanceLockScopeValue,
} from '../attendance.constants';
import type { AttendanceLockWindowRow } from '../attendance.types';

export class CreateLockWindowDto {
  @ApiProperty({ enum: ATTENDANCE_LOCK_SCOPE_VALUES as unknown as string[] })
  @IsEnum(ATTENDANCE_LOCK_SCOPE_VALUES as unknown as object)
  public readonly scope!: AttendanceLockScopeValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly startDate!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly endDate!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public readonly reason?: string;
}

export class LockWindowListQueryDto {
  @ApiPropertyOptional({ enum: ATTENDANCE_LOCK_SCOPE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ATTENDANCE_LOCK_SCOPE_VALUES as unknown as object)
  public readonly scope?: AttendanceLockScopeValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly activeOn?: string;
}

export class LockWindowResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty({ enum: ATTENDANCE_LOCK_SCOPE_VALUES as unknown as string[] })
  public readonly scope!: AttendanceLockScopeValue;
  @ApiPropertyOptional({ nullable: true }) public readonly branchId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly sectionId!: string | null;
  @ApiProperty({ format: 'date' }) public readonly startDate!: string;
  @ApiProperty({ format: 'date' }) public readonly endDate!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly lockedBy!: string | null;
  @ApiProperty() public readonly lockedAt!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: AttendanceLockWindowRow): LockWindowResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      scope: row.scope,
      branchId: row.branchId,
      sectionId: row.sectionId,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      reason: row.reason,
      lockedBy: row.lockedBy,
      lockedAt: row.lockedAt.toISOString(),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class LockWindowListResponseDto {
  @ApiProperty({ type: () => [LockWindowResponseDto] })
  public readonly items!: readonly LockWindowResponseDto[];
}
