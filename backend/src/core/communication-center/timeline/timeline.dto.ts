/**
 * Timeline DTOs — message lifecycle + append-only event ledger.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimelineEventResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly eventType!: string;
  @ApiProperty() public readonly occurredAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly providerCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly providerMessageId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly errorCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly errorMessage!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'JSON metadata payload supplied by the lifecycle source.' })
  public readonly metadata!: unknown;
}

export class TimelineMessageResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly channel!: string;
  @ApiProperty() public readonly status!: string;
  @ApiProperty() public readonly recipientUserId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly recipientAudience!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly eventKey!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly campaignId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly aggregateType!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly aggregateId!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly sentAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly deliveredAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly readAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly failedAt!: string | null;
}

export class TimelineResponseDto {
  @ApiProperty({ type: () => TimelineMessageResponseDto })
  public readonly message!: TimelineMessageResponseDto;

  @ApiProperty({ type: () => [TimelineEventResponseDto] })
  public readonly events!: readonly TimelineEventResponseDto[];
}
