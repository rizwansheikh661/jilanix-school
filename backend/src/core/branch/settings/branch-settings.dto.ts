import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import type { BranchSettingsRow } from '../branch.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateBranchSettingsDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsOptional()
  public readonly workingDaysJson?: unknown | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsOptional()
  public readonly periodSettingsJson?: unknown | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(0)
  public readonly attendanceWindowOverrideHours?: number | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(40)
  public readonly primaryLanguage?: string | null;
}

export class BranchSettingsResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly branchId!: string;
  @ApiProperty({ nullable: true }) public readonly workingDaysJson!: unknown | null;
  @ApiProperty({ nullable: true }) public readonly periodSettingsJson!: unknown | null;
  @ApiProperty({ nullable: true }) public readonly attendanceWindowOverrideHours!: number | null;
  @ApiProperty({ nullable: true }) public readonly primaryLanguage!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: BranchSettingsRow): BranchSettingsResponseDto {
    return {
      schoolId: row.schoolId,
      branchId: row.branchId,
      workingDaysJson: row.workingDaysJson,
      periodSettingsJson: row.periodSettingsJson,
      attendanceWindowOverrideHours: row.attendanceWindowOverrideHours,
      primaryLanguage: row.primaryLanguage,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
