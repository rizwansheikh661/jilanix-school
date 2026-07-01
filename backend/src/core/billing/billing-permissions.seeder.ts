/**
 * BillingPermissionsSeeder — registers the Sprint 20 billing permission keys
 * with the `permissions` table on every application boot. Mirrors
 * SubscriptionPermissionsSeeder.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import { BILLING_PERMISSION_DESCRIPTIONS, BillingPermissions } from './billing.constants';

@Injectable()
export class BillingPermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingPermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Billing permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(BillingPermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || resource.length === 0 || action.length === 0) {
        this.logger.warn(`malformed billing permission key: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: BILLING_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`Billing permissions seed complete: ${keys.length.toString()} keys upserted.`);
  }
}
