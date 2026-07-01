/**
 * DTOs for `/exams/schemes`.
 *
 * Cross-field validation (band overlap / ordering monotonicity) runs in
 * `ExamSchemeService.validateBands` — class-validator only enforces shape
 * and per-field ranges here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

import { PaginationQueryDto } from '../../http/pagination.dto';
import { EXAM_SCHEME_MAX_BANDS } from '../examination.constants';
import type {
  ExamSchemeBandRow,
  ExamSchemeWithBands,
} from '../examination.types';

export class ExamSchemeBandDto {
  @ApiProperty({ maxLength: 8, example: 'A+' })
  @IsString() @MaxLength(8)
  public readonly gradeLetter!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, nullable: true })
  @IsOptional() @IsNumber() @Min(0) @Max(10)
  public readonly gradePoint?: number | null;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber() @Min(0) @Max(100)
  public readonly minPct!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber() @Min(0) @Max(100)
  public readonly maxPct!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt() @Min(0)
  public readonly ordering!: number;
}

export class CreateExamSchemeDto {
  @ApiProperty({ maxLength: 120 })
  @IsString() @MaxLength(120)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional() @IsString() @MaxLength(60)
  public readonly boardType?: string | null;

  @ApiProperty({ minimum: 0, maximum: 100, default: 33 })
  @IsNumber() @Min(0) @Max(100)
  public readonly passingPct!: number;

  @ApiProperty({ minimum: 0, maximum: 365, default: 14 })
  @IsInt() @Min(0) @Max(365)
  public readonly marksEditWindowDays!: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiProperty({ type: () => [ExamSchemeBandDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(EXAM_SCHEME_MAX_BANDS)
  @ValidateNested({ each: true })
  @Type(() => ExamSchemeBandDto)
  public readonly bands!: ExamSchemeBandDto[];
}

export class UpdateExamSchemeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional() @IsString() @MaxLength(60)
  public readonly boardType?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  public readonly passingPct?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional() @IsInt() @Min(0) @Max(365)
  public readonly marksEditWindowDays?: number;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ type: () => [ExamSchemeBandDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(EXAM_SCHEME_MAX_BANDS)
  @ValidateNested({ each: true })
  @Type(() => ExamSchemeBandDto)
  public readonly bands?: ExamSchemeBandDto[];
}

export class ExamSchemeListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;
}

export class ExamSchemeBandResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly gradeLetter!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly gradePoint!: number | null;
  @ApiProperty() public readonly minPct!: number;
  @ApiProperty() public readonly maxPct!: number;
  @ApiProperty() public readonly ordering!: number;

  public static from(row: ExamSchemeBandRow): ExamSchemeBandResponseDto {
    return {
      id: row.id,
      gradeLetter: row.gradeLetter,
      gradePoint: row.gradePoint,
      minPct: row.minPct,
      maxPct: row.maxPct,
      ordering: row.ordering,
    };
  }
}

export class ExamSchemeResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly boardType!: string | null;
  @ApiProperty() public readonly passingPct!: number;
  @ApiProperty() public readonly marksEditWindowDays!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ type: () => [ExamSchemeBandResponseDto] })
  public readonly bands!: readonly ExamSchemeBandResponseDto[];
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: ExamSchemeWithBands): ExamSchemeResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      boardType: row.boardType,
      passingPct: row.passingPct,
      marksEditWindowDays: row.marksEditWindowDays,
      description: row.description,
      bands: row.bands.map(ExamSchemeBandResponseDto.from),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class ExamSchemeListResponseDto {
  @ApiProperty({ type: () => [ExamSchemeResponseDto] })
  public readonly items!: readonly ExamSchemeResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// Re-export a no-op to satisfy `@IsUUID` import (used elsewhere if needed).
export const __dto = { _: IsUUID };
