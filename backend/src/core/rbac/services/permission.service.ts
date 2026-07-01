/**
 * PermissionService — the runtime permission-check engine.
 *
 * Two responsibilities:
 *
 *   1. **Resolve** a principal's effective permission set from their role
 *      IDs. The IDs come from the JWT claim — fresh per login/refresh, so
 *      the access-token TTL bounds staleness. Inside this service we cache
 *      `roleId → permissions` in-process with a short TTL so a request
 *      with N roles costs at most N cache misses.
 *
 *   2. **Check** a required permission set against the resolved set, with
 *      `all` (AND) or `any` (OR) semantics. The check function returns a
 *      structured result (`{ allowed, missing }`) rather than a boolean,
 *      so the guard can render `details.missing` in the 403.
 *
 * What this service does NOT do:
 *
 *   - It does not enforce — `PermissionsGuard` does. Keeping enforcement
 *     in the guard means non-HTTP callers (jobs, seeds) can call `check()`
 *     directly without throwing.
 *
 *   - It does not load roleIds. Those ride on `AuthPrincipal.roleIds`,
 *     which `AuthService` populated at login time via `UserRoleRepository`.
 *
 * Cache invalidation: bump via `invalidateRole(roleId)` after a write to
 * `role_permissions`. The seeder calls this on every replace; future
 * tenant-admin role editors must call it too.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { AuthPrincipal } from '../../auth/auth.types';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '../permission-match';
import type { PermissionCheckMode, PermissionCheckResult } from '../rbac.types';
import { RoleRepository } from '../repositories/role.repository';

interface CacheEntry {
  readonly permissions: readonly string[];
  readonly expiresAt: number;
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private readonly cache = new Map<string, CacheEntry>();
  /**
   * 5 minutes. Long enough to absorb a burst of requests for the same
   * principal; short enough that an admin role-permission change is felt
   * within a coffee break. Production deployments that need
   * stronger guarantees flush via `invalidateRole` from the admin path.
   */
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(private readonly roles: RoleRepository) {}

  /**
   * Resolve the effective permission set for a list of role IDs, with
   * caching. Empty input returns an empty array immediately — the caller
   * is responsible for short-circuiting requests that don't need any
   * permissions (e.g. `@Public()`).
   */
  public async resolveForRoles(roleIds: readonly string[]): Promise<readonly string[]> {
    if (roleIds.length === 0) {
      return [];
    }

    const now = Date.now();
    const merged = new Set<string>();
    const missingFromCache: string[] = [];

    for (const id of roleIds) {
      const hit = this.cache.get(id);
      if (hit !== undefined && hit.expiresAt > now) {
        for (const p of hit.permissions) merged.add(p);
        continue;
      }
      missingFromCache.push(id);
    }

    if (missingFromCache.length > 0) {
      const fresh = await this.roles.permissionsForRoles(missingFromCache);
      const expiresAt = now + this.cacheTtlMs;
      for (const id of missingFromCache) {
        const list = fresh.get(id) ?? [];
        // Freeze the cache entry so an accidental mutation downstream
        // can't poison the shared map.
        this.cache.set(id, {
          permissions: Object.freeze([...list]),
          expiresAt,
        });
        for (const p of list) merged.add(p);
      }
    }

    return [...merged];
  }

  /** Convenience overload — most callers pass an `AuthPrincipal`. */
  public async resolveForPrincipal(principal: AuthPrincipal): Promise<readonly string[]> {
    return this.resolveForRoles(principal.roleIds);
  }

  /**
   * Run a permission check. Returns `{ allowed, missing }`:
   *   - `allowed=true`  → all/any match satisfied (or `required` is empty)
   *   - `allowed=false` → `missing` lists the entries that didn't match
   *
   * For `mode='any'`, `missing` is the full required set when the check
   * fails (since none matched). For `mode='all'`, `missing` is the subset
   * the principal lacks — useful for showing the user "you need: X, Y".
   */
  public async check(
    principal: AuthPrincipal,
    required: readonly string[],
    mode: PermissionCheckMode = 'all',
  ): Promise<PermissionCheckResult> {
    if (required.length === 0) {
      return { allowed: true, missing: [] };
    }
    const granted = await this.resolveForPrincipal(principal);

    if (mode === 'any') {
      const allowed = hasAnyPermission(granted, required);
      return {
        allowed,
        missing: allowed ? [] : [...required],
      };
    }

    if (hasAllPermissions(granted, required)) {
      return { allowed: true, missing: [] };
    }
    const missing = required.filter((r) => !hasPermission(granted, r));
    return { allowed: false, missing };
  }

  /**
   * Drop the cached permission set for one role. Call this whenever a
   * role's permission grants change (RoleService.replacePermissions, the
   * built-in role seeder, future admin tooling).
   */
  public invalidateRole(roleId: string): void {
    this.cache.delete(roleId);
    this.logger.debug(`permission cache invalidated role=${roleId}`);
  }

  /** Drop the entire cache — used on test reset and platform-wide changes. */
  public invalidateAll(): void {
    this.cache.clear();
  }
}
