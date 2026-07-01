/**
 * Analytics DTOs — delivery/read/failure rates + channel mix.
 */
import { ApiProperty } from '@nestjs/swagger';

import { NOTIFICATION_CHANNEL_VALUES } from '../../notifications/notifications.constants';

export class AnalyticsChannelRowDto {
  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES })
  public readonly channel!: string;

  @ApiProperty() public readonly count!: number;
}

export class AnalyticsSummaryResponseDto {
  @ApiProperty() public readonly total!: number;
  @ApiProperty() public readonly delivered!: number;
  @ApiProperty() public readonly read!: number;
  @ApiProperty({
    description: 'Includes FAILED + DEAD_LETTER (terminal failures).',
  })
  public readonly failed!: number;
  @ApiProperty() public readonly attemptedTotal!: number;
  @ApiProperty({
    description: 'Total attempts beyond the first (sum(attemptCount) - total).',
  })
  public readonly retryCount!: number;

  @ApiProperty({ description: 'DELIVERED / total. 0 when total=0.' })
  public readonly deliveryRate!: number;

  @ApiProperty({ description: 'READ / DELIVERED. 0 when DELIVERED=0.' })
  public readonly readRate!: number;

  @ApiProperty({ description: '(FAILED + DEAD_LETTER) / total. 0 when total=0.' })
  public readonly failureRate!: number;

  @ApiProperty({ type: () => [AnalyticsChannelRowDto] })
  public readonly channelDistribution!: readonly AnalyticsChannelRowDto[];

  @ApiProperty() public readonly generatedAt!: string;
}
