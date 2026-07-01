/**
 * Refund DTOs — request/response shapes for `/v1/billing/refunds*`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import { BILLING_MAX_REASON_LENGTH } from '../billing.constants';
import {
  REFUND_STATUS_VALUES,
  type RefundRow,
  type RefundStatusValue,
} from '../billing.types';

export class CreateRefundDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public paymentId!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public invoiceId?: string | null;

  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  public amount!: number;

  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'INR' })
  @IsOptional() @IsString() @Length(3, 3)
  public currency?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public externalReference?: string | null;
}

export class ApproveRefundDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public notes?: string | null;
}

export class RejectRefundDto {
  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;
}

export class MarkRefundProcessedDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 60 })
  @IsOptional() @IsString() @MaxLength(60)
  public gatewayRefundId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public externalReference?: string | null;
}

export class ListRefundsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly paymentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly invoiceId?: string;

  @ApiPropertyOptional({ enum: REFUND_STATUS_VALUES })
  @IsOptional() @IsIn([...REFUND_STATUS_VALUES])
  public readonly status?: RefundStatusValue;
}

export class RefundResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty({ nullable: true }) public invoiceId!: string | null;
  @ApiProperty() public paymentId!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public refundNumber!: string;
  @ApiProperty({ enum: REFUND_STATUS_VALUES }) public status!: RefundStatusValue;
  @ApiProperty() public currency!: string;
  @ApiProperty() public amount!: number;
  @ApiProperty() public reason!: string;
  @ApiProperty({ nullable: true, type: String }) public approvedAt!: string | null;
  @ApiProperty({ nullable: true }) public approvedBy!: string | null;
  @ApiProperty({ nullable: true, type: String }) public rejectedAt!: string | null;
  @ApiProperty({ nullable: true }) public rejectedBy!: string | null;
  @ApiProperty({ nullable: true }) public rejectionReason!: string | null;
  @ApiProperty({ nullable: true, type: String }) public processedAt!: string | null;
  @ApiProperty({ nullable: true }) public processedBy!: string | null;
  @ApiProperty({ nullable: true }) public gatewayRefundId!: string | null;
  @ApiProperty({ nullable: true }) public externalReference!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: RefundRow): RefundResponseDto {
    const dto = new RefundResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.invoiceId = row.invoiceId;
    dto.paymentId = row.paymentId;
    dto.schoolId = row.schoolId;
    dto.refundNumber = row.refundNumber;
    dto.status = row.status;
    dto.currency = row.currency;
    dto.amount = row.amount;
    dto.reason = row.reason;
    dto.approvedAt = row.approvedAt?.toISOString() ?? null;
    dto.approvedBy = row.approvedBy;
    dto.rejectedAt = row.rejectedAt?.toISOString() ?? null;
    dto.rejectedBy = row.rejectedBy;
    dto.rejectionReason = row.rejectionReason;
    dto.processedAt = row.processedAt?.toISOString() ?? null;
    dto.processedBy = row.processedBy;
    dto.gatewayRefundId = row.gatewayRefundId;
    dto.externalReference = row.externalReference;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}
