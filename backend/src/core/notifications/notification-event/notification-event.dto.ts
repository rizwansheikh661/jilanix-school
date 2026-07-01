/**
 * DTOs for `/api/v1/notifications/events`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import {
  NOTIFICATION_AUDIENCE_VALUES,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_PRIORITY_VALUES,
  type NotificationAudienceValue,
  type NotificationCategoryValue,
  type NotificationPriorityValue,
} from '../notifications.constants';

export class TestFireEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly recipientUserId!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  public readonly variables?: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  public readonly aggregateType?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  public readonly aggregateId?: string;
}

export class EventCatalogItemDto {
  @ApiProperty() public readonly key!: string;

  @ApiProperty({ enum: NOTIFICATION_CATEGORY_VALUES })
  public readonly category!: NotificationCategoryValue;

  @ApiProperty({ enum: NOTIFICATION_PRIORITY_VALUES })
  public readonly defaultPriority!: NotificationPriorityValue;

  @ApiProperty({ enum: NOTIFICATION_AUDIENCE_VALUES })
  public readonly audience!: NotificationAudienceValue;

  @ApiProperty() public readonly description!: string;

  @ApiProperty({ type: Object })
  public readonly sampleVariables!: Readonly<Record<string, unknown>>;
}

export class TestFireEventResponseDto {
  @ApiProperty() public readonly created!: number;
  @ApiProperty() public readonly skipped!: number;
}
