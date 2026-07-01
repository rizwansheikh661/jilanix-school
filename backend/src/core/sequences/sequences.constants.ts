/**
 * SequenceNames — canonical identifiers for every per-tenant counter the
 * application allocates from `tenant_sequences`. Strings live here so callers
 * never inline magic constants; renaming a sequence (or adding a new one) is
 * a one-line change with all consumers picked up by the type-checker.
 */
export const SEQ_NAMES = {
  ADMISSION: 'admission',
  EMPLOYEE: 'employee',
  INVOICE: 'invoice',
  RECEIPT: 'receipt',
  TC: 'tc',
  CERTIFICATE: 'certificate',
  NOTIFICATION: 'notification',
  EVENT: 'event',
  HOMEWORK: 'homework',
  ASSIGNMENT: 'assignment',
  REPORT_RUN: 'report-run',
  IMPORT_JOB: 'import-job',
  BULK_OPERATION: 'bulk-operation',
  DASHBOARD: 'dashboard',
  REPORT_SCHEDULE: 'report-schedule',
  REPORT_TEMPLATE: 'report-template',
  SUBSCRIPTION: 'subscription',
  // Sprint 20 — SaaS Billing (School → Platform). Separate from INVOICE /
  // RECEIPT which are School Fees (Parent → School). Both billing counters
  // reset per fiscal year so invoice numbers carry the FY token.
  BILLING_INVOICE: 'billing-invoice',
  BILLING_RECEIPT: 'billing-receipt',
  BILLING_CREDIT_NOTE: 'billing-credit-note',
  BILLING_REFUND: 'billing-refund',
  /** Account numbers are not FY-scoped (one per school for life of account). */
  BILLING_ACCOUNT: 'billing-account',
} as const;

export type SequenceName = (typeof SEQ_NAMES)[keyof typeof SEQ_NAMES];

/**
 * Which sequences are fiscal-year-scoped vs evergreen. `invoice` and
 * `receipt` (Sprint 9) reset every fiscal year; everything else is a single
 * monotonic counter per school. SequenceService validates the `fiscalYear`
 * argument against this table to catch mistakes early.
 */
export const SEQUENCE_REQUIRES_FISCAL_YEAR: Readonly<Record<SequenceName, boolean>> = Object.freeze({
  [SEQ_NAMES.ADMISSION]: false,
  [SEQ_NAMES.EMPLOYEE]: false,
  [SEQ_NAMES.TC]: false,
  [SEQ_NAMES.CERTIFICATE]: false,
  [SEQ_NAMES.NOTIFICATION]: false,
  [SEQ_NAMES.EVENT]: false,
  [SEQ_NAMES.HOMEWORK]: false,
  [SEQ_NAMES.ASSIGNMENT]: false,
  [SEQ_NAMES.REPORT_RUN]: false,
  [SEQ_NAMES.IMPORT_JOB]: false,
  [SEQ_NAMES.BULK_OPERATION]: false,
  [SEQ_NAMES.DASHBOARD]: false,
  [SEQ_NAMES.REPORT_SCHEDULE]: false,
  [SEQ_NAMES.REPORT_TEMPLATE]: false,
  [SEQ_NAMES.SUBSCRIPTION]: false,
  [SEQ_NAMES.INVOICE]: true,
  [SEQ_NAMES.RECEIPT]: true,
  [SEQ_NAMES.BILLING_INVOICE]: true,
  [SEQ_NAMES.BILLING_RECEIPT]: true,
  [SEQ_NAMES.BILLING_CREDIT_NOTE]: true,
  [SEQ_NAMES.BILLING_REFUND]: true,
  [SEQ_NAMES.BILLING_ACCOUNT]: false,
});

export const ALL_SEQUENCE_NAMES: readonly SequenceName[] = Object.freeze(
  Object.values(SEQ_NAMES),
);

/**
 * SequencesPermissions — read-only externally. Sequence consumption is
 * service-internal (only Staff/Admission/Fees services call `nextValue`);
 * the catalog only exposes `read` so admins can inspect the current value
 * of each counter. A future `reset` permission lands with Sprint 18 maintenance.
 */
export const SequencesPermissions = {
  SEQUENCE_READ: 'sequence.read',
  SEQUENCE_RESET: 'sequence.reset',
} as const;

export type SequencesPermission =
  (typeof SequencesPermissions)[keyof typeof SequencesPermissions];

export const SEQUENCES_PERMISSION_DESCRIPTIONS: Readonly<Record<SequencesPermission, string>> =
  Object.freeze({
    [SequencesPermissions.SEQUENCE_READ]: 'List or peek at per-tenant sequence counters.',
    [SequencesPermissions.SEQUENCE_RESET]:
      'Reset a per-tenant sequence counter (maintenance only — gap risk).',
  });
