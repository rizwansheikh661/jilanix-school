/**
 * ReportingPermissionsSeeder — registers the 38 reporting permission keys
 * with the `permissions` table on every application boot. Mirrors
 * `AcademicContentPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  REPORTING_PERMISSION_DESCRIPTIONS,
  ReportingPermissions,
} from './reporting.constants';

@Injectable()
export class ReportingPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportingPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Reporting permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(ReportingPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(
          `malformed reporting permission key: "${key}" \u2014 skipped.`,
        );
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: REPORTING_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Reporting permissions seed complete: ${keys.length} keys upserted.`,
    );
  }
}
