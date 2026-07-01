/**
 * Billing module domain errors. All extend the shared DomainError hierarchy
 * so the global filter maps them to canonical ErrorCode rows.
 */
import { ERROR_CODES } from '../../contracts/api';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
} from '../errors/domain-error';

// ---------------------------------------------------------------------------
// Module / flag errors
// ---------------------------------------------------------------------------
export class BillingModuleDisabledError extends DomainError {
  public override readonly name = 'BillingModuleDisabledError';
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Billing module is disabled. Enable feature flag "module.billing".',
      details: { feature: 'module.billing' },
    });
  }
}

export class RazorpayDisabledError extends DomainError {
  public override readonly name = 'RazorpayDisabledError';
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Razorpay payment flow is disabled. Enable "billing.razorpay_enabled".',
      details: { feature: 'billing.razorpay_enabled' },
    });
  }
}

export class ManualPaymentsDisabledError extends DomainError {
  public override readonly name = 'ManualPaymentsDisabledError';
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        'Manual payment recording is disabled. Enable "billing.manual_payments_enabled".',
      details: { feature: 'billing.manual_payments_enabled' },
    });
  }
}

// ---------------------------------------------------------------------------
// Account / profile errors
// ---------------------------------------------------------------------------
export class BillingAccountNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('BillingAccount', id);
  }
}

export class BillingAccountAlreadyExistsError extends ConflictError {
  constructor(schoolId: string) {
    super(`BillingAccount already exists for school ${schoolId}.`, {
      details: { resourceType: 'BillingAccount', schoolId },
    });
  }
}

export class BillingProfileNotFoundError extends NotFoundError {
  constructor(accountId: string) {
    super('BillingProfile', accountId);
  }
}

// ---------------------------------------------------------------------------
// Invoice errors
// ---------------------------------------------------------------------------
export class InvoiceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Invoice', id);
  }
}

export class InvalidInvoiceTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`Invoice status transition ${from} -> ${to} is not allowed.`, {
      details: { resourceType: 'Invoice', from, to },
    });
  }
}

export class InvoiceAlreadyPaidError extends ConflictError {
  constructor(id: string) {
    super(`Invoice ${id} is already PAID.`, {
      details: { resourceType: 'Invoice', id },
    });
  }
}

export class InvoiceNotPayableError extends ConflictError {
  constructor(id: string, status: string) {
    super(`Invoice ${id} is not in a payable state (status=${status}).`, {
      details: { resourceType: 'Invoice', id, status },
    });
  }
}

export class InvoiceOverpaymentError extends ConflictError {
  constructor(invoiceId: string, amountDue: string, paymentAmount: string) {
    super(
      `Payment ${paymentAmount} exceeds amount due ${amountDue} on invoice ${invoiceId}.`,
      { details: { resourceType: 'Invoice', invoiceId, amountDue, paymentAmount } },
    );
  }
}

// ---------------------------------------------------------------------------
// Payment errors
// ---------------------------------------------------------------------------
export class PaymentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Payment', id);
  }
}

export class InvalidPaymentTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`Payment status transition ${from} -> ${to} is not allowed.`, {
      details: { resourceType: 'Payment', from, to },
    });
  }
}

export class PaymentSignatureInvalidError extends DomainError {
  public override readonly name = 'PaymentSignatureInvalidError';
  constructor(orderId: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Razorpay signature verification failed for order ${orderId}.`,
      details: { resourceType: 'Payment', orderId },
    });
  }
}

// ---------------------------------------------------------------------------
// Refund / credit-note errors
// ---------------------------------------------------------------------------
export class RefundNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Refund', id);
  }
}

export class InvalidRefundTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`Refund status transition ${from} -> ${to} is not allowed.`, {
      details: { resourceType: 'Refund', from, to },
    });
  }
}

export class RefundAmountExceedsPaymentError extends ConflictError {
  constructor(paymentId: string, refundAmount: string, available: string) {
    super(
      `Refund ${refundAmount} exceeds payment ${paymentId} available balance ${available}.`,
      { details: { resourceType: 'Refund', paymentId, refundAmount, available } },
    );
  }
}

export class CreditNoteNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('CreditNote', id);
  }
}

export class InvalidCreditNoteTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`CreditNote status transition ${from} -> ${to} is not allowed.`, {
      details: { resourceType: 'CreditNote', from, to },
    });
  }
}

// ---------------------------------------------------------------------------
// Payment source errors
// ---------------------------------------------------------------------------
export class PaymentSourceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('PaymentSourceConfiguration', id);
  }
}

export class NoActivePaymentSourceError extends DomainError {
  public override readonly name = 'NoActivePaymentSourceError';
  constructor(sourceType: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `No active payment source configured for type ${sourceType}.`,
      details: { resourceType: 'PaymentSourceConfiguration', sourceType },
    });
  }
}

// ---------------------------------------------------------------------------
// Self / tenant access errors
// ---------------------------------------------------------------------------
export class NotABillingTenantError extends ForbiddenError {
  constructor(schoolId: string) {
    super(`School ${schoolId} has no billing account.`);
  }
}
