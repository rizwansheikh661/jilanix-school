import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import type { JobDeadLetterRow, JobDeadLetterStatus } from '../jobs.types';

const DLQ_STATUS_VALUES: readonly JobDeadLetterStatus[] = ['PENDING', 'REPLAYED', 'ARCHIVED'];

export class JobDeadLetterListQueryDto {
  @ApiPropertyOptional({ enum: DLQ_STATUS_VALUES })
  @IsOptional() @IsEnum(DLQ_STATUS_VALUES) public readonly status?: JobDeadLetterStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) public readonly queue?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public readonly limit?: number;
}

export class JobDeadLetterResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly jobId!: string;
  @ApiProperty({ nullable: true }) public readonly definitionId!: string | null;
  @ApiProperty({ nullable: true }) public readonly schoolId!: string | null;
  @ApiProperty() public readonly queue!: string;
  @ApiProperty() public readonly handlerName!: string;
  @ApiProperty() public readonly attempts!: number;
  @ApiProperty() public readonly firstFailedAt!: string;
  @ApiProperty() public readonly lastFailedAt!: string;
  @ApiProperty({ nullable: true }) public readonly lastError!: string | null;
  @ApiProperty({ enum: DLQ_STATUS_VALUES }) public readonly status!: JobDeadLetterStatus;
  @ApiProperty({ nullable: true }) public readonly replayedAt!: string | null;
  @ApiProperty({ type: Object }) public readonly payload!: unknown;
  @ApiProperty() public readonly version!: number;

  public static from(row: JobDeadLetterRow): JobDeadLetterResponseDto {
    return {
      id: row.id,
      jobId: row.jobId,
      definitionId: row.definitionId,
      schoolId: row.schoolId,
      queue: row.queue,
      handlerName: row.handlerName,
      attempts: row.attempts,
      firstFailedAt: row.firstFailedAt.toISOString(),
      lastFailedAt: row.lastFailedAt.toISOString(),
      lastError: row.lastError,
      status: row.status,
      replayedAt: row.replayedAt?.toISOString() ?? null,
      payload: row.payload,
      version: row.version,
    };
  }
}

export class JobDeadLetterListResponseDto {
  @ApiProperty({ type: [JobDeadLetterResponseDto] })
  public readonly items!: readonly JobDeadLetterResponseDto[];
}
