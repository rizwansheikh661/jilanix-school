/**
 * DTOs for `/api/v1/notifications/inbox`. Shape + per-field validation only;
 * the service enforces the IN_APP channel + recipient = current-user scope.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_MESSAGE_STATUS_VALUES,
  NOTIFICATION_PRIORITY_VALUES,
  type NotificationCategoryValue,
  type NotificationMessageStatusValue,
  type NotificationPriorityValue,
} from '../notifications.constants';

const FEED_DEFAULT_LIMIT = 25;
const FEED_MAX_LIMIT = 100;

export class InboxFeedQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public readonly unread?: boolean;

  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORY_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CATEGORY_VALUES)
  public readonly category?: NotificationCategoryValue;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: FEED_MAX_LIMIT,
    default: FEED_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FEED_MAX_LIMIT)
  public readonly limit?: number;
}

export class InboxFeedItemDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly subjectRendered!: string | null;
  @ApiProperty() public readonly bodyRendered!: string;
  @ApiProperty({ enum: NOTIFICATION_CATEGORY_VALUES })
  public readonly category!: NotificationCategoryValue;
  @ApiProperty({ enum: NOTIFICATION_PRIORITY_VALUES })
  public readonly priority!: NotificationPriorityValue;
  @ApiProperty({ enum: NOTIFICATION_MESSAGE_STATUS_VALUES })
  public readonly status!: NotificationMessageStatusValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly eventKey!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly deepLink!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Object })
  public readonly dataPayload!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly readAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
}

export class InboxFeedResponseDto {
  @ApiProperty({ type: () => [InboxFeedItemDto] })
  public readonly items!: readonly InboxFeedItemDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class UnreadCountResponseDto {
  @ApiProperty({ minimum: 0 })
  public readonly count!: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty({ minimum: 0 })
  public readonly updated!: number;
}
