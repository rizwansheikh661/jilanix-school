/**
 * DTOs for `/api/v1/comms-center/dashboard`. Aggregate-only responses;
 * filter values reuse the shared notification enum tuples so wire types
 * stay in lockstep with the underlying messages table.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  NOTIFICATION_AUDIENCE_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_MESSAGE_STATUS_VALUES,
  type NotificationAudienceValue,
  type NotificationChannelValue,
  type NotificationMessageStatusValue,
} from '../../notifications/notifications.constants';

export class CommunicationFiltersDto {
  @ApiPropertyOptional({
    description: 'Inclusive lower bound on message createdAt (ISO-8601).',
  })
  @IsOptional()
  @IsISO8601()
  public readonly from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound on message createdAt (ISO-8601).',
  })
  @IsOptional()
  @IsISO8601()
  public readonly to?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_CHANNEL_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CHANNEL_VALUES)
  public readonly channel?: NotificationChannelValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_MESSAGE_STATUS_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_MESSAGE_STATUS_VALUES)
  public readonly status?: NotificationMessageStatusValue;

  @ApiPropertyOptional({
    description: 'Operational module the message belongs to (aggregateType, e.g. "Homework").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  public readonly module?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_AUDIENCE_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_AUDIENCE_VALUES)
  public readonly recipientType?: NotificationAudienceValue;
}

export class DashboardSummaryResponseDto {
  @ApiProperty()
  public readonly totalCommunications!: number;

  @ApiProperty()
  public readonly todayCommunications!: number;

  @ApiProperty()
  public readonly pendingDeliveries!: number;

  @ApiProperty()
  public readonly scheduledCommunications!: number;

  @ApiProperty()
  public readonly failedDeliveries!: number;

  @ApiProperty()
  public readonly deliveredCommunications!: number;

  @ApiProperty()
  public readonly readCommunications!: number;

  @ApiProperty({ description: 'ISO-8601 timestamp when the rollup was computed.' })
  public readonly generatedAt!: string;
}
