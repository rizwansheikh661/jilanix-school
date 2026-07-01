import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { OUTBOX_STATUS } from '../outbox.constants';
import type { OutboxEventRow, OutboxStatus } from '../outbox.types';

const OUTBOX_STATUS_VALUES = Object.values(OUTBOX_STATUS) as readonly OutboxStatus[];

export class OutboxListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public readonly topic?: string;

  @ApiPropertyOptional({ enum: OUTBOX_STATUS_VALUES })
  @IsOptional()
  @IsEnum(OUTBOX_STATUS_VALUES)
  public readonly status?: OutboxStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public readonly limit?: number;
}

export class OutboxDeadLetterQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public readonly topic?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public readonly limit?: number;
}

export class OutboxEventResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty({ nullable: true }) public readonly schoolId!: string | null;
  @ApiProperty() public readonly topic!: string;
  @ApiProperty() public readonly aggregateType!: string;
  @ApiProperty() public readonly aggregateId!: string;
  @ApiProperty() public readonly eventId!: string;
  @ApiProperty() public readonly eventType!: string;
  @ApiProperty({ enum: OUTBOX_STATUS_VALUES }) public readonly status!: OutboxStatus;
  @ApiProperty() public readonly attempts!: number;
  @ApiProperty({ nullable: true }) public readonly lastError!: string | null;
  @ApiProperty({ nullable: true }) public readonly nextAttemptAt!: string | null;
  @ApiProperty({ nullable: true }) public readonly deliveredAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ type: Object }) public readonly payload!: unknown;
  @ApiProperty({ type: Object, nullable: true }) public readonly headers!: unknown;

  public static from(row: OutboxEventRow): OutboxEventResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      topic: row.topic,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventId: row.eventId,
      eventType: row.eventType,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
      payload: row.payload,
      headers: row.headers,
    };
  }
}

export class OutboxEventListResponseDto {
  @ApiProperty({ type: [OutboxEventResponseDto] })
  public readonly items!: readonly OutboxEventResponseDto[];
}
