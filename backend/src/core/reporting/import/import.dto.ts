/**
 * DTOs for `/imports`. Service enforces kind catalog validation, tenant
 * scope, state machine, and feature-flag gating. Source spreadsheets are
 * uploaded inline via multipart/form-data; the form body carries `kind`
 * and an optional JSON-encoded `options` string parsed in the controller.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  IMPORT_ISSUE_SEVERITY_VALUES,
  IMPORT_JOB_STATUS_VALUES,
  IMPORT_KIND_VALUES,
  MAX_IMPORT_PREVIEW_ROWS,
  type ImportIssueSeverityValue,
  type ImportJobStatusValue,
  type ImportKindValue,
} from '../reporting.constants';
import type { ImportJobIssueRow, ImportJobRow } from '../reporting.types';
import {
  IMPORT_STATUS_VALUES,
  deriveImportStatus,
  type ImportStatus,
  type ImportValidationErrorItem,
  type ImportValidationSummary,
} from './preview/preview.types';
import {
  IMPORT_TEMPLATE_FORMAT_VALUES,
  type ImportTemplateFormat,
} from './templates/template.types';

/**
 * Form-body shape received by the multipart upload endpoint. `options` is
 * an optional JSON-encoded string parsed in the controller; the per-kind
 * options-DTO validation happens later in the parser / committer.
 */
export class ImportJobMultipartDto {
  @ApiProperty({ enum: IMPORT_KIND_VALUES })
  @IsEnum(IMPORT_KIND_VALUES)
  public readonly kind!: ImportKindValue;

  @ApiPropertyOptional({
    description:
      'Optional JSON-encoded options bag (per-kind shape). Validated by the parser.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  public readonly options?: string;
}

export class ImportJobListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: IMPORT_JOB_STATUS_VALUES })
  @IsOptional()
  @IsEnum(IMPORT_JOB_STATUS_VALUES)
  public readonly status?: ImportJobStatusValue;

  @ApiPropertyOptional({ enum: IMPORT_KIND_VALUES })
  @IsOptional()
  @IsEnum(IMPORT_KIND_VALUES)
  public readonly kind?: ImportKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly requestedByUserId?: string;
}

export class ImportJobIssueListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: IMPORT_ISSUE_SEVERITY_VALUES })
  @IsOptional()
  @IsEnum(IMPORT_ISSUE_SEVERITY_VALUES)
  public readonly severity?: ImportIssueSeverityValue;
}

export class CommitImportJobDto {
  /** No fields — endpoint just promotes status. */
}

export class ImportJobResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty({ enum: IMPORT_KIND_VALUES })
  public readonly kind!: ImportKindValue;
  @ApiProperty({ enum: IMPORT_JOB_STATUS_VALUES })
  public readonly status!: ImportJobStatusValue;
  @ApiProperty() public readonly requestedByUserId!: string;
  @ApiProperty() public readonly requestedAt!: string;
  @ApiProperty() public readonly sourceFileAssetId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly options!: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true })
  public readonly queuedJobId!: string | null;
  @ApiProperty() public readonly totalRows!: number;
  @ApiProperty() public readonly validRows!: number;
  @ApiProperty() public readonly errorRows!: number;
  @ApiProperty() public readonly committedRows!: number;
  /** Derived from rows counts — CLEAN / PARTIAL / INVALID. Surfaces the
   *  same flag that `POST /imports/preview` returns so consumers can use a
   *  single response shape end-to-end. */
  @ApiProperty({ enum: IMPORT_STATUS_VALUES })
  public readonly importStatus!: ImportStatus;
  @ApiPropertyOptional({ nullable: true })
  public readonly startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly endedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly errorMessage!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: ImportJobRow): ImportJobResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      code: row.code,
      kind: row.kind,
      status: row.status,
      requestedByUserId: row.requestedByUserId,
      requestedAt: row.requestedAt.toISOString(),
      sourceFileAssetId: row.sourceFileAssetId,
      options: row.options,
      queuedJobId: row.queuedJobId,
      totalRows: row.totalRows,
      validRows: row.validRows,
      errorRows: row.errorRows,
      committedRows: row.committedRows,
      importStatus: deriveImportStatus(
        row.totalRows,
        row.validRows,
        row.errorRows,
      ),
      startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
      endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
      errorMessage: row.errorMessage,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class ImportJobListResponseDto {
  @ApiProperty({ type: () => [ImportJobResponseDto] })
  public readonly items!: readonly ImportJobResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class ImportJobIssueResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly importJobId!: string;
  @ApiProperty() public readonly rowNumber!: number;
  @ApiPropertyOptional({ nullable: true })
  public readonly columnName!: string | null;
  @ApiProperty({ enum: IMPORT_ISSUE_SEVERITY_VALUES })
  public readonly severity!: ImportIssueSeverityValue;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly message!: string;
  /** Same value as `message` — aliased for clients that prefer the
   *  user-friendly naming used by the preview-summary shape. */
  @ApiProperty() public readonly userFriendlyMessage!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly providedValue!: string | null;
  @ApiPropertyOptional({ nullable: true, type: 'object', additionalProperties: true })
  public readonly rowSnapshot!: Record<string, unknown> | null;
  @ApiProperty() public readonly createdAt!: string;

  public static from(row: ImportJobIssueRow): ImportJobIssueResponseDto {
    return {
      id: row.id,
      importJobId: row.importJobId,
      rowNumber: row.rowNumber,
      columnName: row.columnName,
      severity: row.severity,
      code: row.code,
      message: row.message,
      userFriendlyMessage: row.message,
      providedValue: row.providedValue ?? null,
      rowSnapshot: row.rowSnapshot,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export class ImportJobIssueListResponseDto {
  @ApiProperty({ type: () => [ImportJobIssueResponseDto] })
  public readonly items!: readonly ImportJobIssueResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// ---------------------------------------------------------------------------
// Template (Patch A)
// ---------------------------------------------------------------------------
export class ImportTemplateQueryDto {
  @ApiPropertyOptional({ enum: IMPORT_TEMPLATE_FORMAT_VALUES, default: 'csv' })
  @IsOptional()
  @IsEnum(IMPORT_TEMPLATE_FORMAT_VALUES)
  public readonly format?: ImportTemplateFormat;
}

// ---------------------------------------------------------------------------
// Preview (Patch B)
// ---------------------------------------------------------------------------
export class ImportPreviewMultipartDto {
  @ApiProperty({ enum: IMPORT_KIND_VALUES })
  @IsEnum(IMPORT_KIND_VALUES)
  public readonly kind!: ImportKindValue;

  @ApiPropertyOptional({
    description: `Max rows to validate (cap = ${MAX_IMPORT_PREVIEW_ROWS}).`,
    default: MAX_IMPORT_PREVIEW_ROWS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPORT_PREVIEW_ROWS)
  public readonly previewRows?: number;
}

export class ImportValidationErrorItemDto {
  @ApiProperty() public readonly rowNumber!: number;
  @ApiPropertyOptional({ nullable: true })
  public readonly columnName!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly providedValue!: string | null;
  @ApiProperty() public readonly userFriendlyMessage!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty({ enum: IMPORT_ISSUE_SEVERITY_VALUES })
  public readonly severity!: ImportIssueSeverityValue;

  public static from(item: ImportValidationErrorItem): ImportValidationErrorItemDto {
    return {
      rowNumber: item.rowNumber,
      columnName: item.columnName,
      providedValue: item.providedValue,
      userFriendlyMessage: item.userFriendlyMessage,
      code: item.code,
      severity: item.severity,
    };
  }
}

export class ImportValidationSummaryDto {
  @ApiProperty() public readonly totalRows!: number;
  @ApiProperty() public readonly validRows!: number;
  @ApiProperty() public readonly invalidRows!: number;
  @ApiProperty({ enum: IMPORT_STATUS_VALUES })
  public readonly importStatus!: ImportStatus;
  @ApiProperty({ type: () => [ImportValidationErrorItemDto] })
  public readonly errors!: readonly ImportValidationErrorItemDto[];

  public static from(summary: ImportValidationSummary): ImportValidationSummaryDto {
    return {
      totalRows: summary.totalRows,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows,
      importStatus: summary.importStatus,
      errors: summary.errors.map(ImportValidationErrorItemDto.from),
    };
  }
}

export class ImportPreviewResponseDto {
  @ApiProperty({ type: () => ImportValidationSummaryDto })
  public readonly summary!: ImportValidationSummaryDto;

  @ApiProperty({
    description:
      'First N parsed rows (header-keyed) for UI preview tables. Cap = previewRows.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  public readonly rows!: ReadonlyArray<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Issues listing — summary appended at the top of the existing list response
// (Patch C — additive, callers ignoring `summary` keep working).
// ---------------------------------------------------------------------------
export class IssuesExportQueryDto {
  @ApiPropertyOptional({ enum: IMPORT_ISSUE_SEVERITY_VALUES })
  @IsOptional()
  @IsEnum(IMPORT_ISSUE_SEVERITY_VALUES)
  public readonly severity?: ImportIssueSeverityValue;
}
