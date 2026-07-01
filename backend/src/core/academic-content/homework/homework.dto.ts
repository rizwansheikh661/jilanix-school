/**
 * DTOs for `/homework`. Shape + per-field validation; service enforces tenant
 * scope, state machine, cross-tenant FK guards, and duplicate-code checks.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  ACADEMIC_CONTENT_CODE_PATTERN,
  CONTENT_STATUS_VALUES,
  DESCRIPTION_MAX_LENGTH,
  HOMEWORK_PRIORITY_VALUES,
  REASON_MAX_LENGTH,
  type ContentStatusValue,
  type HomeworkPriorityValue,
} from '../academic-content.constants';
import type { HomeworkRow } from '../academic-content.types';

export class HomeworkListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CONTENT_STATUS_VALUES })
  @IsOptional() @IsEnum(CONTENT_STATUS_VALUES)
  public readonly status?: ContentStatusValue;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly classId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly subjectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly assignedByStaffId?: string;

  @ApiPropertyOptional({ description: 'ISO date (inclusive) dueDate lower bound.' })
  @IsOptional() @IsISO8601()
  public readonly dueFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date (inclusive) dueDate upper bound.' })
  @IsOptional() @IsISO8601()
  public readonly dueTo?: string;
}

export class CreateHomeworkDto {
  @ApiPropertyOptional({
    maxLength: 40,
    pattern: ACADEMIC_CONTENT_CODE_PATTERN.source,
    description: 'Optional; defaults to auto-generated HW-<seq>.',
  })
  @IsOptional() @IsString() @MaxLength(40) @Matches(ACADEMIC_CONTENT_CODE_PATTERN)
  public readonly code?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public readonly title!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional() @IsString() @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly description?: string | null;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional() @IsString() @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly instructions?: string | null;

  @ApiProperty() @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty() @IsUUID()
  public readonly classId!: string;

  @ApiProperty() @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty() @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty() @IsUUID()
  public readonly assignedByStaffId!: string;

  @ApiProperty({ description: 'ISO date (YYYY-MM-DD).' })
  @IsISO8601()
  public readonly assignedDate!: string;

  @ApiProperty({ description: 'ISO date (YYYY-MM-DD).' })
  @IsISO8601()
  public readonly dueDate!: string;

  @ApiPropertyOptional({ enum: HOMEWORK_PRIORITY_VALUES, default: 'MEDIUM' })
  @IsOptional() @IsEnum(HOMEWORK_PRIORITY_VALUES)
  public readonly priority?: HomeworkPriorityValue;
}

export class UpdateHomeworkDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  public readonly title?: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional() @IsString() @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly description?: string | null;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional() @IsString() @MaxLength(DESCRIPTION_MAX_LENGTH)
  public readonly instructions?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  public readonly assignedDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  public readonly dueDate?: string;

  @ApiPropertyOptional({ enum: HOMEWORK_PRIORITY_VALUES })
  @IsOptional() @IsEnum(HOMEWORK_PRIORITY_VALUES)
  public readonly priority?: HomeworkPriorityValue;
}

export class CancelHomeworkDto {
  @ApiPropertyOptional({ maxLength: REASON_MAX_LENGTH, nullable: true })
  @IsOptional() @IsString() @MaxLength(REASON_MAX_LENGTH)
  public readonly reason?: string | null;
}

export class HomeworkResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly instructions!: string | null;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiProperty() public readonly classId!: string;
  @ApiProperty() public readonly sectionId!: string;
  @ApiProperty() public readonly subjectId!: string;
  @ApiProperty() public readonly assignedByStaffId!: string;
  @ApiProperty() public readonly assignedDate!: string;
  @ApiProperty() public readonly dueDate!: string;
  @ApiProperty({ enum: HOMEWORK_PRIORITY_VALUES })
  public readonly priority!: HomeworkPriorityValue;
  @ApiProperty({ enum: CONTENT_STATUS_VALUES })
  public readonly status!: ContentStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly closedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancelledAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancellationReason!: string | null;
  @ApiProperty() public readonly attachmentCount!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: HomeworkRow): HomeworkResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      academicYearId: row.academicYearId,
      classId: row.classId,
      sectionId: row.sectionId,
      subjectId: row.subjectId,
      assignedByStaffId: row.assignedByStaffId,
      assignedDate: row.assignedDate.toISOString().slice(0, 10),
      dueDate: row.dueDate.toISOString().slice(0, 10),
      priority: row.priority,
      status: row.status,
      publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
      closedAt: row.closedAt === null ? null : row.closedAt.toISOString(),
      cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
      cancellationReason: row.cancellationReason,
      attachmentCount: row.attachmentCount,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class HomeworkListResponseDto {
  @ApiProperty({ type: () => [HomeworkResponseDto] })
  public readonly items!: readonly HomeworkResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
