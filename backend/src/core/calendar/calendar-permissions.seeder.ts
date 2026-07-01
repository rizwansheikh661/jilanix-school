import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  CALENDAR_PERMISSION_DESCRIPTIONS,
  CalendarPermissions,
} from './calendar.constants';

@Injectable()
export class CalendarPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CalendarPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Calendar permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(CalendarPermissions);
    for (const key of keys) {
      const parts = key.split('.');
      const resource = parts[0];
      const action = parts.slice(1).join('.');
      if (resource === undefined || action === '') continue;
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: CALENDAR_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Calendar permissions seed complete: ${keys.length} keys upserted.`);
  }
}
