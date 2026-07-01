/**
 * Reporting module constants — permission keys, feature flag keys, outbox
 * topics, notification event keys, kind tuples, job queue/handler names,
 * and numeric guardrails.
 *
 * Sprint 13 ships the Reporting, Import/Export & Bulk Operations foundation:
 *   - ReportRun (lifecycle PENDING → RUNNING → SUCCEEDED|FAILED|CANCELLED;
 *     9 kinds; CSV/XLSX live, PDF reserved).
 *   - ImportJob + ImportJobIssue (lifecycle PENDING → VALIDATING → VALIDATED
 *     → COMMITTING → COMMITTED|FAILED|CANCELLED; 5 kinds — STUDENT fully
 *     implemented, 4 stubs throw ImportKindNotImplementedError).
 *   - BulkOperation (lifecycle DRAFT → PREVIEWED → VALIDATED → EXECUTING →
 *     COMPLETED|FAILED|CANCELLED; 7 kinds — STUDENT_PROMOTE fully wired,
 *     6 stubs throw BulkOperationKindNotImplementedError).
 *   - Dashboard + DashboardWidget (CRUD only, no resolver).
 *   - ReportSchedule (CRUD + cron validation, NO runner).
 *   - ReportTemplate (owner-write, isShared visibility).
 *
 * 5 notification event-key catalog entries (audience=USER per Sprint 11/12
 * precedent; recipient resolver lands with a Portal sprint).
 * 6 feature flags + ~36 RBAC permission keys + ~22 outbox topics.
 */

// ---------------------------------------------------------------------------
// Permissions — 36 keys.
// ---------------------------------------------------------------------------
export const ReportingPermissions = {
  // Report (5)
  REPORT_READ: 'report.read',
  REPORT_CREATE: 'report.create',
  REPORT_CANCEL: 'report.cancel',
  REPORT_DOWNLOAD: 'report.download',
  REPORT_DELETE: 'report.delete',
  // Report engine kind permissions (9)
  REPORT_KIND_STUDENT_LIST: 'report.kind.student-list',
  REPORT_KIND_STUDENT_ATTENDANCE_SUMMARY: 'report.kind.student-attendance-summary',
  REPORT_KIND_STAFF_ATTENDANCE_SUMMARY: 'report.kind.staff-attendance-summary',
  REPORT_KIND_EXAM_MARKS_SHEET: 'report.kind.exam-marks-sheet',
  REPORT_KIND_EXAM_RESULT_SUMMARY: 'report.kind.exam-result-summary',
  REPORT_KIND_FEE_COLLECTION_SUMMARY: 'report.kind.fee-collection-summary',
  REPORT_KIND_FEE_OUTSTANDING: 'report.kind.fee-outstanding',
  REPORT_KIND_HOMEWORK_COMPLIANCE: 'report.kind.homework-compliance',
  REPORT_KIND_SYLLABUS_PROGRESS: 'report.kind.syllabus-progress',
  // Import (6)
  IMPORT_READ: 'import.read',
  IMPORT_CREATE: 'import.create',
  IMPORT_COMMIT: 'import.commit',
  IMPORT_CANCEL: 'import.cancel',
  IMPORT_TEMPLATE: 'import.template',
  IMPORT_PREVIEW: 'import.preview',
  // Bulk operation (4)
  BULK_OPERATION_READ: 'bulk-operation.read',
  BULK_OPERATION_CREATE: 'bulk-operation.create',
  BULK_OPERATION_EXECUTE: 'bulk-operation.execute',
  BULK_OPERATION_CANCEL: 'bulk-operation.cancel',
  // Dashboard (5)
  DASHBOARD_READ: 'dashboard.read',
  DASHBOARD_CREATE: 'dashboard.create',
  DASHBOARD_UPDATE: 'dashboard.update',
  DASHBOARD_DELETE: 'dashboard.delete',
  DASHBOARD_WIDGET_MANAGE: 'dashboard.widget-manage',
  // Report schedule (5)
  REPORT_SCHEDULE_READ: 'report-schedule.read',
  REPORT_SCHEDULE_CREATE: 'report-schedule.create',
  REPORT_SCHEDULE_UPDATE: 'report-schedule.update',
  REPORT_SCHEDULE_TOGGLE: 'report-schedule.toggle',
  REPORT_SCHEDULE_DELETE: 'report-schedule.delete',
  // Report template (4)
  REPORT_TEMPLATE_READ: 'report-template.read',
  REPORT_TEMPLATE_CREATE: 'report-template.create',
  REPORT_TEMPLATE_UPDATE: 'report-template.update',
  REPORT_TEMPLATE_DELETE: 'report-template.delete',
} as const;

export type ReportingPermission =
  (typeof ReportingPermissions)[keyof typeof ReportingPermissions];

export const REPORTING_PERMISSION_DESCRIPTIONS: Readonly<
  Record<ReportingPermission, string>
> = Object.freeze({
  [ReportingPermissions.REPORT_READ]: 'List or read report-run headers.',
  [ReportingPermissions.REPORT_CREATE]: 'Request a new report run (queued).',
  [ReportingPermissions.REPORT_CANCEL]: 'Cancel a PENDING / RUNNING report run.',
  [ReportingPermissions.REPORT_DOWNLOAD]: 'Download the materialized file for a SUCCEEDED report.',
  [ReportingPermissions.REPORT_DELETE]: 'Soft-delete a report-run row and its result FileAsset.',
  [ReportingPermissions.REPORT_KIND_STUDENT_LIST]: 'Request STUDENT_LIST reports.',
  [ReportingPermissions.REPORT_KIND_STUDENT_ATTENDANCE_SUMMARY]: 'Request STUDENT_ATTENDANCE_SUMMARY reports.',
  [ReportingPermissions.REPORT_KIND_STAFF_ATTENDANCE_SUMMARY]: 'Request STAFF_ATTENDANCE_SUMMARY reports.',
  [ReportingPermissions.REPORT_KIND_EXAM_MARKS_SHEET]: 'Request EXAM_MARKS_SHEET reports.',
  [ReportingPermissions.REPORT_KIND_EXAM_RESULT_SUMMARY]: 'Request EXAM_RESULT_SUMMARY reports.',
  [ReportingPermissions.REPORT_KIND_FEE_COLLECTION_SUMMARY]: 'Request FEE_COLLECTION_SUMMARY reports.',
  [ReportingPermissions.REPORT_KIND_FEE_OUTSTANDING]: 'Request FEE_OUTSTANDING reports.',
  [ReportingPermissions.REPORT_KIND_HOMEWORK_COMPLIANCE]: 'Request HOMEWORK_COMPLIANCE reports.',
  [ReportingPermissions.REPORT_KIND_SYLLABUS_PROGRESS]: 'Request SYLLABUS_PROGRESS reports.',
  [ReportingPermissions.IMPORT_READ]: 'List or read import-job headers + per-row issues.',
  [ReportingPermissions.IMPORT_CREATE]: 'Upload a source spreadsheet and create an import-job (queued).',
  [ReportingPermissions.IMPORT_COMMIT]: 'Promote a VALIDATED import-job to COMMITTING (queued).',
  [ReportingPermissions.IMPORT_CANCEL]: 'Cancel a PENDING / VALIDATING import-job.',
  [ReportingPermissions.IMPORT_TEMPLATE]: 'Download a CSV/XLSX header template for an import kind.',
  [ReportingPermissions.IMPORT_PREVIEW]: 'Validate an uploaded import spreadsheet without persisting it.',
  [ReportingPermissions.BULK_OPERATION_READ]: 'List or read bulk-operation headers.',
  [ReportingPermissions.BULK_OPERATION_CREATE]: 'Submit a bulk-operation in PREVIEW or VALIDATE mode (synchronous).',
  [ReportingPermissions.BULK_OPERATION_EXECUTE]: 'Submit a bulk-operation in EXECUTE mode (queued).',
  [ReportingPermissions.BULK_OPERATION_CANCEL]: 'Cancel a DRAFT / PREVIEWED / VALIDATED bulk-operation.',
  [ReportingPermissions.DASHBOARD_READ]: 'List or read dashboards in this tenant.',
  [ReportingPermissions.DASHBOARD_CREATE]: 'Create a new dashboard container.',
  [ReportingPermissions.DASHBOARD_UPDATE]: 'Update dashboard metadata (name / description / isDefault).',
  [ReportingPermissions.DASHBOARD_DELETE]: 'Soft-delete a dashboard; cascades to widgets.',
  [ReportingPermissions.DASHBOARD_WIDGET_MANAGE]: 'Add / update / remove widgets on a dashboard.',
  [ReportingPermissions.REPORT_SCHEDULE_READ]: 'List or read report schedules.',
  [ReportingPermissions.REPORT_SCHEDULE_CREATE]: 'Create a new report schedule (CRUD only; runner deferred).',
  [ReportingPermissions.REPORT_SCHEDULE_UPDATE]: 'Update a report schedule.',
  [ReportingPermissions.REPORT_SCHEDULE_TOGGLE]: 'Enable / disable a report schedule.',
  [ReportingPermissions.REPORT_SCHEDULE_DELETE]: 'Soft-delete a report schedule.',
  [ReportingPermissions.REPORT_TEMPLATE_READ]: 'List or read report templates (own + shared).',
  [ReportingPermissions.REPORT_TEMPLATE_CREATE]: 'Create a new report template (saved filter set).',
  [ReportingPermissions.REPORT_TEMPLATE_UPDATE]: 'Update a report template (owner only).',
  [ReportingPermissions.REPORT_TEMPLATE_DELETE]: 'Soft-delete a report template (owner only).',
});

// ---------------------------------------------------------------------------
// Feature flags — 6 keys.
// ---------------------------------------------------------------------------
export const ReportingFeatureFlags = {
  MODULE: 'module.reporting',
  ALLOW_REPORT_RUN: 'reporting.allow_report_run',
  ALLOW_IMPORT: 'reporting.allow_import',
  ALLOW_BULK_OPERATIONS: 'reporting.allow_bulk_operations',
  IMPORT_STUDENT_ENABLED: 'reporting.import_student_enabled',
  NOTIFY_ON_COMPLETION: 'reporting.notify_on_completion',
} as const;

export type ReportingFeatureFlag =
  (typeof ReportingFeatureFlags)[keyof typeof ReportingFeatureFlags];

// ---------------------------------------------------------------------------
// Outbox topics — 30 keys.
// ---------------------------------------------------------------------------
export const ReportingOutboxTopics = {
  // Report run
  REPORT_RUN_REQUESTED: 'report.run.requested',
  REPORT_RUN_STARTED: 'report.run.started',
  REPORT_RUN_SUCCEEDED: 'report.run.succeeded',
  REPORT_RUN_FAILED: 'report.run.failed',
  REPORT_RUN_CANCELLED: 'report.run.cancelled',
  REPORT_RUN_DOWNLOADED: 'report.run.downloaded',
  REPORT_RUN_DELETED: 'report.run.deleted',
  // Import
  IMPORT_REQUESTED: 'import.requested',
  IMPORT_VALIDATING: 'import.validating',
  IMPORT_VALIDATED: 'import.validated',
  IMPORT_COMMITTING: 'import.committing',
  IMPORT_COMMITTED: 'import.committed',
  IMPORT_FAILED: 'import.failed',
  IMPORT_CANCELLED: 'import.cancelled',
  // Bulk operation
  BULK_OP_REQUESTED: 'bulk-op.requested',
  BULK_OP_PREVIEWED: 'bulk-op.previewed',
  BULK_OP_VALIDATED: 'bulk-op.validated',
  BULK_OP_EXECUTING: 'bulk-op.executing',
  BULK_OP_COMPLETED: 'bulk-op.completed',
  BULK_OP_FAILED: 'bulk-op.failed',
  BULK_OP_CANCELLED: 'bulk-op.cancelled',
  // Dashboard
  DASHBOARD_CREATED: 'dashboard.created',
  DASHBOARD_UPDATED: 'dashboard.updated',
  DASHBOARD_DELETED: 'dashboard.deleted',
  // Schedule
  SCHEDULE_CREATED: 'schedule.created',
  SCHEDULE_TOGGLED: 'schedule.toggled',
  SCHEDULE_DELETED: 'schedule.deleted',
  // Template
  TEMPLATE_CREATED: 'template.created',
  TEMPLATE_UPDATED: 'template.updated',
  TEMPLATE_DELETED: 'template.deleted',
} as const;

export type ReportingOutboxTopic =
  (typeof ReportingOutboxTopics)[keyof typeof ReportingOutboxTopics];

// ---------------------------------------------------------------------------
// Notification event keys — 5 (registered at boot via
// ReportingNotificationBootstrap).
// ---------------------------------------------------------------------------
export const ReportingNotificationEventKeys = {
  REPORT_READY: 'REPORT_READY',
  REPORT_FAILED: 'REPORT_FAILED',
  IMPORT_COMPLETED: 'IMPORT_COMPLETED',
  IMPORT_FAILED: 'IMPORT_FAILED',
  BULK_OPERATION_COMPLETED: 'BULK_OPERATION_COMPLETED',
} as const;

export type ReportingNotificationEventKey =
  (typeof ReportingNotificationEventKeys)[keyof typeof ReportingNotificationEventKeys];

// ---------------------------------------------------------------------------
// Job queue names + handler names.
// ---------------------------------------------------------------------------
export const REPORTING_QUEUES = {
  REPORTS: 'reports',
  IMPORTS: 'imports',
  BULK_OPS: 'bulk-ops',
} as const;

export type ReportingQueue = (typeof REPORTING_QUEUES)[keyof typeof REPORTING_QUEUES];

export const REPORTING_JOB_HANDLERS = {
  REPORT_RUN: 'report.run',
  IMPORT_RUN: 'import.run',
  IMPORT_COMMIT: 'import.commit',
  BULK_OP_EXECUTE: 'bulk-op.execute',
} as const;

export type ReportingJobHandler =
  (typeof REPORTING_JOB_HANDLERS)[keyof typeof REPORTING_JOB_HANDLERS];

// ---------------------------------------------------------------------------
// Enum value tuples — kept alongside DTOs for `@IsEnum` use.
// ---------------------------------------------------------------------------
export const REPORT_KIND_VALUES = [
  'STUDENT_LIST',
  'STUDENT_ATTENDANCE_SUMMARY',
  'STAFF_ATTENDANCE_SUMMARY',
  'EXAM_MARKS_SHEET',
  'EXAM_RESULT_SUMMARY',
  'FEE_COLLECTION_SUMMARY',
  'FEE_OUTSTANDING',
  'HOMEWORK_COMPLIANCE',
  'SYLLABUS_PROGRESS',
] as const;
export type ReportKindValue = (typeof REPORT_KIND_VALUES)[number];

export const REPORT_FORMAT_VALUES = ['CSV', 'EXCEL', 'PDF'] as const;
export type ReportFormatValue = (typeof REPORT_FORMAT_VALUES)[number];

export const REPORT_RUN_STATUS_VALUES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export type ReportRunStatusValue = (typeof REPORT_RUN_STATUS_VALUES)[number];

export const IMPORT_KIND_VALUES = [
  'STUDENT',
  'STAFF',
  'EXAM_MARKS',
  'ATTENDANCE',
  'FEE_PAYMENT',
] as const;
export type ImportKindValue = (typeof IMPORT_KIND_VALUES)[number];

export const IMPORT_JOB_STATUS_VALUES = [
  'PENDING',
  'VALIDATING',
  'VALIDATED',
  'COMMITTING',
  'COMMITTED',
  'FAILED',
  'CANCELLED',
] as const;
export type ImportJobStatusValue = (typeof IMPORT_JOB_STATUS_VALUES)[number];

export const IMPORT_ISSUE_SEVERITY_VALUES = ['ERROR', 'WARNING', 'INFO'] as const;
export type ImportIssueSeverityValue =
  (typeof IMPORT_ISSUE_SEVERITY_VALUES)[number];

export const BULK_OPERATION_KIND_VALUES = [
  'STUDENT_PROMOTE',
  'STUDENT_TRANSFER_SECTION',
  'STUDENT_DEACTIVATE',
  'STAFF_DEACTIVATE',
  'FEE_WAIVE',
  'HOMEWORK_CLOSE',
  'ASSIGNMENT_CLOSE',
] as const;
export type BulkOperationKindValue =
  (typeof BULK_OPERATION_KIND_VALUES)[number];

export const BULK_OPERATION_MODE_VALUES = [
  'PREVIEW',
  'VALIDATE',
  'EXECUTE',
] as const;
export type BulkOperationModeValue =
  (typeof BULK_OPERATION_MODE_VALUES)[number];

export const BULK_OPERATION_STATUS_VALUES = [
  'DRAFT',
  'PREVIEWED',
  'VALIDATED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type BulkOperationStatusValue =
  (typeof BULK_OPERATION_STATUS_VALUES)[number];

export const DASHBOARD_WIDGET_KIND_VALUES = [
  'METRIC',
  'CHART_LINE',
  'CHART_BAR',
  'CHART_PIE',
  'TABLE',
  'LIST',
  'TEXT',
] as const;
export type DashboardWidgetKindValue =
  (typeof DASHBOARD_WIDGET_KIND_VALUES)[number];

export const REPORT_SCHEDULE_FREQUENCY_VALUES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM_CRON',
] as const;
export type ReportScheduleFrequencyValue =
  (typeof REPORT_SCHEDULE_FREQUENCY_VALUES)[number];

export const SCHEDULE_RECIPIENT_TYPE_VALUES = ['USER', 'ROLE', 'EMAIL'] as const;
export type ScheduleRecipientTypeValue =
  (typeof SCHEDULE_RECIPIENT_TYPE_VALUES)[number];

// ---------------------------------------------------------------------------
// File purposes (existing in FilePurpose enum from earlier sprints — declared
// here for service-layer string consistency).
// ---------------------------------------------------------------------------
export const FILE_PURPOSE_REPORT_EXPORT = 'REPORT_EXPORT' as const;
export const FILE_PURPOSE_BULK_IMPORT = 'BULK_IMPORT' as const;

// ---------------------------------------------------------------------------
// Numeric / format guardrails.
// ---------------------------------------------------------------------------
/** Code character set (RPT-, IMP-, BOP-, DSH-, SCHED-, TPL-). */
export const REPORTING_CODE_PATTERN = /^[A-Z0-9_\-\.]{2,40}$/;

/** Hard ceiling on synchronous PREVIEW / VALIDATE target list (bulk-op). */
export const MAX_BULK_OPERATION_PREVIEW_TARGETS = 500;

/** Hard ceiling on rows accepted from a single import spreadsheet. Above this
 *  the parser raises ImportRowCapExceededError. Flag-configurable in a
 *  future sprint. */
export const MAX_IMPORT_ROWS_PER_FILE = 5000;

/** Hard ceiling on rows synchronously parsed + validated by the
 *  `POST /imports/preview` endpoint. Decoupled from
 *  `MAX_IMPORT_ROWS_PER_FILE` so a preview never starves the API thread
 *  even when a caller uploads a near-cap spreadsheet. */
export const MAX_IMPORT_PREVIEW_ROWS = 50;

/** Hard ceiling on rows materialized into a single report export. */
export const MAX_REPORT_ROWS = 20000;

/** Hard ceiling on widgets per dashboard. */
export const MAX_WIDGETS_PER_DASHBOARD = 50;

/** Hard ceiling on widget position (display order). */
export const MAX_WIDGET_POSITION = 1000;

/** Hard ceiling on schedule recipients per row. */
export const MAX_SCHEDULE_RECIPIENTS = 100;

/** Caps for free-form text columns. */
export const NAME_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const ERROR_MESSAGE_MAX_LENGTH = 2000;
export const CRON_MAX_LENGTH = 120;
