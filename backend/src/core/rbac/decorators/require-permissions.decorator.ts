/**
 * RBAC decorators.
 *
 *   `@RequirePermissions('a', 'b')`
 *       AND-semantics: caller must have *every* permission. Most common.
 *
 *   `@RequireAnyPermission('a', 'b')`
 *       OR-semantics: caller must have *at least one* permission. Rare —
 *       use sparingly because it muddies the audit trail (you can't tell
 *       which permission gated the call from logs alone).
 *
 *   `@RequireRole('school_admin', 'principal')`
 *       OR-semantics on role keys. Prefer permissions to roles — roles are
 *       a coarse hierarchy and tend to grow. But it's the right hammer for
 *       routes whose protection is "must be a teacher", e.g. classroom
 *       attendance views.
 *
 * All three may stack on the same handler. The guard treats them with AND
 * across keys: every declared check must pass.
 *
 * Class-level decorators apply to every method on the controller; method-
 * level decorators OVERRIDE the class-level set (Reflector.getAllAndOverride
 * picks the closest scope). This matches Nest's convention so devs already
 * familiar with `@UseGuards()` semantics aren't surprised.
 */
import { SetMetadata } from '@nestjs/common';

import { RBAC_METADATA } from '../rbac.constants';

/** AND-mode: caller must have every listed permission. */
export const RequirePermissions = (
  ...permissions: readonly string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(RBAC_METADATA.PERMISSIONS_ALL, [...permissions]);

/** OR-mode: caller must have at least one of the listed permissions. */
export const RequireAnyPermission = (
  ...permissions: readonly string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(RBAC_METADATA.PERMISSIONS_ANY, [...permissions]);

/** OR-mode on role keys: caller must have one of the listed roles. */
export const RequireRole = (
  ...roleKeys: readonly string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(RBAC_METADATA.ROLES_ANY, [...roleKeys]);
