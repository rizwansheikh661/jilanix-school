/**
 * Billing module domain row types — pure data shapes returned by repositories
 * and consumed by services / controllers. Decimal columns are coerced to
 * `number` at the repo boundary to avoid bigint/Decimal leakage into HTTP.
 *
 * SCOPE: SaaS Billing only (school → platform). All entities are
 * PLATFORM_ONLY (single id PK; multi-tenant filter is by school_id).
 */

import type {
  AdjustmentKind,
  BillingAuditAction,
  CreditNoteStatus,
  InvoiceHistoryAction,
  InvoiceLineType,
  InvoiceStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentSourceType,
  PaymentStatus,
  RefundStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Re-export Prisma enums as typed value constants for runtime use
// ---------------------------------------------------------------------------
export const INVOICE_STATUS_VALUES = [
  'DRAFT',
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
  'REFUNDED',
  'WRITTEN_OFF',
] as const satisfies readonly InvoiceStatus[];

export const INVOICE_LINE_TYPE_VALUES = [
  'SUBSCRIPTION',
  'ADJUSTMENT',
  'TAX',
  'DISCOUNT',
] as const satisfies readonly InvoiceLineType[];

export const PAYMENT_METHOD_VALUES = [
  'RAZORPAY',
  'UPI',
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
  'CARD',
] as const satisfies readonly PaymentMethod[];

export const PAYMENT_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ON_HOLD',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const satisfies readonly PaymentStatus[];

export const PAYMENT_ATTEMPT_STATUS_VALUES = [
  'INITIATED',
  'SUCCESS',
  'FAILED',
  'EXPIRED',
] as const satisfies readonly PaymentAttemptStatus[];

export const PAYMENT_SOURCE_TYPE_VALUES = [
  'RAZORPAY',
  'UPI',
  'BANK',
  'MANUAL',
] as const satisfies readonly PaymentSourceType[];

export const REFUND_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'PROCESSED',
  'REJECTED',
  'FAILED',
] as const satisfies readonly RefundStatus[];

export const CREDIT_NOTE_STATUS_VALUES = [
  'ISSUED',
  'APPLIED',
  'VOID',
] as const satisfies readonly CreditNoteStatus[];

export const ADJUSTMENT_KIND_VALUES = [
  'CREDIT',
  'DEBIT',
] as const satisfies readonly AdjustmentKind[];

export type InvoiceStatusValue = (typeof INVOICE_STATUS_VALUES)[number];
export type InvoiceLineTypeValue = (typeof INVOICE_LINE_TYPE_VALUES)[number];
export type PaymentMethodValue = (typeof PAYMENT_METHOD_VALUES)[number];
export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];
export type PaymentAttemptStatusValue = (typeof PAYMENT_ATTEMPT_STATUS_VALUES)[number];
export type PaymentSourceTypeValue = (typeof PAYMENT_SOURCE_TYPE_VALUES)[number];
export type RefundStatusValue = (typeof REFUND_STATUS_VALUES)[number];
export type CreditNoteStatusValue = (typeof CREDIT_NOTE_STATUS_VALUES)[number];
export type AdjustmentKindValue = (typeof ADJUSTMENT_KIND_VALUES)[number];

export type { BillingAuditAction, InvoiceHistoryAction };

// ---------------------------------------------------------------------------
// BillingAccount
// ---------------------------------------------------------------------------
export interface BillingAccountRow {
  readonly id: string;
  readonly schoolId: string;
  readonly accountNumber: string;
  readonly currency: string;
  readonly balanceDue: number;
  readonly creditBalance: number;
  readonly totalInvoiced: number;
  readonly totalPaid: number;
  readonly totalRefunded: number;
  readonly isActive: boolean;
  readonly lastInvoiceAt: Date | null;
  readonly lastPaymentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface BillingProfileRow {
  readonly id: string;
  readonly accountId: string;
  readonly legalName: string;
  readonly displayName: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
  readonly ccEmails: string | null;
  readonly website: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface BillingAddressRow {
  readonly id: string;
  readonly accountId: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly stateName: string;
  readonly pincode: string;
  readonly countryCode: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface TaxDetailsRow {
  readonly id: string;
  readonly accountId: string;
  readonly gstin: string | null;
  readonly pan: string | null;
  readonly placeOfSupply: string | null;
  readonly taxExempt: boolean;
  readonly exemptReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface BillingSettingsRow {
  readonly id: string;
  readonly accountId: string;
  readonly schoolId: string;
  readonly gracePeriodDays: number;
  readonly billingLeadDays: number;
  readonly autoChargeEnabled: boolean;
  readonly defaultPaymentSourceId: string | null;
  readonly invoicePrefix: string | null;
  readonly remindersEnabled: boolean;
  readonly reminderOffsetsJson: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------
export interface InvoiceRow {
  readonly id: string;
  readonly accountId: string;
  readonly schoolId: string;
  readonly invoiceNumber: string;
  readonly status: InvoiceStatusValue;
  readonly fiscalYear: string;
  readonly subscriptionId: string | null;
  readonly billingCycle: string | null;
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;
  readonly issuedAt: Date | null;
  readonly dueDate: Date | null;
  readonly paidAt: Date | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly currency: string;
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly totalAmount: number;
  readonly amountPaid: number;
  readonly amountRefunded: number;
  readonly amountDue: number;
  readonly profileSnapshot: unknown;
  readonly addressSnapshot: unknown;
  readonly taxSnapshot: unknown;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface InvoiceLineRow {
  readonly id: string;
  readonly invoiceId: string;
  readonly lineType: InvoiceLineTypeValue;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly taxCode: string | null;
  readonly taxRate: number | null;
  readonly taxAmount: number;
  readonly metadata: unknown;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------
export interface PaymentRow {
  readonly id: string;
  readonly accountId: string;
  readonly invoiceId: string | null;
  readonly schoolId: string;
  readonly receiptNumber: string;
  readonly method: PaymentMethodValue;
  readonly status: PaymentStatusValue;
  readonly currency: string;
  readonly amount: number;
  readonly amountRefunded: number;
  readonly feeAmount: number;
  readonly netAmount: number;
  readonly fiscalYear: string;
  readonly gatewayOrderId: string | null;
  readonly gatewayPaymentId: string | null;
  readonly gatewaySignature: string | null;
  readonly externalReference: string | null;
  readonly proofUrl: string | null;
  readonly payerNotes: string | null;
  readonly receivedAt: Date | null;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: Date | null;
  readonly rejectedBy: string | null;
  readonly rejectionReason: string | null;
  readonly holdReason: string | null;
  readonly paymentSourceId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface PaymentAttemptRow {
  readonly id: string;
  readonly paymentId: string;
  readonly status: PaymentAttemptStatusValue;
  readonly amount: number;
  readonly gatewayOrderId: string | null;
  readonly gatewayPaymentId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly rawResponse: unknown;
  readonly attemptedAt: Date;
}

// ---------------------------------------------------------------------------
// Refund / CreditNote / Adjustment
// ---------------------------------------------------------------------------
export interface RefundRow {
  readonly id: string;
  readonly accountId: string;
  readonly invoiceId: string | null;
  readonly paymentId: string;
  readonly schoolId: string;
  readonly refundNumber: string;
  readonly status: RefundStatusValue;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: Date | null;
  readonly rejectedBy: string | null;
  readonly rejectionReason: string | null;
  readonly processedAt: Date | null;
  readonly processedBy: string | null;
  readonly gatewayRefundId: string | null;
  readonly externalReference: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CreditNoteRow {
  readonly id: string;
  readonly accountId: string;
  readonly invoiceId: string | null;
  readonly schoolId: string;
  readonly creditNoteNumber: string;
  readonly status: CreditNoteStatusValue;
  readonly currency: string;
  readonly amount: number;
  readonly amountApplied: number;
  readonly reason: string;
  readonly fiscalYear: string;
  readonly appliedAt: Date | null;
  readonly appliedToInvoiceId: string | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface AdjustmentRow {
  readonly id: string;
  readonly accountId: string;
  readonly invoiceId: string | null;
  readonly schoolId: string;
  readonly kind: AdjustmentKindValue;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// PaymentSource
// ---------------------------------------------------------------------------
export interface PaymentSourceRow {
  readonly id: string;
  readonly sourceType: PaymentSourceTypeValue;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly isDefault: boolean;
  readonly priority: number;
  readonly razorpayKeyId: string | null;
  readonly hasRazorpaySecret: boolean;
  readonly hasRazorpayWebhookSecret: boolean;
  readonly upiHandle: string | null;
  readonly bankName: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIfsc: string | null;
  readonly bankBranch: string | null;
  readonly bankAccountHolder: string | null;
  readonly instructions: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}
