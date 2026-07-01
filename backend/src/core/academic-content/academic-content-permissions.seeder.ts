/**
 * AcademicContentPermissionsSeeder — registers the 29 academic-content
 * permission keys with the `permissions` table on every application boot.
 * Mirrors `EventsPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  ACADEMIC_CONTENT_PERMISSION_DESCRIPTIONS,
  AcademicContentPermissions,
} from './academic-content.constants';

@Injectable()
export class AcademicContentPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AcademicContentPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Academic-content permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(AcademicContentPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(
          `malformed academic-content permission key: "${key}" \u2014 skipped.`,
        );
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: ACADEMIC_CONTENT_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Academic-content permissions seed complete: ${keys.length} keys upserted.`,
    );
  }
}
