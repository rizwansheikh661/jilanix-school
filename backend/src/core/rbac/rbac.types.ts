/**
 * RBAC types — the shapes that flow between repositories, services, the
 * guard, and the rest of the app. Kept separate from `rbac.constants.ts`
 * so callers can import either independently.
 */

/**
 * A role row as exposed to services. Mirrors the `roles` table; we keep
 * the type narrow on purpose so accidentally returning audit columns to
 * the wire requires an explicit field add here.
 */
export interface RoleRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly scope: 'tenant' | 'global';
  readonly isSystem: boolean;
}

/**
 * A user-role assignment as exposed to services. `revokedAt` and `expiresAt`
 * are surfaced so callers can render "active until ..." or "revoked on ..."
 * without re-querying.
 */
export interface UserRoleRow {
  readonly id: string;
  readonly schoolId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly assignedAt: Date;
  readonly assignedBy: string | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
}

/** A permission catalog row. Wildcards never appear here (catalog is exact). */
export interface PermissionRow {
  readonly id: string;
  readonly key: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string | null;
}

/**
 * Result of a permission check. Carries enough diagnostic detail for the
 * guard to render a useful 403 (`details.required`, `details.missing`)
 * without leaking the *granted* permissions to the caller.
 */
export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly missing: readonly string[];
}

/**
 * Modes for `PermissionService.check`. `all` is the default — most routes
 * require every listed permission. `any` is for routes that admit
 * alternative permissions (e.g. "view OR edit").
 */
export type PermissionCheckMode = 'all' | 'any';
