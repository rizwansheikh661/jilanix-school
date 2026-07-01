/**
 * Credit-note and adjustment DTOs.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import { BILLING_MAX_REASON_LENGTH } from '../billing.constants';
import {
  ADJUSTMENT_KIND_VALUES,
  CREDIT_NOTE_STATUS_VALUES,
  type AdjustmentKindValue,
  type AdjustmentRow,
  type CreditNoteRow,
  type CreditNoteStatusValue,
} from '../billing.types';

// ---------------------------------------------------------------------------
// Credit notes
// ---------------------------------------------------------------------------
export class IssueCreditNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public accountId!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public invoiceId?: string | null;

  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  public amount!: number;

  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;

  @ApiProperty({ maxLength: 7 })
  @IsString() @Length(4, 7)
  public fiscalYear!: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'INR' })
  @IsOptional() @IsString() @Length(3, 3)
  public currency?: string;
}

export class ApplyCreditNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public targetInvoiceId!: string;

  @ApiPropertyOptional({ minimum: 0.01, description: 'Defaults to remaining credit-note balance.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  public amount?: number;
}

export class VoidCreditNoteDto {
  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;
}

export class ListCreditNotesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly accountId?: string;

  @ApiPropertyOptional({ enum: CREDIT_NOTE_STATUS_VALUES })
  @IsOptional() @IsIn([...CREDIT_NOTE_STATUS_VALUES])
  public readonly status?: CreditNoteStatusValue;
}

export class CreditNoteResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty({ nullable: true }) public invoiceId!: string | null;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public creditNoteNumber!: string;
  @ApiProperty({ enum: CREDIT_NOTE_STATUS_VALUES }) public status!: CreditNoteStatusValue;
  @ApiProperty() public currency!: string;
  @ApiProperty() public amount!: number;
  @ApiProperty() public amountApplied!: number;
  @ApiProperty() public reason!: string;
  @ApiProperty() public fiscalYear!: string;
  @ApiProperty({ nullable: true, type: String }) public appliedAt!: string | null;
  @ApiProperty({ nullable: true }) public appliedToInvoiceId!: string | null;
  @ApiProperty({ nullable: true, type: String }) public voidedAt!: string | null;
  @ApiProperty({ nullable: true }) public voidReason!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: CreditNoteRow): CreditNoteResponseDto {
    const dto = new CreditNoteResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.invoiceId = row.invoiceId;
    dto.schoolId = row.schoolId;
    dto.creditNoteNumber = row.creditNoteNumber;
    dto.status = row.status;
    dto.currency = row.currency;
    dto.amount = row.amount;
    dto.amountApplied = row.amountApplied;
    dto.reason = row.reason;
    dto.fiscalYear = row.fiscalYear;
    dto.appliedAt = row.appliedAt?.toISOString() ?? null;
    dto.appliedToInvoiceId = row.appliedToInvoiceId;
    dto.voidedAt = row.voidedAt?.toISOString() ?? null;
    dto.voidReason = row.voidReason;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------
export class CreateAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public accountId!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public invoiceId?: string | null;

  @ApiProperty({ enum: ADJUSTMENT_KIND_VALUES })
  @IsIn([...ADJUSTMENT_KIND_VALUES])
  public kind!: AdjustmentKindValue;

  @ApiProperty({ minimum: 0.01, description: 'Absolute value; sign is implied by `kind`.' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  public amount!: number;

  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'INR' })
  @IsOptional() @IsString() @Length(3, 3)
  public currency?: string;
}

export class ListAdjustmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly accountId?: string;

  @ApiPropertyOptional({ enum: ADJUSTMENT_KIND_VALUES })
  @IsOptional() @IsIn([...ADJUSTMENT_KIND_VALUES])
  public readonly kind?: AdjustmentKindValue;
}

export class AdjustmentResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty({ nullable: true }) public invoiceId!: string | null;
  @ApiProperty() public schoolId!: string;
  @ApiProperty({ enum: ADJUSTMENT_KIND_VALUES }) public kind!: AdjustmentKindValue;
  @ApiProperty() public currency!: string;
  @ApiProperty() public amount!: number;
  @ApiProperty() public reason!: string;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: AdjustmentRow): AdjustmentResponseDto {
    const dto = new AdjustmentResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.invoiceId = row.invoiceId;
    dto.schoolId = row.schoolId;
    dto.kind = row.kind;
    dto.currency = row.currency;
    dto.amount = row.amount;
    dto.reason = row.reason;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}
