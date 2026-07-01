/**
 * DTOs for `/bulk-operations`. The service enforces kind catalog
 * validation, the synchronous PREVIEW/VALIDATE target cap, tenant scope,
 * the state machine, and feature-flag gating.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  BULK_OPERATION_KIND_VALUES,
  BULK_OPERATION_MODE_VALUES,
  BULK_OPERATION_STATUS_VALUES,
  type BulkOperationKindValue,
  type BulkOperationModeValue,
  type BulkOperationStatusValue,
} from '../reporting.constants';
import type { BulkOperationRow } from '../reporting.types';

export class CreateBulkOperationDto {
  @ApiProperty({ enum: BULK_OPERATION_KIND_VALUES })
  @IsEnum(BULK_OPERATION_KIND_VALUES)
  public readonly kind!: BulkOperationKindValue;

  @ApiProperty({ enum: BULK_OPERATION_MODE_VALUES })
  @IsEnum(BULK_OPERATION_MODE_VALUES)
  public readonly mode!: BulkOperationModeValue;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Per-kind params payload. For STUDENT_PROMOTE in EXECUTE mode: ' +
      '{ sourceAcademicYearId, targetAcademicYearId, studentIds: UUID[], ' +
      'sectionMapping?: Record<sourceSectionId, targetSectionId> }. ' +
      'PREVIEW/VALIDATE modes cap params.targetIds (or studentIds) at ' +
      'MAX_BULK_OPERATION_PREVIEW_TARGETS.',
  })
  @IsObject()
  public readonly params!: Record<string, unknown>;
}

export class BulkOperationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BULK_OPERATION_STATUS_VALUES })
  @IsOptional()
  @IsEnum(BULK_OPERATION_STATUS_VALUES)
  public readonly status?: BulkOperationStatusValue;

  @ApiPropertyOptional({ enum: BULK_OPERATION_KIND_VALUES })
  @IsOptional()
  @IsEnum(BULK_OPERATION_KIND_VALUES)
  public readonly kind?: BulkOperationKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly requestedByUserId?: string;
}

export class BulkOperationResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty({ enum: BULK_OPERATION_KIND_VALUES })
  public readonly kind!: BulkOperationKindValue;
  @ApiProperty({ enum: BULK_OPERATION_MODE_VALUES })
  public readonly mode!: BulkOperationModeValue;
  @ApiProperty({ enum: BULK_OPERATION_STATUS_VALUES })
  public readonly status!: BulkOperationStatusValue;
  @ApiProperty() public readonly requestedByUserId!: string;
  @ApiProperty() public readonly requestedAt!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly params!: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true })
  public readonly queuedJobId!: string | null;
  @ApiProperty() public readonly targetCount!: number;
  @ApiProperty() public readonly processedCount!: number;
  @ApiProperty() public readonly succeededCount!: number;
  @ApiProperty() public readonly failedCount!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  public readonly previewResult!: Record<string, unknown> | null;
  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  public readonly validationResult!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly endedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly errorMessage!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: BulkOperationRow): BulkOperationResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      kind: row.kind,
      mode: row.mode,
      status: row.status,
      requestedByUserId: row.requestedByUserId,
      requestedAt: row.requestedAt.toISOString(),
      params: row.params,
      queuedJobId: row.queuedJobId,
      targetCount: row.targetCount,
      processedCount: row.processedCount,
      succeededCount: row.succeededCount,
      failedCount: row.failedCount,
      previewResult: row.previewResult,
      validationResult: row.validationResult,
      startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
      endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
      errorMessage: row.errorMessage,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class BulkOperationListResponseDto {
  @ApiProperty({ type: () => [BulkOperationResponseDto] })
  public readonly items!: readonly BulkOperationResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
