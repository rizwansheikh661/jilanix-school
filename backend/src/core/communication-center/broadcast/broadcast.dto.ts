/**
 * Broadcast DTOs — wire shapes for `/api/v1/comms-center/broadcasts`.
 * Validation is intentionally thin: the underlying
 * `NotificationCampaignService` enforces template/channel match, target
 * resolution and DRAFT/start state semantics.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  NOTIFICATION_AUDIENCE_VALUES,
  NOTIFICATION_CAMPAIGN_STATUS_VALUES,
  NOTIFICATION_CAMPAIGN_TARGET_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
  type NotificationAudienceValue,
  type NotificationCampaignStatusValue,
  type NotificationCampaignTargetValue,
  type NotificationChannelValue,
} from '../../notifications/notifications.constants';

const LIST_MAX_LIMIT = 200;

export class ListBroadcastsQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_CAMPAIGN_STATUS_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CAMPAIGN_STATUS_VALUES)
  public readonly status?: NotificationCampaignStatusValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_CAMPAIGN_TARGET_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CAMPAIGN_TARGET_VALUES)
  public readonly targetType?: NotificationCampaignTargetValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: LIST_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  public readonly limit?: number;
}

export class HistoryBroadcastsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: LIST_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  public readonly limit?: number;
}

export class CreateBroadcastDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly notificationTemplateId!: string;

  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES })
  @IsEnum(NOTIFICATION_CHANNEL_VALUES)
  public readonly channel!: NotificationChannelValue;

  @ApiProperty({ enum: NOTIFICATION_CAMPAIGN_TARGET_VALUES })
  @IsEnum(NOTIFICATION_CAMPAIGN_TARGET_VALUES)
  public readonly targetType!: NotificationCampaignTargetValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly targetId?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_AUDIENCE_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_AUDIENCE_VALUES)
  public readonly audience?: NotificationAudienceValue;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  public readonly scheduledAt?: string;
}

export class BroadcastResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly code!: string | null;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES, isArray: true })
  public readonly channels!: readonly NotificationChannelValue[];
  @ApiProperty() public readonly notificationTemplateId!: string;
  @ApiProperty({ enum: NOTIFICATION_CAMPAIGN_TARGET_VALUES })
  public readonly targetType!: NotificationCampaignTargetValue;
  @ApiPropertyOptional({ nullable: true }) public readonly targetId!: string | null;
  @ApiProperty({ enum: NOTIFICATION_AUDIENCE_VALUES })
  public readonly audience!: NotificationAudienceValue;
  @ApiPropertyOptional({ nullable: true }) public readonly scheduledAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly completedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancelledAt!: string | null;
  @ApiProperty({ enum: NOTIFICATION_CAMPAIGN_STATUS_VALUES })
  public readonly status!: NotificationCampaignStatusValue;
  @ApiProperty() public readonly recipientCount!: number;
  @ApiProperty() public readonly sentCount!: number;
  @ApiProperty() public readonly failedCount!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
}

export class CreateBroadcastResponseDto {
  @ApiProperty({ type: () => BroadcastResponseDto })
  public readonly campaign!: BroadcastResponseDto;

  @ApiProperty({
    description: 'true when the underlying campaign was started immediately (no future scheduledAt).',
  })
  public readonly started!: boolean;
}

export class BroadcastListResponseDto {
  @ApiProperty({ type: () => [BroadcastResponseDto] })
  public readonly items!: readonly BroadcastResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class BroadcastRetryResponseDto {
  @ApiProperty({ type: () => BroadcastResponseDto })
  public readonly campaign!: BroadcastResponseDto;

  @ApiProperty() public readonly failedCount!: number;
}
