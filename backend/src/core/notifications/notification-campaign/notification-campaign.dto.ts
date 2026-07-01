/**
 * DTOs for `/api/v1/notifications/campaigns`. Shape + per-field validation
 * only; the service enforces tenant scope, template/channel match, target
 * resolution, broadcast feature-flag gating, and start/cancel state guards.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  NOTIFICATION_AUDIENCE_VALUES,
  NOTIFICATION_CAMPAIGN_STATUS_VALUES,
  NOTIFICATION_CAMPAIGN_TARGET_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_CODE_PATTERN,
  type NotificationAudienceValue,
  type NotificationCampaignStatusValue,
  type NotificationCampaignTargetValue,
  type NotificationChannelValue,
} from '../notifications.constants';

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

export class ListCampaignsQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_CAMPAIGN_STATUS_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CAMPAIGN_STATUS_VALUES)
  public readonly status?: NotificationCampaignStatusValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_CAMPAIGN_TARGET_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CAMPAIGN_TARGET_VALUES)
  public readonly targetType?: NotificationCampaignTargetValue;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: LIST_MAX_LIMIT,
    default: LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  public readonly limit?: number;
}

export class ListCampaignRecipientsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: LIST_MAX_LIMIT,
    default: LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  public readonly limit?: number;
}

export class CreateCampaignDto {
  @ApiPropertyOptional({ maxLength: 40, pattern: NOTIFICATION_CODE_PATTERN.source })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(NOTIFICATION_CODE_PATTERN)
  public readonly code?: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly description?: string | null;

  @ApiProperty({
    enum: NOTIFICATION_CHANNEL_VALUES,
    isArray: true,
    minItems: 1,
    maxItems: 4,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsEnum(NOTIFICATION_CHANNEL_VALUES, { each: true })
  public readonly channels!: NotificationChannelValue[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly notificationTemplateId!: string;

  @ApiProperty({ enum: NOTIFICATION_CAMPAIGN_TARGET_VALUES })
  @IsEnum(NOTIFICATION_CAMPAIGN_TARGET_VALUES)
  public readonly targetType!: NotificationCampaignTargetValue;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when targetType is not SCHOOL.',
  })
  @IsOptional()
  @IsUUID()
  public readonly targetId?: string;

  @ApiPropertyOptional({
    enum: NOTIFICATION_AUDIENCE_VALUES,
    default: 'USER',
  })
  @IsOptional()
  @IsEnum(NOTIFICATION_AUDIENCE_VALUES)
  public readonly audience?: NotificationAudienceValue;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  public readonly scheduledAt?: string;
}

export class CampaignResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly code!: string | null;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES, isArray: true })
  public readonly channels!: readonly NotificationChannelValue[];
  @ApiProperty() public readonly notificationTemplateId!: string;
  @ApiProperty({ enum: NOTIFICATION_CAMPAIGN_TARGET_VALUES })
  public readonly targetType!: NotificationCampaignTargetValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly targetId!: string | null;
  @ApiProperty({ enum: NOTIFICATION_AUDIENCE_VALUES })
  public readonly audience!: NotificationAudienceValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly scheduledAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly completedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly cancelledAt!: string | null;
  @ApiProperty({ enum: NOTIFICATION_CAMPAIGN_STATUS_VALUES })
  public readonly status!: NotificationCampaignStatusValue;
  @ApiProperty() public readonly recipientCount!: number;
  @ApiProperty() public readonly sentCount!: number;
  @ApiProperty() public readonly failedCount!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
}

export class CampaignListResponseDto {
  @ApiProperty({ type: () => [CampaignResponseDto] })
  public readonly items!: readonly CampaignResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class CampaignRecipientResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly notificationCampaignId!: string;
  @ApiProperty() public readonly recipientUserId!: string;
  @ApiProperty({ enum: NOTIFICATION_AUDIENCE_VALUES })
  public readonly recipientAudience!: NotificationAudienceValue;
  @ApiProperty() public readonly resolvedAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly resolutionReason!: string | null;
  @ApiProperty() public readonly skipped!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly skipReason!: string | null;
  @ApiProperty() public readonly createdAt!: string;
}

export class CampaignRecipientListResponseDto {
  @ApiProperty({ type: () => [CampaignRecipientResponseDto] })
  public readonly items!: readonly CampaignRecipientResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class CampaignSummaryByReasonDto {
  @ApiProperty() public readonly OPTED_OUT!: number;
  @ApiProperty() public readonly QUIET_HOURS!: number;
  @ApiProperty() public readonly QUOTA_EXHAUSTED!: number;
  @ApiProperty() public readonly CHANNEL_DISABLED!: number;
}

export class CampaignSummaryResponseDto {
  @ApiProperty() public readonly total!: number;
  @ApiProperty() public readonly skipped!: number;
  @ApiProperty({ type: () => CampaignSummaryByReasonDto })
  public readonly byReason!: CampaignSummaryByReasonDto;
}

export class CampaignDetailResponseDto {
  @ApiProperty({ type: () => CampaignResponseDto })
  public readonly campaign!: CampaignResponseDto;

  @ApiProperty({ type: () => CampaignSummaryResponseDto })
  public readonly summary!: CampaignSummaryResponseDto;
}
