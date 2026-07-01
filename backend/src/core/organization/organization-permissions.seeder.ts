import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  ORGANIZATION_PERMISSION_DESCRIPTIONS,
  OrganizationPermissions,
} from './organization.constants';

@Injectable()
export class OrganizationPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrganizationPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Organization permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(OrganizationPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) continue;
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: ORGANIZATION_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Organization permissions seed complete: ${keys.length} keys upserted.`);
  }
}
