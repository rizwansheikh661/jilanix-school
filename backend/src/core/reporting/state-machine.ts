/**
 * Lifecycle state machines for the reporting module.
 *
 * Report run:
 *   PENDING   → RUNNING | CANCELLED
 *   RUNNING   → SUCCEEDED | FAILED | CANCELLED
 *   SUCCEEDED → (terminal)
 *   FAILED    → (terminal)
 *   CANCELLED → (terminal)
 *
 * Import job:
 *   PENDING     → VALIDATING | CANCELLED
 *   VALIDATING  → VALIDATED | FAILED | CANCELLED
 *   VALIDATED   → COMMITTING | CANCELLED
 *   COMMITTING  → COMMITTED | FAILED
 *   COMMITTED   → (terminal)
 *   FAILED      → (terminal)
 *   CANCELLED   → (terminal)
 *
 * Bulk operation:
 *   DRAFT      → PREVIEWED | VALIDATED | EXECUTING | CANCELLED
 *   PREVIEWED  → VALIDATED | EXECUTING | CANCELLED
 *   VALIDATED  → EXECUTING | CANCELLED
 *   EXECUTING  → COMPLETED | FAILED
 *   COMPLETED  → (terminal)
 *   FAILED     → (terminal)
 *   CANCELLED  → (terminal)
 *
 * Terminal states block all writes. Cancel races are resolved at the SQL
 * layer via `updateMany({ where: {status: {in: [...]}, version}, ... })`
 * — the asserters below are the in-process complement for read-modify-write
 * paths the queue worker takes.
 */
import {
  BulkOperationInvalidStateTransitionError,
  ImportJobInvalidStateTransitionError,
  ReportRunInvalidStateTransitionError,
} from './reporting.errors';
import type {
  BulkOperationStatusValue,
  ImportJobStatusValue,
  ReportRunStatusValue,
} from './reporting.constants';

// ---------------------------------------------------------------------------
// Report run
// ---------------------------------------------------------------------------
const REPORT_RUN_TRANSITIONS: Readonly<
  Record<ReportRunStatusValue, readonly ReportRunStatusValue[]>
> = Object.freeze({
  PENDING: ['RUNNING', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
});

export const TERMINAL_REPORT_RUN_STATUSES: ReadonlySet<ReportRunStatusValue> =
  new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

export const CANCELLABLE_REPORT_RUN_STATUSES: ReadonlySet<ReportRunStatusValue> =
  new Set(['PENDING', 'RUNNING']);

export function canReportRunTransition(
  from: ReportRunStatusValue,
  to: ReportRunStatusValue,
): boolean {
  return REPORT_RUN_TRANSITIONS[from].includes(to);
}

export function assertReportRunTransition(
  id: string,
  from: ReportRunStatusValue,
  to: ReportRunStatusValue,
): void {
  if (!canReportRunTransition(from, to)) {
    throw new ReportRunInvalidStateTransitionError(id, from, to);
  }
}

// ---------------------------------------------------------------------------
// Import job
// ---------------------------------------------------------------------------
const IMPORT_JOB_TRANSITIONS: Readonly<
  Record<ImportJobStatusValue, readonly ImportJobStatusValue[]>
> = Object.freeze({
  PENDING: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['VALIDATED', 'FAILED', 'CANCELLED'],
  VALIDATED: ['COMMITTING', 'CANCELLED'],
  COMMITTING: ['COMMITTED', 'FAILED'],
  COMMITTED: [],
  FAILED: [],
  CANCELLED: [],
});

export const TERMINAL_IMPORT_JOB_STATUSES: ReadonlySet<ImportJobStatusValue> =
  new Set(['COMMITTED', 'FAILED', 'CANCELLED']);

export const CANCELLABLE_IMPORT_JOB_STATUSES: ReadonlySet<ImportJobStatusValue> =
  new Set(['PENDING', 'VALIDATING', 'VALIDATED']);

export const COMMITTABLE_IMPORT_JOB_STATUSES: ReadonlySet<ImportJobStatusValue> =
  new Set(['VALIDATED']);

export function canImportJobTransition(
  from: ImportJobStatusValue,
  to: ImportJobStatusValue,
): boolean {
  return IMPORT_JOB_TRANSITIONS[from].includes(to);
}

export function assertImportJobTransition(
  id: string,
  from: ImportJobStatusValue,
  to: ImportJobStatusValue,
): void {
  if (!canImportJobTransition(from, to)) {
    throw new ImportJobInvalidStateTransitionError(id, from, to);
  }
}

// ---------------------------------------------------------------------------
// Bulk operation
// ---------------------------------------------------------------------------
const BULK_OP_TRANSITIONS: Readonly<
  Record<BulkOperationStatusValue, readonly BulkOperationStatusValue[]>
> = Object.freeze({
  DRAFT: ['PREVIEWED', 'VALIDATED', 'EXECUTING', 'CANCELLED'],
  PREVIEWED: ['VALIDATED', 'EXECUTING', 'CANCELLED'],
  VALIDATED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
});

export const TERMINAL_BULK_OP_STATUSES: ReadonlySet<BulkOperationStatusValue> =
  new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export const CANCELLABLE_BULK_OP_STATUSES: ReadonlySet<BulkOperationStatusValue> =
  new Set(['DRAFT', 'PREVIEWED', 'VALIDATED']);

export function canBulkOperationTransition(
  from: BulkOperationStatusValue,
  to: BulkOperationStatusValue,
): boolean {
  return BULK_OP_TRANSITIONS[from].includes(to);
}

export function assertBulkOperationTransition(
  id: string,
  from: BulkOperationStatusValue,
  to: BulkOperationStatusValue,
): void {
  if (!canBulkOperationTransition(from, to)) {
    throw new BulkOperationInvalidStateTransitionError(id, from, to);
  }
}
