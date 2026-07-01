/**
 * NotificationsFeatureFlagsBootstrap — registers the 13 Notifications
 * feature flags with `FeatureFlagRegistry` at construct time so the
 * entries are present when the registry's `onApplicationBootstrap`
 * upserts them. Mirrors `FeesFeatureFlagsBootstrap`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { NotificationsFeatureFlags } from './notifications.constants';

@Injectable()
export class NotificationsFeatureFlagsBootstrap {
  private readonly logger = new Logger(NotificationsFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: NotificationsFeatureFlags.MODULE,
      name: 'Notifications module',
      description:
        'Enables notification templates, preferences, messages, in-app inbox, campaigns, and the event dispatcher.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.ALLOW_BROADCAST,
      name: 'Allow broadcast campaigns',
      description:
        'When enabled, broadcast campaigns may be started (resolves recipients and fans out per-channel messages).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.ALLOW_SCHEDULED,
      name: 'Allow scheduled dispatch',
      description:
        'When enabled, messages may be persisted with a future `scheduledAt` and held in QUEUED state until that time.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.QUIET_HOURS_ENFORCED,
      name: 'Enforce quiet hours',
      description:
        'When enabled, per-user quiet-hours windows suppress non-CRITICAL deliveries (deferred or dropped per preference).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.CHANNEL_EMAIL,
      name: 'Email channel',
      description: 'Per-tenant entitlement for the EMAIL channel.',
      kind: 'ENTITLEMENT',
      defaultValue: true,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.CHANNEL_SMS,
      name: 'SMS channel',
      description: 'Per-tenant entitlement for the SMS channel.',
      kind: 'ENTITLEMENT',
      defaultValue: false,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.CHANNEL_WHATSAPP,
      name: 'WhatsApp channel',
      description: 'Per-tenant entitlement for the WHATSAPP channel.',
      kind: 'ENTITLEMENT',
      defaultValue: false,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.CHANNEL_IN_APP,
      name: 'In-app channel',
      description: 'Per-tenant entitlement for the IN_APP channel (notification center).',
      kind: 'ENTITLEMENT',
      defaultValue: true,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.PROVIDER_SES,
      name: 'Amazon SES provider',
      description:
        'Enables the EMAIL channel adapter (SES providerCode). Sprint N1 swapped the stub for a Nodemailer-backed SMTP transport — provider-agnostic at the wire level (Mailpit in dev, real SMTP in prod).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.PROVIDER_SENDGRID,
      name: 'SendGrid provider',
      description: 'Enables the SendGrid email adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.PROVIDER_MSG91,
      name: 'MSG91 provider',
      description: 'Enables the MSG91 SMS adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.PROVIDER_TWILIO,
      name: 'Twilio provider',
      description: 'Enables the Twilio SMS adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'notifications',
    });
    registry.register({
      key: NotificationsFeatureFlags.PROVIDER_WABA,
      name: 'WhatsApp Business API provider',
      description: 'Enables the WhatsApp Business API adapter (stub this sprint).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'notifications',
    });
    this.logger.log('Notifications feature flags registered: 13 keys.');
  }
}
