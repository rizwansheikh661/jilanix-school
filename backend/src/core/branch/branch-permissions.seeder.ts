import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { BRANCH_PERMISSION_DESCRIPTIONS, BranchPermissions } from './branch.constants';

@Injectable()
export class BranchPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(BranchPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(`Branch permission seed failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(BranchPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) continue;
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: BRANCH_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Branch permissions seed complete: ${keys.length} keys upserted.`);
  }
}
