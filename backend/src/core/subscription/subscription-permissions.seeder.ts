/**
 * SubscriptionPermissionsSeeder — registers the Sprint 15 subscription
 * permission keys (24) with the `permissions` table on every application
 * boot. Mirrors `ProvisioningPermissionsSeeder`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  SUBSCRIPTION_PERMISSION_DESCRIPTIONS,
  SubscriptionPermissions,
} from './subscription.constants';

@Injectable()
export class SubscriptionPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Subscription permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(SubscriptionPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed subscription permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: SUBSCRIPTION_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(
      `Subscription permissions seed complete: ${keys.length.toString()} keys upserted.`,
    );
  }
}
