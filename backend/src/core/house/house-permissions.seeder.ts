import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { HOUSE_PERMISSION_DESCRIPTIONS, HousePermissions } from './house.constants';

@Injectable()
export class HousePermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(HousePermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `House permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(HousePermissions);
    for (const key of keys) {
      const parts = key.split('.');
      const resource = parts[0];
      const action = parts.slice(1).join('.');
      if (resource === undefined || action === '') continue;
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: HOUSE_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`House permissions seed complete: ${keys.length} keys upserted.`);
  }
}
