/**
 * AcademicPermissionsSeeder — registers the Academic Foundation permission
 * catalog (17 keys) with the `permissions` table on every application boot.
 *
 * Mirrors `BuiltInRolesSeeder`'s permissions pass at
 * `rbac/built-in-roles.seeder.ts:64-76`, but limited to the per-domain
 * catalog. We do not touch role definitions here — `BUILT_IN_ROLE_DEFINITIONS`
 * already grants `*` to platform/school admins and `*.read` to auditors, so
 * the new keys are covered automatically.
 *
 * Idempotent: re-running with the same input upserts the description without
 * changing identity (`key` is the unique). Safe to run on every boot.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { ACADEMIC_PERMISSION_DESCRIPTIONS, AcademicPermissions } from './academic.constants';

@Injectable()
export class AcademicPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AcademicPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Academic permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(AcademicPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed academic permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: ACADEMIC_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Academic permissions seed complete: ${keys.length} keys upserted.`);
  }
}
