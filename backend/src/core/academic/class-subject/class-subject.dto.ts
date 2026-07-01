/**
 * ClassSubject DTOs — request/response shapes for the class default-subject
 * set endpoints. Mutations are PUT-only (`SetClassSubjectsDto` lists the
 * complete desired set).
 */
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import type { ClassSubjectRow } from '../academic.types';

export class ClassSubjectInputDto {
  @ApiProperty({ format: 'uuid', description: 'Subject id (same school).' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  public readonly isOptional?: boolean;

  @ApiProperty({ nullable: true, minimum: 0, maximum: 40 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40)
  public readonly weeklyPeriods?: number;
}

export class SetClassSubjectsDto {
  @ApiProperty({
    type: [ClassSubjectInputDto],
    description: 'Complete desired set of subjects offered by this class.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ClassSubjectInputDto)
  public readonly subjects!: ClassSubjectInputDto[];
}

export class ClassSubjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly classId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly subjectId!: string;

  @ApiProperty()
  public readonly isOptional!: boolean;

  @ApiProperty({ nullable: true })
  public readonly weeklyPeriods!: number | null;

  @ApiProperty()
  public readonly version!: number;

  public static from(row: ClassSubjectRow): ClassSubjectResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      classId: row.classId,
      subjectId: row.subjectId,
      isOptional: row.isOptional,
      weeklyPeriods: row.weeklyPeriods,
      version: row.version,
    };
  }
}

export class ClassSubjectListResponseDto {
  @ApiProperty({ type: [ClassSubjectResponseDto] })
  public readonly items!: readonly ClassSubjectResponseDto[];
}
