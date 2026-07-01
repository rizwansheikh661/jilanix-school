/**
 * SubscriptionNotificationBootstrap — registers Sprint 15's lifecycle and
 * usage notification event keys (11 total) with the NotificationEventRegistry.
 *
 * Templates are NOT seeded — each school authors its own copy.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationEventDefinition } from '../../notifications/notification-events.catalog';
import { NotificationEventRegistry } from '../../notifications/notification-event.registry';
import { SubscriptionNotificationEventKeys } from '../subscription.constants';

@Injectable()
export class SubscriptionNotificationBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionNotificationBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    for (const def of SUBSCRIPTION_NOTIFICATION_DEFINITIONS) {
      this.registry.register(def);
    }
    this.logger.log(
      `Subscription notification catalog registered: ${SUBSCRIPTION_NOTIFICATION_DEFINITIONS.length.toString()} keys.`,
    );
  }
}

const SUBSCRIPTION_NOTIFICATION_DEFINITIONS: readonly NotificationEventDefinition[] =
  Object.freeze([
    {
      key: SubscriptionNotificationEventKeys.SUBSCRIPTION_ACTIVATED,
      category: 'SYSTEM',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Subscription transitioned to ACTIVE.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        planCode: 'GROWTH',
        activatedAt: '2026-06-24T10:00:00Z',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.SUBSCRIPTION_EXPIRING,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Subscription is in EXPIRING window (pre-expiry warning).',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        expiryDate: '2026-07-15',
        daysRemaining: 7,
      },
    },
    {
      key: SubscriptionNotificationEventKeys.SUBSCRIPTION_EXPIRED,
      category: 'SYSTEM',
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      description: 'Subscription expired.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        expiredAt: '2026-07-15T00:00:00Z',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.SUBSCRIPTION_SUSPENDED,
      category: 'SYSTEM',
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      description: 'Subscription suspended.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        suspendedAt: '2026-06-24T10:00:00Z',
        reason: 'Non-payment',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.SUBSCRIPTION_REACTIVATED,
      category: 'SYSTEM',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Subscription reactivated from suspension.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        reactivatedAt: '2026-06-24T10:00:00Z',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.SUBSCRIPTION_CANCELLED,
      category: 'SYSTEM',
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      description: 'Subscription cancelled (terminal).',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        cancelledAt: '2026-06-24T10:00:00Z',
        reason: 'Customer request',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.PLAN_UPGRADED,
      category: 'SYSTEM',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Plan upgraded.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        fromPlanCode: 'STARTER',
        toPlanCode: 'GROWTH',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.PLAN_DOWNGRADED,
      category: 'SYSTEM',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Plan downgraded.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        fromPlanCode: 'GROWTH',
        toPlanCode: 'STARTER',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.PLAN_RENEWED,
      category: 'SYSTEM',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Subscription renewed for another cycle.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        planCode: 'GROWTH',
        renewedAt: '2026-06-24T10:00:00Z',
        nextRenewalAt: '2026-07-24T10:00:00Z',
      },
    },
    {
      key: SubscriptionNotificationEventKeys.USAGE_THRESHOLD_REACHED,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Usage threshold (80% or 90%) reached on a metered feature.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        featureKey: 'student_count',
        percent: 80,
        used: 400,
        limit: 500,
      },
    },
    {
      key: SubscriptionNotificationEventKeys.USAGE_LIMIT_EXCEEDED,
      category: 'SYSTEM',
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      description: 'Hard limit reached on a metered feature.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        featureKey: 'student_count',
        used: 500,
        limit: 500,
      },
    },
  ]);
