/**
 * ParentFeatureFlagsBootstrap — registers the Parent module's feature
 * flags with `FeatureFlagRegistry` at construct time so the entries are
 * present when the registry's `onApplicationBootstrap` upserts them.
 *
 * Currently only one key: `parent_portal`. Although it is already
 * plan-mapped via the `subscription_foundation` migration, the registry
 * still needs an in-memory `register({...})` call so
 * `FeatureFlagService.assert(...)` will not reject the key as unknown.
 *
 * Mirrors `NotificationsFeatureFlagsBootstrap`. Add future parent-domain
 * flags here.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { ParentFeatureFlags } from './parent.constants';

@Injectable()
export class ParentFeatureFlagsBootstrap {
  private readonly logger = new Logger(ParentFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: ParentFeatureFlags.PARENT_PORTAL,
      name: 'Parent Portal',
      description:
        'Enables the parent-portal admin endpoints (invite/suspend/reactivate/archive) and the `/me/*` self-service surface. Plan-mapped (see plan_features.parent_portal).',
      kind: 'ENTITLEMENT',
      defaultValue: true,
      owner: 'parent',
    });
    this.logger.log('Parent feature flags registered: 1 key.');
  }
}
