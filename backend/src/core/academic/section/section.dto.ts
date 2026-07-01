/**
 * Section DTOs — request / response shapes for the `sections` endpoints.
 *
 * Capacity is an optional positive integer. classTeacherId is a UUID or
 * explicitly null (unassign). Body of `AssignClassTeacherDto` mirrors the
 * dedicated route.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import type { SectionRow } from '../academic.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSectionDto {
  @ApiProperty({ description: 'Parent class id.', format: 'uuid' })
  @IsUUID()
  public readonly classId!: string;

  @ApiProperty({ description: 'Short label, e.g. "A". Unique within (school, class).', maxLength: 20 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  public readonly name!: string;

  @ApiPropertyOptional({ description: 'Soft cap on student count. Null = unbounded.', minimum: 1, maximum: 10_000 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  public readonly capacity?: number | null;

  @ApiPropertyOptional({ description: 'Optional class teacher (User id).', format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  public readonly classTeacherId?: string | null;
}

export class UpdateSectionDto {
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  public readonly name?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10_000, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  public readonly capacity?: number | null;
}

export class AssignClassTeacherDto {
  @ApiProperty({
    description: 'User id of the new class teacher. Pass `null` to unassign.',
    format: 'uuid',
    nullable: true,
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  public readonly teacherId!: string | null;
}

export class SectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly classId!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty({ nullable: true })
  public readonly capacity!: number | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly classTeacherId!: string | null;

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

  public static from(row: SectionRow): SectionResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      classId: row.classId,
      name: row.name,
      capacity: row.capacity,
      classTeacherId: row.classTeacherId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class SectionListResponseDto {
  @ApiProperty({ type: [SectionResponseDto] })
  public readonly items!: readonly SectionResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}
