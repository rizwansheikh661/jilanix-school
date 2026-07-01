/**
 * Payment DTOs — request/response shapes for `/v1/billing/payments*`.
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
  PAYMENT_ATTEMPT_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  type PaymentAttemptRow,
  type PaymentAttemptStatusValue,
  type PaymentMethodValue,
  type PaymentRow,
  type PaymentStatusValue,
} from '../billing.types';

const MANUAL_PAYMENT_METHODS: readonly PaymentMethodValue[] = [
  'UPI',
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
  'CARD',
];

export class RecordManualPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public accountId!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public invoiceId?: string | null;

  @ApiProperty({ enum: MANUAL_PAYMENT_METHODS })
  @IsIn([...MANUAL_PAYMENT_METHODS])
  public method!: PaymentMethodValue;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public amount!: number;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'INR' })
  @IsOptional() @IsString() @Length(3, 3)
  public currency?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public externalReference?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  public proofUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public payerNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public paymentSourceId?: string | null;
}

export class ApprovePaymentDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public notes?: string | null;
}

export class RejectPaymentDto {
  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;
}

export class HoldPaymentDto {
  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;
}

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly accountId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly invoiceId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_STATUS_VALUES })
  @IsOptional() @IsIn([...PAYMENT_STATUS_VALUES])
  public readonly status?: PaymentStatusValue;

  @ApiPropertyOptional({ enum: PAYMENT_METHOD_VALUES })
  @IsOptional() @IsIn([...PAYMENT_METHOD_VALUES])
  public readonly method?: PaymentMethodValue;
}

export class PaymentResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty({ nullable: true }) public invoiceId!: string | null;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public receiptNumber!: string;
  @ApiProperty({ enum: PAYMENT_METHOD_VALUES }) public method!: PaymentMethodValue;
  @ApiProperty({ enum: PAYMENT_STATUS_VALUES }) public status!: PaymentStatusValue;
  @ApiProperty() public currency!: string;
  @ApiProperty() public amount!: number;
  @ApiProperty() public amountRefunded!: number;
  @ApiProperty() public feeAmount!: number;
  @ApiProperty() public netAmount!: number;
  @ApiProperty() public fiscalYear!: string;
  @ApiProperty({ nullable: true }) public gatewayOrderId!: string | null;
  @ApiProperty({ nullable: true }) public gatewayPaymentId!: string | null;
  @ApiProperty({ nullable: true }) public externalReference!: string | null;
  @ApiProperty({ nullable: true }) public proofUrl!: string | null;
  @ApiProperty({ nullable: true }) public payerNotes!: string | null;
  @ApiProperty({ nullable: true, type: String }) public receivedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public approvedAt!: string | null;
  @ApiProperty({ nullable: true }) public approvedBy!: string | null;
  @ApiProperty({ nullable: true, type: String }) public rejectedAt!: string | null;
  @ApiProperty({ nullable: true }) public rejectedBy!: string | null;
  @ApiProperty({ nullable: true }) public rejectionReason!: string | null;
  @ApiProperty({ nullable: true }) public holdReason!: string | null;
  @ApiProperty({ nullable: true }) public paymentSourceId!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: PaymentRow): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.invoiceId = row.invoiceId;
    dto.schoolId = row.schoolId;
    dto.receiptNumber = row.receiptNumber;
    dto.method = row.method;
    dto.status = row.status;
    dto.currency = row.currency;
    dto.amount = row.amount;
    dto.amountRefunded = row.amountRefunded;
    dto.feeAmount = row.feeAmount;
    dto.netAmount = row.netAmount;
    dto.fiscalYear = row.fiscalYear;
    dto.gatewayOrderId = row.gatewayOrderId;
    dto.gatewayPaymentId = row.gatewayPaymentId;
    dto.externalReference = row.externalReference;
    dto.proofUrl = row.proofUrl;
    dto.payerNotes = row.payerNotes;
    dto.receivedAt = row.receivedAt?.toISOString() ?? null;
    dto.approvedAt = row.approvedAt?.toISOString() ?? null;
    dto.approvedBy = row.approvedBy;
    dto.rejectedAt = row.rejectedAt?.toISOString() ?? null;
    dto.rejectedBy = row.rejectedBy;
    dto.rejectionReason = row.rejectionReason;
    dto.holdReason = row.holdReason;
    dto.paymentSourceId = row.paymentSourceId;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}

export class PaymentAttemptResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public paymentId!: string;
  @ApiProperty({ enum: PAYMENT_ATTEMPT_STATUS_VALUES }) public status!: PaymentAttemptStatusValue;
  @ApiProperty() public amount!: number;
  @ApiProperty({ nullable: true }) public gatewayOrderId!: string | null;
  @ApiProperty({ nullable: true }) public gatewayPaymentId!: string | null;
  @ApiProperty({ nullable: true }) public errorCode!: string | null;
  @ApiProperty({ nullable: true }) public errorMessage!: string | null;
  @ApiProperty({ nullable: true, type: Object }) public rawResponse!: unknown;
  @ApiProperty({ type: String }) public attemptedAt!: string;

  public static from(row: PaymentAttemptRow): PaymentAttemptResponseDto {
    const dto = new PaymentAttemptResponseDto();
    dto.id = row.id;
    dto.paymentId = row.paymentId;
    dto.status = row.status;
    dto.amount = row.amount;
    dto.gatewayOrderId = row.gatewayOrderId;
    dto.gatewayPaymentId = row.gatewayPaymentId;
    dto.errorCode = row.errorCode;
    dto.errorMessage = row.errorMessage;
    dto.rawResponse = row.rawResponse;
    dto.attemptedAt = row.attemptedAt.toISOString();
    return dto;
  }
}
