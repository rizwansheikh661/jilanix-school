/**
 * RoleService — admin operations on roles and role assignments.
 *
 * Surface:
 *   - listRoles / getRoleByKey / getRoleById   — read paths.
 *   - createRole / updateRole / deleteRole     — admin write paths
 *     (system roles are protected — `isSystem` rows refuse mutation).
 *   - replacePermissions / addPermission /
 *     removePermission                         — grant editing; calls
 *     `PermissionService.invalidateRole` so the runtime cache picks up
 *     the change without waiting for the 5-minute TTL.
 *   - assignRoleToUser / revokeRoleFromUser    — UserRole lifecycle.
 *     Validates role/user scope alignment so a `tenant`-scope role can't
 *     be granted to a `global` user.
 *   - listActiveRoleIdsForUser                 — used by AuthService at
 *     login/refresh to populate the JWT `role_ids` claim.
 *
 * What this service does NOT do:
 *   - It does not enforce who is allowed to call these methods. Routes
 *     that expose them must declare `@RequirePermissions(Permissions.ROLES_*)`
 *     and let the global PermissionsGuard handle the 403.
 */
import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../../errors/domain-error';
import { isValidPermissionKey } from '../permission-match';
import { ValidationFailedError } from '../../errors/domain-error';
import {
  RoleAlreadyAssignedError,
  RoleAssignmentNotFoundError,
  RoleScopeMismatchError,
  UnknownRoleError,
} from '../rbac.errors';
import type { RoleRow, UserRoleRow } from '../rbac.types';
import { RoleRepository } from '../repositories/role.repository';
import { UserRoleRepository } from '../repositories/user-role.repository';
import { PermissionService } from './permission.service';

export interface CreateRoleArgs {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly scope: 'tenant' | 'global';
  readonly permissionKeys?: readonly string[];
  readonly createdBy?: string;
}

export interface UpdateRoleArgs {
  readonly name?: string;
  readonly description?: string | null;
  readonly updatedBy?: string;
}

export interface AssignRoleArgs {
  readonly schoolId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly userScope: 'tenant' | 'global';
  readonly assignedBy?: string;
  readonly expiresAt?: Date | null;
}

@Injectable()
export class RoleService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly userRoles: UserRoleRepository,
    private readonly permissions: PermissionService,
  ) {}

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  public listRoles(filter: { scope?: 'tenant' | 'global' } = {}): Promise<readonly RoleRow[]> {
    return this.roles.listAll(filter) as Promise<readonly RoleRow[]>;
  }

  public async getRoleById(id: string): Promise<RoleRow> {
    const row = await this.roles.findById(id);
    if (row === null) {
      throw new UnknownRoleError(id);
    }
    return row;
  }

  public async getRoleByKey(key: string): Promise<RoleRow> {
    const row = await this.roles.findByKey(key);
    if (row === null) {
      throw new UnknownRoleError(key);
    }
    return row;
  }

  public permissionsForRole(roleId: string): Promise<readonly string[]> {
    return this.roles.permissionsForRole(roleId);
  }

  /** Used by AuthService at login/refresh to populate the JWT claim. */
  public listActiveRoleIdsForUser(args: {
    schoolId: string;
    userId: string;
  }): Promise<readonly string[]> {
    return this.userRoles.listActiveRoleIdsForUser(args);
  }

  public listUserRoleAssignments(args: {
    schoolId: string;
    userId: string;
  }): Promise<readonly UserRoleRow[]> {
    return this.userRoles.listAllForUser(args);
  }

  // -------------------------------------------------------------------
  // Role CRUD
  // -------------------------------------------------------------------

  public async createRole(args: CreateRoleArgs): Promise<RoleRow> {
    if (args.permissionKeys !== undefined) {
      assertAllValidPermissionKeys(args.permissionKeys);
    }
    const existing = await this.roles.findByKey(args.key);
    if (existing !== null) {
      throw new ValidationFailedError([
        { path: 'key', code: 'DUPLICATE', message: `Role key "${args.key}" already exists.` },
      ]);
    }
    const role = await this.roles.create({
      key: args.key,
      name: args.name,
      description: args.description,
      scope: args.scope,
      isSystem: false,
      createdBy: args.createdBy,
    });
    if (args.permissionKeys !== undefined && args.permissionKeys.length > 0) {
      await this.roles.replacePermissionsForRole({
        roleId: role.id,
        permissionKeys: args.permissionKeys,
        createdBy: args.createdBy,
      });
      this.permissions.invalidateRole(role.id);
    }
    return role;
  }

  public async updateRole(id: string, patch: UpdateRoleArgs): Promise<RoleRow> {
    const existing = await this.roles.findById(id);
    if (existing === null) {
      throw new UnknownRoleError(id);
    }
    if (existing.isSystem) {
      throw new ValidationFailedError([
        { path: 'id', code: 'SYSTEM_ROLE_LOCKED', message: 'System roles cannot be edited.' },
      ]);
    }
    return this.roles.update(id, patch);
  }

  public async deleteRole(id: string): Promise<void> {
    const existing = await this.roles.findById(id);
    if (existing === null) {
      throw new UnknownRoleError(id);
    }
    if (existing.isSystem) {
      throw new ValidationFailedError([
        { path: 'id', code: 'SYSTEM_ROLE_LOCKED', message: 'System roles cannot be deleted.' },
      ]);
    }
    await this.roles.deleteById(id);
    this.permissions.invalidateRole(id);
  }

  // -------------------------------------------------------------------
  // Permission grants on a role
  // -------------------------------------------------------------------

  public async replacePermissions(args: {
    roleId: string;
    permissionKeys: readonly string[];
    actorId?: string;
  }): Promise<readonly string[]> {
    const role = await this.roles.findById(args.roleId);
    if (role === null) {
      throw new UnknownRoleError(args.roleId);
    }
    assertAllValidPermissionKeys(args.permissionKeys);
    await this.roles.replacePermissionsForRole({
      roleId: args.roleId,
      permissionKeys: args.permissionKeys,
      createdBy: args.actorId,
    });
    this.permissions.invalidateRole(args.roleId);
    return args.permissionKeys;
  }

  public async grantPermissionToRole(args: {
    roleId: string;
    permissionKey: string;
    actorId?: string;
  }): Promise<void> {
    const role = await this.roles.findById(args.roleId);
    if (role === null) {
      throw new UnknownRoleError(args.roleId);
    }
    if (!isValidPermissionKey(args.permissionKey)) {
      throw new ValidationFailedError([
        {
          path: 'permissionKey',
          code: 'INVALID_PERMISSION_KEY',
          message: `"${args.permissionKey}" is not a valid permission key.`,
        },
      ]);
    }
    await this.roles.addPermissionToRole({
      roleId: args.roleId,
      permissionKey: args.permissionKey,
      createdBy: args.actorId,
    });
    this.permissions.invalidateRole(args.roleId);
  }

  public async revokePermissionFromRole(args: {
    roleId: string;
    permissionKey: string;
  }): Promise<void> {
    await this.roles.removePermissionFromRole({
      roleId: args.roleId,
      permissionKey: args.permissionKey,
    });
    this.permissions.invalidateRole(args.roleId);
  }

  // -------------------------------------------------------------------
  // Role assignment to users
  // -------------------------------------------------------------------

  /**
   * Assign a role to a user. Idempotent: re-assigning re-activates a
   * revoked grant (rather than creating a duplicate row).
   *
   * Scope enforcement: a `tenant`-scope role may only be assigned to a
   * `tenant` user, and a `global`-scope role only to a `global` user.
   * Mixing the two is almost always a bug — a global super-admin shouldn't
   * be a tenant role at the same time.
   */
  public async assignRoleToUser(args: AssignRoleArgs): Promise<UserRoleRow> {
    const role = await this.roles.findById(args.roleId);
    if (role === null) {
      throw new UnknownRoleError(args.roleId);
    }
    if (role.scope !== args.userScope) {
      throw new RoleScopeMismatchError({
        roleKey: role.key,
        roleScope: role.scope,
        userScope: args.userScope,
      });
    }
    return this.userRoles.assign({
      schoolId: args.schoolId,
      userId: args.userId,
      roleId: args.roleId,
      assignedBy: args.assignedBy,
      expiresAt: args.expiresAt ?? null,
    });
  }

  /** Soft-revoke an assignment. Throws if no active assignment exists. */
  public async revokeRoleFromUser(args: {
    schoolId: string;
    userId: string;
    roleId: string;
    revokedBy?: string;
  }): Promise<void> {
    const count = await this.userRoles.revoke({
      schoolId: args.schoolId,
      userId: args.userId,
      roleId: args.roleId,
      revokedBy: args.revokedBy,
    });
    if (count === 0) {
      throw new RoleAssignmentNotFoundError({ userId: args.userId, roleId: args.roleId });
    }
  }

  /** Stricter assign: refuses to re-activate a revoked grant. */
  public async assignRoleToUserStrict(args: AssignRoleArgs): Promise<UserRoleRow> {
    const existing = await this.userRoles.findActiveAssignment({
      schoolId: args.schoolId,
      userId: args.userId,
      roleId: args.roleId,
    });
    if (existing !== null) {
      throw new RoleAlreadyAssignedError({ userId: args.userId, roleId: args.roleId });
    }
    return this.assignRoleToUser(args);
  }

  /** Revoke every active role assignment for a user (used on user disable). */
  public async revokeAllForUser(args: {
    schoolId: string;
    userId: string;
    revokedBy?: string;
  }): Promise<number> {
    return this.userRoles.revokeAllForUser(args);
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  /** Resolve a role by id-or-key. Used by `@RequireRole(...)` resolution. */
  public async resolveRoles(idsOrKeys: readonly string[]): Promise<readonly RoleRow[]> {
    if (idsOrKeys.length === 0) {
      return [];
    }
    const out: RoleRow[] = [];
    for (const idOrKey of idsOrKeys) {
      const row =
        (await this.roles.findById(idOrKey)) ?? (await this.roles.findByKey(idOrKey));
      if (row === null) {
        throw new NotFoundError('Role', idOrKey);
      }
      out.push(row);
    }
    return out;
  }
}

function assertAllValidPermissionKeys(keys: readonly string[]): void {
  const invalid = keys.filter((k) => !isValidPermissionKey(k));
  if (invalid.length > 0) {
    throw new ValidationFailedError(
      invalid.map((k) => ({
        path: 'permissionKeys',
        code: 'INVALID_PERMISSION_KEY',
        message: `"${k}" is not a valid permission key.`,
      })),
    );
  }
}
