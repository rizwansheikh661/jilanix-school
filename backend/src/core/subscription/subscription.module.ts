/**
 * SubscriptionModule — composition root for Sprint 15 SaaS Subscription &
 * Plan Management Foundation.
 *
 * Wires:
 *   - Permissions seeder (24 keys) and feature-flag / notification bootstraps.
 *   - plan-feature submodule (matrix CRUD + idempotent seeder for 14 keys x
 *     3 plans).
 *   - subscription submodule (lifecycle service, repo, history repo, super-
 *     admin + self controllers, state machine pure module).
 *   - usage submodule (school-usage repo + service, usage-event ledger,
 *     threshold-state edge-trigger repo, super-admin + self controllers).
 *   - SubscriptionGuardService — entry point feature modules use to gate
 *     consumption and dispatch threshold notifications.
 *   - Daily expiry scan job (handler + idempotent JobDefinition bootstrap).
 *
 * Imports:
 *   - FeatureFlagModule — ENFORCE_LIMITS / NOTIFY_THRESHOLDS / ALLOW_PLAN_CHANGE.
 *   - OutboxModule      — lifecycle + threshold + recompute publishers.
 *   - JobsModule        — JobHandlerRegistry + JobDefinitionRepository for the
 *                         daily expiry scan.
 *   - NotificationsModule — NotificationEventRegistry for the 11-key catalog
 *                           bootstrap.
 *
 * AuditModule, RbacModule, PrismaModule are @Global so not imported here.
 *
 * Wired into CoreModule AFTER ProvisioningModule because the orchestrator
 * pulls in SubscriptionService + SchoolUsageService.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox';
import { SubscriptionFeatureFlagsBootstrap } from './bootstrap/subscription-feature-flags.bootstrap';
import { SubscriptionNotificationBootstrap } from './bootstrap/subscription-notification.bootstrap';
import { SubscriptionGuardService } from './guard/subscription-guard.service';
import { SubscriptionWriteGuardInterceptor } from './guard/subscription-write-guard.interceptor';
import { SubscriptionExpiryJobHandler } from './jobs/subscription-expiry.job-handler';
import { SubscriptionExpiryScheduleBootstrap } from './jobs/subscription-expiry.schedule.bootstrap';
import { PlanFeatureController } from './plan-feature/plan-feature.controller';
import { PlanFeatureRepository } from './plan-feature/plan-feature.repository';
import { PlanFeatureSeeder } from './plan-feature/plan-feature.seeder';
import { PlanFeatureService } from './plan-feature/plan-feature.service';
import { SubscriptionPermissionsSeeder } from './subscription-permissions.seeder';
import { SubscriptionHistoryRepository } from './subscription/subscription-history.repository';
import { SubscriptionRepository } from './subscription/subscription.repository';
import { SubscriptionSelfController } from './subscription/subscription-self.controller';
import { SubscriptionController } from './subscription/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';
import { SchoolUsageRepository } from './usage/school-usage.repository';
import { SchoolUsageService } from './usage/school-usage.service';
import { UsageEventRepository } from './usage/usage-event.repository';
import { UsageSelfController } from './usage/usage-self.controller';
import { UsageController } from './usage/usage.controller';
import { UsageThresholdStateRepository } from './usage/usage-threshold-state.repository';

@Module({
  imports: [FeatureFlagModule, OutboxModule, JobsModule, NotificationsModule],
  controllers: [
    PlanFeatureController,
    SubscriptionController,
    SubscriptionSelfController,
    UsageController,
    UsageSelfController,
  ],
  providers: [
    // Bootstraps + seeders
    SubscriptionPermissionsSeeder,
    SubscriptionFeatureFlagsBootstrap,
    SubscriptionNotificationBootstrap,
    // plan-feature submodule
    PlanFeatureRepository,
    PlanFeatureService,
    PlanFeatureSeeder,
    // subscription submodule
    SubscriptionRepository,
    SubscriptionHistoryRepository,
    SubscriptionService,
    // usage submodule
    SchoolUsageRepository,
    UsageEventRepository,
    UsageThresholdStateRepository,
    SchoolUsageService,
    // guard
    SubscriptionGuardService,
    SubscriptionWriteGuardInterceptor,
    // jobs
    SubscriptionExpiryJobHandler,
    SubscriptionExpiryScheduleBootstrap,
  ],
  exports: [
    PlanFeatureService,
    PlanFeatureRepository,
    SubscriptionService,
    SubscriptionRepository,
    SchoolUsageService,
    SchoolUsageRepository,
    SubscriptionGuardService,
    SubscriptionWriteGuardInterceptor,
  ],
})
export class SubscriptionModule {}
