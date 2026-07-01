/**
 * Fees domain errors. All extend the shared `DomainError`, so the global
 * filter maps them to the canonical envelope.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type {
  FeeInvoiceStatusValue,
  FeeStructureStatusValue,
  FeeReceiptStatusValue,
} from './fees.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class FeeHeadNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeHead', id);
  }
}

export class FeeStructureNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeStructure', id);
  }
}

export class FeeStructureLineNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeStructureLine', id);
  }
}

export class FeeDiscountNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeDiscount', id);
  }
}

export class StudentFeeDiscountNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('StudentFeeDiscount', id);
  }
}

export class FeeLateFinePolicyNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeLateFinePolicy', id);
  }
}

export class FeeInvoiceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeInvoice', id);
  }
}

export class FeePaymentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeePayment', id);
  }
}

export class FeeReceiptNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeReceipt', id);
  }
}

export class FeeRefundNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeeRefund', id);
  }
}

export class FeePaymentSourceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('FeePaymentSource', id);
  }
}

export class DuplicateFeePaymentSourceCodeError extends ConflictError {
  constructor(code: string) {
    super(`A payment source with this code already exists.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'FeePaymentSource', conflictField: 'code', value: code },
    });
  }
}

export class FeePaymentSourceInactiveError extends ConflictError {
  constructor(id: string) {
    super(`Payment source is inactive and cannot be used for new payments.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'PAYMENT_SOURCE_INACTIVE', id },
    });
  }
}

export class PaymentNotPendingVerificationError extends ConflictError {
  constructor(paymentId: string, status: string) {
    super(`Payment is not pending verification.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'PAYMENT_NOT_PENDING_VERIFICATION', paymentId, status },
    });
  }
}

export class PaymentSourceRequiredError extends ConflictError {
  constructor(method: string) {
    super(`A paymentSourceId is required for manual payment methods.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'PAYMENT_SOURCE_REQUIRED', method },
    });
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class FeesModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Fees module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.fees' },
    });
  }
}

// ---------------------------------------------------------------------------
// Duplicate (active-uniqueness; STORED deleted_at_key partial uniques)
// ---------------------------------------------------------------------------
export class DuplicateFeeHeadCodeError extends ConflictError {
  constructor(code: string) {
    super(`A fee head with this code already exists.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'FeeHead', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateFeeStructureNameError extends ConflictError {
  constructor(name: string) {
    super(`A fee structure with this name already exists in the academic year.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'FeeStructure', conflictField: 'name', value: name },
    });
  }
}

export class DuplicateFeeDiscountCodeError extends ConflictError {
  constructor(code: string) {
    super(`A fee discount with this code already exists.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'FeeDiscount', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateFineePolicyCodeError extends ConflictError {
  constructor(code: string) {
    super(`A fine policy with this code already exists.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'FeeLateFinePolicy', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateFeeInvoiceError extends ConflictError {
  constructor(studentId: string, periodFrom: string) {
    super(`An active invoice already exists for this student/period/structure.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'FeeInvoice', studentId, periodFrom },
    });
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
export class FeeStructureStatusTransitionError extends ConflictError {
  constructor(from: FeeStructureStatusValue, to: FeeStructureStatusValue) {
    super(`Cannot transition fee structure from ${from} to ${to}.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'FEE_STRUCTURE_STATUS_TRANSITION', from, to },
    });
  }
}

export class FeeStructureNotPublishedError extends ConflictError {
  constructor(id: string, status: FeeStructureStatusValue) {
    super(`Fee structure must be PUBLISHED to generate invoices.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'FEE_STRUCTURE_NOT_PUBLISHED', id, status },
    });
  }
}

export class FeeStructureNotEditableError extends ConflictError {
  constructor(id: string, status: FeeStructureStatusValue) {
    super(`Fee structure can only be edited while in DRAFT.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'FEE_STRUCTURE_NOT_EDITABLE', id, status },
    });
  }
}

export class FeeInvoiceStatusTransitionError extends ConflictError {
  constructor(from: FeeInvoiceStatusValue, to: FeeInvoiceStatusValue) {
    super(`Cannot transition invoice from ${from} to ${to}.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'FEE_INVOICE_STATUS_TRANSITION', from, to },
    });
  }
}

export class InvoiceAlreadyPaidError extends ConflictError {
  constructor(invoiceId: string) {
    super(`Invoice already has a captured payment; void/delete refused.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'INVOICE_ALREADY_PAID', invoiceId },
    });
  }
}

export class InvoiceVoidNotAllowedError extends ConflictError {
  constructor(invoiceId: string, status: FeeInvoiceStatusValue) {
    super(`Invoice cannot be voided in its current state.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'INVOICE_VOID_NOT_ALLOWED', invoiceId, status },
    });
  }
}

export class FineAlreadyAppliedError extends ConflictError {
  constructor(invoiceId: string) {
    super(`A late-fine line has already been frozen for the current overdue window.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'FINE_ALREADY_APPLIED', invoiceId },
    });
  }
}

export class ReceiptAlreadyCancelledError extends ConflictError {
  constructor(receiptId: string, status: FeeReceiptStatusValue) {
    super(`Receipt is not in ISSUED state and cannot be cancelled.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'RECEIPT_ALREADY_CANCELLED', receiptId, status },
    });
  }
}

export class ReceiptCancelRefundExistsError extends ConflictError {
  constructor(receiptId: string) {
    super(`Cannot cancel a receipt whose underlying payment has refunds.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'RECEIPT_CANCEL_REFUND_EXISTS', receiptId },
    });
  }
}

// ---------------------------------------------------------------------------
// Payment validation
// ---------------------------------------------------------------------------
export class PaymentAmountMismatchError extends ConflictError {
  constructor(amount: number, allocationsTotal: number) {
    super(`Payment amount must equal the sum of its allocations.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'PAYMENT_AMOUNT_MISMATCH', amount, allocationsTotal },
    });
  }
}

export class AllocationExceedsBalanceError extends ConflictError {
  constructor(invoiceId: string, balance: number, attempted: number) {
    super(`Allocation amount exceeds the invoice's outstanding balance.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'ALLOCATION_EXCEEDS_BALANCE', invoiceId, balance, attempted },
    });
  }
}

export class PartialPaymentDisabledError extends ConflictError {
  constructor() {
    super(`Partial payments are disabled by tenant configuration.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'PARTIAL_PAYMENT_DISABLED', flag: 'fees.allow_partial_payment' },
    });
  }
}

export class InvalidPaymentMethodError extends ConflictError {
  constructor(method: string) {
    super(`Payment method is not accepted.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'INVALID_PAYMENT_METHOD', method },
    });
  }
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------
export class RefundExceedsPaidError extends ConflictError {
  constructor(paymentId: string, available: number, requested: number) {
    super(`Refund amount exceeds the remaining refundable balance on the payment.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'REFUND_EXCEEDS_PAID', paymentId, available, requested },
    });
  }
}

export class PaymentNotRefundableError extends ConflictError {
  constructor(paymentId: string, status: string) {
    super(`Payment is not in a refundable state.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'PAYMENT_NOT_REFUNDABLE', paymentId, status },
    });
  }
}

// ---------------------------------------------------------------------------
// Discount validation
// ---------------------------------------------------------------------------
export class DiscountValueInvalidError extends ConflictError {
  constructor(reason: string) {
    super(`Discount value is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'DISCOUNT_VALUE_INVALID', detail: reason },
    });
  }
}

export class DiscountNotApprovedError extends ConflictError {
  constructor(studentDiscountId: string) {
    super(`Student fee discount requires approval before it can be applied.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'DISCOUNT_NOT_APPROVED', studentDiscountId },
    });
  }
}

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------
export class FeesVersionConflictError extends ConflictError {
  constructor(resource: string, id: string) {
    super(`${resource} was modified since this version was read.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'VERSION_CONFLICT', resource, id },
    });
  }
}

export class FeesInUseError extends ConflictError {
  constructor(resource: string, id: string, referencedBy: string) {
    super(`${resource} is referenced by ${referencedBy}; delete refused.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'IN_USE', resource, id, referencedBy },
    });
  }
}

export class FeesCrossTenantReferenceError extends ConflictError {
  constructor(resource: string, id: string) {
    super(`Referenced ${resource} does not belong to the current tenant.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'CROSS_SCHOOL_REFERENCE', resource, id },
    });
  }
}

export class FeesBulkLimitExceededError extends ConflictError {
  constructor(limit: number, received: number) {
    super(`Bulk request exceeds the per-call limit.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'BULK_LIMIT_EXCEEDED', limit, received },
    });
  }
}

// ---------------------------------------------------------------------------
// Payment gateway
// ---------------------------------------------------------------------------
export class PaymentGatewayNotImplementedError extends DomainError {
  constructor(gateway: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Payment gateway "${gateway}" is not implemented in this sprint.`,
      details: { reason: 'PAYMENT_GATEWAY_NOT_IMPLEMENTED', gateway },
    });
  }
}

export class PaymentGatewayDisabledError extends DomainError {
  constructor(gateway: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Payment gateway "${gateway}" is disabled by feature flag.`,
      details: { reason: 'PAYMENT_GATEWAY_DISABLED', gateway },
    });
  }
}

export class PaymentGatewayUnknownError extends DomainError {
  constructor(gateway: string) {
    super({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `Unknown payment gateway "${gateway}".`,
      details: { reason: 'PAYMENT_GATEWAY_UNKNOWN', gateway },
    });
  }
}
