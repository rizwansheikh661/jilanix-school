import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { JobDefinitionRow, JobRunRow } from './jobs.types';

const CRON_REGEX = /^(\S+\s+){4}\S+$/;
const NAME_REGEX = /^[a-z][a-z0-9_\-.]*$/;

export class JobDefinitionListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) public readonly queue?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() public readonly isActive?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public readonly limit?: number;
}

export class CreateJobDefinitionDto {
  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(100) @Matches(NAME_REGEX)
  public readonly name!: string;

  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(50)
  public readonly queue!: string;

  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(120)
  public readonly handlerName!: string;

  @ApiPropertyOptional({ description: '5-field cron expression; null = on-demand only.' })
  @IsOptional() @IsString() @MaxLength(100) @Matches(CRON_REGEX)
  public readonly scheduleCron?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional() @IsObject()
  public readonly payloadTemplate?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string;
}

export class UpdateJobDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50)
  public readonly queue?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  public readonly handlerName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100) @Matches(CRON_REGEX)
  public readonly scheduleCron?: string | null;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  public readonly payloadTemplate?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;
}

export class JobDefinitionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty({ nullable: true }) public readonly schoolId!: string | null;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly queue!: string;
  @ApiProperty() public readonly handlerName!: string;
  @ApiProperty({ nullable: true }) public readonly scheduleCron!: string | null;
  @ApiProperty({ type: Object, nullable: true }) public readonly payloadTemplate!: unknown;
  @ApiProperty() public readonly isActive!: boolean;
  @ApiProperty({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: JobDefinitionRow): JobDefinitionResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      queue: row.queue,
      handlerName: row.handlerName,
      scheduleCron: row.scheduleCron,
      payloadTemplate: row.payloadTemplate,
      isActive: row.isActive,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}

export class JobDefinitionListResponseDto {
  @ApiProperty({ type: [JobDefinitionResponseDto] })
  public readonly items!: readonly JobDefinitionResponseDto[];
}

export class JobRunListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(36) public readonly definitionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(36) public readonly jobId?: string;
  @ApiPropertyOptional({ enum: ['RUNNING', 'SUCCESS', 'FAILED'] })
  @IsOptional() @IsString() public readonly status?: 'RUNNING' | 'SUCCESS' | 'FAILED';
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public readonly limit?: number;
}

export class JobRunResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty({ nullable: true }) public readonly jobId!: string | null;
  @ApiProperty({ nullable: true }) public readonly definitionId!: string | null;
  @ApiProperty({ nullable: true }) public readonly schoolId!: string | null;
  @ApiProperty() public readonly queue!: string;
  @ApiProperty() public readonly handlerName!: string;
  @ApiProperty() public readonly attempt!: number;
  @ApiProperty() public readonly status!: 'RUNNING' | 'SUCCESS' | 'FAILED';
  @ApiProperty() public readonly startedAt!: string;
  @ApiProperty({ nullable: true }) public readonly finishedAt!: string | null;
  @ApiProperty({ nullable: true }) public readonly errorMessage!: string | null;
  @ApiProperty({ nullable: true }) public readonly errorCode!: string | null;
  @ApiProperty({ nullable: true }) public readonly durationMs!: number | null;

  public static from(row: JobRunRow): JobRunResponseDto {
    return {
      id: row.id,
      jobId: row.jobId,
      definitionId: row.definitionId,
      schoolId: row.schoolId,
      queue: row.queue,
      handlerName: row.handlerName,
      attempt: row.attempt,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
      errorCode: row.errorCode,
      durationMs: row.durationMs,
    };
  }
}

export class JobRunListResponseDto {
  @ApiProperty({ type: [JobRunResponseDto] })
  public readonly items!: readonly JobRunResponseDto[];
}
