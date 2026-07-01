/**
 * DTOs for `/exams/:examId/marks`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { EXAM_MARKS_BULK_MAX } from '../examination.constants';
import type { ExamMarksRow } from '../examination.types';

export class MarksMatrixQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;
}

export class MarksMatrixListResponseDto {
  @ApiProperty({ type: () => [Object] })
  public readonly items!: readonly ExamMarksResponseDto[];
  @ApiProperty()
  public readonly version!: number;
}

export class UpsertExamMarksDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly studentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, nullable: true })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly marksObtained?: number | null;

  @ApiProperty()
  @IsBoolean()
  public readonly isAbsent!: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly remarks?: string | null;
}

export class BulkMarksEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly studentId!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, nullable: true })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly marksObtained?: number | null;

  @ApiProperty()
  @IsBoolean()
  public readonly isAbsent!: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly remarks?: string | null;
}

export class BulkMarksDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ description: 'Latest known max-version across the batch.' })
  @IsInt() @Min(0)
  public readonly version!: number;

  @ApiProperty({ type: () => [BulkMarksEntryDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(EXAM_MARKS_BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => BulkMarksEntryDto)
  public readonly entries!: BulkMarksEntryDto[];
}

export class ExamMarksResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly examId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly subjectId!: string;
  @ApiProperty() public readonly sectionId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly marksObtained!: number | null;
  @ApiProperty() public readonly isAbsent!: boolean;
  @ApiPropertyOptional({ nullable: true }) public readonly remarks!: string | null;
  @ApiProperty() public readonly enteredAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly enteredBy!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: ExamMarksRow): ExamMarksResponseDto {
    return {
      id: row.id,
      examId: row.examId,
      studentId: row.studentId,
      subjectId: row.subjectId,
      sectionId: row.sectionId,
      marksObtained: row.marksObtained,
      isAbsent: row.isAbsent,
      remarks: row.remarks,
      enteredAt: row.enteredAt.toISOString(),
      enteredBy: row.enteredBy,
      version: row.version,
    };
  }
}

export class ExamMarksListResponseDto {
  @ApiProperty({ type: () => [ExamMarksResponseDto] })
  public readonly items!: readonly ExamMarksResponseDto[];
  @ApiProperty({ description: 'Max version across the listed rows (for bulk PUT version field).' })
  public readonly version!: number;
}

export class BulkMarksResponseDto {
  @ApiProperty({ type: () => [ExamMarksResponseDto] })
  public readonly entries!: readonly ExamMarksResponseDto[];
}
