/**
 * Reporting domain types — row shapes returned by repositories + helper
 * types shared between sub-modules.
 *
 * Kept thin: each sub-folder declares its own DTOs; this file only models
 * the persistence-mapped row shapes + cross-cutting validation result type.
 */
import type {
  BulkOperationKindValue,
  BulkOperationModeValue,
  BulkOperationStatusValue,
  DashboardWidgetKindValue,
  ImportIssueSeverityValue,
  ImportJobStatusValue,
  ImportKindValue,
  ReportFormatValue,
  ReportKindValue,
  ReportRunStatusValue,
  ReportScheduleFrequencyValue,
  ScheduleRecipientTypeValue,
} from './reporting.constants';

// ---------------------------------------------------------------------------
// Row shapes (camelCase mirror of Prisma rows, minus audit timestamps).
// ---------------------------------------------------------------------------
export interface ReportRunRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly kind: ReportKindValue;
  readonly format: ReportFormatValue;
  readonly status: ReportRunStatusValue;
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  readonly params: Record<string, unknown>;
  readonly queuedJobId: string | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly errorMessage: string | null;
  readonly fileAssetId: string | null;
  readonly rowCount: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ImportJobRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly kind: ImportKindValue;
  readonly status: ImportJobStatusValue;
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  readonly sourceFileAssetId: string;
  readonly options: Record<string, unknown>;
  readonly queuedJobId: string | null;
  readonly totalRows: number;
  readonly validRows: number;
  readonly errorRows: number;
  readonly committedRows: number;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly errorMessage: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ImportJobIssueRow {
  readonly id: string;
  readonly schoolId: string;
  readonly importJobId: string;
  readonly rowNumber: number;
  readonly columnName: string | null;
  readonly severity: ImportIssueSeverityValue;
  readonly code: string;
  readonly message: string;
  /** Stringified value at `columnName` (snapshot-derived); null when column
   *  is null or no value was supplied. Capped at 500 chars by the DB column. */
  readonly providedValue: string | null;
  readonly rowSnapshot: Record<string, unknown> | null;
  readonly version: number;
  readonly createdAt: Date;
}

export interface BulkOperationRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly kind: BulkOperationKindValue;
  readonly mode: BulkOperationModeValue;
  readonly status: BulkOperationStatusValue;
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  readonly params: Record<string, unknown>;
  readonly queuedJobId: string | null;
  readonly targetCount: number;
  readonly processedCount: number;
  readonly succeededCount: number;
  readonly failedCount: number;
  readonly previewResult: Record<string, unknown> | null;
  readonly validationResult: Record<string, unknown> | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly errorMessage: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface DashboardRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly isDefault: boolean;
  readonly ownedByUserId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface DashboardWidgetRow {
  readonly id: string;
  readonly schoolId: string;
  readonly dashboardId: string;
  readonly kind: DashboardWidgetKindValue;
  readonly position: number;
  readonly title: string;
  readonly config: Record<string, unknown>;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ScheduleRecipient {
  readonly type: ScheduleRecipientTypeValue;
  readonly value: string;
}

export interface ReportScheduleRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly reportKind: ReportKindValue;
  readonly format: ReportFormatValue;
  readonly frequency: ReportScheduleFrequencyValue;
  readonly cron: string;
  readonly params: Record<string, unknown>;
  readonly recipients: readonly ScheduleRecipient[];
  readonly isEnabled: boolean;
  readonly nextRunAt: Date | null;
  readonly lastRunAt: Date | null;
  readonly lastReportRunId: string | null;
  readonly ownedByUserId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ReportTemplateRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly reportKind: ReportKindValue;
  readonly params: Record<string, unknown>;
  readonly isShared: boolean;
  readonly ownedByUserId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Validation / import helpers
// ---------------------------------------------------------------------------
export interface RowValidationIssue {
  readonly rowNumber: number;
  readonly columnName?: string;
  readonly severity: ImportIssueSeverityValue;
  readonly code: string;
  /** User-friendly message — resolved human-readable text, not just a code.
   *  Persisted to `import_job_issues.message`. */
  readonly message: string;
  /** Stringified value at `columnName` (when present); persisted to
   *  `import_job_issues.provided_value`. Cap 500 chars at the DB layer. */
  readonly providedValue?: string | null;
  readonly rowSnapshot?: Record<string, unknown>;
}

export interface ImportDryRunResult<TRow> {
  readonly totalRows: number;
  readonly validRows: number;
  readonly errorRows: number;
  readonly issues: readonly RowValidationIssue[];
  readonly rows: readonly TRow[];
}

export interface ImportContext {
  readonly schoolId: string;
  readonly userId: string;
  readonly importJobId: string;
  readonly options: Record<string, unknown>;
}

export type ValidationResult<TOutput> =
  | { ok: true; output: TOutput }
  | { ok: false; issues: readonly RowValidationIssue[] };

// ---------------------------------------------------------------------------
// Engine / executor helpers
// ---------------------------------------------------------------------------
export interface ReportColumn {
  readonly key: string;
  readonly header: string;
}

export interface ReportRowSet {
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly Record<string, unknown>[];
}

export interface BulkOperationPreviewResult {
  readonly targetCount: number;
  readonly summary: Record<string, unknown>;
}

export interface BulkOperationValidationResult {
  readonly targetCount: number;
  readonly issues: readonly RowValidationIssue[];
}

export interface BulkOperationExecutionResult {
  readonly processedCount: number;
  readonly succeededCount: number;
  readonly failedCount: number;
  readonly perTarget: readonly {
    readonly targetId: string;
    readonly ok: boolean;
    readonly error?: string;
  }[];
}
