import { Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { FeatureFlagAuditController } from './feature-flag-audit/feature-flag-audit.controller';
import { FeatureFlagDefinitionController } from './feature-flag-definition/feature-flag-definition.controller';
import { FeatureFlagPermissionsSeeder } from './feature-flag-permissions.seeder';
import { FeatureFlagRolloutController } from './feature-flag-rollout/feature-flag-rollout.controller';
import { FeatureFlagTenantOverrideController } from './feature-flag-tenant-override/feature-flag-tenant-override.controller';
import { FeatureFlagAuditRepository } from './repositories/feature-flag-audit.repository';
import { FeatureFlagDefinitionRepository } from './repositories/feature-flag-definition.repository';
import { FeatureFlagPlanMapRepository } from './repositories/feature-flag-plan-map.repository';
import { FeatureFlagRolloutRepository } from './repositories/feature-flag-rollout.repository';
import { FeatureFlagTenantOverrideRepository } from './repositories/feature-flag-tenant-override.repository';
import { FeatureFlagCacheInvalidator } from './services/feature-flag-cache.invalidator';
import { FeatureFlagCacheService } from './services/feature-flag-cache.service';
import { FeatureFlagRegistry } from './services/feature-flag.registry';
import { FeatureFlagService } from './services/feature-flag.service';

@Module({
  imports: [OutboxModule],
  controllers: [
    FeatureFlagDefinitionController,
    FeatureFlagTenantOverrideController,
    FeatureFlagRolloutController,
    FeatureFlagAuditController,
  ],
  providers: [
    FeatureFlagDefinitionRepository,
    FeatureFlagPlanMapRepository,
    FeatureFlagTenantOverrideRepository,
    FeatureFlagRolloutRepository,
    FeatureFlagAuditRepository,
    FeatureFlagCacheService,
    FeatureFlagCacheInvalidator,
    FeatureFlagRegistry,
    FeatureFlagService,
    FeatureFlagPermissionsSeeder,
  ],
  exports: [FeatureFlagService, FeatureFlagRegistry, FeatureFlagCacheService],
})
export class FeatureFlagModule {}
