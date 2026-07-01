/**
 * ParentPermissionsSeeder — registers the Parent permission catalog
 * with the `permissions` table on every application boot. Mirrors
 * `StudentPermissionsSeeder` exactly.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { PARENT_PERMISSION_DESCRIPTIONS, ParentPermissions } from './parent.constants';

@Injectable()
export class ParentPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ParentPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Parent permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(ParentPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed parent permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: PARENT_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Parent permissions seed complete: ${keys.length} keys upserted.`);
  }
}
