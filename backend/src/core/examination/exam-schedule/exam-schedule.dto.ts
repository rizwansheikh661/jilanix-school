/**
 * DTOs for `/exams/:examId/schedule`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { EXAM_SCHEDULE_BULK_MAX } from '../examination.constants';
import type { ExamScheduleRow } from '../examination.types';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export class CreateExamScheduleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly roomId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly invigilatorStaffId?: string | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @Type(() => Date) @IsDate()
  public readonly date!: Date;

  @ApiProperty({ example: '09:00:00' })
  @IsString() @Matches(TIME_REGEX)
  public readonly startTime!: string;

  @ApiProperty({ example: '12:00:00' })
  @IsString() @Matches(TIME_REGEX)
  public readonly endTime!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly maxMarks?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly passMarks?: number;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  public readonly instructions?: string | null;
}

export class UpdateExamScheduleDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly roomId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly invigilatorStaffId?: string | null;

  @ApiPropertyOptional({ type: 'string', format: 'date-time' })
  @IsOptional() @Type(() => Date) @IsDate()
  public readonly date?: Date;

  @ApiPropertyOptional({ example: '09:00:00' })
  @IsOptional() @IsString() @Matches(TIME_REGEX)
  public readonly startTime?: string;

  @ApiPropertyOptional({ example: '12:00:00' })
  @IsOptional() @IsString() @Matches(TIME_REGEX)
  public readonly endTime?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly maxMarks?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @IsNumber() @Min(0) @Max(9999)
  public readonly passMarks?: number;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  public readonly instructions?: string | null;
}

export class BulkExamScheduleDto {
  @ApiProperty({ type: () => [CreateExamScheduleDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(EXAM_SCHEDULE_BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => CreateExamScheduleDto)
  public readonly items!: CreateExamScheduleDto[];
}

export class ExamScheduleListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly subjectId?: string;
}

export class ExamScheduleResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly examId!: string;
  @ApiProperty() public readonly subjectId!: string;
  @ApiProperty() public readonly sectionId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly roomId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly invigilatorStaffId!: string | null;
  @ApiProperty() public readonly date!: string;
  @ApiProperty() public readonly startTime!: string;
  @ApiProperty() public readonly endTime!: string;
  @ApiProperty() public readonly maxMarks!: number;
  @ApiProperty() public readonly passMarks!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly instructions!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: ExamScheduleRow): ExamScheduleResponseDto {
    return {
      id: row.id,
      examId: row.examId,
      subjectId: row.subjectId,
      sectionId: row.sectionId,
      roomId: row.roomId,
      invigilatorStaffId: row.invigilatorStaffId,
      date: row.date.toISOString(),
      startTime: row.startTime,
      endTime: row.endTime,
      maxMarks: row.maxMarks,
      passMarks: row.passMarks,
      instructions: row.instructions,
      version: row.version,
    };
  }
}

export class ExamScheduleListResponseDto {
  @ApiProperty({ type: () => [ExamScheduleResponseDto] })
  public readonly items!: readonly ExamScheduleResponseDto[];
}

export class BulkExamScheduleFailureDto {
  @ApiProperty() public readonly index!: number;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly message!: string;
}

export class BulkExamScheduleResponseDto {
  @ApiProperty({ type: () => [ExamScheduleResponseDto] })
  public readonly created!: readonly ExamScheduleResponseDto[];
  @ApiProperty({ type: () => [BulkExamScheduleFailureDto] })
  public readonly failed!: readonly BulkExamScheduleFailureDto[];
}
