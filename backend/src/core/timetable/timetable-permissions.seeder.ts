/**
 * TimetablePermissionsSeeder — registers the 23 Timetable permission
 * keys with the `permissions` table on every application boot. Mirrors
 * `AttendancePermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  TIMETABLE_PERMISSION_DESCRIPTIONS,
  TimetablePermissions,
} from './timetable.constants';

@Injectable()
export class TimetablePermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(TimetablePermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Timetable permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(TimetablePermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed timetable permission key: "${key}" \u2014 skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: TIMETABLE_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Timetable permissions seed complete: ${keys.length} keys upserted.`);
  }
}
