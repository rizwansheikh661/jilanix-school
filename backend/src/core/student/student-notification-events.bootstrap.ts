/**
 * StudentNotificationEventsBootstrap — Sprint 18 W5.
 *
 * The 4 STUDENT_* event keys (INVITED, ACTIVATED, SUSPENDED, ARCHIVED)
 * are appended to the static `NOTIFICATION_EVENTS` catalog and therefore
 * arrive in the registry automatically. This bootstrap exists to:
 *
 *   1. Provide a single grep-able "registered N student events" log line
 *      so the boot-smoke verification can confirm the keys are present.
 *   2. Surface a hard failure at boot if the static catalog ever drops one
 *      of the student keys, instead of waiting for the first dispatch.
 *
 * Mirrors `ParentNotificationEventsBootstrap`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { NotificationEventRegistry } from '../notifications/notification-event.registry';

export const STUDENT_NOTIFICATION_EVENT_KEYS = [
  'STUDENT_INVITED',
  'STUDENT_ACTIVATED',
  'STUDENT_SUSPENDED',
  'STUDENT_ARCHIVED',
] as const;

@Injectable()
export class StudentNotificationEventsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(StudentNotificationEventsBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    const missing = STUDENT_NOTIFICATION_EVENT_KEYS.filter(
      (key) => !this.registry.has(key),
    );
    if (missing.length > 0) {
      throw new Error(
        `StudentNotificationEventsBootstrap: missing student notification keys: ${missing.join(', ')}. ` +
          `Verify NOTIFICATION_EVENTS in notification-events.catalog.ts.`,
      );
    }
    this.logger.log(
      `Student notification catalog registered: ${STUDENT_NOTIFICATION_EVENT_KEYS.length.toString()} STUDENT_* keys.`,
    );
  }
}
