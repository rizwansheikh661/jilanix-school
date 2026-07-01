/**
 * Schedule DTOs — pending scheduled-broadcast listing.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const LIST_MAX_LIMIT = 200;

export class ListSchedulesQueryDto {
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

export class ScheduledBroadcastResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly code!: string | null;
  @ApiProperty() public readonly status!: string;
  @ApiProperty() public readonly scheduledAt!: string;
  @ApiProperty() public readonly targetType!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly targetId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
}

export class ScheduleListResponseDto {
  @ApiProperty({ type: () => [ScheduledBroadcastResponseDto] })
  public readonly items!: readonly ScheduledBroadcastResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
