/**
 * DTOs for `/fees/fine-policies`.
 *
 * Per-field validation only; the service enforces cross-field rules
 * (PERCENT_PER_DAY <= 100, code-uniqueness, in-use checks, etc.).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_CODE_PATTERN,
  FEE_FINE_GRACE_DAYS_MAX,
  FEE_FINE_POLICY_TYPE_VALUES,
  type FeeFinePolicyTypeValue,
} from '../fees.constants';
import type { FeeLateFinePolicyRow } from '../fees.types';

export class FeeLateFinePolicyListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FEE_FINE_POLICY_TYPE_VALUES })
  @IsOptional()
  @IsEnum(FEE_FINE_POLICY_TYPE_VALUES)
  public readonly type?: FeeFinePolicyTypeValue;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;
}

export class CreateFeeLateFinePolicyDto {
  @ApiProperty({ pattern: FEE_CODE_PATTERN.source, maxLength: 40 })
  @IsString() @Matches(FEE_CODE_PATTERN)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString() @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ enum: FEE_FINE_POLICY_TYPE_VALUES })
  @IsEnum(FEE_FINE_POLICY_TYPE_VALUES)
  public readonly type!: FeeFinePolicyTypeValue;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly value!: number;

  @ApiProperty({ minimum: 0, maximum: FEE_FINE_GRACE_DAYS_MAX, default: 0 })
  @IsInt() @Min(0) @Max(FEE_FINE_GRACE_DAYS_MAX)
  public readonly gracePeriodDays!: number;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly capAmount?: number | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class UpdateFeeLateFinePolicyDto {
  @ApiPropertyOptional({ pattern: FEE_CODE_PATTERN.source, maxLength: 40 })
  @IsOptional() @IsString() @Matches(FEE_CODE_PATTERN)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: FEE_FINE_POLICY_TYPE_VALUES })
  @IsOptional() @IsEnum(FEE_FINE_POLICY_TYPE_VALUES)
  public readonly type?: FeeFinePolicyTypeValue;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly value?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: FEE_FINE_GRACE_DAYS_MAX })
  @IsOptional() @IsInt() @Min(0) @Max(FEE_FINE_GRACE_DAYS_MAX)
  public readonly gracePeriodDays?: number;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly capAmount?: number | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class FeeLateFinePolicyResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: FEE_FINE_POLICY_TYPE_VALUES })
  public readonly type!: FeeFinePolicyTypeValue;
  @ApiProperty() public readonly value!: number;
  @ApiProperty() public readonly gracePeriodDays!: number;
  @ApiPropertyOptional({ nullable: true })
  public readonly capAmount!: number | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: FeeLateFinePolicyRow): FeeLateFinePolicyResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      type: row.type,
      value: row.value,
      gracePeriodDays: row.gracePeriodDays,
      capAmount: row.capAmount,
      description: row.description,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeeLateFinePolicyListResponseDto {
  @ApiProperty({ type: () => [FeeLateFinePolicyResponseDto] })
  public readonly items!: readonly FeeLateFinePolicyResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
