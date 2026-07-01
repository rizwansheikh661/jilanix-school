/**
 * Subject DTOs — request / response shapes for the `subjects` endpoints.
 *
 * `code` is enforced uppercase + trimmed at the DTO boundary so the
 * DB-level unique index (`uq_subjects_school_code`) collates predictably
 * even when clients send mixed-case input.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SUBJECT_TYPE_VALUES, type SubjectRow, type SubjectTypeValue } from '../academic.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const upperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSubjectDto {
  @ApiProperty({ description: 'Display name, e.g. "Mathematics".', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  public readonly name!: string;

  @ApiProperty({
    description: 'Short stable code, e.g. "MATH". Uppercased + trimmed; unique per school.',
    maxLength: 20,
  })
  @Transform(upperTrim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9._-]+$/, { message: 'code must contain only A-Z, 0-9, dot, underscore, hyphen.' })
  public readonly code!: string;

  @ApiProperty({ enum: SUBJECT_TYPE_VALUES as unknown as string[], default: 'CORE' })
  @IsEnum(SUBJECT_TYPE_VALUES as unknown as object)
  public readonly type!: SubjectTypeValue;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Z0-9._-]+$/)
  public readonly code?: string;

  @ApiPropertyOptional({ enum: SUBJECT_TYPE_VALUES as unknown as string[] })
  @IsOptional()
  @IsEnum(SUBJECT_TYPE_VALUES as unknown as object)
  public readonly type?: SubjectTypeValue;
}

export class SubjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty()
  public readonly code!: string;

  @ApiProperty({ enum: SUBJECT_TYPE_VALUES as unknown as string[] })
  public readonly type!: SubjectTypeValue;

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

  public static from(row: SubjectRow): SubjectResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      code: row.code,
      type: row.type,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class SubjectListResponseDto {
  @ApiProperty({ type: [SubjectResponseDto] })
  public readonly items!: readonly SubjectResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}
