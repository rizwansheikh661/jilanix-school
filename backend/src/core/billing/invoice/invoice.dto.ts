/**
 * Invoice DTOs — request/response shapes for `/v1/billing/invoices*`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  BILLING_MAX_NOTES_LENGTH,
  BILLING_MAX_REASON_LENGTH,
} from '../billing.constants';
import {
  INVOICE_LINE_TYPE_VALUES,
  INVOICE_STATUS_VALUES,
  type InvoiceLineRow,
  type InvoiceLineTypeValue,
  type InvoiceRow,
  type InvoiceStatusValue,
} from '../billing.types';
import type { InvoiceHistoryRow } from './invoice.repository';

export class InvoiceLineInputDto {
  @ApiProperty({ enum: INVOICE_LINE_TYPE_VALUES })
  @IsIn([...INVOICE_LINE_TYPE_VALUES])
  public lineType!: InvoiceLineTypeValue;

  @ApiProperty({ maxLength: 500 })
  @IsString() @Length(1, 500)
  public description!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public quantity!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public unitPrice!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public amount!: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional() @IsString() @MaxLength(20)
  public taxCode?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public taxRate?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  public taxAmount?: number;

  @ApiPropertyOptional({ nullable: true, type: Object })
  @IsOptional() @IsObject()
  public metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  public sortOrder?: number;
}

export class CreateInvoiceDraftDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public accountId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public schoolId!: string;

  @ApiProperty({ maxLength: 7, description: 'e.g. 2627 (FY 2026-27).' })
  @IsString() @Length(4, 7)
  public fiscalYear!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public subscriptionId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional() @IsString() @MaxLength(20)
  public billingCycle?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional() @IsDateString()
  public periodStart?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional() @IsDateString()
  public periodEnd?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional() @IsDateString()
  public dueDate?: string | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'INR' })
  @IsOptional() @IsString() @Length(3, 3)
  public currency?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: BILLING_MAX_NOTES_LENGTH })
  @IsOptional() @IsString() @MaxLength(BILLING_MAX_NOTES_LENGTH)
  public notes?: string | null;

  @ApiProperty({ type: () => [InvoiceLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  public lines!: InvoiceLineInputDto[];
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional() @IsDateString()
  public dueDate?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: BILLING_MAX_NOTES_LENGTH })
  @IsOptional() @IsString() @MaxLength(BILLING_MAX_NOTES_LENGTH)
  public notes?: string | null;

  @ApiPropertyOptional({ type: () => [InvoiceLineInputDto], description: 'When provided, replaces all lines (DRAFT only).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  public lines?: InvoiceLineInputDto[];
}

export class IssueInvoiceDto {
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional() @IsDateString()
  public issuedAt?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional() @IsDateString()
  public dueDate?: string | null;
}

export class VoidInvoiceDto {
  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;
}

export class WriteOffInvoiceDto {
  @ApiProperty({ maxLength: BILLING_MAX_REASON_LENGTH })
  @IsString() @Length(1, BILLING_MAX_REASON_LENGTH)
  public reason!: string;
}

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly accountId?: string;

  @ApiPropertyOptional({ enum: INVOICE_STATUS_VALUES })
  @IsOptional() @IsIn([...INVOICE_STATUS_VALUES])
  public readonly status?: InvoiceStatusValue;

  @ApiPropertyOptional({ maxLength: 7 })
  @IsOptional() @IsString() @Length(4, 7)
  public readonly fiscalYear?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly subscriptionId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @IsDateString()
  public readonly dueBefore?: string;
}

export class InvoiceLineResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public invoiceId!: string;
  @ApiProperty({ enum: INVOICE_LINE_TYPE_VALUES }) public lineType!: InvoiceLineTypeValue;
  @ApiProperty() public description!: string;
  @ApiProperty() public quantity!: number;
  @ApiProperty() public unitPrice!: number;
  @ApiProperty() public amount!: number;
  @ApiProperty({ nullable: true }) public taxCode!: string | null;
  @ApiProperty({ nullable: true }) public taxRate!: number | null;
  @ApiProperty() public taxAmount!: number;
  @ApiProperty({ nullable: true, type: Object }) public metadata!: unknown;
  @ApiProperty() public sortOrder!: number;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;

  public static from(row: InvoiceLineRow): InvoiceLineResponseDto {
    const dto = new InvoiceLineResponseDto();
    dto.id = row.id;
    dto.invoiceId = row.invoiceId;
    dto.lineType = row.lineType;
    dto.description = row.description;
    dto.quantity = row.quantity;
    dto.unitPrice = row.unitPrice;
    dto.amount = row.amount;
    dto.taxCode = row.taxCode;
    dto.taxRate = row.taxRate;
    dto.taxAmount = row.taxAmount;
    dto.metadata = row.metadata;
    dto.sortOrder = row.sortOrder;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    return dto;
  }
}

export class InvoiceResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public invoiceNumber!: string;
  @ApiProperty({ enum: INVOICE_STATUS_VALUES }) public status!: InvoiceStatusValue;
  @ApiProperty() public fiscalYear!: string;
  @ApiProperty({ nullable: true }) public subscriptionId!: string | null;
  @ApiProperty({ nullable: true }) public billingCycle!: string | null;
  @ApiProperty({ nullable: true, type: String }) public periodStart!: string | null;
  @ApiProperty({ nullable: true, type: String }) public periodEnd!: string | null;
  @ApiProperty({ nullable: true, type: String }) public issuedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public dueDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) public paidAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public voidedAt!: string | null;
  @ApiProperty({ nullable: true }) public voidReason!: string | null;
  @ApiProperty() public currency!: string;
  @ApiProperty() public subtotal!: number;
  @ApiProperty() public discountTotal!: number;
  @ApiProperty() public taxTotal!: number;
  @ApiProperty() public totalAmount!: number;
  @ApiProperty() public amountPaid!: number;
  @ApiProperty() public amountRefunded!: number;
  @ApiProperty() public amountDue!: number;
  @ApiProperty({ nullable: true, type: Object }) public profileSnapshot!: unknown;
  @ApiProperty({ nullable: true, type: Object }) public addressSnapshot!: unknown;
  @ApiProperty({ nullable: true, type: Object }) public taxSnapshot!: unknown;
  @ApiProperty({ nullable: true }) public notes!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: InvoiceRow): InvoiceResponseDto {
    const dto = new InvoiceResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.schoolId = row.schoolId;
    dto.invoiceNumber = row.invoiceNumber;
    dto.status = row.status;
    dto.fiscalYear = row.fiscalYear;
    dto.subscriptionId = row.subscriptionId;
    dto.billingCycle = row.billingCycle;
    dto.periodStart = row.periodStart?.toISOString() ?? null;
    dto.periodEnd = row.periodEnd?.toISOString() ?? null;
    dto.issuedAt = row.issuedAt?.toISOString() ?? null;
    dto.dueDate = row.dueDate?.toISOString() ?? null;
    dto.paidAt = row.paidAt?.toISOString() ?? null;
    dto.voidedAt = row.voidedAt?.toISOString() ?? null;
    dto.voidReason = row.voidReason;
    dto.currency = row.currency;
    dto.subtotal = row.subtotal;
    dto.discountTotal = row.discountTotal;
    dto.taxTotal = row.taxTotal;
    dto.totalAmount = row.totalAmount;
    dto.amountPaid = row.amountPaid;
    dto.amountRefunded = row.amountRefunded;
    dto.amountDue = row.amountDue;
    dto.profileSnapshot = row.profileSnapshot;
    dto.addressSnapshot = row.addressSnapshot;
    dto.taxSnapshot = row.taxSnapshot;
    dto.notes = row.notes;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}

export class InvoiceWithLinesResponseDto {
  @ApiProperty({ type: () => InvoiceResponseDto }) public invoice!: InvoiceResponseDto;
  @ApiProperty({ type: () => [InvoiceLineResponseDto] }) public lines!: readonly InvoiceLineResponseDto[];

  public static from(
    invoice: InvoiceRow,
    lines: readonly InvoiceLineRow[],
  ): InvoiceWithLinesResponseDto {
    const dto = new InvoiceWithLinesResponseDto();
    dto.invoice = InvoiceResponseDto.from(invoice);
    dto.lines = lines.map(InvoiceLineResponseDto.from);
    return dto;
  }
}

export class InvoiceHistoryResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public invoiceId!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public action!: string;
  @ApiProperty({ nullable: true }) public fromStatus!: string | null;
  @ApiProperty({ nullable: true }) public toStatus!: string | null;
  @ApiProperty({ nullable: true }) public amount!: number | null;
  @ApiProperty({ nullable: true }) public notes!: string | null;
  @ApiProperty({ nullable: true }) public actorUserId!: string | null;
  @ApiProperty({ nullable: true, type: Object }) public metadata!: unknown;
  @ApiProperty({ type: String }) public occurredAt!: string;

  public static from(row: InvoiceHistoryRow): InvoiceHistoryResponseDto {
    const dto = new InvoiceHistoryResponseDto();
    dto.id = row.id;
    dto.invoiceId = row.invoiceId;
    dto.schoolId = row.schoolId;
    dto.action = row.action;
    dto.fromStatus = row.fromStatus;
    dto.toStatus = row.toStatus;
    dto.amount = row.amount;
    dto.notes = row.notes;
    dto.actorUserId = row.actorUserId;
    dto.metadata = row.metadata;
    dto.occurredAt = row.occurredAt.toISOString();
    return dto;
  }
}
