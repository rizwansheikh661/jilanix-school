/**
 * AdmissionPermissionsSeeder — registers the Admission permission
 * catalog with the `permissions` table on every application boot.
 * Mirrors `StudentPermissionsSeeder` exactly.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { ADMISSION_PERMISSION_DESCRIPTIONS, AdmissionPermissions } from './admission.constants';

@Injectable()
export class AdmissionPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdmissionPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Admission permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(AdmissionPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed admission permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: ADMISSION_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Admission permissions seed complete: ${keys.length} keys upserted.`);
  }
}
