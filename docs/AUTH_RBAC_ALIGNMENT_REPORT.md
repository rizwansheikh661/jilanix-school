# Authentication — Development Seed RBAC Alignment Report

**Sprint:** Authentication Patch Plan — pre-W1.5 RBAC alignment
**Scope:** RBAC constants + Prisma seed only. No AuthService, controller,
DTO, or login-flow changes.
**Status:** ✅ Complete. All five demo users authenticate; teacher / parent
/ student now resolve their approved permission grants.
**Date:** 2026-06-28

---

## 1. Roles Assigned

The three demo roles (`teacher`, `parent`, `student`) are now part of the
runtime built-in registry — they sit alongside `platform_admin`,
`school_admin`, and `auditor`, are upserted by `BuiltInRolesSeeder` on
every Nest boot, and carry `isSystem=true`. The Prisma seed continues to
upsert the role rows (so demo `UserRole` foreign keys resolve before Nest
boots) but no longer attempts to own their permission set.

| User | Role key | Source of grants | Scope |
|------|----------|-------------------|-------|
| `platform.admin@schoolos.local` | `platform_admin` | `BUILT_IN_ROLE_DEFINITIONS` | global |
| `school.admin@canary.local` | `school_admin` | `BUILT_IN_ROLE_DEFINITIONS` | tenant |
| `teacher1@canary.local` | `teacher` | `BUILT_IN_ROLE_DEFINITIONS` (new) | tenant |
| `parent1@canary.local` | `parent` | `BUILT_IN_ROLE_DEFINITIONS` (new) | tenant |
| `20260001@students.canary.local` | `student` | `BUILT_IN_ROLE_DEFINITIONS` (new) | tenant |

Nest boot log confirms the catalogue expanded from 3 → 6 entries:

```
INFO  RBAC seed complete: 6 built-in roles upserted.
```

The seed no longer produces "permission-less placeholder" rows. Every
demo user authenticates with the same RBAC foundation the production
codebase uses for the existing built-ins.

---

## 2. Permissions Resolved

Permission keys are copied verbatim from
`docs/ROLES_AND_PERMISSIONS.md` §3.2. Scope predicates ("own classes",
"own subjects", "in window", "own children", "own data") live in the
permission resolver, not in the role grant — per §5 of the same
document — so the role definitions hold the plain keys.

| Role | Grants (alphabetical) | Source |
|------|----------------------|--------|
| `platform_admin` | `*`, `communication.*`, `plan.*`, `provisioning.*`, `school.*` | `BUILT_IN_ROLE_DEFINITIONS[0]` (unchanged) |
| `school_admin` | `*` | `BUILT_IN_ROLE_DEFINITIONS[1]` (unchanged) |
| `auditor` | `*.read`, `audit.read` | `BUILT_IN_ROLE_DEFINITIONS[2]` (unchanged) |
| `teacher` | `attendance.create`, `marks.create`, `marks.update`, `messages.send`, `notices.create` | `BUILT_IN_ROLE_DEFINITIONS[3]` (new) |
| `parent` | `attendance.read`, `fees.pay`, `fees.read`, `leave.apply`, `marks.read`, `messages.send`, `notices.acknowledge`, `report_cards.read`, `students.read` | `BUILT_IN_ROLE_DEFINITIONS[4]` (new) |
| `student` | `homework.submit`, `library.read`, `marks.read`, `notices.read`, `timetable.read` | `BUILT_IN_ROLE_DEFINITIONS[5]` (new) |

No new permission keys were invented; every key matches the
authoritative `docs/ROLES_AND_PERMISSIONS.md` table.

---

## 3. Seed Verification

`SEED_TARGET=dev npm run prisma:seed` succeeded end-to-end on the
pre-existing dev database (idempotent re-run — the prior seed had already
created the role rows with `isSystem=false`; `ensureRole` now normalises
that flag to `true` on every re-seed):

```
[seed] target=dev modules=3
[seed]  → platform/regions (apply)
[seed]  → platform/regions (verify)
[seed]  ✓ platform/regions (60ms)
[seed]  → platform/canary-tenant (apply)
[seed]  → platform/canary-tenant (verify)
[seed]  ✓ platform/canary-tenant (43ms)
[seed]  → platform/demo-users (apply)
[seed]  → platform/demo-users (verify)
[seed]  ✓ platform/demo-users (487ms)
[seed] done.
```

Subsequent Nest boot picked up the three new entries in
`BUILT_IN_ROLE_DEFINITIONS` and called
`RoleRepository.replacePermissionsForRole` for each — writing the
grants listed in §2 into the `role_permissions` table and invalidating
the in-process permission cache via
`PermissionService.invalidateRole(roleId)`. Boot log:

```
[bootstrap] schoolos-api@0.1.0 listening on http://127.0.0.1:3000
INFO  RBAC seed complete: 6 built-in roles upserted.
INFO  Nest application successfully started
```

No errors, no `BuiltInRolesSeeder` warnings, no `UnknownFeatureFlag`
noise.

---

## 4. Login Verification

All five seeded accounts authenticated via
`POST /v1/auth/login` against the freshly booted backend. Each returned
HTTP 200 with a valid `AuthTokens` envelope containing both the access
token and the populated `user` projection.

| Account | HTTP | `user.roles` | `actorScope` |
|---------|------|--------------|--------------|
| `platform.admin@schoolos.local` | **200** | `["platform_admin"]` | `global` |
| `school.admin@canary.local` | **200** | `["school_admin"]` | `tenant` |
| `teacher1@canary.local` | **200** | `["teacher"]` | `tenant` |
| `parent1@canary.local` | **200** | `["parent"]` | `tenant` |
| `20260001@students.canary.local` | **200** | `["student"]` | `tenant` |

No `InvalidCredentialsError`, no `TenantContextMissingError`, no
`INTERNAL_ERROR` envelope. JWTs continue to carry `sub`, `tenant_id`,
`scope`, `role_ids`, `sid`, `chain_id`, `jti`, `iss=schoolos`,
`aud=schoolos-api`.

---

## 5. AuthMe Verification

`AuthTokens.user` is the populated `AuthMeDto` projection
`AuthService.buildAuthMe()` produces during `login()` — it carries
`roles`, `permissions`, `roleIds`, `actorScope`, `schoolSlug`, `locale`,
`timezone`, `displayName`, `email`, `mustChangePassword`, `featureFlags`,
and `sessionId`. The relevant fields for this report:

```jsonc
// teacher1@canary.local
{
  "roles": ["teacher"],
  "permissions": [
    "attendance.create",
    "marks.create",
    "marks.update",
    "messages.send",
    "notices.create"
  ],
  "actorScope": "tenant",
  "schoolSlug": "canary"
}

// parent1@canary.local
{
  "roles": ["parent"],
  "permissions": [
    "attendance.read",
    "fees.pay",
    "fees.read",
    "leave.apply",
    "marks.read",
    "messages.send",
    "notices.acknowledge",
    "report_cards.read",
    "students.read"
  ],
  "actorScope": "tenant",
  "schoolSlug": "canary"
}

// 20260001@students.canary.local
{
  "roles": ["student"],
  "permissions": [
    "homework.submit",
    "library.read",
    "marks.read",
    "notices.read",
    "timetable.read"
  ],
  "actorScope": "tenant",
  "schoolSlug": "canary"
}
```

Each permission array matches `BUILT_IN_ROLE_DEFINITIONS` byte-for-byte
(sort order is whatever `PermissionService.resolveForRoles` returns —
the set semantics are what matter).

For completeness, the two admin grants resolved identically to the
pre-alignment behaviour, confirming this patch did not regress the
existing built-ins:

```jsonc
// platform.admin@schoolos.local
{ "roles": ["platform_admin"],
  "permissions": ["*", "communication.*", "plan.*", "provisioning.*", "school.*"],
  "actorScope": "global" }

// school.admin@canary.local
{ "roles": ["school_admin"], "permissions": ["*"], "actorScope": "tenant" }
```

The wiring end-to-end is:

```
login() → UserRoleRepository.listActiveRoleIdsForUser
       → PermissionService.resolveForRoles(roleIds)
       → RoleRepository.permissionsForRoles → role_permissions table
       → AuthService.buildAuthMe → AuthMeDto.permissions
       → AuthTokens.user.permissions  (HTTP response)
```

`AuthMeDto.permissions` is populated correctly for every demo user.

---

## Files Modified

| Path | Change |
|------|--------|
| `backend/src/core/rbac/rbac.constants.ts` | Added `TEACHER`, `PARENT`, `STUDENT` to `RoleKeys`; added three matching `BuiltInRoleDefinition` entries with the permission keys taken verbatim from `docs/ROLES_AND_PERMISSIONS.md` §3.2. |
| `backend/prisma/seed/platform/demo-users.ts` | `ROLE_DEFAULTS` now marks `teacher`/`parent`/`student` as `isSystem=true` (the runtime `BuiltInRolesSeeder` owns them); `ensureRole` now normalises `name`/`description`/`scope`/`isSystem` on existing role rows so a re-seed upgrades the legacy `isSystem=false` rows from the prior dev seed. |

No new `npm` dependencies. No Prisma schema migration. **No AuthService,
controller, DTO, login-flow, RBAC service, permission-matcher, or guard
changes**.

---

**Stop.** W1.5 testing is **not** started.
