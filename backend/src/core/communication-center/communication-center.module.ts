/**
 * CommunicationCenterModule — orchestration layer over Notifications +
 * Job Scheduler. Sprint 19 adds no new providers / dispatchers / storage
 * tables; every member here is either a thin orchestrator, a read-model,
 * or a bootstrap hook that registers a permission, feature flag, or job
 * handler with an existing registry.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { JobsModule } from '../jobs';
import { NotificationsModule } from '../notifications';
import { OutboxModule } from '../outbox';

import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { BroadcastController } from './broadcast/broadcast.controller';
import { BroadcastService } from './broadcast/broadcast.service';
import { CommunicationCenterFeatureFlagsBootstrap } from './communication-center-feature-flags.bootstrap';
import { CommunicationCenterMetricsRepository } from './communication-center-metrics.repository';
import { CommunicationCenterPermissionsSeeder } from './communication-center-permissions.seeder';
import { CommunicationDashboardController } from './dashboard/communication-dashboard.controller';
import { CommunicationDashboardService } from './dashboard/communication-dashboard.service';
import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringService } from './monitoring/monitoring.service';
import { ScheduleController } from './schedule/schedule.controller';
import { ScheduleService } from './schedule/schedule.service';
import { ScheduledBroadcastStartJobHandler } from './schedule/scheduled-broadcast-start.job-handler';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';
import { TimelineController } from './timeline/timeline.controller';
import { TimelineService } from './timeline/timeline.service';

@Module({
  imports: [FeatureFlagModule, NotificationsModule, JobsModule, OutboxModule],
  controllers: [
    CommunicationDashboardController,
    BroadcastController,
    TimelineController,
    MonitoringController,
    AnalyticsController,
    ScheduleController,
    SearchController,
  ],
  providers: [
    CommunicationCenterMetricsRepository,
    CommunicationDashboardService,
    BroadcastService,
    TimelineService,
    MonitoringService,
    AnalyticsService,
    ScheduleService,
    ScheduledBroadcastStartJobHandler,
    SearchService,
    CommunicationCenterPermissionsSeeder,
    CommunicationCenterFeatureFlagsBootstrap,
  ],
})
export class CommunicationCenterModule {}
