/**
 * Billing module constants — permission keys (9), outbox topics, notification
 * event keys, feature flags (3), job handler names, and field guardrails for
 * Sprint 20 SaaS Billing Foundation.
 *
 * SCOPE: SaaS Billing only (School → Platform). Permanently separate from
 * School Fees (Parent → School). See docs/BILLING_FOUNDATION_ARCHITECTURE.md §1.
 */

// ---------------------------------------------------------------------------
// Permissions — 9 keys (per Sprint 20 directive)
// ---------------------------------------------------------------------------
export const BillingPermissions = {
  // Account / profile / settings (3)
  ACCOUNT_READ: 'billing.account.read',
  ACCOUNT_MANAGE: 'billing.account.manage',
  SETTINGS_MANAGE: 'billing.settings.manage',

  // Invoices (1)
  INVOICE_MANAGE: 'billing.invoice.manage',

  // Payments (2)
  PAYMENT_RECORD: 'billing.payment.record',
  PAYMENT_VERIFY: 'billing.payment.verify',

  // Refunds / credit notes / adjustments (1 combined)
  REFUND_MANAGE: 'billing.refund.manage',

  // Payment sources (1)
  PAYMENT_SOURCE_MANAGE: 'billing.payment_source.manage',

  // Tenant self (1)
  SELF_READ: 'billing.self.read',
} as const;

export type BillingPermission = (typeof BillingPermissions)[keyof typeof BillingPermissions];

export const BILLING_PERMISSION_DESCRIPTIONS: Readonly<Record<BillingPermission, string>> =
  Object.freeze({
    [BillingPermissions.ACCOUNT_READ]:
      'Read billing accounts, profiles, addresses and tax details (platform admin).',
    [BillingPermissions.ACCOUNT_MANAGE]:
      'Create or update billing accounts, profiles, addresses and tax details.',
    [BillingPermissions.SETTINGS_MANAGE]:
      'Update per-school billing settings (grace period, reminders, default source).',
    [BillingPermissions.INVOICE_MANAGE]:
      'Create, issue, void, write-off, mark-overdue invoices for a school.',
    [BillingPermissions.PAYMENT_RECORD]:
      'Record a manual payment (UPI/Bank/Cash/Cheque/Card).',
    [BillingPermissions.PAYMENT_VERIFY]:
      'Approve / reject / hold a pending payment.',
    [BillingPermissions.REFUND_MANAGE]:
      'Create / approve / reject / process refunds, credit notes and adjustments.',
    [BillingPermissions.PAYMENT_SOURCE_MANAGE]:
      'Configure platform-wide payment sources (Razorpay / UPI / Bank / Manual).',
    [BillingPermissions.SELF_READ]:
      "Read the calling tenant's own billing account, invoices, payments, refunds.",
  });

// ---------------------------------------------------------------------------
// Outbox topics
// ---------------------------------------------------------------------------
export const BillingOutboxTopics = {
  ACCOUNT_CREATED: 'billing.account.created',

  INVOICE_CREATED: 'billing.invoice.created',
  INVOICE_ISSUED: 'billing.invoice.issued',
  INVOICE_PAID: 'billing.invoice.paid',
  INVOICE_PARTIALLY_PAID: 'billing.invoice.partially_paid',
  INVOICE_OVERDUE: 'billing.invoice.overdue',
  INVOICE_VOIDED: 'billing.invoice.voided',
  INVOICE_WRITTEN_OFF: 'billing.invoice.written_off',

  PAYMENT_RECORDED: 'billing.payment.recorded',
  PAYMENT_APPROVED: 'billing.payment.approved',
  PAYMENT_REJECTED: 'billing.payment.rejected',
  PAYMENT_HELD: 'billing.payment.held',
  PAYMENT_FAILED: 'billing.payment.failed',
  PAYMENT_GATEWAY_RECEIVED: 'billing.payment.gateway.received',

  REFUND_CREATED: 'billing.refund.created',
  REFUND_APPROVED: 'billing.refund.approved',
  REFUND_PROCESSED: 'billing.refund.processed',
  REFUND_REJECTED: 'billing.refund.rejected',

  CREDIT_NOTE_ISSUED: 'billing.credit_note.issued',
  CREDIT_NOTE_APPLIED: 'billing.credit_note.applied',
  CREDIT_NOTE_VOIDED: 'billing.credit_note.voided',

  ADJUSTMENT_APPLIED: 'billing.adjustment.applied',

  SETTINGS_UPDATED: 'billing.settings.updated',

  PAYMENT_SOURCE_CONFIGURED: 'billing.payment_source.configured',
  PAYMENT_SOURCE_DISABLED: 'billing.payment_source.disabled',
} as const;

export type BillingOutboxTopic = (typeof BillingOutboxTopics)[keyof typeof BillingOutboxTopics];

// ---------------------------------------------------------------------------
// Notification event keys — 9 events under category=SYSTEM (no BILLING cat)
// ---------------------------------------------------------------------------
export const BillingNotificationEventKeys = {
  BILLING_INVOICE_ISSUED: 'BILLING_INVOICE_ISSUED',
  BILLING_PAYMENT_DUE: 'BILLING_PAYMENT_DUE',
  BILLING_PAYMENT_RECEIVED: 'BILLING_PAYMENT_RECEIVED',
  BILLING_PAYMENT_FAILED: 'BILLING_PAYMENT_FAILED',
  BILLING_PAYMENT_PENDING_VERIFICATION: 'BILLING_PAYMENT_PENDING_VERIFICATION',
  BILLING_INVOICE_OVERDUE: 'BILLING_INVOICE_OVERDUE',
  BILLING_REFUND_PROCESSED: 'BILLING_REFUND_PROCESSED',
  BILLING_CREDIT_NOTE_ISSUED: 'BILLING_CREDIT_NOTE_ISSUED',
  BILLING_GRACE_PERIOD_STARTED: 'BILLING_GRACE_PERIOD_STARTED',
} as const;

export type BillingNotificationEventKey =
  (typeof BillingNotificationEventKeys)[keyof typeof BillingNotificationEventKeys];

// ---------------------------------------------------------------------------
// Feature flags — 3 keys (per Sprint 20 directive)
// ---------------------------------------------------------------------------
export const BillingFeatureFlags = {
  /** Master switch — when off the module's controllers refuse all writes. */
  MODULE: 'module.billing',
  /** Gate the Razorpay online payment flow. Off = manual payments only. */
  RAZORPAY_ENABLED: 'billing.razorpay_enabled',
  /** Gate the manual payment (UPI/Bank/Cash/Cheque/Card) recording flow. */
  MANUAL_PAYMENTS_ENABLED: 'billing.manual_payments_enabled',
} as const;

export type BillingFeatureFlag = (typeof BillingFeatureFlags)[keyof typeof BillingFeatureFlags];

// ---------------------------------------------------------------------------
// Job handler names
// ---------------------------------------------------------------------------
export const BillingJobHandlers = {
  /** Daily — scan PENDING invoices past due+grace, mark OVERDUE. */
  INVOICE_OVERDUE_SCAN: 'billing.invoice-overdue-scan',
  /** Daily — generate invoices for subscriptions whose nextRenewalAt <= today + lead. */
  INVOICE_GENERATION_SCAN: 'billing.invoice-generation-scan',
  /** Daily — fire BILLING_PAYMENT_DUE reminders per BillingSettings. */
  PAYMENT_REMINDER_SCAN: 'billing.payment-reminder-scan',
} as const;

// ---------------------------------------------------------------------------
// Field guardrails
// ---------------------------------------------------------------------------
export const BILLING_DEFAULT_GRACE_PERIOD_DAYS = 7;
export const BILLING_DEFAULT_BILLING_LEAD_DAYS = 7;
export const BILLING_MAX_REASON_LENGTH = 500;
export const BILLING_MAX_NOTES_LENGTH = 1000;
export const BILLING_DEFAULT_CURRENCY = 'INR';
export const BILLING_ACCOUNT_NUMBER_PREFIX = 'BA';
export const BILLING_INVOICE_NUMBER_PREFIX = 'INV';
export const BILLING_RECEIPT_NUMBER_PREFIX = 'RCP';
export const BILLING_CREDIT_NOTE_NUMBER_PREFIX = 'CN';
export const BILLING_REFUND_NUMBER_PREFIX = 'REF';

// ---------------------------------------------------------------------------
// Tax constants (India — Sprint 20 v1 fixed slab)
// ---------------------------------------------------------------------------
export const BILLING_DEFAULT_GST_RATE = 18;
export const BILLING_PLATFORM_STATE_CODE = 'KA';

// ---------------------------------------------------------------------------
// Razorpay constants
// ---------------------------------------------------------------------------
export const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
export const RAZORPAY_DEFAULT_RECEIPT_PREFIX = 'rcpt_';
export const RAZORPAY_WEBHOOK_TOLERANCE_SECONDS = 300;
