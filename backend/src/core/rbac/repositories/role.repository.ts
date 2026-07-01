/**
 * RoleRepository — read/write paths for the `roles` and `role_permissions`
 * tables.
 *
 * The model is PLATFORM_ONLY so the tenantScopeExt does not inject a
 * schoolId filter. That's deliberate: a `tenant`-scoped role is still a
 * platform-defined object — only its *assignment* (UserRole) is tenant-
 * scoped. Tenant admins reading the catalog see global roles too; that
 * matches the seeded built-in set (school_admin, auditor, ...) which is
 * shared across all tenants.
 *
 * Wildcard grants: `permissionKey` is the source of truth on
 * `role_permissions`. `permissionId` is opportunistic — the seeder
 * resolves it for exact-key grants so the FK is non-null where possible,
 * but wildcards (`*`, `students.*`, `*.read`) leave it null.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { RoleRow } from '../rbac.types';

export interface RolePermissionRow {
  readonly roleId: string;
  readonly permissionKey: string;
  readonly permissionId: string | null;
}

export interface CreateRoleInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly scope: 'tenant' | 'global';
  readonly isSystem?: boolean;
  readonly createdBy?: string;
}

export interface UpdateRoleInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly updatedBy?: string;
}

@Injectable()
export class RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findById(id: string, tx?: PrismaTx): Promise<RoleRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.role.findUnique({ where: { id } });
    return row === null ? null : mapRole(row);
  }

  public async findByKey(key: string, tx?: PrismaTx): Promise<RoleRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.role.findUnique({ where: { key } });
    return row === null ? null : mapRole(row);
  }

  public async findManyByIds(
    ids: readonly string[],
    tx?: PrismaTx,
  ): Promise<readonly RoleRow[]> {
    if (ids.length === 0) {
      return [];
    }
    const reader = this.resolve(tx);
    const rows = await reader.role.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(mapRole);
  }

  /**
   * List all roles, optionally filtered by scope. Used by RoleService
   * for admin listing. Pagination is unnecessary at the role-catalog
   * scale (typically <50 roles per deployment).
   */
  public async listAll(filter: { scope?: 'tenant' | 'global' } = {}): Promise<readonly RoleRow[]> {
    const where = filter.scope === undefined ? {} : { scope: filter.scope };
    const reader = this.resolve();
    const rows = await reader.role.findMany({
      where,
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return rows.map(mapRole);
  }

  public async create(input: CreateRoleInput, tx?: PrismaTx): Promise<RoleRow> {
    const writer = this.resolve(tx);
    const row = await writer.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        scope: input.scope,
        isSystem: input.isSystem ?? false,
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
      },
    });
    return mapRole(row);
  }

  public async update(id: string, patch: UpdateRoleInput, tx?: PrismaTx): Promise<RoleRow> {
    const writer = this.resolve(tx);
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.updatedBy !== undefined) data.updatedBy = patch.updatedBy;
    const row = await writer.role.update({ where: { id }, data });
    return mapRole(row);
  }

  public async deleteById(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    await writer.role.delete({ where: { id } });
  }

  // -------------------------------------------------------------------
  // role_permissions
  // -------------------------------------------------------------------

  /**
   * All permission grants for a role, returned as the raw key strings
   * (wildcards intact). Order is stable for cache equality comparisons.
   */
  public async permissionsForRole(roleId: string, tx?: PrismaTx): Promise<readonly string[]> {
    const reader = this.resolve(tx);
    const rows = await reader.rolePermission.findMany({
      where: { roleId },
      select: { permissionKey: true },
      orderBy: { permissionKey: 'asc' },
    });
    return rows.map((r: { permissionKey: string }) => r.permissionKey);
  }

  /**
   * Bulk-fetch grants for several roles in one query — used by
   * PermissionService when a user has multiple roles. Returns a Map
   * keyed by roleId for cheap merging.
   */
  public async permissionsForRoles(
    roleIds: readonly string[],
    tx?: PrismaTx,
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (roleIds.length === 0) {
      return new Map();
    }
    const reader = this.resolve(tx);
    const rows = await reader.rolePermission.findMany({
      where: { roleId: { in: [...roleIds] } },
      select: { roleId: true, permissionKey: true },
      orderBy: [{ roleId: 'asc' }, { permissionKey: 'asc' }],
    });
    const out = new Map<string, string[]>();
    for (const id of roleIds) {
      out.set(id, []);
    }
    for (const r of rows) {
      const list = out.get(r.roleId);
      if (list !== undefined) {
        list.push(r.permissionKey);
      }
    }
    return out;
  }

  public async addPermissionToRole(
    args: { roleId: string; permissionKey: string; permissionId?: string | null; createdBy?: string },
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.rolePermission.upsert({
      where: { roleId_permissionKey: { roleId: args.roleId, permissionKey: args.permissionKey } },
      create: {
        roleId: args.roleId,
        permissionKey: args.permissionKey,
        permissionId: args.permissionId ?? null,
        createdBy: args.createdBy ?? null,
      },
      update: {
        permissionId: args.permissionId ?? null,
      },
    });
  }

  public async removePermissionFromRole(
    args: { roleId: string; permissionKey: string },
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.rolePermission.deleteMany({
      where: { roleId: args.roleId, permissionKey: args.permissionKey },
    });
  }

  /** Replace the entire permission set for a role — used by the seeder. */
  public async replacePermissionsForRole(
    args: { roleId: string; permissionKeys: readonly string[]; createdBy?: string },
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.rolePermission.deleteMany({ where: { roleId: args.roleId } });
    if (args.permissionKeys.length === 0) {
      return;
    }
    await writer.rolePermission.createMany({
      data: args.permissionKeys.map((key) => ({
        roleId: args.roleId,
        permissionKey: key,
        permissionId: null,
        createdBy: args.createdBy ?? null,
      })),
    });
  }
}

function mapRole(row: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: string;
  isSystem: boolean;
}): RoleRow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    scope: row.scope === 'global' ? 'global' : 'tenant',
    isSystem: row.isSystem,
  };
}
