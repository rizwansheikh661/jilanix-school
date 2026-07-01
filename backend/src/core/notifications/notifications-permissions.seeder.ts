/**
 * NotificationsPermissionsSeeder — registers the Notifications permission
 * keys with the `permissions` table on every application boot. Mirrors
 * `FeesPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  NOTIFICATIONS_PERMISSION_DESCRIPTIONS,
  NotificationsPermissions,
} from './notifications.constants';

@Injectable()
export class NotificationsPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Notifications permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(NotificationsPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed notifications permission key: "${key}" \u2014 skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: NOTIFICATIONS_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Notifications permissions seed complete: ${keys.length} keys upserted.`,
    );
  }
}
