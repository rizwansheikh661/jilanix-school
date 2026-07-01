/**
 * ExaminationPermissionsSeeder — registers the 25 Examination permission
 * keys with the `permissions` table on every application boot. Mirrors
 * `TimetablePermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  EXAMINATION_PERMISSION_DESCRIPTIONS,
  ExaminationPermissions,
} from './examination.constants';

@Injectable()
export class ExaminationPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExaminationPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Examination permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(ExaminationPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(
          `malformed examination permission key: "${key}" \u2014 skipped.`,
        );
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: EXAMINATION_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Examination permissions seed complete: ${keys.length} keys upserted.`,
    );
  }
}
