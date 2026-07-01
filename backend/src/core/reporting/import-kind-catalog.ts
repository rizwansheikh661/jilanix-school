/**
 * Import kind catalog — maps each ImportKind enum value to its options-DTO
 * key, queue, and an `implemented` flag that drives "parser throws on
 * parse()" stubs vs the live STUDENT parser.
 *
 * `POST /imports` rejects an unknown kind; the parser registry rejects an
 * unimplemented kind via ImportKindNotImplementedError at run time so
 * future sprints can fill in parsers without API changes.
 */
import {
  REPORTING_QUEUES,
  type ImportKindValue,
  type ReportingQueue,
} from './reporting.constants';

export interface ImportKindCatalogEntry {
  readonly kind: ImportKindValue;
  /** Key in the options-DTO registry (per-kind option-shape validator). */
  readonly optionsDtoKey: string;
  /** BullMQ queue the run / commit are enqueued on. */
  readonly queue: ReportingQueue;
  /** Whether the parser + committer are wired in this sprint. */
  readonly implemented: boolean;
  /** Human label for UI / audit messages. */
  readonly label: string;
  /** Whether STUDENT/STAFF imports should also categorize audit as `pii`. */
  readonly auditPii: boolean;
}

export const IMPORT_KIND_CATALOG: Readonly<
  Record<ImportKindValue, ImportKindCatalogEntry>
> = Object.freeze({
  STUDENT: {
    kind: 'STUDENT',
    optionsDtoKey: 'student-import-options',
    queue: REPORTING_QUEUES.IMPORTS,
    implemented: true,
    label: 'Student bulk import',
    auditPii: true,
  },
  STAFF: {
    kind: 'STAFF',
    optionsDtoKey: 'staff-import-options',
    queue: REPORTING_QUEUES.IMPORTS,
    implemented: false,
    label: 'Staff bulk import',
    auditPii: true,
  },
  EXAM_MARKS: {
    kind: 'EXAM_MARKS',
    optionsDtoKey: 'exam-marks-import-options',
    queue: REPORTING_QUEUES.IMPORTS,
    implemented: false,
    label: 'Exam marks bulk import',
    auditPii: false,
  },
  ATTENDANCE: {
    kind: 'ATTENDANCE',
    optionsDtoKey: 'attendance-import-options',
    queue: REPORTING_QUEUES.IMPORTS,
    implemented: false,
    label: 'Attendance bulk import',
    auditPii: false,
  },
  FEE_PAYMENT: {
    kind: 'FEE_PAYMENT',
    optionsDtoKey: 'fee-payment-import-options',
    queue: REPORTING_QUEUES.IMPORTS,
    implemented: false,
    label: 'Fee payment bulk import',
    auditPii: false,
  },
});

export function getImportKindEntry(
  kind: ImportKindValue,
): ImportKindCatalogEntry | undefined {
  return IMPORT_KIND_CATALOG[kind];
}
