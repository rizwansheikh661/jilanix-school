/**
 * BillingReportsBootstrap — Sprint 20 W8 stub.
 *
 * The Sprint 20 directive calls for four billing report definitions to be
 * registered with the platform reporting catalog at bootstrap:
 *
 *   - billing.invoice.summary      (invoices by status / period / school)
 *   - billing.payment.summary      (payments by method / status / period)
 *   - billing.refund.summary       (refunds by status / period)
 *   - billing.outstanding          (outstanding balance by school / aging)
 *
 * However, the reporting subsystem in this repo (`ReportEngineRegistry` /
 * `REPORT_KIND_CATALOG`) is bound to a static `ReportKindValue` Prisma enum
 * and exposes NO dynamic registration entry point — there is no
 * `ReportRegistry`, `ReportDefinitionService`, or `ReportCatalog` provider in
 * the codebase. The directive's fallback path is to log a deferral and not
 * invent new reporting infrastructure here.
 *
 * TODO(billing): When the reporting module grows a dynamic registry (or when
 * the four billing kinds are added to the Prisma `ReportKind` enum + the
 * static catalog), wire each of the keys above through that surface.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

const PLANNED_BILLING_REPORT_KEYS: readonly string[] = Object.freeze([
  'billing.invoice.summary',
  'billing.payment.summary',
  'billing.refund.summary',
  'billing.outstanding',
]);

@Injectable()
export class BillingReportsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingReportsBootstrap.name);

  public onApplicationBootstrap(): void {
    this.logger.log(
      'Billing reports bootstrap: reporting registry not found — deferring registration.',
    );
    this.logger.debug(
      `Planned billing report keys (deferred): ${PLANNED_BILLING_REPORT_KEYS.join(', ')}`,
    );
  }
}
