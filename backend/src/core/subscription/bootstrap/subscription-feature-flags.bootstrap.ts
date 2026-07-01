/**
 * SubscriptionFeatureFlagsBootstrap — registers the 4 Sprint 15 subscription
 * feature flags with FeatureFlagRegistry at construction time.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../../feature-flag/services/feature-flag.registry';
import { SubscriptionFeatureFlags } from '../subscription.constants';

@Injectable()
export class SubscriptionFeatureFlagsBootstrap {
  private readonly logger = new Logger(SubscriptionFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: SubscriptionFeatureFlags.MODULE,
      name: 'Subscription module',
      description:
        'Master switch for the Sprint 15 Subscription & Plan Management ' +
        'module. When off, the subscription / plan-feature / usage write ' +
        'endpoints refuse mutations.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'subscription',
    });
    registry.register({
      key: SubscriptionFeatureFlags.ALLOW_PLAN_CHANGE,
      name: 'Allow plan change (upgrade/downgrade)',
      description:
        'Gate upgrade/downgrade endpoints. Set to false to freeze plan ' +
        'changes during a billing experiment.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'subscription',
    });
    registry.register({
      key: SubscriptionFeatureFlags.ENFORCE_LIMITS,
      name: 'Enforce subscription limits',
      description:
        'When enabled, SubscriptionGuardService.assertAndConsume throws on ' +
        'limit breach. When off, the guard logs the breach but allows the ' +
        'operation (warn-only mode for rollout).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'subscription',
    });
    registry.register({
      key: SubscriptionFeatureFlags.NOTIFY_THRESHOLDS,
      name: 'Notify usage thresholds',
      description:
        'When enabled, the 80/90/100% usage threshold events fire to the ' +
        'outbox / notification dispatcher. Off = silent counting.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'subscription',
    });
    this.logger.log('Subscription feature flags registered: 4 keys.');
  }
}
