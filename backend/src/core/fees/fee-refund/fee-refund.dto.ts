/**
 * DTOs for `/fees/refunds` and `/fees/payments/:paymentId/refund`.
 *
 * Shape + per-field validation only — service enforces tenant scope, payment
 * status, refund cap, allocation reversal, and audit/outbox writes.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_PAYMENT_METHOD_VALUES,
  type FeePaymentMethodValue,
} from '../fees.constants';
import type { FeeRefundRow } from '../fees.types';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export class CreateFeeRefundDto {
  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  public readonly amount!: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  public readonly reason!: string;

  @ApiProperty({ enum: FEE_PAYMENT_METHOD_VALUES })
  @IsIn([...FEE_PAYMENT_METHOD_VALUES])
  public readonly method!: FeePaymentMethodValue;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly referenceNo?: string;
}

export class FeeRefundListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly paymentId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public readonly from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public readonly to?: string;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export class FeeRefundResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly feePaymentId!: string;
  @ApiProperty() public readonly amount!: number;
  @ApiProperty() public readonly reason!: string;
  @ApiProperty({ format: 'date-time' }) public readonly refundedAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly refundedBy!: string | null;
  @ApiProperty({ enum: FEE_PAYMENT_METHOD_VALUES })
  public readonly method!: FeePaymentMethodValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly referenceNo!: string | null;

  public static from(row: FeeRefundRow): FeeRefundResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      feePaymentId: row.feePaymentId,
      amount: row.amount,
      reason: row.reason,
      refundedAt: row.refundedAt.toISOString(),
      refundedBy: row.refundedBy,
      method: row.method,
      referenceNo: row.referenceNo,
    };
  }
}

export class FeeRefundListResponseDto {
  @ApiProperty({ type: () => [FeeRefundResponseDto] })
  public readonly items!: readonly FeeRefundResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
