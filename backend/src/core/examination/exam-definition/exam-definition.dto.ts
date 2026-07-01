/**
 * DTOs for `/exams` (Exam Definition).
 *
 * Cross-field invariants (startDate <= endDate, at-least-one-map) run in
 * `ExamDefinitionService` — class-validator only enforces shape here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  EXAM_STATUS_VALUES,
  EXAM_TYPE_VALUES,
  type ExamStatusValue,
  type ExamTypeValue,
} from '../examination.constants';
import type { ExamRow, ExamWithMaps } from '../examination.types';

export class CreateExamDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly branchId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly academicTermId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly examSchemeId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString() @MaxLength(160)
  public readonly name!: string;

  @ApiProperty({ enum: EXAM_TYPE_VALUES })
  @IsEnum(EXAM_TYPE_VALUES)
  public readonly type!: ExamTypeValue;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly startDate!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly endDate!: Date;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, default: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly defaultMaxMarks?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, default: 33 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly defaultPassMarks?: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray() @ArrayMinSize(0) @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  public readonly classIds!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray() @ArrayMinSize(0) @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  public readonly sectionIds!: string[];
}

export class UpdateExamDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly academicTermId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly examSchemeId?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional() @IsString() @MaxLength(160)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional() @IsEnum(EXAM_TYPE_VALUES)
  public readonly type?: ExamTypeValue;

  @ApiPropertyOptional({ type: 'string', format: 'date-time' })
  @IsOptional() @Type(() => Date) @IsDate()
  public readonly startDate?: Date;

  @ApiPropertyOptional({ type: 'string', format: 'date-time' })
  @IsOptional() @Type(() => Date) @IsDate()
  public readonly endDate?: Date;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly defaultMaxMarks?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly defaultPassMarks?: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional() @IsArray() @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  public readonly classIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional() @IsArray() @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  public readonly sectionIds?: string[];
}

export class ExamListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicTermId?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional() @IsIn([...EXAM_TYPE_VALUES])
  public readonly type?: ExamTypeValue;

  @ApiPropertyOptional({ enum: EXAM_STATUS_VALUES })
  @IsOptional() @IsIn([...EXAM_STATUS_VALUES])
  public readonly status?: ExamStatusValue;
}

export class ExamResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly branchId!: string | null;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly academicTermId!: string | null;
  @ApiProperty() public readonly examSchemeId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: EXAM_TYPE_VALUES }) public readonly type!: ExamTypeValue;
  @ApiProperty({ enum: EXAM_STATUS_VALUES }) public readonly status!: ExamStatusValue;
  @ApiProperty() public readonly startDate!: string;
  @ApiProperty() public readonly endDate!: string;
  @ApiProperty() public readonly defaultMaxMarks!: number;
  @ApiProperty() public readonly defaultPassMarks!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly archivedAt!: string | null;
  @ApiProperty({ type: [String] }) public readonly classIds!: readonly string[];
  @ApiProperty({ type: [String] }) public readonly sectionIds!: readonly string[];
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: ExamWithMaps): ExamResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      academicYearId: row.academicYearId,
      academicTermId: row.academicTermId,
      examSchemeId: row.examSchemeId,
      name: row.name,
      type: row.type,
      status: row.status,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      defaultMaxMarks: row.defaultMaxMarks,
      defaultPassMarks: row.defaultPassMarks,
      description: row.description,
      publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
      archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
      classIds: row.classIds,
      sectionIds: row.sectionIds,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class ExamHeaderResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: EXAM_STATUS_VALUES }) public readonly status!: ExamStatusValue;
  @ApiProperty() public readonly version!: number;

  public static from(row: ExamRow): ExamHeaderResponseDto {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      version: row.version,
    };
  }
}

export class ExamListResponseDto {
  @ApiProperty({ type: () => [ExamResponseDto] })
  public readonly items!: readonly ExamResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
