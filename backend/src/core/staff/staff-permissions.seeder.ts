/**
 * StaffPermissionsSeeder — registers the 24 Staff-domain permission keys
 * with the `permissions` table on every application boot. Mirrors
 * `AdmissionPermissionsSeeder` exactly.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { STAFF_PERMISSION_DESCRIPTIONS, StaffPermissions } from './staff.constants';

@Injectable()
export class StaffPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(StaffPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Staff permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(StaffPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed staff permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: STAFF_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Staff permissions seed complete: ${keys.length} keys upserted.`);
  }
}
