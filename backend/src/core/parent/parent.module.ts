/**
 * ParentModule — composition root for the Parent domain. Wires the
 * controller, service, both repositories, and the permission seeder.
 *
 * Sprint 17 — extended with the Parent Portal Foundation:
 *   - `ParentRelationshipService`            — extracted link/unlink validation.
 *   - `ParentUserRepository` + `ParentUserService` — lifecycle FSM
 *     (PENDING_INVITE → ACTIVE → SUSPENDED → ARCHIVED).
 *   - `ParentInvitationService` + `ParentActivationOutboxHandler` —
 *     end-to-end invite + activate flow over the existing PasswordReset
 *     surface.
 *   - `ParentFeatureFlagsBootstrap`          — registers `parent_portal`.
 *
 * `ParentService` is exported so `AdmissionModule` can inject it for
 * the APPROVE transaction (Sprint 3 §state-machine).
 */
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FeatureFlagModule } from '../feature-flag';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { ParentActivationOutboxHandler } from './invitation/parent-activation.outbox-handler';
import { ParentInvitationService } from './invitation/parent-invitation.service';
import { ParentFeatureFlagsBootstrap } from './parent-feature-flags.bootstrap';
import { ParentNotificationEventsBootstrap } from './parent-notification-events.bootstrap';
import { ParentPermissionsSeeder } from './parent-permissions.seeder';
import { ParentUserController } from './parent-user/parent-user.controller';
import { ParentUserRepository } from './parent-user/parent-user.repository';
import { ParentUserService } from './parent-user/parent-user.service';
import { ParentController } from './parent/parent.controller';
import { ParentService } from './parent/parent.service';
import { ParentPreferenceController } from './preferences/parent-preference.controller';
import { ParentPreferenceService } from './preferences/parent-preference.service';
import { ParentRelationshipService } from './relationships/parent-relationship.service';
import { ParentStudentLinkRepository } from './repositories/parent-student-link.repository';
import { ParentRepository } from './repositories/parent.repository';

@Module({
  imports: [
    AuthModule,
    FeatureFlagModule,
    OutboxModule,
    NotificationsModule,
    ProvisioningModule,
  ],
  controllers: [ParentController, ParentUserController, ParentPreferenceController],
  providers: [
    ParentRepository,
    ParentStudentLinkRepository,
    ParentService,
    ParentRelationshipService,
    ParentUserRepository,
    ParentUserService,
    ParentInvitationService,
    ParentActivationOutboxHandler,
    ParentPreferenceService,
    ParentPermissionsSeeder,
    ParentFeatureFlagsBootstrap,
    ParentNotificationEventsBootstrap,
  ],
  exports: [
    ParentService,
    ParentRelationshipService,
    ParentUserService,
    ParentInvitationService,
    ParentPreferenceService,
  ],
})
export class ParentModule {}
