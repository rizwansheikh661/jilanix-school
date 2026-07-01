/**
 * ProvisioningModule — composition root for Sprint 14 Super-Admin & School-
 * Provisioning Foundation. Waves 2-9 wire the Plan, school-lifecycle,
 * trial-management, orchestrator, and password-reset sub-modules end-to-end.
 *
 * Imports:
 *   - FeatureFlagModule — `module.provisioning` gating (Wave 8 bootstrap).
 *   - OutboxModule      — plan / school / trial / password-reset publishers.
 *   - SchoolModule      — SchoolRootRepository/Service consumed by lifecycle
 *                         + orchestrator.
 *
 * AuditModule, RbacModule, PrismaModule are @Global so not imported here.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox';
import { SchoolModule } from '../school/school.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ProvisioningFeatureFlagsBootstrap } from './bootstrap/provisioning-feature-flags.bootstrap';
import { ProvisioningNotificationBootstrap } from './bootstrap/provisioning-notification.bootstrap';
import { PlanController } from './plan/plan.controller';
import { PlanRepository } from './plan/plan.repository';
import { PlanSeeder } from './plan/plan.seeder';
import { PlanService } from './plan/plan.service';
import { ProvisioningPermissionsSeeder } from './provisioning-permissions.seeder';
import { SchoolLifecycleController } from './lifecycle/school-lifecycle.controller';
import { SchoolLifecycleService } from './lifecycle/school-lifecycle.service';
import { ProvisioningRunRepository } from './orchestrator/provisioning-run.repository';
import { SchoolProvisioningController } from './orchestrator/school-provisioning.controller';
import { SchoolProvisioningService } from './orchestrator/school-provisioning.service';
import { PasswordResetController } from './password-reset/password-reset.controller';
import { PasswordResetNotificationOutboxHandler } from './password-reset/password-reset-notification.outbox-handler';
import { PasswordResetRepository } from './password-reset/password-reset.repository';
import { PasswordResetService } from './password-reset/password-reset.service';
import { TrialController } from './trial/trial.controller';
import { TrialExpiryJobHandler } from './trial/trial-expiry.job-handler';
import { TrialExpiryScheduleBootstrap } from './trial/trial-expiry.schedule.bootstrap';
import { TrialService } from './trial/trial.service';

@Module({
  imports: [FeatureFlagModule, OutboxModule, SchoolModule, JobsModule, NotificationsModule, SubscriptionModule],
  controllers: [
    PlanController,
    SchoolLifecycleController,
    SchoolProvisioningController,
    TrialController,
    PasswordResetController,
  ],
  providers: [
    ProvisioningPermissionsSeeder,
    ProvisioningFeatureFlagsBootstrap,
    ProvisioningNotificationBootstrap,
    // Plan sub-module
    PlanRepository,
    PlanService,
    PlanSeeder,
    // Lifecycle sub-module (Wave 4)
    SchoolLifecycleService,
    // Trial sub-module (Wave 5)
    TrialService,
    TrialExpiryJobHandler,
    TrialExpiryScheduleBootstrap,
    // Orchestrator sub-module (Wave 6)
    ProvisioningRunRepository,
    SchoolProvisioningService,
    // Password reset sub-module (Wave 7)
    PasswordResetRepository,
    PasswordResetService,
    PasswordResetNotificationOutboxHandler,
  ],
  exports: [
    PlanService,
    PlanRepository,
    SchoolLifecycleService,
    TrialService,
    SchoolProvisioningService,
    PasswordResetService,
    // Sprint 17 — exported so ParentUserService can cancel outstanding
    // reset tokens on archive, and ParentInvitationService can stage a
    // reset token alongside the invitation write.
    PasswordResetRepository,
  ],
})
export class ProvisioningModule {}
