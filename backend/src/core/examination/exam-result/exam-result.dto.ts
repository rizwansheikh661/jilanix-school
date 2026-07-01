/**
 * DTOs for `/exams/:examId/results`.
 *
 * `POST /compute` body is empty — the request is keyed entirely by examId in
 * the path plus the global `Idempotency-Key` header. List/read endpoints
 * support filter query strings.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import {
  EXAM_RESULT_STATUS_VALUES,
  type ExamResultStatusValue,
} from '../examination.constants';
import type {
  ExamResultRow,
  ExamResultWithSubjects,
  ExamSubjectResultRow,
} from '../examination.types';

export class ResultListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly studentId?: string;
}

export class ExamSubjectResultResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly subjectId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly marksObtained!: number | null;
  @ApiProperty() public readonly maxMarks!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly percentage!: number | null;
  @ApiProperty() public readonly isAbsent!: boolean;
  @ApiProperty() public readonly isPassed!: boolean;
  @ApiPropertyOptional({ nullable: true }) public readonly gradeLetter!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly gradePoint!: number | null;

  public static from(row: ExamSubjectResultRow): ExamSubjectResultResponseDto {
    return {
      id: row.id,
      subjectId: row.subjectId,
      marksObtained: row.marksObtained,
      maxMarks: row.maxMarks,
      percentage: row.percentage,
      isAbsent: row.isAbsent,
      isPassed: row.isPassed,
      gradeLetter: row.gradeLetter,
      gradePoint: row.gradePoint,
    };
  }
}

export class ExamResultResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly examId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly sectionId!: string;
  @ApiProperty() public readonly totalMarksObtained!: number;
  @ApiProperty() public readonly totalMaxMarks!: number;
  @ApiProperty() public readonly percentage!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly gradeLetter!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly gradePoint!: number | null;
  @ApiProperty({ enum: EXAM_RESULT_STATUS_VALUES })
  public readonly status!: ExamResultStatusValue;
  @ApiProperty() public readonly isPassed!: boolean;
  @ApiProperty() public readonly computedAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly computedBy!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ type: () => [ExamSubjectResultResponseDto] })
  public readonly subjects!: readonly ExamSubjectResultResponseDto[];

  public static from(row: ExamResultWithSubjects): ExamResultResponseDto {
    return {
      id: row.id,
      examId: row.examId,
      studentId: row.studentId,
      sectionId: row.sectionId,
      totalMarksObtained: row.totalMarksObtained,
      totalMaxMarks: row.totalMaxMarks,
      percentage: row.percentage,
      gradeLetter: row.gradeLetter,
      gradePoint: row.gradePoint,
      status: row.status,
      isPassed: row.isPassed,
      computedAt: row.computedAt.toISOString(),
      computedBy: row.computedBy,
      version: row.version,
      subjects: row.subjects.map(ExamSubjectResultResponseDto.from),
    };
  }

  public static fromHeader(row: ExamResultRow): Omit<ExamResultResponseDto, 'subjects'> {
    return {
      id: row.id,
      examId: row.examId,
      studentId: row.studentId,
      sectionId: row.sectionId,
      totalMarksObtained: row.totalMarksObtained,
      totalMaxMarks: row.totalMaxMarks,
      percentage: row.percentage,
      gradeLetter: row.gradeLetter,
      gradePoint: row.gradePoint,
      status: row.status,
      isPassed: row.isPassed,
      computedAt: row.computedAt.toISOString(),
      computedBy: row.computedBy,
      version: row.version,
    };
  }
}

export class ExamResultListResponseDto {
  @ApiProperty({ type: () => [ExamResultResponseDto] })
  public readonly items!: readonly ExamResultResponseDto[];
}

export class ComputeExamResultsResponseDto {
  @ApiProperty() public readonly examId!: string;
  @ApiProperty() public readonly resultCount!: number;
  @ApiProperty() public readonly passCount!: number;
  @ApiProperty() public readonly failCount!: number;
  @ApiProperty({ type: () => [ExamResultResponseDto] })
  public readonly results!: readonly ExamResultResponseDto[];
}
