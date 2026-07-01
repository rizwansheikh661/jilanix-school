/**
 * DTOs for `/reports`. Service enforces kind/format catalog validation, tenant
 * scope, state machine, and feature-flag gating.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  REPORT_FORMAT_VALUES,
  REPORT_KIND_VALUES,
  REPORT_RUN_STATUS_VALUES,
  type ReportFormatValue,
  type ReportKindValue,
  type ReportRunStatusValue,
} from '../reporting.constants';
import type { ReportRunRow } from '../reporting.types';

export class CreateReportRunDto {
  @ApiProperty({ enum: REPORT_KIND_VALUES })
  @IsEnum(REPORT_KIND_VALUES)
  public readonly kind!: ReportKindValue;

  @ApiPropertyOptional({ enum: REPORT_FORMAT_VALUES })
  @IsOptional()
  @IsEnum(REPORT_FORMAT_VALUES)
  public readonly format?: ReportFormatValue;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Filter inputs for the report kind (validated by its engine).',
  })
  @IsObject()
  public readonly params!: Record<string, unknown>;
}

export class ReportRunListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_RUN_STATUS_VALUES })
  @IsOptional()
  @IsEnum(REPORT_RUN_STATUS_VALUES)
  public readonly status?: ReportRunStatusValue;

  @ApiPropertyOptional({ enum: REPORT_KIND_VALUES })
  @IsOptional()
  @IsEnum(REPORT_KIND_VALUES)
  public readonly kind?: ReportKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly requestedByUserId?: string;
}

export class ReportRunResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty({ enum: REPORT_KIND_VALUES }) public readonly kind!: ReportKindValue;
  @ApiProperty({ enum: REPORT_FORMAT_VALUES }) public readonly format!: ReportFormatValue;
  @ApiProperty({ enum: REPORT_RUN_STATUS_VALUES })
  public readonly status!: ReportRunStatusValue;
  @ApiProperty() public readonly requestedByUserId!: string;
  @ApiProperty() public readonly requestedAt!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly params!: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true })
  public readonly queuedJobId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly endedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly errorMessage!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly fileAssetId!: string | null;
  @ApiProperty() public readonly rowCount!: number;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: ReportRunRow): ReportRunResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      kind: row.kind,
      format: row.format,
      status: row.status,
      requestedByUserId: row.requestedByUserId,
      requestedAt: row.requestedAt.toISOString(),
      params: row.params,
      queuedJobId: row.queuedJobId,
      startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
      endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
      errorMessage: row.errorMessage,
      fileAssetId: row.fileAssetId,
      rowCount: row.rowCount,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class ReportRunListResponseDto {
  @ApiProperty({ type: () => [ReportRunResponseDto] })
  public readonly items!: readonly ReportRunResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
