import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { OUTBOX_PERMISSION_DESCRIPTIONS, OutboxPermissions } from './outbox.constants';

@Injectable()
export class OutboxPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Outbox permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(OutboxPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || action === '') {
        this.logger.warn(`malformed outbox permission key "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: OUTBOX_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Outbox permissions seeded: ${keys.length} keys.`);
  }
}
