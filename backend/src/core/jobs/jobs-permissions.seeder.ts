import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { JOBS_PERMISSION_DESCRIPTIONS, JobsPermissions } from './jobs.constants';

@Injectable()
export class JobsPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Jobs permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(JobsPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || action === '') {
        this.logger.warn(`malformed jobs permission key "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: JOBS_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Jobs permissions seeded: ${keys.length} keys.`);
  }
}
