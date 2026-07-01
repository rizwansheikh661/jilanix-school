/**
 * DTOs for `/fees/heads`. Shape + per-field validation only; the service
 * enforces tenant scope, duplicate-code guards, and in-use checks.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_CODE_PATTERN,
  FEE_DECIMAL_PLACES,
  FEE_HEAD_CATEGORY_VALUES,
  type FeeHeadCategoryValue,
} from '../fees.constants';
import type { FeeHeadRow } from '../fees.types';

export class FeeHeadListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FEE_HEAD_CATEGORY_VALUES })
  @IsOptional()
  @IsEnum(FEE_HEAD_CATEGORY_VALUES)
  public readonly category?: FeeHeadCategoryValue;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;
}

export class CreateFeeHeadDto {
  @ApiProperty({ maxLength: 40, pattern: FEE_CODE_PATTERN.source })
  @IsString() @MaxLength(40) @Matches(FEE_CODE_PATTERN)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString() @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ enum: FEE_HEAD_CATEGORY_VALUES })
  @IsEnum(FEE_HEAD_CATEGORY_VALUES)
  public readonly category!: FeeHeadCategoryValue;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @IsString() @MaxLength(20)
  public readonly hsnSac?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  public readonly isRefundable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  public readonly isTaxable?: boolean;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: FEE_DECIMAL_PLACES }) @Min(0)
  public readonly defaultAmount?: number | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional() @IsString() @MaxLength(40)
  public readonly glAccount?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class UpdateFeeHeadDto {
  @ApiPropertyOptional({ maxLength: 40, pattern: FEE_CODE_PATTERN.source })
  @IsOptional() @IsString() @MaxLength(40) @Matches(FEE_CODE_PATTERN)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: FEE_HEAD_CATEGORY_VALUES })
  @IsOptional() @IsEnum(FEE_HEAD_CATEGORY_VALUES)
  public readonly category?: FeeHeadCategoryValue;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @IsString() @MaxLength(20)
  public readonly hsnSac?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isRefundable?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isTaxable?: boolean;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: FEE_DECIMAL_PLACES }) @Min(0)
  public readonly defaultAmount?: number | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional() @IsString() @MaxLength(40)
  public readonly glAccount?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class FeeHeadResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: FEE_HEAD_CATEGORY_VALUES })
  public readonly category!: FeeHeadCategoryValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly hsnSac!: string | null;
  @ApiProperty() public readonly isRefundable!: boolean;
  @ApiProperty() public readonly isTaxable!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly defaultAmount!: number | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly glAccount!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: FeeHeadRow): FeeHeadResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      category: row.category,
      hsnSac: row.hsnSac,
      isRefundable: row.isRefundable,
      isTaxable: row.isTaxable,
      defaultAmount: row.defaultAmount,
      glAccount: row.glAccount,
      description: row.description,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeeHeadListResponseDto {
  @ApiProperty({ type: () => [FeeHeadResponseDto] })
  public readonly items!: readonly FeeHeadResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
