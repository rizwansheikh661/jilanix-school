/**
 * RBAC constants — metadata keys for the decorator/guard wire-up,
 * built-in role keys, and the seeded permission catalog.
 *
 * Design notes:
 *
 *   - **Permission key shape**: `<resource>.<action>` (snake-or-kebab inside
 *     each segment, e.g. `students.read`, `attendance.bulk_mark`). The
 *     matcher only understands two-segment keys plus wildcards — keep it
 *     simple. Multi-tenant resource names that need disambiguation should
 *     use a longer resource (e.g. `billing.invoices.read`) — the matcher
 *     treats anything before the *first* `.` as the resource.
 *
 *   - **Wildcards**: `*` (super), `<resource>.*`, `*.<action>`. We don't
 *     allow internal wildcards like `students.*.read`. See `permission-match.ts`.
 *
 *   - **Built-in role keys**: stable strings consumed by both the seed and
 *     the decorator (`@RequireRole(RoleKeys.PRINCIPAL)`). Renaming one is a
 *     breaking schema change.
 *
 *   - **Seed catalog**: minimal foundation set. Feature modules contribute
 *     additional permissions in their own seeders — this file isn't the
 *     full catalog, just the cross-cutting baseline that lets RBAC bootstrap.
 */

/**
 * Reflector keys for the RBAC decorators.
 *
 * Three keys, three orthogonal checks:
 *   - `permissions_all` → user must have *every* listed permission.
 *   - `permissions_any` → user must have *at least one* listed permission.
 *   - `roles_any`        → user must have *at least one* role with one of
 *     the listed `key` values.
 *
 * A handler may stack any combination; the guard treats them with AND
 * across keys (all_required AND any_required AND any_role).
 */
export const RBAC_METADATA = {
  PERMISSIONS_ALL: 'rbac:permissions_all',
  PERMISSIONS_ANY: 'rbac:permissions_any',
  ROLES_ANY: 'rbac:roles_any',
} as const;

/** Wildcard tokens recognised by the matcher. */
export const PERMISSION_WILDCARD_ALL = '*';
export const PERMISSION_WILDCARD_SUFFIX = '.*';
export const PERMISSION_WILDCARD_PREFIX = '*.';

/**
 * Built-in role keys. These are seeded at boot. Adding a new built-in here
 * means: (1) add to this object, (2) extend BUILT_IN_ROLE_DEFINITIONS below
 * with a permission set, (3) the seeder picks it up automatically.
 */
export const RoleKeys = {
  /** Cross-tenant super admin. Holds the `*` permission grant. */
  PLATFORM_ADMIN: 'platform_admin',
  /** Tenant-level super admin. Holds `*` within the school. */
  SCHOOL_ADMIN: 'school_admin',
  /** Read-only auditor — every read permission, no writes. */
  AUDITOR: 'auditor',
  /**
   * Subject/class teacher. Grants from `docs/ROLES_AND_PERMISSIONS.md` §3.2
   * (`attendance.create`, `marks.create/update`, `notices.create`,
   * `messages.send`). Scope predicates (own classes / own subjects /
   * in-window) live in the resolver, not in the role grant set.
   */
  TEACHER: 'teacher',
  /**
   * Parent of one or more students on the tenant. Read-only on child's
   * records plus `fees.pay`, `messages.send`, `leave.apply`,
   * `notices.acknowledge` per `docs/ROLES_AND_PERMISSIONS.md` §3.2.
   * "Own children only" scope is enforced by the resolver.
   */
  PARENT: 'parent',
  /**
   * Student. Read timetable/marks/notices, submit homework, browse the
   * library catalogue per `docs/ROLES_AND_PERMISSIONS.md` §3.2. "Own data
   * only" scope is enforced by the resolver.
   */
  STUDENT: 'student',
} as const;

export type RoleKey = (typeof RoleKeys)[keyof typeof RoleKeys];

/**
 * Cross-cutting baseline permissions. Feature modules will add to the
 * catalog (students, attendance, billing, etc.) via their own seeders;
 * this is just what RBAC + Auth need to function.
 */
export const Permissions = {
  // RBAC self-administration
  ROLES_READ: 'roles.read',
  ROLES_WRITE: 'roles.write',
  ROLES_ASSIGN: 'roles.assign',

  // Identity
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',

  // Audit / observability
  AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Definition of each built-in role's permission grants. The seeder
 * upserts these on boot — operators never edit them by hand.
 */
export interface BuiltInRoleDefinition {
  readonly key: RoleKey;
  readonly name: string;
  readonly description: string;
  readonly scope: 'tenant' | 'global';
  readonly permissions: readonly string[];
}

export const BUILT_IN_ROLE_DEFINITIONS: readonly BuiltInRoleDefinition[] = [
  {
    key: RoleKeys.PLATFORM_ADMIN,
    name: 'Platform Admin',
    description:
      'Cross-tenant super admin. Bypasses every permission check via `*`; ' +
      'the scoped wildcards below are explicit so the grant set documents ' +
      'the Sprint 14 super-admin surface (provisioning + school + plan + ' +
      'communication). Subscription / billing namespaces are reserved for ' +
      'a future patch — do NOT invent perm keys here ahead of those modules.',
    scope: 'global',
    // NOTE: `*` already covers every key; the scoped wildcards are kept
    // alongside it as living documentation of the Sprint 14 super-admin
    // surface and so the role's grant set survives any future narrowing
    // of `*`. RESERVED (future): `subscription.*`, `billing.*` — add when
    // those modules land. Do NOT add speculative perm keys here.
    permissions: [
      PERMISSION_WILDCARD_ALL,
      'provisioning.*',
      'school.*',
      'plan.*',
      'communication.*',
    ],
  },
  {
    key: RoleKeys.SCHOOL_ADMIN,
    name: 'School Admin',
    description: 'Tenant super admin. Holds every permission within the school.',
    scope: 'tenant',
    permissions: [PERMISSION_WILDCARD_ALL],
  },
  {
    key: RoleKeys.AUDITOR,
    name: 'Auditor',
    description: 'Read-only access across the tenant. No writes, no admin actions.',
    scope: 'tenant',
    permissions: ['*.read', Permissions.AUDIT_READ],
  },
  {
    key: RoleKeys.TEACHER,
    name: 'Teacher',
    description:
      'Subject/class teacher. Grants verbatim from docs/ROLES_AND_PERMISSIONS.md §3.2. ' +
      'Scope predicates (own classes / own subjects / in-window) are applied by the ' +
      'permission resolver, not the role grant — keep these keys plain.',
    scope: 'tenant',
    permissions: [
      'attendance.create',
      'marks.create',
      'marks.update',
      'notices.create',
      'messages.send',
    ],
  },
  {
    key: RoleKeys.PARENT,
    name: 'Parent',
    description:
      'Parent of one or more students on the tenant. Read-only on child records ' +
      '(students/attendance/marks/report cards/fees) plus fees.pay, messages.send, ' +
      'leave.apply, notices.acknowledge per docs/ROLES_AND_PERMISSIONS.md §3.2. ' +
      '"Own children only" scope is enforced by the resolver.',
    scope: 'tenant',
    permissions: [
      'students.read',
      'attendance.read',
      'marks.read',
      'report_cards.read',
      'fees.read',
      'fees.pay',
      'messages.send',
      'leave.apply',
      'notices.acknowledge',
    ],
  },
  {
    key: RoleKeys.STUDENT,
    name: 'Student',
    description:
      'Student. Reads timetable/marks/notices, submits homework, browses the library ' +
      'catalogue per docs/ROLES_AND_PERMISSIONS.md §3.2. "Own data only" scope is ' +
      'enforced by the resolver.',
    scope: 'tenant',
    permissions: [
      'timetable.read',
      'marks.read',
      'notices.read',
      'homework.submit',
      'library.read',
    ],
  },
];
