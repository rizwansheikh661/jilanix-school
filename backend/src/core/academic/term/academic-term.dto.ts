/**
 * AcademicTerm DTOs — request/response shapes for the `/academic-years/:yearId/terms`
 * and `/academic-terms/:id` routes.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { AcademicTermRow } from '../academic.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAcademicTermDto {
  @ApiProperty({ description: 'Display name, e.g. "Term 1".', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  public readonly name!: string;

  @ApiPropertyOptional({
    description: '1-based ordinal within the year. Omit to auto-append next.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly sequence?: number;

  @ApiProperty({ format: 'date', description: 'ISO YYYY-MM-DD.' })
  @IsDateString({ strict: true })
  public readonly startDate!: string;

  @ApiProperty({ format: 'date', description: 'ISO YYYY-MM-DD.' })
  @IsDateString({ strict: true })
  public readonly endDate!: string;
}

export class UpdateAcademicTermDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  public readonly name?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly sequence?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  public readonly startDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  public readonly endDate?: string;
}

export class AcademicTermResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly academicYearId!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty()
  public readonly sequence!: number;

  @ApiProperty({ format: 'date' })
  public readonly startDate!: string;

  @ApiProperty({ format: 'date' })
  public readonly endDate!: string;

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

  public static from(row: AcademicTermRow): AcademicTermResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      academicYearId: row.academicYearId,
      name: row.name,
      sequence: row.sequence,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class AcademicTermListResponseDto {
  @ApiProperty({ type: [AcademicTermResponseDto] })
  public readonly items!: readonly AcademicTermResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}
