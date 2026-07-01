/**
 * ProvisioningPermissionsSeeder — registers the Sprint 14 provisioning
 * permission keys with the `permissions` table on every application boot.
 * Mirrors the school / reporting permission seeders.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  PROVISIONING_PERMISSION_DESCRIPTIONS,
  ProvisioningPermissions,
} from './provisioning.constants';

@Injectable()
export class ProvisioningPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProvisioningPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Provisioning permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(ProvisioningPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed provisioning permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: PROVISIONING_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Provisioning permissions seed complete: ${keys.length.toString()} keys upserted.`,
    );
  }
}
