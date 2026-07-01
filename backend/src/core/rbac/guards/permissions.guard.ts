/**
 * PermissionsGuard — global guard that enforces the RBAC decorators.
 *
 * Lifecycle on a request:
 *   1. JwtAuthGuard ran first (registered in CoreModule before this one)
 *      and attached `AuthPrincipal` to `req.user`.
 *   2. This guard runs. It reads the three RBAC metadata keys
 *      (PERMISSIONS_ALL, PERMISSIONS_ANY, ROLES_ANY) from the handler +
 *      class via `Reflector.getAllAndOverride` (method-level beats class-
 *      level — Nest's standard semantics).
 *   3. If no metadata is present, the guard is a no-op. Routes without
 *      any RBAC declaration are gated by JwtAuthGuard alone (auth-only).
 *   4. If `@Public()` was set, JwtAuthGuard would have skipped and `req.user`
 *      would be undefined — we treat this as "no checks possible" and let
 *      the route through. This matches the principle that a public route
 *      can't claim permission requirements; if it does, that's a config bug.
 *   5. If any check fails, throws `MissingPermissionError` or
 *      `MissingRoleError` — both subclasses of `ForbiddenError` and
 *      mapped to 403 with `details.reason` for client routing.
 *
 * Permission resolution caching: handled by `PermissionService` (5-minute
 * TTL keyed by roleId). Role resolution caches role keys via `RoleService`
 * — but only the user's *id list* changes per principal, the *id→key*
 * mapping is essentially static, so we cache it in-process here.
 */
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthPrincipal } from '../../auth/auth.types';
import { IS_PUBLIC_METADATA_KEY } from '../../auth/token/token.constants';
import { RequestContextRegistry } from '../../request-context';
import { RBAC_METADATA } from '../rbac.constants';
import {
  MissingPermissionError,
  MissingRoleError,
} from '../rbac.errors';
import { PermissionService } from '../services/permission.service';
import { RoleService } from '../services/role.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  /**
   * Tiny in-process map from `roleId` to `roleKey`. Role key lookups are
   * essentially read-mostly — a row's key is immutable in practice. We
   * size cap at 1024 entries to bound memory; well above any realistic
   * deployment's role count.
   */
  private readonly roleKeyCache = new Map<string, string>();
  private readonly roleKeyCacheCap = 1024;

  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    private readonly roles: RoleService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_METADATA_KEY,
      targets,
    );
    if (isPublic === true) {
      // Public routes bypass everything. If a route stacks @Public() with
      // @RequirePermissions, the @Public() wins — the route is public.
      return true;
    }

    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      RBAC_METADATA.PERMISSIONS_ALL,
      targets,
    );
    const requiredAny = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      RBAC_METADATA.PERMISSIONS_ANY,
      targets,
    );
    const requiredRoles = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      RBAC_METADATA.ROLES_ANY,
      targets,
    );

    const hasAnyDeclaration =
      (required !== undefined && required.length > 0) ||
      (requiredAny !== undefined && requiredAny.length > 0) ||
      (requiredRoles !== undefined && requiredRoles.length > 0);

    if (!hasAnyDeclaration) {
      // Auth-only route. JwtAuthGuard already verified the JWT.
      return true;
    }

    const principal = this.extractPrincipal(context);
    if (principal === null) {
      // The route declared RBAC requirements but JwtAuthGuard didn't
      // attach a principal. Treat as 403 — anyone hitting this route
      // without a JWT shouldn't pass our permission gates.
      throw new MissingPermissionError({
        required: [...(required ?? []), ...(requiredAny ?? [])],
        missing: [...(required ?? []), ...(requiredAny ?? [])],
        mode: required !== undefined && required.length > 0 ? 'all' : 'any',
      });
    }

    if (required !== undefined && required.length > 0) {
      const result = await this.permissions.check(principal, required, 'all');
      if (!result.allowed) {
        throw new MissingPermissionError({
          required,
          missing: result.missing,
          mode: 'all',
        });
      }
    }

    if (requiredAny !== undefined && requiredAny.length > 0) {
      const result = await this.permissions.check(principal, requiredAny, 'any');
      if (!result.allowed) {
        throw new MissingPermissionError({
          required: requiredAny,
          missing: result.missing,
          mode: 'any',
        });
      }
    }

    if (requiredRoles !== undefined && requiredRoles.length > 0) {
      const ok = await this.principalHasAnyRole(principal, requiredRoles);
      if (!ok) {
        throw new MissingRoleError(requiredRoles);
      }
    }

    // Stamp the resolved permissions onto RequestContext so downstream
    // code (audit, feature checks) can read them without re-resolving.
    await this.stampContextPermissions(principal);

    return true;
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private extractPrincipal(context: ExecutionContext): AuthPrincipal | null {
    const req = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    return req.user ?? null;
  }

  private async principalHasAnyRole(
    principal: AuthPrincipal,
    requiredKeys: readonly string[],
  ): Promise<boolean> {
    if (principal.roleIds.length === 0) {
      return false;
    }
    // Resolve principal's role IDs to keys, populating our cache as we
    // go. Bulk-resolve uncached entries in one DB roundtrip.
    const uncached: string[] = [];
    for (const id of principal.roleIds) {
      if (!this.roleKeyCache.has(id)) {
        uncached.push(id);
      }
    }
    if (uncached.length > 0) {
      const rows = await this.roles.resolveRoles(uncached).catch(() => []);
      for (const r of rows) {
        if (this.roleKeyCache.size >= this.roleKeyCacheCap) {
          // Evict an arbitrary entry — Map preserves insertion order so
          // the oldest goes first. A proper LRU is overkill at this scale.
          const firstKey = this.roleKeyCache.keys().next().value;
          if (typeof firstKey === 'string') {
            this.roleKeyCache.delete(firstKey);
          }
        }
        this.roleKeyCache.set(r.id, r.key);
      }
    }

    const required = new Set(requiredKeys);
    for (const id of principal.roleIds) {
      const key = this.roleKeyCache.get(id);
      if (key !== undefined && required.has(key)) {
        return true;
      }
    }
    return false;
  }

  private async stampContextPermissions(principal: AuthPrincipal): Promise<void> {
    const ctx = RequestContextRegistry.peek();
    if (ctx === undefined) {
      return;
    }
    if (ctx.permissions.length > 0) {
      // Already stamped earlier in the request — don't redo the work.
      return;
    }
    const granted = await this.permissions.resolveForPrincipal(principal);
    RequestContextRegistry.upgrade({ permissions: [...granted] });
  }
}
