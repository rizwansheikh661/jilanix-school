/**
 * EventsFeatureFlagsBootstrap — registers the 5 Events feature flags with
 * `FeatureFlagRegistry` at construct time. Mirrors
 * `NotificationsFeatureFlagsBootstrap`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { EventsFeatureFlags } from './events.constants';

@Injectable()
export class EventsFeatureFlagsBootstrap {
  private readonly logger = new Logger(EventsFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: EventsFeatureFlags.MODULE,
      name: 'Events module',
      description:
        'Enables event management, participants, attendance, fee assignment, documents, and results.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'events',
    });
    registry.register({
      key: EventsFeatureFlags.ALLOW_PUBLISH,
      name: 'Allow event publish',
      description:
        'When enabled, the SCHEDULED → PUBLISHED transition is allowed (and a notification fires).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'events',
    });
    registry.register({
      key: EventsFeatureFlags.ALLOW_FEE_GENERATION,
      name: 'Allow event fee-invoice generation',
      description:
        'When enabled, admins may batch-generate FeeInvoices for an event\u2019s PENDING fee assignments.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'events',
    });
    registry.register({
      key: EventsFeatureFlags.ALLOW_BULK_REGISTRATION,
      name: 'Allow bulk event registration',
      description:
        'When enabled, admins may register an entire class or section in a single call.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'events',
    });
    registry.register({
      key: EventsFeatureFlags.NOTIFY_ON_LIFECYCLE,
      name: 'Notify on event lifecycle',
      description:
        'When enabled, EventService dispatches notifications at publish / open-reg / close-reg / cancel transitions.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'events',
    });
    this.logger.log('Events feature flags registered: 5 keys.');
  }
}
