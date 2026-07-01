/**
 * DTOs for `/fees/discounts` and `/fees/student-discounts`.
 *
 * Cross-field validation (value vs. type, validFrom <= validTo, duplicate
 * code) runs in the service layer; class-validator only enforces shape
 * and per-field ranges here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_CODE_PATTERN,
  FEE_DISCOUNT_TYPE_VALUES,
  type FeeDiscountTypeValue,
} from '../fees.constants';
import type { FeeDiscountRow, StudentFeeDiscountRow } from '../fees.types';

// ---------------------------------------------------------------------------
// FeeDiscount DTOs
// ---------------------------------------------------------------------------

export class FeeDiscountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FEE_DISCOUNT_TYPE_VALUES })
  @IsOptional() @IsEnum(FEE_DISCOUNT_TYPE_VALUES)
  public readonly type?: FeeDiscountTypeValue;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly appliesToFeeHeadId?: string;
}

export class CreateFeeDiscountDto {
  @ApiProperty({ pattern: FEE_CODE_PATTERN.source })
  @IsString() @Matches(FEE_CODE_PATTERN)
  public readonly code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString() @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ enum: FEE_DISCOUNT_TYPE_VALUES })
  @IsEnum(FEE_DISCOUNT_TYPE_VALUES)
  public readonly type!: FeeDiscountTypeValue;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly value!: number;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly maxAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly appliesToFeeHeadId?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly requiresApprovalAbove?: number | null;
}

export class UpdateFeeDiscountDto {
  @ApiPropertyOptional({ pattern: FEE_CODE_PATTERN.source })
  @IsOptional() @IsString() @Matches(FEE_CODE_PATTERN)
  public readonly code?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: FEE_DISCOUNT_TYPE_VALUES })
  @IsOptional() @IsEnum(FEE_DISCOUNT_TYPE_VALUES)
  public readonly type?: FeeDiscountTypeValue;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly value?: number;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly maxAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly appliesToFeeHeadId?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public readonly requiresApprovalAbove?: number | null;
}

export class FeeDiscountResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: FEE_DISCOUNT_TYPE_VALUES })
  public readonly type!: FeeDiscountTypeValue;
  @ApiProperty() public readonly value!: number;
  @ApiPropertyOptional({ nullable: true })
  public readonly maxAmount!: number | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly appliesToFeeHeadId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly requiresApprovalAbove!: number | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: FeeDiscountRow): FeeDiscountResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      type: row.type,
      value: row.value,
      maxAmount: row.maxAmount,
      appliesToFeeHeadId: row.appliesToFeeHeadId,
      description: row.description,
      requiresApprovalAbove: row.requiresApprovalAbove,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeeDiscountListResponseDto {
  @ApiProperty({ type: () => [FeeDiscountResponseDto] })
  public readonly items!: readonly FeeDiscountResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// ---------------------------------------------------------------------------
// StudentFeeDiscount DTOs
// ---------------------------------------------------------------------------

export class StudentFeeDiscountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly studentId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly feeDiscountId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    return value;
  })
  @IsBoolean()
  public readonly approvedOnly?: boolean;
}

export class CreateStudentFeeDiscountDto {
  @ApiProperty()
  @IsUUID()
  public readonly studentId!: string;

  @ApiProperty()
  @IsUUID()
  public readonly feeDiscountId!: string;

  @ApiProperty()
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  public readonly validFrom!: string;

  @ApiPropertyOptional({ example: '2027-03-31', nullable: true })
  @IsOptional() @IsDateString()
  public readonly validTo?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly reason?: string | null;
}

export class StudentFeeDiscountResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly feeDiscountId!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiProperty() public readonly validFrom!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly validTo!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly reason!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly approvedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly approvedBy!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: StudentFeeDiscountRow): StudentFeeDiscountResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      feeDiscountId: row.feeDiscountId,
      academicYearId: row.academicYearId,
      validFrom: row.validFrom.toISOString(),
      validTo: row.validTo === null ? null : row.validTo.toISOString(),
      reason: row.reason,
      approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
      approvedBy: row.approvedBy,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class StudentFeeDiscountListResponseDto {
  @ApiProperty({ type: () => [StudentFeeDiscountResponseDto] })
  public readonly items!: readonly StudentFeeDiscountResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// Keep `Type` import live (used by class-transformer for nested types in
// future expansion; reserved.)
export const __dto = { _: Type };
