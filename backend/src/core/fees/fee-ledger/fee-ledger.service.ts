/**
 * FeeLedgerService — READ-ONLY computed timeline of a student's fee
 * activity. No writes, no outbox, no audit. The `fee_ledger_entries` table
 * was deferred — the ledger is rebuilt on every request from invoices,
 * payments, and refunds.
 *
 * Pipeline:
 *   1. `module.fees` feature flag gate.
 *   2. Query invoices (status != VOID, soft-delete filtered) joined with
 *      lines.
 *   3. Query payments (status CAPTURED | REFUNDED) joined with allocations.
 *      When `academicYearId` is on, restrict to payments whose ANY
 *      allocation references one of the in-set invoices.
 *   4. Query refunds where feePaymentId IN paymentIds.
 *   5. Build entries:
 *        - INVOICE   (debit  = invoice.total - Σ late-fine line totals)
 *        - FINE      (debit  = line.lineTotal, separately so it shows on
 *                     the timeline. Invoice debit excludes these to avoid
 *                     double counting.)
 *        - DISCOUNT  (informational only — already netted into invoice.total
 *                     at generate time, so debit = credit = 0.)
 *        - PAYMENT   (credit = payment.amount)
 *        - REFUND    (debit  = refund.amount)
 *   6. Sort by `at` asc, then by stable type order: INVOICE < FINE <
 *      DISCOUNT < PAYMENT < REFUND so same-day rows read intuitively.
 *   7. Walk to compute runningBalance += (debit - credit).
 *   8. Compute totals — invoiced/paid/refunded/outstanding.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequestContextRegistry } from '../../request-context';
import { FEE_DECIMAL_PLACES, FeesFeatureFlags } from '../fees.constants';
import { FeesModuleDisabledError } from '../fees.errors';
import type {
  LedgerEntry,
  LedgerEntryType,
  StudentFeeLedger,
} from '../fees.types';

export interface GetStudentLedgerArgs {
  readonly schoolId: string;
  readonly studentId: string;
  readonly academicYearId?: string;
}

// Stable secondary ordering for same-`at` entries.
const TYPE_ORDER: Readonly<Record<LedgerEntryType, number>> = Object.freeze({
  INVOICE: 0,
  FINE: 1,
  DISCOUNT: 2,
  PAYMENT: 3,
  REFUND: 4,
});

@Injectable()
export class FeeLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  public async getStudentLedger(
    args: GetStudentLedgerArgs,
  ): Promise<StudentFeeLedger> {
    await this.assertModuleEnabled();
    const { schoolId, studentId } = args;
    const academicYearId = args.academicYearId ?? null;
    const client = this.prisma.client;

    // 1. Invoices (+ lines), excluding VOID and soft-deleted rows.
    const invoiceWhere: Record<string, unknown> = {
      schoolId,
      studentId,
      deletedAt: null,
      status: { not: 'VOID' },
    };
    if (academicYearId !== null) invoiceWhere.academicYearId = academicYearId;

    const invoices = (await client.feeInvoice.findMany({
      where: invoiceWhere,
      include: {
        lines: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
    })) as unknown as RawInvoiceWithLines[];

    const invoiceIdSet = new Set(invoices.map((i) => i.id));

    // 2. Payments (+ allocations). Skip CANCELLED and pending-verification.
    const paymentWhere: Record<string, unknown> = {
      schoolId,
      studentId,
      deletedAt: null,
      status: { in: ['CAPTURED', 'REFUNDED'] },
      verificationStatus: { not: 'PENDING' },
    };

    const allPayments = (await client.feePayment.findMany({
      where: paymentWhere,
      include: {
        allocations: true,
        paymentSource: true,
      },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    })) as unknown as RawPaymentWithAllocations[];

    // When `academicYearId` filter is on, drop payments that don't touch any
    // invoice in the filtered set.
    const payments =
      academicYearId === null
        ? allPayments
        : allPayments.filter((p) =>
            p.allocations.some((a) => invoiceIdSet.has(a.feeInvoiceId)),
          );

    const paymentIds = payments.map((p) => p.id);

    // 3. Refunds against the captured payment set.
    const refunds =
      paymentIds.length === 0
        ? []
        : ((await client.feeRefund.findMany({
            where: {
              schoolId,
              feePaymentId: { in: paymentIds },
            },
            orderBy: [{ refundedAt: 'asc' }, { id: 'asc' }],
          })) as unknown as RawRefund[]);

    // 4. Build entries.
    const entries: LedgerEntry[] = [];

    for (const invoice of invoices) {
      let fineLineTotal = 0;
      for (const line of invoice.lines) {
        if (line.isLateFine) fineLineTotal += toNumber(line.lineTotal);
      }
      const invoiceDebit = round2(toNumber(invoice.total) - fineLineTotal);

      entries.push({
        at: invoice.issueDate,
        type: 'INVOICE',
        referenceId: invoice.id,
        description: `Invoice ${invoice.invoiceNo}`,
        debit: invoiceDebit,
        credit: 0,
        runningBalance: 0,
      });

      for (const line of invoice.lines) {
        if (line.isLateFine) {
          entries.push({
            at: line.createdAt,
            type: 'FINE',
            referenceId: line.id,
            description: line.description,
            debit: round2(toNumber(line.lineTotal)),
            credit: 0,
            runningBalance: 0,
          });
        }
        if (line.sourceDiscountId !== null) {
          entries.push({
            at: line.createdAt,
            type: 'DISCOUNT',
            referenceId: line.sourceDiscountId,
            description: `Discount: ${line.description}`,
            debit: 0,
            credit: 0,
            runningBalance: 0,
          });
        }
      }
    }

    for (const payment of payments) {
      const desc = payment.paymentNo ?? payment.method;
      const sourceSuffix =
        payment.paymentSource !== null && payment.paymentSource !== undefined
          ? ` (${payment.paymentSource.name})`
          : '';
      entries.push({
        at: payment.paidAt,
        type: 'PAYMENT',
        referenceId: payment.id,
        description: `Payment ${desc}${sourceSuffix}`,
        debit: 0,
        credit: round2(toNumber(payment.amount)),
        runningBalance: 0,
      });
    }

    for (const refund of refunds) {
      entries.push({
        at: refund.refundedAt,
        type: 'REFUND',
        referenceId: refund.id,
        description: `Refund: ${refund.reason}`,
        debit: round2(toNumber(refund.amount)),
        credit: 0,
        runningBalance: 0,
      });
    }

    // 5. Sort: by `at` asc, then by stable type ordering.
    entries.sort((a, b) => {
      const aT = a.at.getTime();
      const bT = b.at.getTime();
      if (aT !== bT) return aT - bT;
      return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    });

    // 6. Running balance + totals.
    let running = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalRefunded = 0;
    const finalized: LedgerEntry[] = entries.map((e) => {
      running = round2(running + e.debit - e.credit);
      if (e.type === 'INVOICE' || e.type === 'FINE') totalInvoiced += e.debit;
      else if (e.type === 'PAYMENT') totalPaid += e.credit;
      else if (e.type === 'REFUND') totalRefunded += e.debit;
      return { ...e, runningBalance: running };
    });

    const totals = {
      totalInvoiced: round2(totalInvoiced),
      totalPaid: round2(totalPaid),
      totalRefunded: round2(totalRefunded),
      outstandingBalance: round2(totalInvoiced - totalPaid + totalRefunded),
    };

    return {
      studentId,
      academicYearId,
      entries: finalized,
      totals,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(FeesFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new FeesModuleDisabledError();
  }
}

// ---------------------------------------------------------------------------
// Raw row shapes — narrow surface against Prisma's generated types so we
// don't import `@prisma/client` here.
// ---------------------------------------------------------------------------

interface RawInvoiceLine {
  id: string;
  description: string;
  lineTotal: unknown;
  isLateFine: boolean;
  sourceDiscountId: string | null;
  createdAt: Date;
}

interface RawInvoiceWithLines {
  id: string;
  invoiceNo: string;
  issueDate: Date;
  total: unknown;
  lines: RawInvoiceLine[];
}

interface RawAllocation {
  id: string;
  feeInvoiceId: string;
}

interface RawPaymentSource {
  name: string;
}

interface RawPaymentWithAllocations {
  id: string;
  paymentNo: string | null;
  method: string;
  amount: unknown;
  paidAt: Date;
  allocations: RawAllocation[];
  paymentSource: RawPaymentSource | null;
}

interface RawRefund {
  id: string;
  reason: string;
  amount: unknown;
  refundedAt: Date;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function round2(v: number): number {
  const factor = Math.pow(10, FEE_DECIMAL_PLACES);
  return Math.round(v * factor) / factor;
}

export const __test__ = { round2, TYPE_ORDER };
