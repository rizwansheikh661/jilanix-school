import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { SCHOOL_PERMISSION_DESCRIPTIONS, SchoolPermissions } from './school.constants';

@Injectable()
export class SchoolPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchoolPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `School permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(SchoolPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) continue;
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: SCHOOL_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`School permissions seed complete: ${keys.length} keys upserted.`);
  }
}
