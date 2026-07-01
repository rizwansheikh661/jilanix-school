/**
 * AcademicYear DTOs — request / response shapes for the academic-years
 * endpoints. Strings are trimmed, dates accept ISO `YYYY-MM-DD`, and the
 * response carries the audit + version columns clients need for the
 * optimistic-concurrency `If-Match` flow.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import type { AcademicYearRow } from '../academic.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAcademicYearDto {
  @ApiProperty({ description: 'Display name, e.g. "AY 2026-2027". Unique per school.', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  public readonly name!: string;

  @ApiProperty({ description: 'Year start date (ISO YYYY-MM-DD).', format: 'date' })
  @IsDateString({ strict: true })
  public readonly startDate!: string;

  @ApiProperty({ description: 'Year end date (ISO YYYY-MM-DD).', format: 'date' })
  @IsDateString({ strict: true })
  public readonly endDate!: string;
}

export class UpdateAcademicYearDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  public readonly name?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  public readonly startDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  public readonly endDate?: string;
}

export class AcademicYearResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty({ format: 'date' })
  public readonly startDate!: string;

  @ApiProperty({ format: 'date' })
  public readonly endDate!: string;

  @ApiProperty()
  public readonly isCurrent!: boolean;

  @ApiProperty()
  public readonly version!: number;

  @ApiProperty({ format: 'date-time' })
  public readonly createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly createdBy!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly updatedBy!: string | null;

  public static from(row: AcademicYearRow): AcademicYearResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      isCurrent: row.isCurrent,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class AcademicYearListResponseDto {
  @ApiProperty({ type: [AcademicYearResponseDto] })
  public readonly items!: readonly AcademicYearResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}
