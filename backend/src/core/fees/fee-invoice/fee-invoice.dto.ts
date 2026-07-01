/**
 * DTOs for `/fees/invoices` (FeeInvoice + FeeInvoiceLine).
 *
 * Shape + per-field validation only — service enforces tenant scope,
 * duplicate guards, state transitions, fine computation, and cross-tenant
 * FK checks.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  FEE_INVOICE_GENERATE_STUDENTS_MAX,
  FEE_INVOICE_STATUS_VALUES,
  type FeeInvoiceStatusValue,
} from '../fees.constants';
import type {
  FeeInvoiceLineRow,
  FeeInvoiceRow,
  FeeInvoiceWithLines,
} from '../fees.types';

export const FEE_INVOICE_GENERATE_SCOPE_VALUES = [
  'students',
  'class',
  'section',
] as const;
export type FeeInvoiceGenerateScope =
  (typeof FEE_INVOICE_GENERATE_SCOPE_VALUES)[number];

export class FeeInvoicePeriodDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly from!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly to!: string;
}

export class GenerateFeeInvoicesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly structureId!: string;

  @ApiProperty({ type: () => FeeInvoicePeriodDto })
  @ValidateNested()
  @Type(() => FeeInvoicePeriodDto)
  public readonly period!: FeeInvoicePeriodDto;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly issueDate!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dueDate!: string;

  @ApiProperty({ enum: FEE_INVOICE_GENERATE_SCOPE_VALUES })
  @IsIn([...FEE_INVOICE_GENERATE_SCOPE_VALUES])
  public readonly scope!: FeeInvoiceGenerateScope;

  @ApiPropertyOptional({ type: () => [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FEE_INVOICE_GENERATE_STUDENTS_MAX)
  @IsUUID('all', { each: true })
  public readonly studentIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly classId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class FeeInvoiceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly studentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional({ enum: FEE_INVOICE_STATUS_VALUES })
  @IsOptional() @IsIn([...FEE_INVOICE_STATUS_VALUES])
  public readonly status?: FeeInvoiceStatusValue;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly periodFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly periodTo?: string;
}

export class FeeInvoiceLineResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly feeHeadId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly sourceFinePolicyId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly sourceDiscountId!: string | null;
  @ApiProperty() public readonly description!: string;
  @ApiProperty() public readonly quantity!: number;
  @ApiProperty() public readonly unitAmount!: number;
  @ApiProperty() public readonly discountAmount!: number;
  @ApiProperty() public readonly taxAmount!: number;
  @ApiProperty() public readonly lineTotal!: number;
  @ApiProperty() public readonly isLateFine!: boolean;
  @ApiProperty() public readonly version!: number;

  public static from(row: FeeInvoiceLineRow): FeeInvoiceLineResponseDto {
    return {
      id: row.id,
      feeHeadId: row.feeHeadId,
      sourceFinePolicyId: row.sourceFinePolicyId,
      sourceDiscountId: row.sourceDiscountId,
      description: row.description,
      quantity: row.quantity,
      unitAmount: row.unitAmount,
      discountAmount: row.discountAmount,
      taxAmount: row.taxAmount,
      lineTotal: row.lineTotal,
      isLateFine: row.isLateFine,
      version: row.version,
    };
  }
}

export class FeeInvoiceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly feeStructureId!: string;
  @ApiProperty() public readonly academicYearId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly branchId!: string | null;
  @ApiProperty() public readonly invoiceNo!: string;
  @ApiProperty({ format: 'date' }) public readonly periodFrom!: string;
  @ApiProperty({ format: 'date' }) public readonly periodTo!: string;
  @ApiProperty({ format: 'date' }) public readonly issueDate!: string;
  @ApiProperty({ format: 'date' }) public readonly dueDate!: string;
  @ApiProperty() public readonly subtotal!: number;
  @ApiProperty() public readonly discountTotal!: number;
  @ApiProperty() public readonly taxTotal!: number;
  @ApiProperty() public readonly total!: number;
  @ApiProperty() public readonly paidTotal!: number;
  @ApiProperty() public readonly refundTotal!: number;
  @ApiProperty() public readonly balanceTotal!: number;
  @ApiProperty({ enum: FEE_INVOICE_STATUS_VALUES })
  public readonly status!: FeeInvoiceStatusValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly notes!: string | null;
  @ApiProperty({ type: () => [FeeInvoiceLineResponseDto] })
  public readonly lines!: readonly FeeInvoiceLineResponseDto[];
  @ApiProperty() public readonly computedFine!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: FeeInvoiceWithLines): FeeInvoiceResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      feeStructureId: row.feeStructureId,
      academicYearId: row.academicYearId,
      branchId: row.branchId,
      invoiceNo: row.invoiceNo,
      periodFrom: row.periodFrom.toISOString(),
      periodTo: row.periodTo.toISOString(),
      issueDate: row.issueDate.toISOString(),
      dueDate: row.dueDate.toISOString(),
      subtotal: row.subtotal,
      discountTotal: row.discountTotal,
      taxTotal: row.taxTotal,
      total: row.total,
      paidTotal: row.paidTotal,
      refundTotal: row.refundTotal,
      balanceTotal: row.balanceTotal,
      status: row.status,
      notes: row.notes,
      lines: row.lines.map(FeeInvoiceLineResponseDto.from),
      computedFine: row.computedFine,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public static fromHeader(
    row: FeeInvoiceRow,
    lines: readonly FeeInvoiceLineRow[],
    computedFine: number,
  ): FeeInvoiceResponseDto {
    return FeeInvoiceResponseDto.from({
      ...row,
      lines,
      computedFine,
    });
  }
}

export class FeeInvoiceListResponseDto {
  @ApiProperty({ type: () => [FeeInvoiceResponseDto] })
  public readonly items!: readonly FeeInvoiceResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class FeeInvoiceGenerateResponseDto {
  @ApiProperty() public readonly generated!: number;
  @ApiProperty() public readonly skipped!: number;
  @ApiProperty({ type: () => [FeeInvoiceResponseDto] })
  public readonly invoices!: readonly FeeInvoiceResponseDto[];

  public static build(
    generated: number,
    skipped: number,
    invoices: readonly FeeInvoiceResponseDto[],
  ): FeeInvoiceGenerateResponseDto {
    return { generated, skipped, invoices };
  }
}
