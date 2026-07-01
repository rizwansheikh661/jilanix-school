/**
 * DTOs for `/events/{id}/results`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  EVENT_RESULT_POSITION_VALUES,
  type EventResultPositionValue,
} from '../events.constants';
import type { EventResultRow } from '../events.types';

export class EventResultListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EVENT_RESULT_POSITION_VALUES })
  @IsOptional() @IsEnum(EVENT_RESULT_POSITION_VALUES)
  public readonly position?: EventResultPositionValue;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly participantId?: string;
}

export class CreateEventResultDto {
  @ApiProperty()
  @IsUUID()
  public readonly participantId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(100_000)
  public readonly rank?: number | null;

  @ApiProperty({ enum: EVENT_RESULT_POSITION_VALUES })
  @IsEnum(EVENT_RESULT_POSITION_VALUES)
  public readonly position!: EventResultPositionValue;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsNumber() @Min(0) @Max(99_999_999)
  public readonly score?: number | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly remark?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly awardedAt?: string | null;
}

export class UpdateEventResultDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(100_000)
  public readonly rank?: number | null;

  @ApiPropertyOptional({ enum: EVENT_RESULT_POSITION_VALUES })
  @IsOptional() @IsEnum(EVENT_RESULT_POSITION_VALUES)
  public readonly position?: EventResultPositionValue;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsNumber() @Min(0) @Max(99_999_999)
  public readonly score?: number | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly remark?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsISO8601()
  public readonly awardedAt?: string | null;
}

export class EventResultResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly eventId!: string;
  @ApiProperty() public readonly participantId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly rank!: number | null;
  @ApiProperty({ enum: EVENT_RESULT_POSITION_VALUES })
  public readonly position!: EventResultPositionValue;
  @ApiPropertyOptional({ nullable: true }) public readonly score!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly remark!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly awardedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly awardedBy!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: EventResultRow): EventResultResponseDto {
    return {
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      rank: row.rank,
      position: row.position,
      score: row.score,
      remark: row.remark,
      awardedAt: row.awardedAt === null ? null : row.awardedAt.toISOString(),
      awardedBy: row.awardedBy,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class EventResultListResponseDto {
  @ApiProperty({ type: () => [EventResultResponseDto] })
  public readonly items!: readonly EventResultResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
