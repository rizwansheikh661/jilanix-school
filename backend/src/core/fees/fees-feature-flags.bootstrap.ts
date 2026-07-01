/**
 * FeesFeatureFlagsBootstrap — registers the 8 Fees feature flags with
 * `FeatureFlagRegistry` at construct time so the entries are present when
 * the registry's `onApplicationBootstrap` upserts them.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { FeesFeatureFlags } from './fees.constants';

@Injectable()
export class FeesFeatureFlagsBootstrap {
  private readonly logger = new Logger(FeesFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: FeesFeatureFlags.MODULE,
      name: 'Fees module',
      description:
        'Enables fee heads, structures, discounts, invoices, payments, receipts, and the ledger.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.ALLOW_PARTIAL_PAYMENT,
      name: 'Allow partial payment',
      description:
        'When enabled, payments smaller than the invoice balance are accepted (invoice flips to PARTIAL).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.FREEZE_FINES_REQUIRED,
      name: 'Require explicit fine freeze',
      description:
        'When enabled, late fines must be frozen via POST /apply-fines before a payment can clear an overdue invoice.',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.GATEWAY_RAZORPAY,
      name: 'Razorpay gateway',
      description: 'Enables the Razorpay online-payment adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.GATEWAY_PHONEPE,
      name: 'PhonePe gateway',
      description: 'Enables the PhonePe online-payment adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.GATEWAY_PAYTM,
      name: 'Paytm gateway',
      description: 'Enables the Paytm online-payment adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.GATEWAY_STRIPE,
      name: 'Stripe gateway',
      description: 'Enables the Stripe online-payment adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'fees',
    });
    registry.register({
      key: FeesFeatureFlags.GATEWAY_CASHFREE,
      name: 'Cashfree gateway',
      description: 'Enables the Cashfree online-payment adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'fees',
    });
    this.logger.log('Fees feature flags registered: 8 keys.');
  }
}
