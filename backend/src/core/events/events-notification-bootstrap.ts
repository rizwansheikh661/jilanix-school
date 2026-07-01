/**
 * EventsNotificationBootstrap — registers the 6 event-key catalog entries
 * for the Events lifecycle with Sprint 10's NotificationEventRegistry on
 * application bootstrap. Templates are NOT auto-seeded (each school
 * authors its own copy).
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationEventDefinition } from '../notifications/notification-events.catalog';
import { NotificationEventRegistry } from '../notifications/notification-event.registry';
import { EventsNotificationEventKeys } from './events.constants';

@Injectable()
export class EventsNotificationBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsNotificationBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    for (const def of EVENT_NOTIFICATION_DEFINITIONS) {
      this.registry.register(def);
    }
    this.logger.log(
      `Events notification catalog registered: ${EVENT_NOTIFICATION_DEFINITIONS.length} keys.`,
    );
  }
}

const SAMPLE = {
  eventName: 'Annual Sports Day 2026',
  eventCode: 'EVT-000123',
  startDate: '2026-07-15',
  endDate: '2026-07-15',
  venue: 'Main Ground',
} as const;

const EVENT_NOTIFICATION_DEFINITIONS: readonly NotificationEventDefinition[] =
  Object.freeze([
    {
      key: EventsNotificationEventKeys.EVENT_CREATED,
      category: 'COMMUNICATION',
      defaultPriority: 'LOW',
      audience: 'USER',
      description: 'New event created',
      sampleVariables: SAMPLE,
    },
    {
      key: EventsNotificationEventKeys.EVENT_PUBLISHED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Event published',
      sampleVariables: SAMPLE,
    },
    {
      key: EventsNotificationEventKeys.EVENT_REGISTRATION_OPENED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Registration is now open',
      sampleVariables: SAMPLE,
    },
    {
      key: EventsNotificationEventKeys.EVENT_REGISTRATION_CLOSED,
      category: 'COMMUNICATION',
      defaultPriority: 'LOW',
      audience: 'USER',
      description: 'Registration is now closed',
      sampleVariables: SAMPLE,
    },
    {
      key: EventsNotificationEventKeys.EVENT_REMINDER,
      category: 'COMMUNICATION',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Event happening soon',
      sampleVariables: { ...SAMPLE, startsInHours: 24 },
    },
    {
      key: EventsNotificationEventKeys.EVENT_CANCELLED,
      category: 'COMMUNICATION',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Event cancelled',
      sampleVariables: { ...SAMPLE, reason: 'Heavy rainfall forecast' },
    },
  ]);
