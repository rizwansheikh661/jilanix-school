/**
 * CommunicationCenterPermissionsSeeder — upserts the 9 Communication
 * Center permission keys with the `permissions` table on application
 * bootstrap. Mirrors `NotificationsPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  COMMUNICATION_CENTER_PERMISSION_DESCRIPTIONS,
  CommunicationCenterPermissions,
} from './communication-center.constants';

@Injectable()
export class CommunicationCenterPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommunicationCenterPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Communication Center permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(CommunicationCenterPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed communication-center permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: COMMUNICATION_CENTER_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Communication Center permissions seed complete: ${keys.length} keys upserted.`,
    );
  }
}
