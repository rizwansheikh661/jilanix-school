/**
 * Search DTOs — by-aggregate communication search.
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
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_MESSAGE_STATUS_VALUES,
  type NotificationAudienceValue,
  type NotificationChannelValue,
  type NotificationMessageStatusValue,
} from '../../notifications/notifications.constants';

const LIST_MAX_LIMIT = 200;

export class SearchCommunicationsQueryDto {
  @ApiProperty({
    description: 'Aggregate type (e.g. "Student", "Parent", "Homework", "FeeInvoice", "Event").',
    maxLength: 60,
  })
  @IsString()
  @MaxLength(60)
  public readonly aggregateType!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly aggregateId?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_CHANNEL_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CHANNEL_VALUES)
  public readonly channel?: NotificationChannelValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_MESSAGE_STATUS_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_MESSAGE_STATUS_VALUES)
  public readonly status?: NotificationMessageStatusValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_AUDIENCE_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_AUDIENCE_VALUES)
  public readonly recipientAudience?: NotificationAudienceValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly recipientUserId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  public readonly from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  public readonly to?: string;

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

export class SearchHitResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly channel!: string;
  @ApiProperty() public readonly status!: string;
  @ApiProperty() public readonly recipientUserId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly recipientAudience!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly eventKey!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly aggregateType!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly aggregateId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly campaignId!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly sentAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly deliveredAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly readAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly failedAt!: string | null;
}

export class SearchListResponseDto {
  @ApiProperty({ type: () => [SearchHitResponseDto] })
  public readonly items!: readonly SearchHitResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
