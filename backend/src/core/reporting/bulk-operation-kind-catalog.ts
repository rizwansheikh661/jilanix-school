/**
 * Bulk operation kind catalog — maps each BulkOperationKind enum value to
 * its params-DTO key, queue, and an `implemented` flag.
 *
 * Sprint 13 wires STUDENT_PROMOTE fully (delegates to existing Sprint 3
 * AcademicYearPromotionService). The other 6 register here so DTOs +
 * preview/validate gates are stable, but their executor throws
 * BulkOperationKindNotImplementedError until a later sprint fills them in.
 */
import {
  REPORTING_QUEUES,
  type BulkOperationKindValue,
  type ReportingQueue,
} from './reporting.constants';

export interface BulkOperationKindCatalogEntry {
  readonly kind: BulkOperationKindValue;
  /** Key in the params-DTO registry. */
  readonly paramsDtoKey: string;
  /** BullMQ queue the EXECUTE-mode invocation is enqueued on. */
  readonly queue: ReportingQueue;
  /** Whether the executor is wired in this sprint. */
  readonly implemented: boolean;
  /** Human label for UI / audit messages. */
  readonly label: string;
}

export const BULK_OPERATION_KIND_CATALOG: Readonly<
  Record<BulkOperationKindValue, BulkOperationKindCatalogEntry>
> = Object.freeze({
  STUDENT_PROMOTE: {
    kind: 'STUDENT_PROMOTE',
    paramsDtoKey: 'student-promote-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: true,
    label: 'Bulk promote students',
  },
  STUDENT_TRANSFER_SECTION: {
    kind: 'STUDENT_TRANSFER_SECTION',
    paramsDtoKey: 'student-transfer-section-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: false,
    label: 'Bulk transfer student section',
  },
  STUDENT_DEACTIVATE: {
    kind: 'STUDENT_DEACTIVATE',
    paramsDtoKey: 'student-deactivate-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: false,
    label: 'Bulk deactivate students',
  },
  STAFF_DEACTIVATE: {
    kind: 'STAFF_DEACTIVATE',
    paramsDtoKey: 'staff-deactivate-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: false,
    label: 'Bulk deactivate staff',
  },
  FEE_WAIVE: {
    kind: 'FEE_WAIVE',
    paramsDtoKey: 'fee-waive-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: false,
    label: 'Bulk waive fees',
  },
  HOMEWORK_CLOSE: {
    kind: 'HOMEWORK_CLOSE',
    paramsDtoKey: 'homework-close-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: false,
    label: 'Bulk close homework',
  },
  ASSIGNMENT_CLOSE: {
    kind: 'ASSIGNMENT_CLOSE',
    paramsDtoKey: 'assignment-close-params',
    queue: REPORTING_QUEUES.BULK_OPS,
    implemented: false,
    label: 'Bulk close assignments',
  },
});

export function getBulkOperationKindEntry(
  kind: BulkOperationKindValue,
): BulkOperationKindCatalogEntry | undefined {
  return BULK_OPERATION_KIND_CATALOG[kind];
}
