import { Module } from '@nestjs/common';

import { SubscriptionModule } from '../subscription';
import { BranchController } from './branch/branch.controller';
import { BranchService } from './branch/branch.service';
import { BranchPermissionsSeeder } from './branch-permissions.seeder';
import { BranchRepository } from './repositories/branch.repository';
import { BranchSettingsRepository } from './repositories/branch-settings.repository';
import { BranchSettingsController } from './settings/branch-settings.controller';
import { BranchSettingsService } from './settings/branch-settings.service';

@Module({
  imports: [SubscriptionModule],
  controllers: [BranchController, BranchSettingsController],
  providers: [
    BranchRepository,
    BranchSettingsRepository,
    BranchService,
    BranchSettingsService,
    BranchPermissionsSeeder,
  ],
  exports: [BranchService, BranchSettingsService, BranchRepository],
})
export class BranchModule {}
