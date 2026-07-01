/**
 * DTOs for the communication entitlement controllers.
 *
 * - `UpdateCommunicationEntitlementDto` is consumed only by super-admin.
 * - `ListEntitlementsQueryDto` and `UsageQueryDto` are super-admin filters.
 * - The two response shapes are echoed from controller methods after the
 *   service-layer mapping is applied.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { MAX_MONTHLY_LIMIT } from '../notifications.constants';
import type { SchoolCommunicationEntitlementRow } from '../notifications.types';

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

export class UpdateCommunicationEntitlementDto {
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly smsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly whatsappEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly inAppEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: MAX_MONTHLY_LIMIT })
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONTHLY_LIMIT)
  public readonly emailMonthlyLimit?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: MAX_MONTHLY_LIMIT })
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONTHLY_LIMIT)
  public readonly smsMonthlyLimit?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: MAX_MONTHLY_LIMIT })
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONTHLY_LIMIT)
  public readonly whatsappMonthlyLimit?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isTrial?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @IsISO8601()
  public readonly trialExpiresAt?: string | null;
}

export class ListEntitlementsQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor returned in the previous page response.' })
  @IsOptional() @IsString() @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  public readonly limit?: number;
}

export class UsageQueryDto {
  @ApiPropertyOptional({ description: 'Month filter in YYYY-MM form.', pattern: PERIOD_PATTERN.source })
  @IsOptional() @IsString() @Matches(PERIOD_PATTERN)
  public readonly period?: string;
}

export class CommunicationEntitlementResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly emailEnabled!: boolean;
  @ApiProperty() public readonly smsEnabled!: boolean;
  @ApiProperty() public readonly whatsappEnabled!: boolean;
  @ApiProperty() public readonly inAppEnabled!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly emailMonthlyLimit!: number | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly smsMonthlyLimit!: number | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly whatsappMonthlyLimit!: number | null;
  @ApiProperty() public readonly emailUsedThisPeriod!: number;
  @ApiProperty() public readonly smsUsedThisPeriod!: number;
  @ApiProperty() public readonly whatsappUsedThisPeriod!: number;
  @ApiProperty() public readonly usagePeriodStart!: string;
  @ApiProperty() public readonly usagePeriodEnd!: string;
  @ApiProperty() public readonly isTrial!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly trialExpiresAt!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: SchoolCommunicationEntitlementRow): CommunicationEntitlementResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      emailEnabled: row.emailEnabled,
      smsEnabled: row.smsEnabled,
      whatsappEnabled: row.whatsappEnabled,
      inAppEnabled: row.inAppEnabled,
      emailMonthlyLimit: row.emailMonthlyLimit,
      smsMonthlyLimit: row.smsMonthlyLimit,
      whatsappMonthlyLimit: row.whatsappMonthlyLimit,
      emailUsedThisPeriod: row.emailUsedThisPeriod,
      smsUsedThisPeriod: row.smsUsedThisPeriod,
      whatsappUsedThisPeriod: row.whatsappUsedThisPeriod,
      usagePeriodStart: row.usagePeriodStart.toISOString(),
      usagePeriodEnd: row.usagePeriodEnd.toISOString(),
      isTrial: row.isTrial,
      trialExpiresAt: row.trialExpiresAt === null ? null : row.trialExpiresAt.toISOString(),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class CommunicationEntitlementListResponseDto {
  @ApiProperty({ type: () => [CommunicationEntitlementResponseDto] })
  public readonly items!: readonly CommunicationEntitlementResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class CommunicationUsagePeriodDto {
  @ApiProperty() public readonly start!: string;
  @ApiProperty() public readonly end!: string;
}

export class CommunicationUsageChannelDto {
  @ApiProperty() public readonly used!: number;
  @ApiPropertyOptional({ nullable: true })
  public readonly limit!: number | null;
}

export class CommunicationUsageResponseDto {
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty({ type: () => CommunicationUsagePeriodDto })
  public readonly period!: CommunicationUsagePeriodDto;
  @ApiProperty({ type: () => CommunicationUsageChannelDto })
  public readonly email!: CommunicationUsageChannelDto;
  @ApiProperty({ type: () => CommunicationUsageChannelDto })
  public readonly sms!: CommunicationUsageChannelDto;
  @ApiProperty({ type: () => CommunicationUsageChannelDto })
  public readonly whatsapp!: CommunicationUsageChannelDto;
}

export class CommunicationUsageListResponseDto {
  @ApiProperty({ type: () => [CommunicationUsageResponseDto] })
  public readonly items!: readonly CommunicationUsageResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
