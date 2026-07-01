/**
 * SequencesPermissionsSeeder — upserts the 2 sequence-related permission keys
 * (`sequence.read`, `sequence.reset`) on every boot.
 *
 * Mirrors AcademicPermissionsSeeder. Built-in roles already cover the new
 * keys via `*` (platform/school admin) and `*.read` (auditor), so no role
 * grants are touched here.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { SEQUENCES_PERMISSION_DESCRIPTIONS, SequencesPermissions } from './sequences.constants';

@Injectable()
export class SequencesPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SequencesPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Sequences permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(SequencesPermissions);
    for (const key of keys) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        this.logger.warn(`malformed sequences permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: SEQUENCES_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Sequences permissions seed complete: ${keys.length} keys upserted.`);
  }
}
