/**
 * DTOs for `/fees/payments`.
 *
 * Shape + per-field validation only — service enforces tenant scope, sum
 * checks, allocation guards, balance checks, and method restrictions.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_PAYMENT_ALLOCATIONS_MAX,
  FEE_PAYMENT_METHOD_VALUES,
  FEE_PAYMENT_STATUS_VALUES,
  FEE_PAYMENT_VERIFICATION_STATUS_VALUES,
  type FeePaymentMethodValue,
  type FeePaymentStatusValue,
  type FeePaymentVerificationStatusValue,
} from '../fees.constants';
import type {
  FeePaymentAllocationRow,
  FeePaymentWithAllocations,
  FeeReceiptRow,
} from '../fees.types';

export class FeePaymentAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly invoiceId!: string;

  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  public readonly amount!: number;
}

export class CreateFeePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly studentId!: string;

  @ApiProperty({ enum: FEE_PAYMENT_METHOD_VALUES })
  @IsIn([...FEE_PAYMENT_METHOD_VALUES])
  public readonly method!: FeePaymentMethodValue;

  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  public readonly amount!: number;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly referenceNo?: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  public readonly paidAt!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly notes?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly paymentSourceId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly paymentProofUrl?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly verificationNotes?: string;

  @ApiProperty({ type: () => [FeePaymentAllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FEE_PAYMENT_ALLOCATIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => FeePaymentAllocationDto)
  public readonly allocations!: FeePaymentAllocationDto[];
}

export class VerifyFeePaymentDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly notes?: string;
}

export class RejectFeePaymentDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  public readonly reason!: string;
}

export class FeePaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly studentId?: string;

  @ApiPropertyOptional({ enum: FEE_PAYMENT_METHOD_VALUES })
  @IsOptional()
  @IsIn([...FEE_PAYMENT_METHOD_VALUES])
  public readonly method?: FeePaymentMethodValue;

  @ApiPropertyOptional({ enum: FEE_PAYMENT_STATUS_VALUES })
  @IsOptional()
  @IsIn([...FEE_PAYMENT_STATUS_VALUES])
  public readonly status?: FeePaymentStatusValue;

  @ApiPropertyOptional({ enum: FEE_PAYMENT_VERIFICATION_STATUS_VALUES })
  @IsOptional()
  @IsIn([...FEE_PAYMENT_VERIFICATION_STATUS_VALUES])
  public readonly verificationStatus?: FeePaymentVerificationStatusValue;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public readonly from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public readonly to?: string;
}

export class CheckoutFeeInvoiceDto {
  @ApiProperty({ description: 'Gateway code (razorpay/phonepe/paytm/stripe).' })
  @IsString()
  @MaxLength(40)
  public readonly gatewayCode!: string;

  @ApiPropertyOptional({ format: 'uri', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly returnUrl?: string;
}

export class FeePaymentAllocationResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly feeInvoiceId!: string;
  @ApiProperty() public readonly amount!: number;
  @ApiProperty() public readonly allocatedAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly allocatedBy!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly reversedAt!: string | null;

  public static from(row: FeePaymentAllocationRow): FeePaymentAllocationResponseDto {
    return {
      id: row.id,
      feeInvoiceId: row.feeInvoiceId,
      amount: row.amount,
      allocatedAt: row.allocatedAt.toISOString(),
      allocatedBy: row.allocatedBy,
      reversedAt: row.reversedAt === null ? null : row.reversedAt.toISOString(),
    };
  }
}

export class FeeReceiptSummaryDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly receiptNo!: string;
  @ApiProperty() public readonly status!: string;

  public static from(row: FeeReceiptRow): FeeReceiptSummaryDto {
    return {
      id: row.id,
      receiptNo: row.receiptNo,
      status: row.status,
    };
  }
}

export class FeePaymentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly paymentNo!: string | null;
  @ApiProperty({ enum: FEE_PAYMENT_METHOD_VALUES })
  public readonly method!: FeePaymentMethodValue;
  @ApiProperty() public readonly amount!: number;
  @ApiProperty({ enum: FEE_PAYMENT_STATUS_VALUES })
  public readonly status!: FeePaymentStatusValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly referenceNo!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly paidAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly gatewayCode!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly gatewayPaymentId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly notes!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly paymentSourceId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly paymentProofUrl!: string | null;
  @ApiProperty({ enum: FEE_PAYMENT_VERIFICATION_STATUS_VALUES })
  public readonly verificationStatus!: FeePaymentVerificationStatusValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly verifiedBy!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  public readonly verifiedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly verificationNotes!: string | null;
  @ApiProperty({ type: () => [FeePaymentAllocationResponseDto] })
  public readonly allocations!: readonly FeePaymentAllocationResponseDto[];
  @ApiPropertyOptional({ nullable: true, type: () => FeeReceiptSummaryDto })
  public readonly receipt!: FeeReceiptSummaryDto | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly receiptId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly receiptNo!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(
    row: FeePaymentWithAllocations,
    receipt: FeeReceiptRow | null = null,
  ): FeePaymentResponseDto {
    const summary = receipt === null ? null : FeeReceiptSummaryDto.from(receipt);
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      paymentNo: row.paymentNo,
      method: row.method,
      amount: row.amount,
      status: row.status,
      referenceNo: row.referenceNo,
      paidAt: row.paidAt.toISOString(),
      gatewayCode: row.gatewayCode,
      gatewayPaymentId: row.gatewayPaymentId,
      notes: row.notes,
      paymentSourceId: row.paymentSourceId,
      paymentProofUrl: row.paymentProofUrl,
      verificationStatus: row.verificationStatus,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
      verificationNotes: row.verificationNotes,
      allocations: row.allocations.map(FeePaymentAllocationResponseDto.from),
      receipt: summary,
      receiptId: receipt === null ? null : receipt.id,
      receiptNo: receipt === null ? null : receipt.receiptNo,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeePaymentListResponseDto {
  @ApiProperty({ type: () => [FeePaymentResponseDto] })
  public readonly items!: readonly FeePaymentResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class CheckoutResponseDto {
  @ApiProperty() public readonly gatewayCode!: string;
  @ApiProperty() public readonly sessionId!: string;
  @ApiProperty() public readonly redirectUrl!: string;
  @ApiProperty({ format: 'date-time' }) public readonly expiresAt!: string;
}
