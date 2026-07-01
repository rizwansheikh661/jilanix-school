/**
 * SectionSubject DTOs — request/response shapes for section-level subject
 * override management (`/sections/:sectionId/subjects` + `/subject-overrides`).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';

import {
  SECTION_SUBJECT_MODES,
  type SectionSubjectMode,
  type SectionSubjectRow,
} from '../academic.types';

export class CreateSectionSubjectDto {
  @ApiProperty({ format: 'uuid', description: 'Subject id to ADD / REMOVE / REPLACE with.' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ enum: SECTION_SUBJECT_MODES as unknown as string[] })
  @IsEnum(SECTION_SUBJECT_MODES as unknown as readonly string[])
  public readonly mode!: SectionSubjectMode;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when mode = REPLACE; rejected otherwise.',
  })
  @IsOptional()
  @ValidateIf((o: CreateSectionSubjectDto) => o.mode === 'REPLACE')
  @IsUUID()
  public readonly replacesSubjectId?: string;
}

export class SectionSubjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly subjectId!: string;

  @ApiProperty({ enum: SECTION_SUBJECT_MODES as unknown as string[] })
  public readonly mode!: SectionSubjectMode;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly replacesSubjectId!: string | null;

  public static from(row: SectionSubjectRow): SectionSubjectResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      sectionId: row.sectionId,
      subjectId: row.subjectId,
      mode: row.mode,
      replacesSubjectId: row.replacesSubjectId,
    };
  }
}

export class SectionSubjectListResponseDto {
  @ApiProperty({ type: [SectionSubjectResponseDto] })
  public readonly items!: readonly SectionSubjectResponseDto[];
}

export class EffectiveSectionSubjectsResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly classId!: string;

  @ApiProperty({
    type: [String],
    description: 'Resolved subject-id set after ClassDefaults ± overrides.',
  })
  public readonly subjectIds!: readonly string[];

  public static from(args: {
    readonly sectionId: string;
    readonly classId: string;
    readonly subjectIds: readonly string[];
  }): EffectiveSectionSubjectsResponseDto {
    return {
      sectionId: args.sectionId,
      classId: args.classId,
      subjectIds: args.subjectIds,
    };
  }
}
