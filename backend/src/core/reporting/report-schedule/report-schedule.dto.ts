/**
 * DTOs for `/report-schedules`. Service enforces tenant scope, cron
 * validation, recipient cap, and feature-flag gating.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  CRON_MAX_LENGTH,
  MAX_SCHEDULE_RECIPIENTS,
  NAME_MAX_LENGTH,
  REPORT_FORMAT_VALUES,
  REPORT_KIND_VALUES,
  REPORT_SCHEDULE_FREQUENCY_VALUES,
  SCHEDULE_RECIPIENT_TYPE_VALUES,
  type ReportFormatValue,
  type ReportKindValue,
  type ReportScheduleFrequencyValue,
  type ScheduleRecipientTypeValue,
} from '../reporting.constants';
import type { ReportScheduleRow, ScheduleRecipient } from '../reporting.types';

export class ScheduleRecipientDto {
  @ApiProperty({ enum: SCHEDULE_RECIPIENT_TYPE_VALUES })
  @IsEnum(SCHEDULE_RECIPIENT_TYPE_VALUES)
  public readonly type!: ScheduleRecipientTypeValue;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  public readonly value!: string;
}

export class CreateReportScheduleDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly name!: string;

  @ApiProperty({ enum: REPORT_KIND_VALUES })
  @IsEnum(REPORT_KIND_VALUES)
  public readonly reportKind!: ReportKindValue;

  @ApiProperty({ enum: REPORT_FORMAT_VALUES })
  @IsEnum(REPORT_FORMAT_VALUES)
  public readonly format!: ReportFormatValue;

  @ApiProperty({ enum: REPORT_SCHEDULE_FREQUENCY_VALUES })
  @IsEnum(REPORT_SCHEDULE_FREQUENCY_VALUES)
  public readonly frequency!: ReportScheduleFrequencyValue;

  @ApiProperty({ maxLength: CRON_MAX_LENGTH })
  @IsString()
  @MaxLength(CRON_MAX_LENGTH)
  public readonly cron!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly params!: Record<string, unknown>;

  @ApiProperty({ type: () => [ScheduleRecipientDto] })
  @IsArray()
  @ArrayMaxSize(MAX_SCHEDULE_RECIPIENTS)
  @ValidateNested({ each: true })
  @Type(() => ScheduleRecipientDto)
  public readonly recipients!: ScheduleRecipientDto[];
}

export class UpdateReportScheduleDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  public readonly name?: string;

  @ApiPropertyOptional({ enum: REPORT_KIND_VALUES })
  @IsOptional()
  @IsEnum(REPORT_KIND_VALUES)
  public readonly reportKind?: ReportKindValue;

  @ApiPropertyOptional({ enum: REPORT_FORMAT_VALUES })
  @IsOptional()
  @IsEnum(REPORT_FORMAT_VALUES)
  public readonly format?: ReportFormatValue;

  @ApiPropertyOptional({ enum: REPORT_SCHEDULE_FREQUENCY_VALUES })
  @IsOptional()
  @IsEnum(REPORT_SCHEDULE_FREQUENCY_VALUES)
  public readonly frequency?: ReportScheduleFrequencyValue;

  @ApiPropertyOptional({ maxLength: CRON_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(CRON_MAX_LENGTH)
  public readonly cron?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly params?: Record<string, unknown>;

  @ApiPropertyOptional({ type: () => [ScheduleRecipientDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCHEDULE_RECIPIENTS)
  @ValidateNested({ each: true })
  @Type(() => ScheduleRecipientDto)
  public readonly recipients?: ScheduleRecipientDto[];
}

export class ReportScheduleListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_KIND_VALUES })
  @IsOptional()
  @IsEnum(REPORT_KIND_VALUES)
  public readonly reportKind?: ReportKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  public readonly isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly ownedByUserId?: string;
}

export class ReportScheduleResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ enum: REPORT_KIND_VALUES })
  public readonly reportKind!: ReportKindValue;
  @ApiProperty({ enum: REPORT_FORMAT_VALUES })
  public readonly format!: ReportFormatValue;
  @ApiProperty({ enum: REPORT_SCHEDULE_FREQUENCY_VALUES })
  public readonly frequency!: ReportScheduleFrequencyValue;
  @ApiProperty() public readonly cron!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly params!: Record<string, unknown>;
  @ApiProperty({ type: () => [ScheduleRecipientDto] })
  public readonly recipients!: readonly ScheduleRecipient[];
  @ApiProperty() public readonly isEnabled!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly nextRunAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly lastRunAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly lastReportRunId!: string | null;
  @ApiProperty() public readonly ownedByUserId!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: ReportScheduleRow): ReportScheduleResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      name: row.name,
      reportKind: row.reportKind,
      format: row.format,
      frequency: row.frequency,
      cron: row.cron,
      params: row.params,
      recipients: row.recipients,
      isEnabled: row.isEnabled,
      nextRunAt: row.nextRunAt === null ? null : row.nextRunAt.toISOString(),
      lastRunAt: row.lastRunAt === null ? null : row.lastRunAt.toISOString(),
      lastReportRunId: row.lastReportRunId,
      ownedByUserId: row.ownedByUserId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class ReportScheduleListResponseDto {
  @ApiProperty({ type: () => [ReportScheduleResponseDto] })
  public readonly items!: readonly ReportScheduleResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
