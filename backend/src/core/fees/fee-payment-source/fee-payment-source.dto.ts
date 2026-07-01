/**
 * DTOs for `/fees/payment-sources`. Shape + per-field validation only; the
 * service enforces tenant scope, duplicate-code guards, and in-use checks.
 *
 * `code` is immutable after create — `UpdateFeePaymentSourceDto` omits it.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_CODE_PATTERN,
  FEE_PAYMENT_SOURCE_KIND_VALUES,
  type FeePaymentSourceKindValue,
} from '../fees.constants';
import type { FeePaymentSourceRow } from '../fees.types';

export class ListFeePaymentSourcesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FEE_PAYMENT_SOURCE_KIND_VALUES })
  @IsOptional()
  @IsEnum(FEE_PAYMENT_SOURCE_KIND_VALUES)
  public readonly kind?: FeePaymentSourceKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly isActive?: boolean;
}

export class CreateFeePaymentSourceDto {
  @ApiProperty({ maxLength: 40, pattern: FEE_CODE_PATTERN.source })
  @IsString() @MaxLength(40) @Matches(FEE_CODE_PATTERN)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString() @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ enum: FEE_PAYMENT_SOURCE_KIND_VALUES })
  @IsEnum(FEE_PAYMENT_SOURCE_KIND_VALUES)
  public readonly kind!: FeePaymentSourceKindValue;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString() @MinLength(1) @MaxLength(255)
  public readonly identifier!: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @IsString() @MaxLength(20)
  public readonly ifsc?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly holderName?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class UpdateFeePaymentSourceDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: FEE_PAYMENT_SOURCE_KIND_VALUES })
  @IsOptional() @IsEnum(FEE_PAYMENT_SOURCE_KIND_VALUES)
  public readonly kind?: FeePaymentSourceKindValue;

  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  public readonly identifier?: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @IsString() @MaxLength(20)
  public readonly ifsc?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly holderName?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class FeePaymentSourceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: FEE_PAYMENT_SOURCE_KIND_VALUES })
  public readonly kind!: FeePaymentSourceKindValue;
  @ApiProperty() public readonly identifier!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly ifsc!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly holderName!: string | null;
  @ApiProperty() public readonly isActive!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: FeePaymentSourceRow): FeePaymentSourceResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      kind: row.kind,
      identifier: row.identifier,
      ifsc: row.ifsc,
      holderName: row.holderName,
      isActive: row.isActive,
      description: row.description,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeePaymentSourceListResponseDto {
  @ApiProperty({ type: () => [FeePaymentSourceResponseDto] })
  public readonly items!: readonly FeePaymentSourceResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
