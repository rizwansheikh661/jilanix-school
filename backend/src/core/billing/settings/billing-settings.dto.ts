/**
 * Billing settings DTOs.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { BillingSettingsRow } from '../billing.types';

export class UpdateBillingSettingsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional() @IsInt() @Min(0) @Max(365)
  public gracePeriodDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional() @IsInt() @Min(0) @Max(365)
  public billingLeadDays?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public autoChargeEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional() @IsUUID()
  public defaultPaymentSourceId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional() @IsString() @MaxLength(10)
  public invoicePrefix?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public remindersEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, type: Object })
  @IsOptional() @IsObject()
  public reminderOffsetsJson?: Record<string, unknown> | null;
}

export class BillingSettingsResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public gracePeriodDays!: number;
  @ApiProperty() public billingLeadDays!: number;
  @ApiProperty() public autoChargeEnabled!: boolean;
  @ApiProperty({ nullable: true }) public defaultPaymentSourceId!: string | null;
  @ApiProperty({ nullable: true }) public invoicePrefix!: string | null;
  @ApiProperty() public remindersEnabled!: boolean;
  @ApiProperty({ nullable: true, type: Object }) public reminderOffsetsJson!: unknown;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: BillingSettingsRow): BillingSettingsResponseDto {
    const dto = new BillingSettingsResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.schoolId = row.schoolId;
    dto.gracePeriodDays = row.gracePeriodDays;
    dto.billingLeadDays = row.billingLeadDays;
    dto.autoChargeEnabled = row.autoChargeEnabled;
    dto.defaultPaymentSourceId = row.defaultPaymentSourceId;
    dto.invoicePrefix = row.invoicePrefix;
    dto.remindersEnabled = row.remindersEnabled;
    dto.reminderOffsetsJson = row.reminderOffsetsJson;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}
