/**
 * Monitoring DTOs — by-status breakdown over the filtered window.
 */
import { ApiProperty } from '@nestjs/swagger';

import { NOTIFICATION_MESSAGE_STATUS_VALUES } from '../../notifications/notifications.constants';

export class MonitoringStatusBreakdownDto {
  @ApiProperty({ enum: NOTIFICATION_MESSAGE_STATUS_VALUES })
  public readonly status!: string;

  @ApiProperty() public readonly count!: number;
}

export class MonitoringSummaryResponseDto {
  @ApiProperty() public readonly total!: number;

  @ApiProperty({
    description: 'Counts keyed by NotificationMessageStatus value; missing statuses are 0.',
  })
  public readonly byStatus!: Readonly<Record<string, number>>;

  @ApiProperty({ type: () => [MonitoringStatusBreakdownDto] })
  public readonly breakdown!: readonly MonitoringStatusBreakdownDto[];

  @ApiProperty() public readonly generatedAt!: string;
}
