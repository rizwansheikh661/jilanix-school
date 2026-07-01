/**
 * BillingFeatureFlagsBootstrap — registers the 3 Sprint 20 billing feature
 * flags with FeatureFlagRegistry at construction time.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../../feature-flag/services/feature-flag.registry';
import { BillingFeatureFlags } from '../billing.constants';

@Injectable()
export class BillingFeatureFlagsBootstrap {
  private readonly logger = new Logger(BillingFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: BillingFeatureFlags.MODULE,
      name: 'Billing module',
      description:
        'Master switch for the Sprint 20 SaaS Billing Foundation (school → platform). ' +
        'When off, all billing write endpoints refuse mutations.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'billing',
    });
    registry.register({
      key: BillingFeatureFlags.RAZORPAY_ENABLED,
      name: 'Razorpay online payments',
      description:
        'Gate the Razorpay order/checkout/webhook flow. When off, only manual ' +
        'payments (UPI/Bank/Cash/Cheque/Card) are accepted.',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'billing',
    });
    registry.register({
      key: BillingFeatureFlags.MANUAL_PAYMENTS_ENABLED,
      name: 'Manual payment recording',
      description:
        'Gate the manual payment recording flow (UPI/Bank/Cash/Cheque/Card). ' +
        'When off, only Razorpay payments are accepted.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'billing',
    });
    this.logger.log('Billing feature flags registered: 3 keys.');
  }
}
