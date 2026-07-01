/**
 * Fees domain row shapes. Repos map raw Prisma rows into these interfaces
 * so the rest of the module never imports `@prisma/client` directly.
 *
 * Decimal columns are surfaced as `number` after `toNumber()` conversion;
 * Date columns stay as JS `Date` (controllers ISO-format at the boundary).
 */
import type {
  FeeDiscountTypeValue,
  FeeFinePolicyTypeValue,
  FeeFrequencyValue,
  FeeHeadCategoryValue,
  FeeInvoiceStatusValue,
  FeePaymentMethodValue,
  FeePaymentSourceKindValue,
  FeePaymentStatusValue,
  FeePaymentVerificationStatusValue,
  FeeReceiptStatusValue,
  FeeStructureAppliesToValue,
  FeeStructureStatusValue,
} from './fees.constants';

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

interface SoftDeleteTail {
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
}

// ---------------------------------------------------------------------------
// FeeHead
// ---------------------------------------------------------------------------
export interface FeeHeadRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly category: FeeHeadCategoryValue;
  readonly hsnSac: string | null;
  readonly isRefundable: boolean;
  readonly isTaxable: boolean;
  readonly defaultAmount: number | null;
  readonly glAccount: string | null;
  readonly description: string | null;
}

// ---------------------------------------------------------------------------
// FeeStructure + lines
// ---------------------------------------------------------------------------
export interface FeeStructureRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly academicYearId: string;
  readonly branchId: string | null;
  readonly name: string;
  readonly appliesTo: FeeStructureAppliesToValue;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly studentId: string | null;
  readonly currency: string;
  readonly status: FeeStructureStatusValue;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly description: string | null;
}

export interface FeeStructureLineRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly feeStructureId: string;
  readonly feeHeadId: string;
  readonly lateFinePolicyId: string | null;
  readonly amount: number;
  readonly frequency: FeeFrequencyValue;
  readonly dueDay: number | null;
  readonly ordering: number;
}

export interface FeeStructureWithLines extends FeeStructureRow {
  readonly lines: readonly FeeStructureLineRow[];
}

// ---------------------------------------------------------------------------
// FeeDiscount + StudentFeeDiscount
// ---------------------------------------------------------------------------
export interface FeeDiscountRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly type: FeeDiscountTypeValue;
  readonly value: number;
  readonly maxAmount: number | null;
  readonly appliesToFeeHeadId: string | null;
  readonly description: string | null;
  readonly requiresApprovalAbove: number | null;
}

export interface StudentFeeDiscountRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly studentId: string;
  readonly feeDiscountId: string;
  readonly academicYearId: string;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly reason: string | null;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
}

// ---------------------------------------------------------------------------
// FeeLateFinePolicy
// ---------------------------------------------------------------------------
export interface FeeLateFinePolicyRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly type: FeeFinePolicyTypeValue;
  readonly value: number;
  readonly gracePeriodDays: number;
  readonly capAmount: number | null;
  readonly description: string | null;
}

// ---------------------------------------------------------------------------
// FeeInvoice + lines
// ---------------------------------------------------------------------------
export interface FeeInvoiceRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly studentId: string;
  readonly feeStructureId: string;
  readonly academicYearId: string;
  readonly branchId: string | null;
  readonly invoiceNo: string;
  readonly periodFrom: Date;
  readonly periodTo: Date;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly paidTotal: number;
  readonly refundTotal: number;
  readonly balanceTotal: number;
  readonly status: FeeInvoiceStatusValue;
  readonly notes: string | null;
}

export interface FeeInvoiceLineRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly feeInvoiceId: string;
  readonly feeHeadId: string;
  readonly sourceFinePolicyId: string | null;
  readonly sourceDiscountId: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly discountAmount: number;
  readonly taxAmount: number;
  readonly lineTotal: number;
  readonly isLateFine: boolean;
}

export interface FeeInvoiceWithLines extends FeeInvoiceRow {
  readonly lines: readonly FeeInvoiceLineRow[];
  /** Computed live fine (not yet frozen). 0 when no policy or within grace. */
  readonly computedFine: number;
}

/** Result of pure fine computation. */
export interface ComputedFine {
  readonly amount: number;
  readonly daysOverdue: number;
  readonly policyId: string | null;
  readonly cappedAt: number | null;
}

// ---------------------------------------------------------------------------
// FeePayment + allocations
// ---------------------------------------------------------------------------
export interface FeePaymentRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly studentId: string;
  readonly paymentNo: string | null;
  readonly method: FeePaymentMethodValue;
  readonly amount: number;
  readonly status: FeePaymentStatusValue;
  readonly referenceNo: string | null;
  readonly paidAt: Date;
  readonly gatewayCode: string | null;
  readonly gatewayPaymentId: string | null;
  readonly notes: string | null;
  readonly paymentSourceId: string | null;
  readonly paymentProofUrl: string | null;
  readonly verificationStatus: FeePaymentVerificationStatusValue;
  readonly verifiedBy: string | null;
  readonly verifiedAt: Date | null;
  readonly verificationNotes: string | null;
}

export interface FeePaymentAllocationRow {
  readonly id: string;
  readonly schoolId: string;
  readonly feePaymentId: string;
  readonly feeInvoiceId: string;
  readonly amount: number;
  readonly allocatedAt: Date;
  readonly allocatedBy: string | null;
  readonly reversedAt: Date | null;
  readonly reversedBy: string | null;
  readonly reversalReason: string | null;
}

export interface FeePaymentWithAllocations extends FeePaymentRow {
  readonly allocations: readonly FeePaymentAllocationRow[];
}

// ---------------------------------------------------------------------------
// FeeReceipt
// ---------------------------------------------------------------------------
export interface FeeReceiptRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly feePaymentId: string;
  readonly studentId: string;
  readonly receiptNo: string;
  readonly issuedAt: Date;
  readonly issuedBy: string | null;
  readonly totalAmount: number;
  readonly status: FeeReceiptStatusValue;
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
  readonly cancellationReason: string | null;
  readonly notes: string | null;
}

export interface FeeReceiptWithLines extends FeeReceiptRow {
  readonly allocations: readonly FeePaymentAllocationRow[];
}

// ---------------------------------------------------------------------------
// FeeRefund
// ---------------------------------------------------------------------------
export interface FeeRefundRow {
  readonly id: string;
  readonly schoolId: string;
  readonly feePaymentId: string;
  readonly amount: number;
  readonly reason: string;
  readonly refundedAt: Date;
  readonly refundedBy: string | null;
  readonly method: FeePaymentMethodValue;
  readonly referenceNo: string | null;
}

// ---------------------------------------------------------------------------
// FeePaymentSource (Sprint 9.1)
// ---------------------------------------------------------------------------
export interface FeePaymentSourceRow extends AuditTail, SoftDeleteTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly kind: FeePaymentSourceKindValue;
  readonly identifier: string;
  readonly ifsc: string | null;
  readonly holderName: string | null;
  readonly isActive: boolean;
  readonly description: string | null;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------
export type LedgerEntryType =
  | 'INVOICE'
  | 'PAYMENT'
  | 'REFUND'
  | 'FINE'
  | 'DISCOUNT';

export interface LedgerEntry {
  readonly at: Date;
  readonly type: LedgerEntryType;
  readonly referenceId: string;
  readonly description: string;
  readonly debit: number;
  readonly credit: number;
  readonly runningBalance: number;
}

export interface StudentFeeLedger {
  readonly studentId: string;
  readonly academicYearId: string | null;
  readonly entries: readonly LedgerEntry[];
  readonly totals: {
    readonly totalInvoiced: number;
    readonly totalPaid: number;
    readonly totalRefunded: number;
    readonly outstandingBalance: number;
  };
}
