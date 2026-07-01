/**
 * BillingNotificationEventsBootstrap — registers the 9
 * `BillingNotificationEventKeys` with Sprint 10's `NotificationEventRegistry`
 * at application bootstrap. Mirrors `AcademicContentNotificationBootstrap`.
 *
 * Notes on audience/priority mapping (the notifications module ships fewer
 * dimensions than the billing spec asks for):
 *
 *   - `NotificationAudienceValue` only has USER | PARENT | STUDENT. SCHOOL_ADMIN
 *     and PLATFORM_ADMIN are mapped onto USER; the recipient resolver wired
 *     in a later sprint will narrow that down by role. See TODO below.
 *   - `NotificationPriorityValue` only has LOW | MEDIUM | HIGH | CRITICAL.
 *     The spec's `NORMAL` is mapped onto MEDIUM.
 *   - `NotificationEventDefinition` has no `defaultChannels` field — that is
 *     resolved per-template at dispatch time. We surface the desired default
 *     channel set in `sampleVariables.defaultChannels` purely for operator
 *     reference + future migration.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationEventDefinition } from '../../notifications/notification-events.catalog';
import { NotificationEventRegistry } from '../../notifications/notification-event.registry';
import type {
  NotificationAudienceValue,
  NotificationChannelValue,
  NotificationPriorityValue,
} from '../../notifications/notifications.constants';
import { BillingNotificationEventKeys } from '../billing.constants';

// TODO(billing): tighten audience to SCHOOL_ADMIN / PLATFORM_ADMIN once the
// notifications module grows beyond USER | PARENT | STUDENT. For now every
// billing event lands on USER and relies on the recipient resolver to filter.
const SCHOOL_ADMIN_AUDIENCE: NotificationAudienceValue = 'USER';
const PLATFORM_ADMIN_AUDIENCE: NotificationAudienceValue = 'USER';

interface BillingEventSpec {
  readonly key: string;
  readonly defaultPriority: NotificationPriorityValue;
  readonly audience: NotificationAudienceValue;
  readonly defaultChannels: readonly NotificationChannelValue[];
  readonly description: string;
}

const BILLING_EVENT_SPECS: readonly BillingEventSpec[] = Object.freeze([
  {
    key: BillingNotificationEventKeys.BILLING_INVOICE_ISSUED,
    defaultPriority: 'MEDIUM',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP'],
    description: 'A new invoice was issued for the school subscription.',
  },
  {
    key: BillingNotificationEventKeys.BILLING_PAYMENT_DUE,
    defaultPriority: 'HIGH',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP', 'SMS'],
    description: 'An invoice payment is due soon (within billing-lead window).',
  },
  {
    key: BillingNotificationEventKeys.BILLING_PAYMENT_RECEIVED,
    defaultPriority: 'LOW',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP'],
    description: 'A payment was received and applied to an invoice.',
  },
  {
    key: BillingNotificationEventKeys.BILLING_PAYMENT_FAILED,
    defaultPriority: 'HIGH',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP', 'SMS'],
    description: 'A payment attempt failed.',
  },
  {
    key: BillingNotificationEventKeys.BILLING_PAYMENT_PENDING_VERIFICATION,
    defaultPriority: 'MEDIUM',
    audience: PLATFORM_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP'],
    description: 'A manual payment is awaiting platform-admin verification.',
  },
  {
    key: BillingNotificationEventKeys.BILLING_INVOICE_OVERDUE,
    defaultPriority: 'HIGH',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP', 'SMS'],
    description: 'An invoice has gone overdue (past due-date + grace).',
  },
  {
    key: BillingNotificationEventKeys.BILLING_REFUND_PROCESSED,
    defaultPriority: 'MEDIUM',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP'],
    description: 'A refund was processed against a previously settled payment.',
  },
  {
    key: BillingNotificationEventKeys.BILLING_CREDIT_NOTE_ISSUED,
    defaultPriority: 'MEDIUM',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP'],
    description: 'A credit note was issued against an invoice.',
  },
  {
    key: BillingNotificationEventKeys.BILLING_GRACE_PERIOD_STARTED,
    defaultPriority: 'HIGH',
    audience: SCHOOL_ADMIN_AUDIENCE,
    defaultChannels: ['EMAIL', 'IN_APP'],
    description: 'Grace period started; service will pause if unpaid.',
  },
]);

const SAMPLE_BASE = {
  schoolId: '01HZ-SCHOOL-ID',
  accountId: '01HZ-ACCOUNT-ID',
  invoiceId: '01HZ-INVOICE-ID',
  invoiceNumber: 'INV-2026-27-000042',
  amountDue: 9999,
  currency: 'INR',
  dueDate: '2026-07-15',
} as const;

@Injectable()
export class BillingNotificationEventsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingNotificationEventsBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    const definitions: NotificationEventDefinition[] = BILLING_EVENT_SPECS.map(
      (spec): NotificationEventDefinition => ({
        key: spec.key,
        category: 'SYSTEM',
        defaultPriority: spec.defaultPriority,
        audience: spec.audience,
        description: spec.description,
        sampleVariables: {
          ...SAMPLE_BASE,
          defaultChannels: spec.defaultChannels,
        },
      }),
    );
    for (const def of definitions) {
      this.registry.register(def);
    }
    this.logger.log(
      `Billing notification catalog registered: ${definitions.length.toString()} keys.`,
    );
  }
}
