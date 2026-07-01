/**
 * ProvisioningFeatureFlagsBootstrap — registers the 4 Sprint 14 provisioning
 * flags with FeatureFlagRegistry at construction time so the registry's
 * `onApplicationBootstrap` upserts them into `feature_flag_definitions`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../../feature-flag/services/feature-flag.registry';
import { ProvisioningFeatureFlags } from '../provisioning.constants';

@Injectable()
export class ProvisioningFeatureFlagsBootstrap {
  private readonly logger = new Logger(ProvisioningFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: ProvisioningFeatureFlags.MODULE,
      name: 'Provisioning module',
      description:
        'Master switch for the Super-Admin & School-Provisioning module. ' +
        'When off the lifecycle, trial, orchestrator and password-reset ' +
        'controllers refuse all writes.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'provisioning',
    });
    registry.register({
      key: ProvisioningFeatureFlags.ALLOW_PROVISIONING,
      name: 'Allow tenant provisioning',
      description:
        'When enabled, the orchestrator may create brand-new tenants. ' +
        'Set to false to freeze the platform without taking down the rest of ' +
        'the API.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'provisioning',
    });
    registry.register({
      key: ProvisioningFeatureFlags.ALLOW_TRIAL_EXTENSION,
      name: 'Allow trial extensions',
      description:
        'When enabled, super-admins may extend a trial up to ' +
        '`TRIAL_EXTENSION_MAX_COUNT` times. Toggle off to enforce a hard ' +
        'cutoff during a billing experiment.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'provisioning',
    });
    registry.register({
      key: ProvisioningFeatureFlags.ALLOW_PASSWORD_RESET,
      name: 'Allow password resets',
      description:
        'Kill switch for the anonymous password-reset request endpoint. ' +
        'Useful during a credential-stuffing incident.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'provisioning',
    });
    this.logger.log('Provisioning feature flags registered: 4 keys.');
  }
}
