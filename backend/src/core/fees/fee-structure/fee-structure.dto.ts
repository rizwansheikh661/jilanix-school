/**
 * DTOs for `/fees/structures` (FeeStructure + FeeStructureLine).
 *
 * Shape + per-field validation only — service enforces tenant scope,
 * duplicate-name guards, state transitions, and cross-tenant FK checks.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_DECIMAL_PLACES,
  FEE_FREQUENCY_VALUES,
  FEE_STRUCTURE_APPLIES_TO_VALUES,
  FEE_STRUCTURE_LINES_MAX,
  FEE_STRUCTURE_STATUS_VALUES,
  type FeeFrequencyValue,
  type FeeStructureAppliesToValue,
  type FeeStructureStatusValue,
} from '../fees.constants';
import type {
  FeeStructureLineRow,
  FeeStructureWithLines,
} from '../fees.types';

export class FeeStructureLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly feeHeadId!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: FEE_DECIMAL_PLACES })
  @Min(0)
  public readonly amount!: number;

  @ApiProperty({ enum: FEE_FREQUENCY_VALUES })
  @IsEnum(FEE_FREQUENCY_VALUES)
  public readonly frequency!: FeeFrequencyValue;

  @ApiPropertyOptional({ minimum: 1, maximum: 31, nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(31)
  public readonly dueDay?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly lateFinePolicyId?: string | null;

  @ApiProperty({ minimum: 0 })
  @IsInt() @Min(0)
  public readonly ordering!: number;
}

export class CreateFeeStructureDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly branchId?: string | null;

  @ApiProperty({ maxLength: 160 })
  @IsString() @MaxLength(160)
  public readonly name!: string;

  @ApiProperty({ enum: FEE_STRUCTURE_APPLIES_TO_VALUES })
  @IsEnum(FEE_STRUCTURE_APPLIES_TO_VALUES)
  public readonly appliesTo!: FeeStructureAppliesToValue;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly classId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly studentId?: string | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @IsOptional() @IsString() @Length(3, 3)
  public readonly currency?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiProperty({ type: () => [FeeStructureLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FEE_STRUCTURE_LINES_MAX)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureLineDto)
  public readonly lines!: FeeStructureLineDto[];
}

export class UpdateFeeStructureDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly branchId?: string | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional() @IsString() @MaxLength(160)
  public readonly name?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly classId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  public readonly studentId?: string | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @IsOptional() @IsString() @Length(3, 3)
  public readonly currency?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ type: () => [FeeStructureLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FEE_STRUCTURE_LINES_MAX)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureLineDto)
  public readonly lines?: FeeStructureLineDto[];
}

export class CloneFeeStructureDto {
  @ApiProperty({ maxLength: 160 })
  @IsString() @MaxLength(160)
  public readonly name!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;
}

export class FeeStructureListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly classId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly studentId?: string;

  @ApiPropertyOptional({ enum: FEE_STRUCTURE_STATUS_VALUES })
  @IsOptional() @IsIn([...FEE_STRUCTURE_STATUS_VALUES])
  public readonly status?: FeeStructureStatusValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly branchId?: string;
}

export class FeeStructureLineResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly feeHeadId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly lateFinePolicyId!: string | null;
  @ApiProperty() public readonly amount!: number;
  @ApiProperty({ enum: FEE_FREQUENCY_VALUES })
  public readonly frequency!: FeeFrequencyValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly dueDay!: number | null;
  @ApiProperty() public readonly ordering!: number;
  @ApiProperty() public readonly version!: number;

  public static from(row: FeeStructureLineRow): FeeStructureLineResponseDto {
    return {
      id: row.id,
      feeHeadId: row.feeHeadId,
      lateFinePolicyId: row.lateFinePolicyId,
      amount: row.amount,
      frequency: row.frequency,
      dueDay: row.dueDay,
      ordering: row.ordering,
      version: row.version,
    };
  }
}

export class FeeStructureResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly branchId!: string | null;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: FEE_STRUCTURE_APPLIES_TO_VALUES })
  public readonly appliesTo!: FeeStructureAppliesToValue;
  @ApiPropertyOptional({ nullable: true }) public readonly classId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly sectionId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly studentId!: string | null;
  @ApiProperty() public readonly currency!: string;
  @ApiProperty({ enum: FEE_STRUCTURE_STATUS_VALUES })
  public readonly status!: FeeStructureStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly archivedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ type: () => [FeeStructureLineResponseDto] })
  public readonly lines!: readonly FeeStructureLineResponseDto[];
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: FeeStructureWithLines): FeeStructureResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      academicYearId: row.academicYearId,
      branchId: row.branchId,
      name: row.name,
      appliesTo: row.appliesTo,
      classId: row.classId,
      sectionId: row.sectionId,
      studentId: row.studentId,
      currency: row.currency,
      status: row.status,
      publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
      archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
      description: row.description,
      lines: row.lines.map(FeeStructureLineResponseDto.from),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeeStructureListResponseDto {
  @ApiProperty({ type: () => [FeeStructureResponseDto] })
  public readonly items!: readonly FeeStructureResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
