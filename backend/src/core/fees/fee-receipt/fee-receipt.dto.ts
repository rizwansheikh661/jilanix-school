/**
 * DTOs for `/fees/receipts`.
 *
 * Shape + per-field validation only — service enforces tenant scope, status
 * machine, refund-existence guard, and version checks.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_RECEIPT_STATUS_VALUES,
  type FeeReceiptStatusValue,
} from '../fees.constants';
import type {
  FeePaymentAllocationRow,
  FeeReceiptRow,
  FeeReceiptWithLines,
} from '../fees.types';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export class CancelReceiptDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  public readonly reason!: string;
}

export class FeeReceiptListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly studentId?: string;

  @ApiPropertyOptional({ enum: FEE_RECEIPT_STATUS_VALUES })
  @IsOptional()
  @IsIn([...FEE_RECEIPT_STATUS_VALUES])
  public readonly status?: FeeReceiptStatusValue;

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

export class FeeReceiptAllocationResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly feeInvoiceId!: string;
  @ApiProperty() public readonly amount!: number;
  @ApiProperty({ format: 'date-time' }) public readonly allocatedAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly allocatedBy!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly reversedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly reversedBy!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly reversalReason!: string | null;

  public static from(
    row: FeePaymentAllocationRow,
  ): FeeReceiptAllocationResponseDto {
    return {
      id: row.id,
      feeInvoiceId: row.feeInvoiceId,
      amount: row.amount,
      allocatedAt: row.allocatedAt.toISOString(),
      allocatedBy: row.allocatedBy,
      reversedAt: row.reversedAt === null ? null : row.reversedAt.toISOString(),
      reversedBy: row.reversedBy,
      reversalReason: row.reversalReason,
    };
  }
}

export class FeeReceiptResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly feePaymentId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly receiptNo!: string;
  @ApiProperty({ format: 'date-time' }) public readonly issuedAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly issuedBy!: string | null;
  @ApiProperty() public readonly totalAmount!: number;
  @ApiProperty({ enum: FEE_RECEIPT_STATUS_VALUES })
  public readonly status!: FeeReceiptStatusValue;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  public readonly cancelledAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly cancelledBy!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly cancellationReason!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly notes!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: FeeReceiptRow): FeeReceiptResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      feePaymentId: row.feePaymentId,
      studentId: row.studentId,
      receiptNo: row.receiptNo,
      issuedAt: row.issuedAt.toISOString(),
      issuedBy: row.issuedBy,
      totalAmount: row.totalAmount,
      status: row.status,
      cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
      cancelledBy: row.cancelledBy,
      cancellationReason: row.cancellationReason,
      notes: row.notes,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class FeeReceiptDetailResponseDto extends FeeReceiptResponseDto {
  @ApiProperty({ type: () => [FeeReceiptAllocationResponseDto] })
  public readonly allocations!: readonly FeeReceiptAllocationResponseDto[];

  public static override from(
    row: FeeReceiptWithLines,
  ): FeeReceiptDetailResponseDto {
    return {
      ...FeeReceiptResponseDto.from(row),
      allocations: row.allocations.map((a) =>
        FeeReceiptAllocationResponseDto.from(a),
      ),
    };
  }
}

export class FeeReceiptListResponseDto {
  @ApiProperty({ type: () => [FeeReceiptResponseDto] })
  public readonly items!: readonly FeeReceiptResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
