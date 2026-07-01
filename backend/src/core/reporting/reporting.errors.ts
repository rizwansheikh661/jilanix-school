/**
 * Reporting domain errors. All extend the shared DomainError hierarchy so the
 * global filter maps them to the canonical envelope via ERROR_CODES.
 *
 * Reuses `VersionConflictError`, `NotFoundError`, `ConflictError`, and
 * `ForbiddenError` from core/errors / infra/prisma/errors where appropriate.
 */
import { ERROR_CODES } from '../../contracts/api';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
} from '../errors/domain-error';

import type {
  BulkOperationKindValue,
  BulkOperationStatusValue,
  ImportJobStatusValue,
  ImportKindValue,
  ReportFormatValue,
  ReportKindValue,
  ReportRunStatusValue,
} from './reporting.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class ReportRunNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ReportRun', id);
  }
}

export class ImportJobNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ImportJob', id);
  }
}

export class BulkOperationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('BulkOperation', id);
  }
}

export class DashboardNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Dashboard', id);
  }
}

export class DashboardWidgetNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('DashboardWidget', id);
  }
}

export class ReportScheduleNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ReportSchedule', id);
  }
}

export class ReportTemplateNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ReportTemplate', id);
  }
}

// ---------------------------------------------------------------------------
// Catalog / kind / format
// ---------------------------------------------------------------------------
export class ReportKindUnknownError extends DomainError {
  constructor(kind: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Unknown report kind: "${kind}".`,
      details: { reason: 'REPORT_KIND_UNKNOWN', kind },
    });
  }
}

export class ReportFormatNotSupportedError extends DomainError {
  constructor(kind: ReportKindValue, format: ReportFormatValue) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Report kind ${kind} does not support format ${format}.`,
      details: { reason: 'REPORT_FORMAT_NOT_SUPPORTED', kind, format },
    });
  }
}

export class ReportFormatNotImplementedError extends DomainError {
  constructor(format: ReportFormatValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Report format ${format} is not yet implemented.`,
      details: { reason: 'REPORT_FORMAT_NOT_IMPLEMENTED', format },
    });
  }
}

export class ReportKindEngineNotImplementedError extends DomainError {
  constructor(kind: ReportKindValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Report kind ${kind} engine is not yet implemented.`,
      details: { reason: 'REPORT_KIND_ENGINE_NOT_IMPLEMENTED', kind },
    });
  }
}

export class ImportKindUnknownError extends DomainError {
  constructor(kind: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Unknown import kind: "${kind}".`,
      details: { reason: 'IMPORT_KIND_UNKNOWN', kind },
    });
  }
}

export class ImportKindNotImplementedError extends DomainError {
  constructor(kind: ImportKindValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Import kind ${kind} is not yet implemented in this sprint.`,
      details: { reason: 'IMPORT_KIND_NOT_IMPLEMENTED', kind },
    });
  }
}

export class BulkOperationKindUnknownError extends DomainError {
  constructor(kind: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Unknown bulk-operation kind: "${kind}".`,
      details: { reason: 'BULK_OP_KIND_UNKNOWN', kind },
    });
  }
}

export class BulkOperationKindNotImplementedError extends DomainError {
  constructor(kind: BulkOperationKindValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Bulk-operation kind ${kind} is not yet implemented in this sprint.`,
      details: { reason: 'BULK_OP_KIND_NOT_IMPLEMENTED', kind },
    });
  }
}

// ---------------------------------------------------------------------------
// State / lifecycle
// ---------------------------------------------------------------------------
export class ReportRunInvalidStateTransitionError extends DomainError {
  constructor(id: string, from: ReportRunStatusValue, to: ReportRunStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Report run cannot transition from ${from} to ${to}.`,
      details: { reason: 'INVALID_STATE_TRANSITION', id, from, to },
    });
  }
}

export class ReportRunNotCancellableError extends DomainError {
  constructor(id: string, status: ReportRunStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Report run cannot be cancelled in its current state (${status}).`,
      details: { reason: 'NOT_CANCELLABLE', id, status },
    });
  }
}

export class ReportRunNotDownloadableError extends DomainError {
  constructor(id: string, status: ReportRunStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Report run is not downloadable in its current state (${status}). Must be SUCCEEDED.`,
      details: { reason: 'NOT_DOWNLOADABLE', id, status },
    });
  }
}

export class ImportJobInvalidStateTransitionError extends DomainError {
  constructor(id: string, from: ImportJobStatusValue, to: ImportJobStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Import job cannot transition from ${from} to ${to}.`,
      details: { reason: 'INVALID_STATE_TRANSITION', id, from, to },
    });
  }
}

export class ImportJobNotCancellableError extends DomainError {
  constructor(id: string, status: ImportJobStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Import job cannot be cancelled in its current state (${status}).`,
      details: { reason: 'NOT_CANCELLABLE', id, status },
    });
  }
}

export class ImportJobNotCommittableError extends DomainError {
  constructor(id: string, status: ImportJobStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Import job is not committable in its current state (${status}). Must be VALIDATED.`,
      details: { reason: 'NOT_COMMITTABLE', id, status },
    });
  }
}

export class ImportSourceFileMissingError extends DomainError {
  constructor(fileAssetId: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Source FileAsset ${fileAssetId} is missing or deleted.`,
      details: { reason: 'IMPORT_SOURCE_FILE_MISSING', fileAssetId },
    });
  }
}

export class ImportRowCapExceededError extends DomainError {
  constructor(rowCount: number, cap: number) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Import file contains ${rowCount} rows; per-file cap is ${cap}.`,
      details: { reason: 'IMPORT_ROW_CAP_EXCEEDED', rowCount, cap },
    });
  }
}

export class BulkOperationInvalidStateTransitionError extends DomainError {
  constructor(
    id: string,
    from: BulkOperationStatusValue,
    to: BulkOperationStatusValue,
  ) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Bulk operation cannot transition from ${from} to ${to}.`,
      details: { reason: 'INVALID_STATE_TRANSITION', id, from, to },
    });
  }
}

export class BulkOperationNotCancellableError extends DomainError {
  constructor(id: string, status: BulkOperationStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Bulk operation cannot be cancelled in its current state (${status}).`,
      details: { reason: 'NOT_CANCELLABLE', id, status },
    });
  }
}

export class BulkOperationTargetsExceededError extends DomainError {
  constructor(count: number, cap: number) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Bulk operation target count ${count} exceeds cap ${cap} for synchronous PREVIEW/VALIDATE.`,
      details: { reason: 'BULK_OP_TARGETS_EXCEEDED', count, cap },
    });
  }
}

// ---------------------------------------------------------------------------
// Duplicate code (active-uniqueness STORED partial indexes)
// ---------------------------------------------------------------------------
export class DuplicateReportRunCodeError extends ConflictError {
  constructor(code: string) {
    super('A report run with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'ReportRun', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateImportJobCodeError extends ConflictError {
  constructor(code: string) {
    super('An import job with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'ImportJob', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateBulkOperationCodeError extends ConflictError {
  constructor(code: string) {
    super('A bulk operation with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'BulkOperation', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateDashboardCodeError extends ConflictError {
  constructor(code: string) {
    super('A dashboard with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'Dashboard', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateReportScheduleCodeError extends ConflictError {
  constructor(code: string) {
    super('A report schedule with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'ReportSchedule', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateReportTemplateCodeError extends ConflictError {
  constructor(code: string) {
    super('A report template with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'ReportTemplate', conflictField: 'code', value: code },
    });
  }
}

// ---------------------------------------------------------------------------
// Ownership / authorization
// ---------------------------------------------------------------------------
export class ReportTemplateNotOwnedError extends ForbiddenError {
  constructor(id: string) {
    super('Only the template owner may modify or delete it.', {
      details: { resource: 'ReportTemplate', id },
    });
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export class ReportScheduleCronInvalidError extends DomainError {
  constructor(cron: string, reason: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Invalid cron expression: ${reason}`,
      details: { reason: 'CRON_INVALID', cron, parseError: reason },
    });
  }
}

export class DashboardWidgetCapExceededError extends DomainError {
  constructor(dashboardId: string, cap: number) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Dashboard ${dashboardId} already has ${cap} widgets; cap is ${cap}.`,
      details: { reason: 'WIDGET_CAP_EXCEEDED', dashboardId, cap },
    });
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class ReportingModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Reporting module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.reporting' },
    });
  }
}

// ---------------------------------------------------------------------------
// Cross-tenant FK guard — reuses academic-content's TenantRefMissingError
// (re-exported here for callers that want a single import surface).
// ---------------------------------------------------------------------------
export { TenantRefMissingError } from '../academic-content/academic-content.errors';
