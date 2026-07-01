/**
 * AttendancePermissionsSeeder — registers the 21 Attendance permission
 * keys with the `permissions` table on every application boot. Mirrors
 * `StaffPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  ATTENDANCE_PERMISSION_DESCRIPTIONS,
  AttendancePermissions,
} from './attendance.constants';

@Injectable()
export class AttendancePermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendancePermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Attendance permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(AttendancePermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed attendance permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: ATTENDANCE_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Attendance permissions seed complete: ${keys.length} keys upserted.`);
  }
}
