/**
 * StudentModule — composition root for the Student domain. Wires the
 * controller, service, repository, and permission seeder.
 *
 * `StudentService` is exported so `AdmissionModule` can inject it and
 * call `create(args, tx)` from inside its own APPROVE transaction.
 * Mirrors Sprint 2 conventions; PrismaModule and RbacModule are
 * `@Global`, so we don't import them explicitly.
 *
 * Sprint 18 — extended with the Student Portal Foundation. Providers and
 * controllers for the StudentUser lifecycle, invitation, activation
 * outbox handler, and student-self preference surface are wired here.
 */
import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagModule } from '../feature-flag';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { SubscriptionModule } from '../subscription';
import { StudentActivationOutboxHandler } from './invitation/student-activation.outbox-handler';
import { StudentInvitationService } from './invitation/student-invitation.service';
import { StudentPreferenceController } from './preferences/student-preference.controller';
import { StudentPreferenceService } from './preferences/student-preference.service';
import { StudentRepository } from './repositories/student.repository';
import { StudentFeatureFlagsBootstrap } from './student-feature-flags.bootstrap';
import { StudentNotificationEventsBootstrap } from './student-notification-events.bootstrap';
import { StudentPermissionsSeeder } from './student-permissions.seeder';
import { StudentUserController } from './student-user/student-user.controller';
import { StudentUserRepository } from './student-user/student-user.repository';
import { StudentUserService } from './student-user/student-user.service';
import { StudentController } from './student/student.controller';
import { StudentService } from './student/student.service';

@Module({
  imports: [
    SubscriptionModule,
    AuthModule,
    FeatureFlagModule,
    OutboxModule,
    NotificationsModule,
    ProvisioningModule,
    AcademicModule,
  ],
  controllers: [StudentController, StudentUserController, StudentPreferenceController],
  providers: [
    StudentRepository,
    StudentService,
    StudentPermissionsSeeder,
    StudentFeatureFlagsBootstrap,
    StudentNotificationEventsBootstrap,
    StudentUserRepository,
    StudentUserService,
    StudentInvitationService,
    StudentActivationOutboxHandler,
    StudentPreferenceService,
  ],
  exports: [StudentService, StudentUserService, StudentInvitationService],
})
export class StudentModule {}
