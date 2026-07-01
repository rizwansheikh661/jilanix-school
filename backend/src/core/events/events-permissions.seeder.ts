/**
 * EventsPermissionsSeeder — registers the Events permission keys with the
 * `permissions` table on every application boot. Mirrors
 * `NotificationsPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  EVENTS_PERMISSION_DESCRIPTIONS,
  EventsPermissions,
} from './events.constants';

@Injectable()
export class EventsPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Events permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(EventsPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed events permission key: "${key}" \u2014 skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: EVENTS_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Events permissions seed complete: ${keys.length} keys upserted.`);
  }
}
