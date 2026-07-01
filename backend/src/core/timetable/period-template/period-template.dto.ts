/**
 * DTOs for `/timetable/period-templates`.
 *
 * Cross-field validation (index contiguity, time overlap, days dedup) is
 * performed by `PeriodTemplateService.validateDays` /
 * `validatePeriods` — class-validator only enforces shape & range here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  PERIOD_TEMPLATE_MAX_PERIODS,
  PERIOD_TYPE_VALUES,
  type PeriodTypeValue,
} from '../timetable.constants';
import type { PeriodTemplateWithPeriods } from '../timetable.types';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreatePeriodDto {
  @ApiProperty({ minimum: 1, maximum: PERIOD_TEMPLATE_MAX_PERIODS })
  @IsInt() @Min(1) @Max(PERIOD_TEMPLATE_MAX_PERIODS)
  public readonly index!: number;

  @ApiProperty({ maxLength: 80 })
  @IsString() @MaxLength(80)
  public readonly label!: string;

  @ApiProperty({ enum: PERIOD_TYPE_VALUES as unknown as string[] })
  @IsEnum(PERIOD_TYPE_VALUES as unknown as object)
  public readonly type!: PeriodTypeValue;

  @ApiProperty({ pattern: TIME_PATTERN.source, example: '08:00:00' })
  @Matches(TIME_PATTERN)
  public readonly startTime!: string;

  @ApiProperty({ pattern: TIME_PATTERN.source, example: '08:45:00' })
  @Matches(TIME_PATTERN)
  public readonly endTime!: string;
}

export class CreatePeriodTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly branchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString() @MaxLength(100)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string;

  @ApiProperty({ type: [Number], minimum: 1, maximum: 7, example: [1, 2, 3, 4, 5] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique()
  @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  public readonly days!: number[];

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  public readonly isDefault?: boolean;

  @ApiProperty({ type: () => [CreatePeriodDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(PERIOD_TEMPLATE_MAX_PERIODS)
  @ValidateNested({ each: true })
  @Type(() => CreatePeriodDto)
  public readonly periods!: CreatePeriodDto[];
}

export class UpdatePeriodTemplateDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ type: [Number], minimum: 1, maximum: 7 })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique()
  @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  public readonly days?: number[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isDefault?: boolean;

  @ApiPropertyOptional({ type: () => [CreatePeriodDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(PERIOD_TEMPLATE_MAX_PERIODS)
  @ValidateNested({ each: true })
  @Type(() => CreatePeriodDto)
  public readonly periods?: CreatePeriodDto[];
}

export class PeriodTemplateListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  public readonly isDefault?: boolean;
}

export class PeriodResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly index!: number;
  @ApiProperty() public readonly label!: string;
  @ApiProperty({ enum: PERIOD_TYPE_VALUES as unknown as string[] })
  public readonly type!: PeriodTypeValue;
  @ApiProperty({ example: '08:00:00' }) public readonly startTime!: string;
  @ApiProperty({ example: '08:45:00' }) public readonly endTime!: string;
  @ApiProperty() public readonly version!: number;
}

export class PeriodTemplateResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly branchId!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ type: [Number] }) public readonly days!: readonly number[];
  @ApiProperty() public readonly isDefault!: boolean;
  @ApiProperty({ type: () => [PeriodResponseDto] })
  public readonly periods!: readonly PeriodResponseDto[];
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: PeriodTemplateWithPeriods): PeriodTemplateResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      branchId: row.branchId,
      academicYearId: row.academicYearId,
      name: row.name,
      description: row.description,
      days: row.days,
      isDefault: row.isDefault,
      periods: row.periods.map((p) => ({
        id: p.id,
        index: p.index,
        label: p.label,
        type: p.type,
        startTime: p.startTime,
        endTime: p.endTime,
        version: p.version,
      })),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class PeriodTemplateListResponseDto {
  @ApiProperty({ type: () => [PeriodTemplateResponseDto] })
  public readonly items!: readonly PeriodTemplateResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
