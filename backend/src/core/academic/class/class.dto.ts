/**
 * Class DTOs — request / response shapes for the `classes` endpoints.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import type { ClassRow } from '../academic.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateClassDto {
  @ApiProperty({ description: 'Display name, e.g. "Grade 5". Unique per school.', maxLength: 60 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(60)
  public readonly name!: string;

  @ApiProperty({ description: 'Numeric grade for sorting (0..20).', minimum: 0, maximum: 20 })
  @IsInt()
  @Min(0)
  @Max(20)
  public readonly gradeLevel!: number;

  @ApiPropertyOptional({ description: 'Tiebreaker order within a grade. Defaults to 0.', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly displayOrder?: number;
}

export class UpdateClassDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public readonly name?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  public readonly gradeLevel?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly displayOrder?: number;
}

export class ClassResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty()
  public readonly gradeLevel!: number;

  @ApiProperty()
  public readonly displayOrder!: number;

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

  public static from(row: ClassRow): ClassResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      gradeLevel: row.gradeLevel,
      displayOrder: row.displayOrder,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class ClassListResponseDto {
  @ApiProperty({ type: [ClassResponseDto] })
  public readonly items!: readonly ClassResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}
