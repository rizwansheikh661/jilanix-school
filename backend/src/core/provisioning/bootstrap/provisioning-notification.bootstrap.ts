/**
 * ProvisioningNotificationBootstrap — registers Sprint 14's provisioning-
 * lifecycle event keys with the NotificationEventRegistry on application
 * bootstrap, so per-tenant templates can render them through the dispatcher.
 *
 * Templates are NOT seeded — each school authors its own copy.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationEventDefinition } from '../../notifications/notification-events.catalog';
import { NotificationEventRegistry } from '../../notifications/notification-event.registry';
import { ProvisioningNotificationEventKeys } from '../provisioning.constants';

@Injectable()
export class ProvisioningNotificationBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProvisioningNotificationBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    for (const def of PROVISIONING_NOTIFICATION_DEFINITIONS) {
      this.registry.register(def);
    }
    this.logger.log(
      `Provisioning notification catalog registered: ${PROVISIONING_NOTIFICATION_DEFINITIONS.length.toString()} keys.`,
    );
  }
}

const PROVISIONING_NOTIFICATION_DEFINITIONS: readonly NotificationEventDefinition[] =
  Object.freeze([
    {
      key: ProvisioningNotificationEventKeys.SCHOOL_PROVISIONED,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'New tenant provisioned (admin welcome email + temp password)',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        adminEmail: 'admin@sunrise.local',
        adminTemporaryPassword: 'ChangeM3-Now!8q',
        trialEndDate: '2026-07-23',
      },
    },
    {
      key: ProvisioningNotificationEventKeys.SCHOOL_ACTIVATED,
      category: 'SYSTEM',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Tenant moved from TRIAL/SUSPENDED/EXPIRED to ACTIVE',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        activatedAt: '2026-06-23T10:00:00Z',
      },
    },
    {
      key: ProvisioningNotificationEventKeys.SCHOOL_SUSPENDED,
      category: 'SYSTEM',
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      description: 'Tenant suspended — all sessions revoked',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        suspendedAt: '2026-06-23T10:00:00Z',
        reason: 'Non-payment',
      },
    },
    {
      // Sprint 14.1 — emitted by the daily trial-expiry scheduler when a
      // school transitions TRIAL → EXPIRED. Mirrors TRIAL_EXPIRED but
      // namespaced at the school level for cross-cutting alerting.
      key: ProvisioningNotificationEventKeys.SCHOOL_EXPIRED,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'School trial expired — lifecycle transitioned to EXPIRED.',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        expiredAt: '2026-07-01T00:00:00Z',
        previousStatus: 'TRIAL',
      },
    },
    {
      // Sprint 14.1 — emitted by the daily trial-expiry scheduler when a
      // school's trial_end_date falls within the warning window.
      key: ProvisioningNotificationEventKeys.TRIAL_EXPIRING,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Trial expiring soon — N days remaining (warning window).',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        trialEndDate: '2026-07-01',
        daysRemaining: 7,
      },
    },
    {
      key: ProvisioningNotificationEventKeys.TRIAL_EXPIRY_WARNING,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Trial expires soon — N days remaining',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        trialEndDate: '2026-07-01',
        daysRemaining: 7,
      },
    },
    {
      key: ProvisioningNotificationEventKeys.TRIAL_EXPIRED,
      category: 'SYSTEM',
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      description: 'Trial period expired',
      sampleVariables: {
        schoolName: 'Sunrise Public School',
        expiredAt: '2026-07-01T00:00:00Z',
      },
    },
    {
      key: ProvisioningNotificationEventKeys.PASSWORD_RESET_REQUESTED,
      category: 'SYSTEM',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Password reset link issued',
      sampleVariables: {
        userEmail: 'admin@sunrise.local',
        resetLink: 'https://app.schoolos.example/reset?t=…',
        expiresAt: '2026-06-23T12:00:00Z',
      },
    },
  ]);
