/**
 * BillingSubscriptionIntegrationService — the seam between the Subscription
 * lifecycle (per-school SaaS plan) and the Billing module (invoices, payments).
 * This file MUST NOT touch the subscription table directly; every read or
 * mutation goes through `SubscriptionService` so the Subscription FSM stays
 * the single source of truth.
 *
 *   - generateInvoiceForRenewal : creates and issues an invoice for the next
 *     subscription period using the snapshot prices on `SubscriptionRow`.
 *   - markSubscriptionActiveAfterPayment : invoked when a subscription invoice
 *     is fully paid — renews / activates the underlying subscription.
 *   - pauseSubscriptionOnNonPayment : invoked when the grace period elapses
 *     without payment — suspends the underlying subscription.
 *
 * Note on signatures: `SubscriptionService.getById/renew/suspend` all require
 * `schoolId` alongside the subscription id. The integration methods accept
 * both so callers (jobs, webhooks) can pass the values they already have.
 */
import { Injectable, Logger } from '@nestjs/common';

import {
  BILLING_DEFAULT_BILLING_LEAD_DAYS,
  BILLING_DEFAULT_GRACE_PERIOD_DAYS,
} from '../billing.constants';
import { BillingAccountService } from '../account/billing-account.service';
import { BillingSettingsService } from '../settings/billing-settings.service';
import { InvoiceService } from '../invoice/invoice.service';
import { computeFiscalYear, roundMoney } from '../billing.shared';
import type { InvoiceRow } from '../billing.types';
import { SubscriptionService } from '../../subscription/subscription/subscription.service';
import type {
  BillingCycleValue,
  SubscriptionRow,
} from '../../subscription/subscription.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHLY_DAYS = 30;
const YEARLY_DAYS = 365;

export interface GenerateInvoiceForRenewalArgs {
  readonly schoolId: string;
  readonly subscriptionId: string;
}

export interface PauseSubscriptionOnNonPaymentArgs {
  readonly schoolId: string;
  readonly subscriptionId: string;
  readonly expectedVersion: number;
}

@Injectable()
export class BillingSubscriptionIntegrationService {
  private readonly logger = new Logger(BillingSubscriptionIntegrationService.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly invoiceService: InvoiceService,
    private readonly accountService: BillingAccountService,
    private readonly settingsService: BillingSettingsService,
  ) {}

  // -------------------------------------------------------------------------
  // generateInvoiceForRenewal
  // -------------------------------------------------------------------------

  public async generateInvoiceForRenewal(
    args: GenerateInvoiceForRenewalArgs,
  ): Promise<InvoiceRow> {
    // SubscriptionService.getById is the only read path we use; we MUST NOT
    // hit the subscription table directly.
    const sub = await this.subscriptionService.getById(args.schoolId, args.subscriptionId);
    const account = await this.accountService.getAccountBySchoolId(sub.schoolId);

    // BillingSettings drive lead/grace; tolerate the (rare) case where a
    // brand-new account has no settings row yet by using the defaults.
    let billingLeadDays = BILLING_DEFAULT_BILLING_LEAD_DAYS;
    let gracePeriodDays = BILLING_DEFAULT_GRACE_PERIOD_DAYS;
    try {
      const settings = await this.settingsService.getSettings(account.id);
      billingLeadDays = settings.billingLeadDays;
      gracePeriodDays = settings.gracePeriodDays;
    } catch (err) {
      this.logger.warn(
        `BillingSettings missing for account=${account.id}; using defaults (${(err as Error).message}).`,
      );
    }

    const cycleDays = daysForCycle(sub.billingCycle);
    const periodStart = nextPeriodStart(sub);
    const periodEnd = new Date(periodStart.getTime() + cycleDays * MS_PER_DAY);

    const amount = priceForCycle(sub);
    const fiscalYear = computeFiscalYear(periodStart);

    // Due date: now + leadDays + graceDays — keeps invoice generation a few
    // days ahead of the period boundary while honouring the school's grace.
    const issueAt = new Date();
    const dueDate = new Date(issueAt.getTime() + (billingLeadDays + gracePeriodDays) * MS_PER_DAY);

    const draft = await this.invoiceService.createDraft({
      accountId: account.id,
      schoolId: sub.schoolId,
      fiscalYear,
      subscriptionId: sub.id,
      billingCycle: sub.billingCycle,
      periodStart,
      periodEnd,
      dueDate,
      currency: sub.currency,
      lines: [
        {
          lineType: 'SUBSCRIPTION',
          description: `Subscription: ${sub.planId} (${sub.billingCycle})`,
          quantity: 1,
          unitPrice: amount,
          amount,
        },
      ],
    });

    const issued = await this.invoiceService.issue({
      invoiceId: draft.invoice.id,
      expectedVersion: draft.invoice.version,
      issuedAt: issueAt,
      dueDate,
    });
    this.logger.log(
      `Renewal invoice issued schoolId=${sub.schoolId} subscriptionId=${sub.id} invoiceId=${issued.id} amount=${amount}.`,
    );
    return issued;
  }

  // -------------------------------------------------------------------------
  // markSubscriptionActiveAfterPayment
  // -------------------------------------------------------------------------

  public async markSubscriptionActiveAfterPayment(invoiceId: string): Promise<void> {
    const invoice = await this.invoiceService.get(invoiceId);
    if (invoice.subscriptionId === null) {
      this.logger.debug(
        `Invoice ${invoiceId} has no subscriptionId; nothing to renew.`,
      );
      return;
    }

    // We need expectedVersion + cycle length to renew. Load via the service.
    const sub = await this.subscriptionService.getById(invoice.schoolId, invoice.subscriptionId);
    const extendDays = daysForCycle(sub.billingCycle);
    if (extendDays === 0) {
      // TRIAL / CUSTOM — no automatic renew. Defer to operators.
      // TODO(billing): wire CUSTOM-cycle handling once the contract is defined.
      this.logger.warn(
        `Skipping auto-renew for subscriptionId=${sub.id} cycle=${sub.billingCycle}.`,
      );
      return;
    }

    await this.subscriptionService.renew({
      schoolId: sub.schoolId,
      subscriptionId: sub.id,
      expectedVersion: sub.version,
      extendDays,
      billingCycle: sub.billingCycle,
    });
    this.logger.log(
      `Subscription renewed after payment schoolId=${sub.schoolId} subscriptionId=${sub.id} extendDays=${extendDays}.`,
    );
  }

  // -------------------------------------------------------------------------
  // pauseSubscriptionOnNonPayment
  // -------------------------------------------------------------------------

  public async pauseSubscriptionOnNonPayment(
    args: PauseSubscriptionOnNonPaymentArgs,
  ): Promise<void> {
    const sub = await this.subscriptionService.getById(args.schoolId, args.subscriptionId);
    if (sub.status === 'SUSPENDED' || sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
      this.logger.debug(
        `Subscription ${sub.id} already non-active (status=${sub.status}); skipping suspend.`,
      );
      return;
    }
    await this.subscriptionService.suspend(
      sub.schoolId,
      sub.id,
      args.expectedVersion,
      'non-payment',
    );
    this.logger.log(
      `Subscription suspended for non-payment schoolId=${sub.schoolId} subscriptionId=${sub.id}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function daysForCycle(cycle: BillingCycleValue): number {
  switch (cycle) {
    case 'MONTHLY':
      return MONTHLY_DAYS;
    case 'YEARLY':
      return YEARLY_DAYS;
    default:
      // TRIAL / CUSTOM — leave to the caller to decide a renewal cadence.
      return 0;
  }
}

function priceForCycle(sub: SubscriptionRow): number {
  if (sub.billingCycle === 'YEARLY') {
    return roundMoney(sub.yearlyPrice);
  }
  // MONTHLY / TRIAL / CUSTOM all default to monthlyPrice; CUSTOM contracts
  // should override via a different code path before reaching this method.
  return roundMoney(sub.monthlyPrice);
}

function nextPeriodStart(sub: SubscriptionRow): Date {
  if (sub.lastRenewedAt !== null) {
    return sub.lastRenewedAt;
  }
  if (sub.startedAt !== null) {
    return sub.startedAt;
  }
  return new Date();
}
