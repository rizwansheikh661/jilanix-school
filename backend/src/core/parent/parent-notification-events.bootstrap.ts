/**
 * ParentNotificationEventsBootstrap — Sprint 17 W6.
 *
 * The 6 PARENT_* event keys (INVITED, ACTIVATED, SUSPENDED, ARCHIVED,
 * LINKED, UNLINKED) are appended to the static `NOTIFICATION_EVENTS`
 * catalog and therefore arrive in the registry automatically. This
 * bootstrap exists to:
 *
 *   1. Provide a single grep-able "registered N parent events" log line so
 *      the boot-smoke verification (Sprint 17 plan §12) can confirm that
 *      the keys are present in the registry.
 *   2. Surface a hard failure at boot if the static catalog ever drops one
 *      of the parent keys, instead of waiting for the first dispatch.
 *
 * Mirrors `ProvisioningNotificationBootstrap` / `EventsNotificationBootstrap`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { NotificationEventRegistry } from '../notifications/notification-event.registry';

export const PARENT_NOTIFICATION_EVENT_KEYS = [
  'PARENT_INVITED',
  'PARENT_ACTIVATED',
  'PARENT_SUSPENDED',
  'PARENT_ARCHIVED',
  'PARENT_LINKED',
  'PARENT_UNLINKED',
] as const;

@Injectable()
export class ParentNotificationEventsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ParentNotificationEventsBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    const missing = PARENT_NOTIFICATION_EVENT_KEYS.filter(
      (key) => !this.registry.has(key),
    );
    if (missing.length > 0) {
      throw new Error(
        `ParentNotificationEventsBootstrap: missing parent notification keys: ${missing.join(', ')}. ` +
          `Verify NOTIFICATION_EVENTS in notification-events.catalog.ts.`,
      );
    }
    this.logger.log(
      `Parent notification catalog registered: ${PARENT_NOTIFICATION_EVENT_KEYS.length.toString()} PARENT_* keys.`,
    );
  }
}
