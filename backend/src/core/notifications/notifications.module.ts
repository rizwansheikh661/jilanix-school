/**
 * NotificationsModule — composition root for Sprint 10
 * Notifications & Communication Foundation.
 *
 * Wave 2 ships the skeleton: feature-flag/outbox/jobs wiring + the
 * event registry only. Wave 3 adds the channel abstraction:
 *   - CommunicationChannelRegistry + 6 self-registering adapters
 *     (SES/SendGrid/MSG91/Twilio/WABA stubs + InApp real)
 *   - CommunicationProviderController for the admin listing endpoint
 *
 * Subsequent waves add:
 *   - notification-template      (header + immutable versions)
 *   - notification-preference    (per-user channel + category opt-outs)
 *   - communication-entitlement  (per-school quota engine)
 *   - event dispatcher + template renderer
 *   - notification-message + in-app inbox
 *   - notification.queued outbox handler + send job handler
 *   - notification-campaign      (broadcast with SCHOOL/BRANCH/CLASS/SECTION
 *                                  target resolvers; flag-gated)
 *   - permissions seeder (28 keys) + feature-flag bootstrap (13 keys)
 *
 * Imports:
 *   - FeatureFlagModule  — `module.notifications`, channel/provider gates.
 *   - OutboxModule       — transactional publishes (`notification.*`,
 *                           `comms.*`) + handler registry hook for
 *                           `notification.queued`.
 *   - JobsModule         — `JobEnqueueService` for send retries + DLQ via
 *                           the existing `JobDeadLetter` table.
 * AuditModule, RbacModule, PrismaModule are @Global so not imported here.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { JobsModule } from '../jobs';
import { OutboxModule } from '../outbox';
import { SchoolModule } from '../school/school.module';
import { SequencesModule } from '../sequences';
import { InAppAdapter } from './channels/adapters/in-app.adapter';
import { Msg91Adapter } from './channels/adapters/msg91.adapter';
import { SendgridAdapter } from './channels/adapters/sendgrid.adapter';
import { SesAdapter } from './channels/adapters/ses.adapter';
import { TwilioAdapter } from './channels/adapters/twilio.adapter';
import { WabaAdapter } from './channels/adapters/waba.adapter';
import { CommunicationChannelRegistry } from './channels/communication-channel.registry';
import { CommunicationProviderController } from './channels/communication-provider.controller';
import { EmailTransportService } from './channels/email-transport.service';
import {
  CommunicationEntitlementAdminController,
  CommunicationEntitlementController,
} from './communication-entitlement/communication-entitlement.controller';
import { CommunicationEntitlementRepository } from './communication-entitlement/communication-entitlement.repository';
import { CommunicationEntitlementService } from './communication-entitlement/communication-entitlement.service';
import { NotificationCampaignController } from './notification-campaign/notification-campaign.controller';
import { NotificationCampaignRepository } from './notification-campaign/notification-campaign.repository';
import { NotificationCampaignService } from './notification-campaign/notification-campaign.service';
import { NotificationQueuedOutboxHandler } from './notification-dispatcher/notification-queued.outbox-handler';
import { NotificationSendJobHandler } from './notification-dispatcher/notification-send.job-handler';
import { NotificationSendQueueBootstrap } from './notification-dispatcher/notification-send-queue.bootstrap';
import { NotificationEventController } from './notification-event/notification-event.controller';
import { NotificationEventDispatcherService } from './notification-event-dispatcher/notification-event-dispatcher.service';
import { NotificationEventRegistry } from './notification-event.registry';
import { NotificationInboxController } from './notification-inbox/notification-inbox.controller';
import { NotificationInboxService } from './notification-inbox/notification-inbox.service';
import { NotificationMessageController } from './notification-message/notification-message.controller';
import { NotificationMessageRepository } from './notification-message/notification-message.repository';
import { NotificationMessageService } from './notification-message/notification-message.service';
import { NotificationPreferenceController } from './notification-preference/notification-preference.controller';
import { NotificationPreferenceRepository } from './notification-preference/notification-preference.repository';
import { NotificationPreferenceService } from './notification-preference/notification-preference.service';
import { NotificationTemplateController } from './notification-template/notification-template.controller';
import { NotificationTemplateRepository } from './notification-template/notification-template.repository';
import { NotificationTemplateService } from './notification-template/notification-template.service';
import { NotificationsFeatureFlagsBootstrap } from './notifications-feature-flags.bootstrap';
import { NotificationsPermissionsSeeder } from './notifications-permissions.seeder';

@Module({
  imports: [FeatureFlagModule, OutboxModule, JobsModule, SequencesModule, SchoolModule],
  controllers: [
    CommunicationProviderController,
    NotificationPreferenceController,
    CommunicationEntitlementController,
    CommunicationEntitlementAdminController,
    NotificationTemplateController,
    NotificationMessageController,
    NotificationInboxController,
    NotificationCampaignController,
    NotificationEventController,
  ],
  providers: [
    NotificationEventRegistry,
    CommunicationChannelRegistry,
    EmailTransportService,
    SesAdapter,
    SendgridAdapter,
    Msg91Adapter,
    TwilioAdapter,
    WabaAdapter,
    InAppAdapter,
    NotificationPreferenceRepository,
    NotificationPreferenceService,
    CommunicationEntitlementRepository,
    CommunicationEntitlementService,
    NotificationTemplateRepository,
    NotificationTemplateService,
    NotificationEventDispatcherService,
    NotificationMessageRepository,
    NotificationMessageService,
    NotificationInboxService,
    NotificationQueuedOutboxHandler,
    NotificationSendJobHandler,
    NotificationSendQueueBootstrap,
    NotificationCampaignRepository,
    NotificationCampaignService,
    NotificationsPermissionsSeeder,
    NotificationsFeatureFlagsBootstrap,
  ],
  exports: [
    NotificationEventRegistry,
    CommunicationChannelRegistry,
    NotificationPreferenceService,
    CommunicationEntitlementService,
    NotificationTemplateService,
    NotificationTemplateRepository,
    NotificationEventDispatcherService,
    NotificationMessageRepository,
    NotificationMessageService,
    NotificationCampaignService,
    NotificationCampaignRepository,
  ],
})
export class NotificationsModule {}
