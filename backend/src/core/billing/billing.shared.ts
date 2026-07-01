/**
 * Billing module shared helpers — used by every billing service.
 *
 *   - `assertBillingEnabled(flags, schoolId, flag, errClass)` — checks a
 *     billing feature flag and throws the matching domain error when the
 *     flag is off. Single helper that the services compose into module/
 *     razorpay/manual-payments gates.
 *   - `computeFiscalYear(date)` — Indian FY format `YYYY-YY` (Apr→Mar).
 *   - `formatInvoiceNumber / formatReceiptNumber / formatCreditNoteNumber /
 *     formatRefundNumber / formatAccountNumber` — string formatting around
 *     SequenceService output.
 *   - `splitGstTax(amount, taxRate, intraState)` — CGST/SGST/IGST split.
 *   - `roundMoney(n)` — `Math.round(n * 100) / 100`.
 */
import type { FeatureFlagService } from '../feature-flag/services/feature-flag.service';
import {
  BILLING_ACCOUNT_NUMBER_PREFIX,
  BILLING_CREDIT_NOTE_NUMBER_PREFIX,
  BILLING_RECEIPT_NUMBER_PREFIX,
  BILLING_REFUND_NUMBER_PREFIX,
  BillingFeatureFlags,
} from './billing.constants';
import {
  BillingModuleDisabledError,
  ManualPaymentsDisabledError,
  RazorpayDisabledError,
} from './billing.errors';

type BillingFlagError =
  | typeof BillingModuleDisabledError
  | typeof RazorpayDisabledError
  | typeof ManualPaymentsDisabledError;

/**
 * Generic flag guard — every billing service calls this through the
 * specialised wrappers below.
 */
export async function assertBillingFlagEnabled(
  flags: FeatureFlagService,
  schoolId: string | null,
  flagKey: string,
  errClass: BillingFlagError,
): Promise<void> {
  const enabled = await flags.isEnabled(flagKey, { schoolId });
  if (!enabled) {
    throw new errClass();
  }
}

export async function assertBillingEnabled(
  flags: FeatureFlagService,
  schoolId: string | null,
): Promise<void> {
  await assertBillingFlagEnabled(
    flags,
    schoolId,
    BillingFeatureFlags.MODULE,
    BillingModuleDisabledError,
  );
}

export async function assertRazorpayEnabled(
  flags: FeatureFlagService,
  schoolId: string | null,
): Promise<void> {
  await assertBillingFlagEnabled(
    flags,
    schoolId,
    BillingFeatureFlags.RAZORPAY_ENABLED,
    RazorpayDisabledError,
  );
}

export async function assertManualPaymentsEnabled(
  flags: FeatureFlagService,
  schoolId: string | null,
): Promise<void> {
  await assertBillingFlagEnabled(
    flags,
    schoolId,
    BillingFeatureFlags.MANUAL_PAYMENTS_ENABLED,
    ManualPaymentsDisabledError,
  );
}

/**
 * Indian fiscal year (`YYYY-YY`, Apr→Mar).
 *
 * Dates in Jan-Mar belong to the previous April's FY (e.g. 2027-02 → "2026-27").
 * Dates in Apr-Dec belong to the current April's FY (e.g. 2026-06 → "2026-27").
 */
export function computeFiscalYear(date: Date): string {
  const month = date.getUTCMonth(); // 0=Jan
  const year = date.getUTCFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endTwo = ((startYear + 1) % 100).toString().padStart(2, '0');
  return `${startYear}-${endTwo}`;
}

function formatNumber(prefix: string, fiscalYear: string | null, seq: number): string {
  const seqStr = String(seq).padStart(6, '0');
  return fiscalYear === null ? `${prefix}-${seqStr}` : `${prefix}-${fiscalYear}-${seqStr}`;
}

export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  return formatNumber(prefix, fy, seq);
}

export function formatReceiptNumber(fy: string, seq: number): string {
  return formatNumber(BILLING_RECEIPT_NUMBER_PREFIX, fy, seq);
}

export function formatCreditNoteNumber(fy: string, seq: number): string {
  return formatNumber(BILLING_CREDIT_NOTE_NUMBER_PREFIX, fy, seq);
}

export function formatRefundNumber(fy: string, seq: number): string {
  return formatNumber(BILLING_REFUND_NUMBER_PREFIX, fy, seq);
}

export function formatAccountNumber(seq: number): string {
  return formatNumber(BILLING_ACCOUNT_NUMBER_PREFIX, null, seq);
}

/** Default money rounding — 2 decimal places, banker-rounded via Math.round. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GstSplit {
  readonly cgst: number;
  readonly sgst: number;
  readonly igst: number;
  readonly total: number;
}

/**
 * Split a single GST tax amount into CGST/SGST (intra-state) or IGST
 * (inter-state). When intra-state the half-each split rounds CGST first
 * and assigns the remainder to SGST so the two halves always sum back
 * to the rounded total.
 */
export function splitGstTax(
  amount: number,
  taxRate: number,
  intraState: boolean,
): GstSplit {
  const total = roundMoney((amount * taxRate) / 100);
  if (taxRate <= 0 || total === 0) {
    return { cgst: 0, sgst: 0, igst: 0, total: 0 };
  }
  if (intraState) {
    const cgst = roundMoney(total / 2);
    const sgst = roundMoney(total - cgst);
    return { cgst, sgst, igst: 0, total };
  }
  return { cgst: 0, sgst: 0, igst: total, total };
}

/**
 * Sum line amounts then apply the platform GST split. Returns the
 * components needed by InvoiceService.issue() when stamping snapshots.
 */
export interface InvoiceTotals {
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly totalAmount: number;
}

export interface LineForTotal {
  readonly lineType: 'SUBSCRIPTION' | 'ADJUSTMENT' | 'TAX' | 'DISCOUNT';
  readonly amount: number;
  readonly taxAmount?: number;
}

/**
 * Compute draft totals from raw lines. Lines whose `lineType=DISCOUNT`
 * have their amount subtracted from the subtotal; explicit `TAX` lines
 * accumulate into taxTotal alongside any per-line taxAmount.
 */
export function computeTotalsFromLines(lines: readonly LineForTotal[]): InvoiceTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const line of lines) {
    if (line.lineType === 'DISCOUNT') {
      discount = roundMoney(discount + line.amount);
    } else if (line.lineType === 'TAX') {
      tax = roundMoney(tax + line.amount);
    } else {
      subtotal = roundMoney(subtotal + line.amount);
    }
    if (line.taxAmount !== undefined && line.taxAmount !== 0) {
      tax = roundMoney(tax + line.taxAmount);
    }
  }
  const totalAmount = roundMoney(subtotal - discount + tax);
  return { subtotal, discountTotal: discount, taxTotal: tax, totalAmount };
}
