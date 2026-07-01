/**
 * Fees module constants — permission keys, outbox topics, feature flag keys,
 * shared enum value tuples, and money/limit constants.
 *
 * Sprint 9 ships the foundation: fee heads, structures (+lines), discounts
 * (+ student assignments), late-fine policies, invoices (+lines), payments
 * (+allocations), receipts, refunds, and a read-only ledger. Real payment
 * gateway integration is OUT — port + 4 stub adapters only.
 *
 * Sprint 9.1 (Hybrid Fee Collection) extends this with:
 *   - FeePaymentSource RBAC + outbox topics + verification permission.
 *   - Cashfree gateway feature-flag key.
 *   - New payment method values (UPI_MANUAL, ONLINE_GATEWAY) plus deprecated
 *     UPI / ONLINE retained for backward compatibility.
 *   - Verification-status / source-kind enum tuples + manual-method routing
 *     tuples consumed by services.
 */

// ---------------------------------------------------------------------------
// Permissions — 40 keys.
// ---------------------------------------------------------------------------
export const FeesPermissions = {
  // Fee Head
  HEAD_READ: 'fee-head.read',
  HEAD_CREATE: 'fee-head.create',
  HEAD_UPDATE: 'fee-head.update',
  HEAD_DELETE: 'fee-head.delete',
  // Fee Structure
  STRUCTURE_READ: 'fee-structure.read',
  STRUCTURE_CREATE: 'fee-structure.create',
  STRUCTURE_UPDATE: 'fee-structure.update',
  STRUCTURE_DELETE: 'fee-structure.delete',
  STRUCTURE_PUBLISH: 'fee-structure.publish',
  STRUCTURE_ARCHIVE: 'fee-structure.archive',
  STRUCTURE_CLONE: 'fee-structure.clone',
  // Fee Discount
  DISCOUNT_READ: 'fee-discount.read',
  DISCOUNT_CREATE: 'fee-discount.create',
  DISCOUNT_UPDATE: 'fee-discount.update',
  DISCOUNT_DELETE: 'fee-discount.delete',
  // Student Discount Assignment
  STUDENT_DISCOUNT_READ: 'student-fee-discount.read',
  STUDENT_DISCOUNT_CREATE: 'student-fee-discount.create',
  STUDENT_DISCOUNT_DELETE: 'student-fee-discount.delete',
  STUDENT_DISCOUNT_APPROVE: 'student-fee-discount.approve',
  // Late-Fine Policy
  FINE_POLICY_READ: 'fee-fine-policy.read',
  FINE_POLICY_CREATE: 'fee-fine-policy.create',
  FINE_POLICY_UPDATE: 'fee-fine-policy.update',
  FINE_POLICY_DELETE: 'fee-fine-policy.delete',
  // Invoice
  INVOICE_READ: 'fee-invoice.read',
  INVOICE_GENERATE: 'fee-invoice.generate',
  INVOICE_RECOMPUTE: 'fee-invoice.recompute',
  INVOICE_APPLY_FINES: 'fee-invoice.apply-fines',
  INVOICE_VOID: 'fee-invoice.void',
  INVOICE_DELETE: 'fee-invoice.delete',
  // Payment
  PAYMENT_READ: 'fee-payment.read',
  PAYMENT_CREATE: 'fee-payment.create',
  PAYMENT_CHECKOUT: 'fee-payment.checkout',
  // Refund
  REFUND_READ: 'fee-refund.read',
  REFUND_CREATE: 'fee-refund.create',
  // Receipt
  RECEIPT_READ: 'fee-receipt.read',
  RECEIPT_CANCEL: 'fee-receipt.cancel',
  // Ledger
  LEDGER_READ: 'fee-ledger.read',
  // Payment Source (Sprint 9.1)
  PAYMENT_SOURCE_READ: 'fee-payment-source.read',
  PAYMENT_SOURCE_CREATE: 'fee-payment-source.create',
  PAYMENT_SOURCE_UPDATE: 'fee-payment-source.update',
  PAYMENT_SOURCE_DELETE: 'fee-payment-source.delete',
  // Payment verification (Sprint 9.1)
  PAYMENT_VERIFY: 'fee-payment.verify',
} as const;

export type FeesPermission = (typeof FeesPermissions)[keyof typeof FeesPermissions];

export const FEES_PERMISSION_DESCRIPTIONS: Readonly<Record<FeesPermission, string>> =
  Object.freeze({
    [FeesPermissions.HEAD_READ]: 'List or read fee heads (line-item catalog).',
    [FeesPermissions.HEAD_CREATE]: 'Create a fee head.',
    [FeesPermissions.HEAD_UPDATE]: 'Update a fee head.',
    [FeesPermissions.HEAD_DELETE]:
      'Soft-delete a fee head; refused if referenced by a non-archived structure line.',
    [FeesPermissions.STRUCTURE_READ]: 'List or read fee structures with their lines.',
    [FeesPermissions.STRUCTURE_CREATE]: 'Create a DRAFT fee structure with lines.',
    [FeesPermissions.STRUCTURE_UPDATE]: 'Update a DRAFT fee structure (replaces lines).',
    [FeesPermissions.STRUCTURE_DELETE]:
      'Soft-delete a DRAFT structure; PUBLISHED/ARCHIVED refused.',
    [FeesPermissions.STRUCTURE_PUBLISH]: 'Publish a structure (DRAFT \u2192 PUBLISHED).',
    [FeesPermissions.STRUCTURE_ARCHIVE]: 'Archive a structure (\u2192 ARCHIVED).',
    [FeesPermissions.STRUCTURE_CLONE]:
      'Clone an existing structure as a new DRAFT (lines copied).',
    [FeesPermissions.DISCOUNT_READ]: 'List or read fee discounts.',
    [FeesPermissions.DISCOUNT_CREATE]: 'Create a fee discount (FLAT or PERCENT).',
    [FeesPermissions.DISCOUNT_UPDATE]: 'Update a fee discount definition.',
    [FeesPermissions.DISCOUNT_DELETE]: 'Soft-delete a fee discount.',
    [FeesPermissions.STUDENT_DISCOUNT_READ]: 'List student fee-discount assignments.',
    [FeesPermissions.STUDENT_DISCOUNT_CREATE]: 'Assign a discount to a student.',
    [FeesPermissions.STUDENT_DISCOUNT_DELETE]: 'Soft-delete (unassign) a student discount.',
    [FeesPermissions.STUDENT_DISCOUNT_APPROVE]:
      'Approve a student fee-discount assignment (reserved for the future 4-eyes workflow).',
    [FeesPermissions.FINE_POLICY_READ]: 'List or read late-fine policies.',
    [FeesPermissions.FINE_POLICY_CREATE]: 'Create a late-fine policy.',
    [FeesPermissions.FINE_POLICY_UPDATE]: 'Update a late-fine policy.',
    [FeesPermissions.FINE_POLICY_DELETE]: 'Soft-delete a late-fine policy.',
    [FeesPermissions.INVOICE_READ]: 'List or read invoices with their lines.',
    [FeesPermissions.INVOICE_GENERATE]:
      'Generate invoices from a published structure for a set of students.',
    [FeesPermissions.INVOICE_RECOMPUTE]:
      'Recompute invoice totals (re-applies active discounts).',
    [FeesPermissions.INVOICE_APPLY_FINES]:
      'Freeze the computed late-fine into a new invoice line.',
    [FeesPermissions.INVOICE_VOID]: 'Void an invoice (refused if any payment exists).',
    [FeesPermissions.INVOICE_DELETE]: 'Soft-delete a DRAFT invoice.',
    [FeesPermissions.PAYMENT_READ]: 'List or read payments and their allocations.',
    [FeesPermissions.PAYMENT_CREATE]:
      'Record an offline payment with per-invoice allocations.',
    [FeesPermissions.PAYMENT_CHECKOUT]:
      'Initiate an online checkout via a registered payment-gateway adapter.',
    [FeesPermissions.REFUND_READ]: 'List or read refunds.',
    [FeesPermissions.REFUND_CREATE]: 'Record a refund against an existing payment.',
    [FeesPermissions.RECEIPT_READ]: 'List or read receipts.',
    [FeesPermissions.RECEIPT_CANCEL]:
      'Cancel a receipt (reverses allocations; refused if any refund references the payment).',
    [FeesPermissions.LEDGER_READ]: 'Read a student\u2019s computed fee ledger.',
    [FeesPermissions.PAYMENT_SOURCE_READ]:
      'List or read fee payment sources (school QR/UPI/bank-account catalog).',
    [FeesPermissions.PAYMENT_SOURCE_CREATE]:
      'Create a fee payment source (QR / UPI VPA / bank account / other).',
    [FeesPermissions.PAYMENT_SOURCE_UPDATE]: 'Update a fee payment source.',
    [FeesPermissions.PAYMENT_SOURCE_DELETE]: 'Soft-delete a fee payment source.',
    [FeesPermissions.PAYMENT_VERIFY]:
      'Verify or reject a pending manual payment (UPI / cheque / bank transfer).',
  });

// ---------------------------------------------------------------------------
// Feature flags — 8 keys.
// ---------------------------------------------------------------------------
export const FeesFeatureFlags = {
  MODULE: 'module.fees',
  ALLOW_PARTIAL_PAYMENT: 'fees.allow_partial_payment',
  FREEZE_FINES_REQUIRED: 'fees.freeze_fines_required',
  GATEWAY_RAZORPAY: 'payments.gateway.razorpay',
  GATEWAY_PHONEPE: 'payments.gateway.phonepe',
  GATEWAY_PAYTM: 'payments.gateway.paytm',
  GATEWAY_STRIPE: 'payments.gateway.stripe',
  GATEWAY_CASHFREE: 'payments.gateway.cashfree',
} as const;

export type FeesFeatureFlag = (typeof FeesFeatureFlags)[keyof typeof FeesFeatureFlags];

// ---------------------------------------------------------------------------
// Outbox topics.
// ---------------------------------------------------------------------------
export const FeesOutboxTopics = {
  HEAD_CREATED: 'fees.head.created',
  HEAD_UPDATED: 'fees.head.updated',
  HEAD_DELETED: 'fees.head.deleted',

  STRUCTURE_CREATED: 'fees.structure.created',
  STRUCTURE_UPDATED: 'fees.structure.updated',
  STRUCTURE_PUBLISHED: 'fees.structure.published',
  STRUCTURE_ARCHIVED: 'fees.structure.archived',
  STRUCTURE_CLONED: 'fees.structure.cloned',
  STRUCTURE_DELETED: 'fees.structure.deleted',

  DISCOUNT_CREATED: 'fees.discount.created',
  DISCOUNT_UPDATED: 'fees.discount.updated',
  DISCOUNT_DELETED: 'fees.discount.deleted',

  STUDENT_DISCOUNT_ASSIGNED: 'fees.student_discount.assigned',
  STUDENT_DISCOUNT_APPROVED: 'fees.student_discount.approved',
  STUDENT_DISCOUNT_UNASSIGNED: 'fees.student_discount.unassigned',

  FINE_POLICY_CREATED: 'fees.fine_policy.created',
  FINE_POLICY_UPDATED: 'fees.fine_policy.updated',
  FINE_POLICY_DELETED: 'fees.fine_policy.deleted',

  INVOICE_GENERATED: 'fees.invoice.generated',
  INVOICE_RECOMPUTED: 'fees.invoice.recomputed',
  INVOICE_FINES_APPLIED: 'fees.invoice.fines_applied',
  INVOICE_VOIDED: 'fees.invoice.voided',
  INVOICE_DELETED: 'fees.invoice.deleted',

  PAYMENT_CAPTURED: 'fees.payment.captured',
  PAYMENT_REFUNDED: 'fees.payment.refunded',

  RECEIPT_ISSUED: 'fees.receipt.issued',
  RECEIPT_CANCELLED: 'fees.receipt.cancelled',

  PAYMENT_SOURCE_CREATED: 'fees.payment_source.created',
  PAYMENT_SOURCE_UPDATED: 'fees.payment_source.updated',
  PAYMENT_SOURCE_DELETED: 'fees.payment_source.deleted',
  PAYMENT_VERIFIED: 'fees.payment.verified',
  PAYMENT_REJECTED: 'fees.payment.rejected',
} as const;

export type FeesOutboxTopic = (typeof FeesOutboxTopics)[keyof typeof FeesOutboxTopics];

// ---------------------------------------------------------------------------
// Enum value tuples — kept alongside DTOs for `@IsEnum` use.
// ---------------------------------------------------------------------------
export const FEE_HEAD_CATEGORY_VALUES = [
  'TUITION',
  'ADMISSION',
  'TRANSPORT',
  'HOSTEL',
  'LIBRARY',
  'EXAMINATION',
  'EVENT',
  'LATE_FINE',
  'CUSTOM',
] as const;
export type FeeHeadCategoryValue = (typeof FEE_HEAD_CATEGORY_VALUES)[number];

export const FEE_FREQUENCY_VALUES = [
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'TERM',
] as const;
export type FeeFrequencyValue = (typeof FEE_FREQUENCY_VALUES)[number];

export const FEE_STRUCTURE_STATUS_VALUES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type FeeStructureStatusValue = (typeof FEE_STRUCTURE_STATUS_VALUES)[number];

export const FEE_STRUCTURE_APPLIES_TO_VALUES = [
  'SCHOOL',
  'CLASS',
  'SECTION',
  'STUDENT',
] as const;
export type FeeStructureAppliesToValue = (typeof FEE_STRUCTURE_APPLIES_TO_VALUES)[number];

export const FEE_DISCOUNT_TYPE_VALUES = ['FLAT', 'PERCENT'] as const;
export type FeeDiscountTypeValue = (typeof FEE_DISCOUNT_TYPE_VALUES)[number];

export const FEE_FINE_POLICY_TYPE_VALUES = [
  'FLAT_ONCE',
  'FLAT_PER_DAY',
  'PERCENT_PER_DAY',
] as const;
export type FeeFinePolicyTypeValue = (typeof FEE_FINE_POLICY_TYPE_VALUES)[number];

export const FEE_INVOICE_STATUS_VALUES = [
  'DRAFT',
  'SENT',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'VOID',
  'REFUNDED',
] as const;
export type FeeInvoiceStatusValue = (typeof FEE_INVOICE_STATUS_VALUES)[number];

export const FEE_PAYMENT_METHOD_VALUES = [
  'CASH',
  'CHEQUE',
  'BANK_TRANSFER',
  'UPI_MANUAL',
  'ONLINE_GATEWAY',
  'UPI',
  'ONLINE',
] as const;
export type FeePaymentMethodValue = (typeof FEE_PAYMENT_METHOD_VALUES)[number];

export const FEE_PAYMENT_VERIFICATION_STATUS_VALUES = [
  'NOT_REQUIRED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
] as const;
export type FeePaymentVerificationStatusValue = (typeof FEE_PAYMENT_VERIFICATION_STATUS_VALUES)[number];

export const FEE_PAYMENT_SOURCE_KIND_VALUES = [
  'SCHOOL_QR',
  'SCHOOL_UPI',
  'PRINCIPAL_UPI',
  'MANAGEMENT_UPI',
  'SCHOOL_BANK_ACCOUNT',
  'OTHER',
] as const;
export type FeePaymentSourceKindValue = (typeof FEE_PAYMENT_SOURCE_KIND_VALUES)[number];

/** Methods that require human verification before receipt issuance. */
export const FEE_PAYMENT_VERIFY_REQUIRED_METHODS = [
  'CHEQUE',
  'BANK_TRANSFER',
  'UPI_MANUAL',
] as const satisfies readonly FeePaymentMethodValue[];
export type FeePaymentVerifyRequiredMethod = (typeof FEE_PAYMENT_VERIFY_REQUIRED_METHODS)[number];

/** Deprecated method names retained only for old data. Rejected on new captures. */
export const FEE_PAYMENT_METHOD_DEPRECATED = ['UPI', 'ONLINE'] as const satisfies readonly FeePaymentMethodValue[];

export const FEE_PAYMENT_STATUS_VALUES = [
  'PENDING',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type FeePaymentStatusValue = (typeof FEE_PAYMENT_STATUS_VALUES)[number];

export const FEE_RECEIPT_STATUS_VALUES = ['ISSUED', 'CANCELLED'] as const;
export type FeeReceiptStatusValue = (typeof FEE_RECEIPT_STATUS_VALUES)[number];

// ---------------------------------------------------------------------------
// Bulk limits + numeric guardrails.
// ---------------------------------------------------------------------------
/** Max lines per FeeStructure or invoice generate-batch line set. */
export const FEE_STRUCTURE_LINES_MAX = 50;

/** Max allocations per payment. */
export const FEE_PAYMENT_ALLOCATIONS_MAX = 50;

/** Max students per invoice-generate request (sync this sprint). */
export const FEE_INVOICE_GENERATE_STUDENTS_MAX = 500;

/** Money rounding: Decimal(12, 2) INR. */
export const FEE_DECIMAL_PLACES = 2;

/** Default currency code stored on FeeStructure. */
export const FEE_DEFAULT_CURRENCY = 'INR';

/** Maximum grace period a fine policy can specify. */
export const FEE_FINE_GRACE_DAYS_MAX = 365;

/** Code character set — uppercase letters, digits, underscores, dashes. */
export const FEE_CODE_PATTERN = /^[A-Z0-9_\-]{2,40}$/;
