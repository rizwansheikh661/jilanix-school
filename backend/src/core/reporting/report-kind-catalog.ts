/**
 * Report kind catalog — maps each ReportKind enum value to its filter DTO
 * key, RBAC permission, supported output formats, default format, queue,
 * and the named handler that materializes its result.
 *
 * The catalog is the single source of truth for "what reports can we run?".
 * `POST /reports` rejects an unknown kind even if Prisma's enum lists it
 * (catalog can be a strict subset of the enum to deprecate kinds without
 * a schema migration).
 */
import type {
  ReportFormatValue,
  ReportingPermission,
  ReportingQueue,
  ReportKindValue,
} from './reporting.constants';
import {
  REPORTING_QUEUES,
  ReportingPermissions,
} from './reporting.constants';

export interface ReportKindCatalogEntry {
  readonly kind: ReportKindValue;
  /** RBAC permission required to request this report kind. */
  readonly permission: ReportingPermission;
  /** Key in the filter-DTO registry — used to resolve per-kind param validators. */
  readonly filterDtoKey: string;
  /** Output formats this kind supports. */
  readonly supportedFormats: readonly ReportFormatValue[];
  /** Default format if the caller omits `format`. */
  readonly defaultFormat: ReportFormatValue;
  /** BullMQ queue the run is enqueued on. */
  readonly queue: ReportingQueue;
  /** Human label for UI / audit messages. */
  readonly label: string;
}

export const REPORT_KIND_CATALOG: Readonly<
  Record<ReportKindValue, ReportKindCatalogEntry>
> = Object.freeze({
  STUDENT_LIST: {
    kind: 'STUDENT_LIST',
    permission: ReportingPermissions.REPORT_KIND_STUDENT_LIST,
    filterDtoKey: 'student-list',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Student list',
  },
  STUDENT_ATTENDANCE_SUMMARY: {
    kind: 'STUDENT_ATTENDANCE_SUMMARY',
    permission: ReportingPermissions.REPORT_KIND_STUDENT_ATTENDANCE_SUMMARY,
    filterDtoKey: 'student-attendance-summary',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Student attendance summary',
  },
  STAFF_ATTENDANCE_SUMMARY: {
    kind: 'STAFF_ATTENDANCE_SUMMARY',
    permission: ReportingPermissions.REPORT_KIND_STAFF_ATTENDANCE_SUMMARY,
    filterDtoKey: 'staff-attendance-summary',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Staff attendance summary',
  },
  EXAM_MARKS_SHEET: {
    kind: 'EXAM_MARKS_SHEET',
    permission: ReportingPermissions.REPORT_KIND_EXAM_MARKS_SHEET,
    filterDtoKey: 'exam-marks-sheet',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Exam marks sheet',
  },
  EXAM_RESULT_SUMMARY: {
    kind: 'EXAM_RESULT_SUMMARY',
    permission: ReportingPermissions.REPORT_KIND_EXAM_RESULT_SUMMARY,
    filterDtoKey: 'exam-result-summary',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Exam result summary',
  },
  FEE_COLLECTION_SUMMARY: {
    kind: 'FEE_COLLECTION_SUMMARY',
    permission: ReportingPermissions.REPORT_KIND_FEE_COLLECTION_SUMMARY,
    filterDtoKey: 'fee-collection-summary',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Fee collection summary',
  },
  FEE_OUTSTANDING: {
    kind: 'FEE_OUTSTANDING',
    permission: ReportingPermissions.REPORT_KIND_FEE_OUTSTANDING,
    filterDtoKey: 'fee-outstanding',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Fee outstanding',
  },
  HOMEWORK_COMPLIANCE: {
    kind: 'HOMEWORK_COMPLIANCE',
    permission: ReportingPermissions.REPORT_KIND_HOMEWORK_COMPLIANCE,
    filterDtoKey: 'homework-compliance',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Homework compliance',
  },
  SYLLABUS_PROGRESS: {
    kind: 'SYLLABUS_PROGRESS',
    permission: ReportingPermissions.REPORT_KIND_SYLLABUS_PROGRESS,
    filterDtoKey: 'syllabus-progress',
    supportedFormats: ['CSV', 'EXCEL'],
    defaultFormat: 'EXCEL',
    queue: REPORTING_QUEUES.REPORTS,
    label: 'Syllabus progress',
  },
});

export function getReportKindEntry(
  kind: ReportKindValue,
): ReportKindCatalogEntry | undefined {
  return REPORT_KIND_CATALOG[kind];
}
