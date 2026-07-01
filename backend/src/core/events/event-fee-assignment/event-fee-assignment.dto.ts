/**
 * DTOs for `/events/{id}/fee-assignments`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  EVENT_FEE_ASSIGNMENT_STATUS_VALUES,
  type EventFeeAssignmentStatusValue,
} from '../events.constants';
import type { EventFeeAssignmentRow } from '../events.types';

export class EventFeeAssignmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EVENT_FEE_ASSIGNMENT_STATUS_VALUES })
  @IsOptional() @IsEnum(EVENT_FEE_ASSIGNMENT_STATUS_VALUES)
  public readonly status?: EventFeeAssignmentStatusValue;
}

export class VoidFeeAssignmentDto {
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly reason?: string | null;
}

export class EventFeeAssignmentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly eventId!: string;
  @ApiProperty() public readonly participantId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly feeHeadId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly feeStructureId!: string | null;
  @ApiProperty() public readonly amount!: number;
  @ApiProperty({ enum: EVENT_FEE_ASSIGNMENT_STATUS_VALUES })
  public readonly status!: EventFeeAssignmentStatusValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly feeInvoiceId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly invoicedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly voidedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly voidReason!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: EventFeeAssignmentRow): EventFeeAssignmentResponseDto {
    return {
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      studentId: row.studentId,
      feeHeadId: row.feeHeadId,
      feeStructureId: row.feeStructureId,
      amount: row.amount,
      status: row.status,
      feeInvoiceId: row.feeInvoiceId,
      invoicedAt: row.invoicedAt === null ? null : row.invoicedAt.toISOString(),
      voidedAt: row.voidedAt === null ? null : row.voidedAt.toISOString(),
      voidReason: row.voidReason,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class EventFeeAssignmentListResponseDto {
  @ApiProperty({ type: () => [EventFeeAssignmentResponseDto] })
  public readonly items!: readonly EventFeeAssignmentResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class GenerateInvoicesResponseDto {
  @ApiProperty() public readonly invoiced!: number;
  @ApiProperty() public readonly skipped!: number;
  @ApiProperty({ type: [String] })
  public readonly invoiceIds!: readonly string[];

  public static of(
    invoiced: number,
    skipped: number,
    invoiceIds: readonly string[],
  ): GenerateInvoicesResponseDto {
    return Object.assign(new GenerateInvoicesResponseDto(), {
      invoiced,
      skipped,
      invoiceIds,
    });
  }
}
