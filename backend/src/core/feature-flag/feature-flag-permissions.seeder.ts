import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  FEATURE_FLAG_PERMISSION_DESCRIPTIONS,
  FeatureFlagPermissions,
} from './feature-flag.constants';

@Injectable()
export class FeatureFlagPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeatureFlagPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Feature-flag permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(FeatureFlagPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || action === '') {
        this.logger.warn(`malformed feature-flag permission key "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: FEATURE_FLAG_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Feature-flag permissions seeded: ${keys.length} keys.`);
  }
}
