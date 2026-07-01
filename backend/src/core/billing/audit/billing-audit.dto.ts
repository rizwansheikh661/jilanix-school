/**
 * Billing-audit DTOs — read-only endpoints since the audit log is APPEND_ONLY
 * and only emitted by service-side flows.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import type { BillingAuditAction } from '../billing.types';
import type { BillingAuditRow } from './billing-audit.repository';

const BILLING_AUDIT_ACTION_VALUES = [
  'ACCOUNT_CREATED',
  'PROFILE_UPDATED',
  'ADDRESS_UPDATED',
  'TAX_DETAILS_UPDATED',
  'INVOICE_CREATED',
  'INVOICE_ISSUED',
  'INVOICE_VOIDED',
  'INVOICE_WRITTEN_OFF',
  'PAYMENT_RECORDED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_HELD',
  'PAYMENT_FAILED',
  'REFUND_CREATED',
  'REFUND_APPROVED',
  'REFUND_PROCESSED',
  'REFUND_REJECTED',
  'CREDIT_NOTE_ISSUED',
  'CREDIT_NOTE_APPLIED',
  'CREDIT_NOTE_VOIDED',
  'ADJUSTMENT_APPLIED',
  'SETTINGS_UPDATED',
  'PAYMENT_SOURCE_CONFIGURED',
  'PAYMENT_SOURCE_DISABLED',
] as const satisfies readonly BillingAuditAction[];

export class ListBillingAuditsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly accountId?: string;

  @ApiPropertyOptional({ enum: BILLING_AUDIT_ACTION_VALUES })
  @IsOptional() @IsIn([...BILLING_AUDIT_ACTION_VALUES])
  public readonly action?: BillingAuditAction;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  public readonly resourceType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly resourceId?: string;
}

export class BillingAuditResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty({ nullable: true }) public accountId!: string | null;
  @ApiProperty() public schoolId!: string;
  @ApiProperty({ enum: BILLING_AUDIT_ACTION_VALUES }) public action!: BillingAuditAction;
  @ApiProperty({ nullable: true }) public resourceType!: string | null;
  @ApiProperty({ nullable: true }) public resourceId!: string | null;
  @ApiProperty({ nullable: true }) public actorUserId!: string | null;
  @ApiProperty({ nullable: true }) public summary!: string | null;
  @ApiProperty({ nullable: true, type: Object }) public metadata!: unknown;
  @ApiProperty({ type: String }) public occurredAt!: string;

  public static from(row: BillingAuditRow): BillingAuditResponseDto {
    const dto = new BillingAuditResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.schoolId = row.schoolId;
    dto.action = row.action;
    dto.resourceType = row.resourceType;
    dto.resourceId = row.resourceId;
    dto.actorUserId = row.actorUserId;
    dto.summary = row.summary;
    dto.metadata = row.metadata;
    dto.occurredAt = row.occurredAt.toISOString();
    return dto;
  }
}
