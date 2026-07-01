/**
 * BuiltInRolesSeeder — seeds the catalog of permissions and built-in
 * roles on every application boot.
 *
 * Behaviour:
 *   - Upserts every entry in `Permissions` (the cross-cutting baseline).
 *   - Upserts every built-in role (`platform_admin`, `school_admin`,
 *     `auditor`) and replaces its grant set so role definitions stay in
 *     sync with code without an explicit migration.
 *   - Calls `PermissionService.invalidateRole` per role so a running
 *     process picks up grant changes without waiting for the cache TTL.
 *
 * Why on every boot (not a one-shot migration)?
 *   - Built-in role definitions live in code. Treating the seed as
 *     authoritative means a deploy that changes a permission grant takes
 *     effect on restart — no follow-up migration step.
 *   - Tenant-defined roles (future) keep `isSystem=false` and are NOT
 *     touched by this seeder.
 *
 * Cost: a handful of upserts on a tiny table. Negligible at boot.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import {
  BUILT_IN_ROLE_DEFINITIONS,
  Permissions,
} from './rbac.constants';
import { PermissionRepository } from './repositories/permission.repository';
import { RoleRepository } from './repositories/role.repository';
import { PermissionService } from './services/permission.service';

@Injectable()
export class BuiltInRolesSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(BuiltInRolesSeeder.name);

  constructor(
    private readonly roles: RoleRepository,
    private readonly permissionsRepo: PermissionRepository,
    private readonly permissions: PermissionService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      // Don't crash the app on seed failure (e.g. DB read-only replica) —
      // log loudly and let ops decide. Without the seed, the app still
      // works; admins just can't rely on the built-in roles existing.
      this.logger.error(
        `RBAC seed failed; built-in roles may be missing: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    this.logger.log(
      `RBAC seed complete: ${BUILT_IN_ROLE_DEFINITIONS.length} built-in roles upserted.`,
    );
  }

  private async seedPermissions(): Promise<void> {
    for (const key of Object.values(Permissions)) {
      const [resource, action] = key.split('.', 2);
      if (resource === undefined || action === undefined) {
        // Should never happen given the shape of `Permissions`, but the
        // type system can't see it, and we'd rather skip than write a
        // garbage row.
        this.logger.warn(`malformed permission key in registry: "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({ key, resource, action });
    }
  }

  private async seedRoles(): Promise<void> {
    for (const def of BUILT_IN_ROLE_DEFINITIONS) {
      const existing = await this.roles.findByKey(def.key);
      const roleId =
        existing?.id ??
        (
          await this.roles.create({
            key: def.key,
            name: def.name,
            description: def.description,
            scope: def.scope,
            isSystem: true,
          })
        ).id;

      // For existing rows, refresh name/description so the seed is the
      // source of truth for the displayed copy.
      if (existing !== null) {
        await this.roles.update(existing.id, {
          name: def.name,
          description: def.description,
        });
      }

      await this.roles.replacePermissionsForRole({
        roleId,
        permissionKeys: def.permissions,
      });
      this.permissions.invalidateRole(roleId);
    }
  }
}
