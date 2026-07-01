/**
 * FeesPermissionsSeeder — registers the 40 Fees permission keys with the
 * `permissions` table on every application boot. Mirrors
 * `ExaminationPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { FEES_PERMISSION_DESCRIPTIONS, FeesPermissions } from './fees.constants';

@Injectable()
export class FeesPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeesPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Fees permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(FeesPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed fees permission key: "${key}" \u2014 skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: FEES_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Fees permissions seed complete: ${keys.length} keys upserted.`);
  }
}
