/**
 * CommunicationCenterFeatureFlagsBootstrap — registers the single
 * `module.communication_center` flag with the global FeatureFlagRegistry
 * so it is upserted on application bootstrap. Mirrors
 * `NotificationsFeatureFlagsBootstrap`.
 *
 * Communication Center is opt-in: defaults to OFF so existing tenants
 * see no behavioural change after deploy. Enable per-tenant when the
 * operations team is ready to use the orchestration surface.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { CommunicationCenterFeatureFlags } from './communication-center.constants';

@Injectable()
export class CommunicationCenterFeatureFlagsBootstrap {
  private readonly logger = new Logger(CommunicationCenterFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: CommunicationCenterFeatureFlags.MODULE,
      name: 'Communication Center module',
      description:
        'Enables the orchestration layer over the existing Notifications + Job Scheduler stack (dashboard, broadcasts, scheduling, monitoring, analytics).',
      kind: 'MODULE',
      defaultValue: false,
      owner: 'communication-center',
    });
    this.logger.log('Communication Center feature flags registered: 1 key.');
  }
}
