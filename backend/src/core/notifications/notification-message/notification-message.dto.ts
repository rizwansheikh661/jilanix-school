/**
 * DTOs for `/api/v1/notifications/messages`. Shape + per-field validation
 * only; the service enforces tenant scope, cancel-state guards, and the
 * cross-tenant rule for send-test.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  EVENT_KEY_PATTERN,
  NOTIFICATION_AUDIENCE_VALUES,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_MESSAGE_STATUS_VALUES,
  NOTIFICATION_PRIORITY_VALUES,
  type NotificationAudienceValue,
  type NotificationCategoryValue,
  type NotificationChannelValue,
  type NotificationMessageStatusValue,
  type NotificationPriorityValue,
} from '../notifications.constants';

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

export class ListNotificationMessagesQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_CHANNEL_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CHANNEL_VALUES)
  public readonly channel?: NotificationChannelValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_MESSAGE_STATUS_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_MESSAGE_STATUS_VALUES)
  public readonly status?: NotificationMessageStatusValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly recipientUserId?: string;

  @ApiPropertyOptional({ maxLength: 80, pattern: EVENT_KEY_PATTERN.source })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(EVENT_KEY_PATTERN)
  public readonly eventKey?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public readonly from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public readonly to?: string;

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

export class SendTestNotificationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly templateId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly recipientUserId?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  public readonly payload!: Record<string, unknown>;
}

export class NotificationMessageEventResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly notificationMessageId!: string;
  @ApiProperty() public readonly eventType!: string;
  @ApiProperty() public readonly occurredAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly providerCode!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly providerMessageId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly errorCode!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly errorMessage!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Object })
  public readonly metadata!: Record<string, unknown> | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly createdBy!: string | null;
}

export class NotificationMessageResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly messageNo!: string | null;
  @ApiProperty() public readonly recipientUserId!: string;
  @ApiProperty({ enum: NOTIFICATION_AUDIENCE_VALUES })
  public readonly recipientAudience!: NotificationAudienceValue;
  @ApiProperty() public readonly recipientAddress!: string;
  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES })
  public readonly channel!: NotificationChannelValue;
  @ApiProperty({ enum: NOTIFICATION_CATEGORY_VALUES })
  public readonly category!: NotificationCategoryValue;
  @ApiProperty({ enum: NOTIFICATION_PRIORITY_VALUES })
  public readonly priority!: NotificationPriorityValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly notificationTemplateId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly templateVersionNo!: number | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly eventKey!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly aggregateType!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly aggregateId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly campaignId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly subjectRendered!: string | null;
  @ApiProperty() public readonly bodyRendered!: string;
  @ApiPropertyOptional({ nullable: true, type: Object })
  public readonly dataPayload!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly deepLink!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly dedupeKey!: string | null;
  @ApiProperty({ enum: NOTIFICATION_MESSAGE_STATUS_VALUES })
  public readonly status!: NotificationMessageStatusValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly scheduledAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly sentAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly deliveredAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly readAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly failedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly lastError!: string | null;
  @ApiProperty() public readonly attemptCount!: number;
  @ApiProperty() public readonly maxAttempts!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiPropertyOptional({
    type: () => [NotificationMessageEventResponseDto],
  })
  public readonly events?: readonly NotificationMessageEventResponseDto[];
}

export class NotificationMessageListResponseDto {
  @ApiProperty({ type: () => [NotificationMessageResponseDto] })
  public readonly items!: readonly NotificationMessageResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
