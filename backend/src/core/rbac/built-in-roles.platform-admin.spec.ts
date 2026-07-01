/**
 * Sprint 14.1 — PLATFORM_ADMIN built-in role definition.
 *
 * Scope:
 *   - Locks the cross-tenant super-admin grant set: the global `*` plus the
 *     scoped Sprint 14 wildcards (`provisioning.*`, `school.*`, `plan.*`,
 *     `communication.*`).
 *   - Asserts the seeder leaves every OTHER built-in role untouched
 *     (`school_admin`, `auditor`).
 *   - Asserts the seeded keys remain shape-valid per `isValidPermissionKey`
 *     so a typo can't sit in code undetected.
 */
import {
  BUILT_IN_ROLE_DEFINITIONS,
  PERMISSION_WILDCARD_ALL,
  RoleKeys,
} from './rbac.constants';
import { isValidPermissionKey } from './permission-match';

function findRole(key: string): {
  permissions: readonly string[];
  scope: string;
  name: string;
} {
  const def = BUILT_IN_ROLE_DEFINITIONS.find((d) => d.key === key);
  if (def === undefined) {
    throw new Error(`built-in role "${key}" missing from seeder catalog`);
  }
  return { permissions: def.permissions, scope: def.scope, name: def.name };
}

describe('BUILT_IN_ROLE_DEFINITIONS — Sprint 14.1 PLATFORM_ADMIN scope', () => {
  it('PLATFORM_ADMIN holds the cross-tenant super-grant plus Sprint 14 scoped wildcards', () => {
    const role = findRole(RoleKeys.PLATFORM_ADMIN);
    expect(role.scope).toBe('global');
    // Spec contract: every scoped wildcard from Patch 1 + the absolute `*`.
    expect(role.permissions).toEqual(
      expect.arrayContaining([
        PERMISSION_WILDCARD_ALL,
        'provisioning.*',
        'school.*',
        'plan.*',
        'communication.*',
      ]),
    );
    // Every seeded permission key must be shape-valid.
    for (const k of role.permissions) {
      expect(isValidPermissionKey(k)).toBe(true);
    }
  });

  it('does NOT modify school_admin or auditor permission sets', () => {
    // Sprint 14.1 contract: only PLATFORM_ADMIN's grants are touched.
    const schoolAdmin = findRole(RoleKeys.SCHOOL_ADMIN);
    expect(schoolAdmin.scope).toBe('tenant');
    expect(schoolAdmin.permissions).toEqual([PERMISSION_WILDCARD_ALL]);

    const auditor = findRole(RoleKeys.AUDITOR);
    expect(auditor.scope).toBe('tenant');
    expect(auditor.permissions).toEqual(['*.read', 'audit.read']);
  });
});
