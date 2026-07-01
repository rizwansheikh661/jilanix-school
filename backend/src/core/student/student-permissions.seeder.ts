/**
 * StudentPermissionsSeeder — registers the Student permission catalog
 * with the `permissions` table on every application boot.
 *
 * Mirrors `AcademicPermissionsSeeder` exactly: idempotent upsert by `key`,
 * does not touch role definitions because `BUILT_IN_ROLE_DEFINITIONS`
 * already grants `*` to platform/school admins and `*.read` to auditors.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { STUDENT_PERMISSION_DESCRIPTIONS, StudentPermissions } from './student.constants';

@Injectable()
export class StudentPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(StudentPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Student permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(StudentPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed student permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: STUDENT_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Student permissions seed complete: ${keys.length} keys upserted.`);
  }
}
