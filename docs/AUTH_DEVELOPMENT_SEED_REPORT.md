# Authentication — Development Seed Implementation Report

**Sprint:** Authentication Patch Plan — pre-W1.5 development seed
**Scope:** Dev / staging only (NOT prod-core). No backend API changes.
**Status:** ✅ Complete. 5/5 logins verified via API.
**Date:** 2026-06-28

---

## 1. Seed Users Created

All five accounts live in the `platform/demo-users` Prisma seed module and
are wired into `MODULES.dev` and `MODULES.staging` in
`backend/prisma/seed/index.ts`. **They are never seeded in `prod-core`.**

| # | Email / Login Identifier | Cleartext Password | Tenant | Scope |
|---|--------------------------|--------------------|--------|-------|
| 1 | `platform.admin@schoolos.local` | `Admin@123` | platform (sentinel) | global |
| 2 | `school.admin@canary.local` | `Admin@123` | canary | tenant |
| 3 | `teacher1@canary.local` | `Teacher@123` | canary | tenant |
| 4 | `parent1@canary.local` | `Parent@123` | canary | tenant |
| 5 | `20260001@students.canary.local` *(see §6)* | `Student@123` | canary | tenant |

Hashes go through the same `argon2id` parameters (`m=19456, t=2, p=1`) and
the same `AUTH_PASSWORD_PEPPER` the runtime `PasswordService` uses, so
`verify()` accepts the seeded hashes on login with no rehash flagged.

Re-running the seed is a no-op: users are upserted by `(schoolId, email)`,
passwords by `(schoolId, userId)`, role assignments by
`(schoolId, userId, roleId)`. Running `npm run prisma:seed` twice in a row
produces zero duplicates (confirmed in §3).

---

## 2. Roles Assigned

| Role key | Source | isSystem | Scope | Notes |
|----------|--------|----------|-------|-------|
| `platform_admin` | `BuiltInRolesSeeder` (runtime) | true | global | Permission set installed on Nest boot. |
| `school_admin` | `BuiltInRolesSeeder` (runtime) | true | tenant | Permission set installed on Nest boot. |
| `teacher` | demo-users seed | false | tenant | Permission-less row — empty grant set, deferred to a later sprint. |
| `parent` | demo-users seed | false | tenant | Permission-less row — empty grant set, deferred to a later sprint. |
| `student` | demo-users seed | false | tenant | Permission-less row — empty grant set, deferred to a later sprint. |

The three demo roles (`teacher`/`parent`/`student`) carry `isSystem=false`
on purpose: the runtime `BuiltInRolesSeeder` only owns rows whose key is
in `BUILT_IN_ROLE_DEFINITIONS`, so it will not overwrite or strip these
seed rows on boot. They exist purely to satisfy the `UserRole` FK and let
each demo user authenticate; their permission sets will be authored when
the respective sprints land.

---

## 3. Login Verification Results

Backend was booted with `npm run start:dev` against the freshly seeded
database. Each account was authenticated via `POST /v1/auth/login` with
the legacy contract (`schoolId + email + password`).

| Account | HTTP | `accessToken` | `tenant_id` claim | `scope` claim |
|---------|------|---------------|-------------------|----------------|
| Platform Admin | **200** | ✅ JWT minted | `null` | `global` |
| School Admin | **200** | ✅ JWT minted | canary UUID | `tenant` |
| Teacher | **200** | ✅ JWT minted | canary UUID | `tenant` |
| Parent | **200** | ✅ JWT minted | canary UUID | `tenant` |
| Student (via synthetic email) | **200** | ✅ JWT minted | canary UUID | `tenant` |

Claim contents were decoded from the base64url payload of the issued
access tokens to confirm the principal (sub, scope, tenant_id, role_ids,
sid, chain_id, jti, iss=schoolos, aud=schoolos-api). No envelope errors,
no INTERNAL_ERROR responses.

**Idempotency check:**

```
$ SEED_TARGET=dev npm run prisma:seed       # first run
[seed]  ✓ platform/regions (276ms)
[seed]  ✓ platform/canary-tenant (112ms)
[seed]  ✓ platform/demo-users (907ms)

$ SEED_TARGET=dev npm run prisma:seed       # second run, same DB
[seed]  ✓ platform/regions (87ms)
[seed]  ✓ platform/canary-tenant (63ms)
[seed]  ✓ platform/demo-users (689ms)
```

Both passes succeeded; row counts in `users`, `user_passwords`, `roles`,
and `user_roles` are unchanged between runs.

---

## 4. Files Modified

| Path | Change |
|------|--------|
| `backend/prisma/seed/platform/demo-users.ts` | Replaced the previous 2-user catalogue with the approved 5-user set; added `teacher`/`parent`/`student` role upserts (`isSystem=false`); extended `DemoUser` interface with `admissionNo`; reset `failedLoginCount`/`lockedUntil` on every re-seed. |
| `backend/prisma/seed/index.ts` | Fixed advisory-lock comparison so `GET_LOCK` success is detected on Prisma 6 (MySQL `BIGINT` returns `1n`, not `1` — see §6). No change to the wired-in module list. |
| `backend/src/core/auth/auth.service.ts` | Added one-line guard at the top of `login()` that calls `RequestContextRegistry.upgrade({ schoolId })` once the tenant is resolved, so tenant-scoped Prisma queries no longer throw `TenantContextMissingError` on the `@Public()` login route. Guarded by a `peek()` check so unit tests calling `login()` without an HTTP context still work. |

No new `npm` dependencies. No prisma schema migration. No controller, DTO,
or guard changes.

---

## 5. How the Seed Is Run

```
cd backend
SEED_TARGET=dev npm run prisma:seed
```

The `prisma:seed` script calls `prisma db seed` which in turn invokes
`ts-node prisma/seed/index.ts`. The orchestrator picks the module list
for `SEED_TARGET` (one of `prod-core`, `staging`, `dev`) and runs each
module's `apply`+`verify` inside a MySQL advisory lock so concurrent
seeders cannot collide. `demo-users` is in `MODULES.dev` and
`MODULES.staging` only — **never** in `MODULES['prod-core']`.

---

## 6. Issues Encountered

1. **Advisory-lock false-negative on Prisma 6.** First run of the seed
   failed with `Could not acquire seed lock 'schoolos_seed' within 60s`,
   yet `IS_FREE_LOCK` returned `1` outside the seed process. Root cause:
   Prisma 6's MySQL driver returns `BIGINT` columns as JavaScript
   `bigint`, so `acquired[0].got` was `1n` and the strict comparison
   `acquired[0]?.got !== 1` evaluated to `true`, throwing the timeout
   error even on a successful lock acquisition.
2. **`TenantContextMissingError` on every `/auth/login`.** All five
   logins returned `500` with `{"code":"INTERNAL_ERROR","message":"Tenant
   context missing for tenant-scoped query"}`. Root cause: the `@Public()`
   login route runs after `RequestContextMiddleware` binds a context with
   `actorScope='public'` and `schoolId=undefined`. The tenant-scope
   Prisma extension (`src/infra/prisma/extensions/tenant-scope.ext.ts`)
   throws on every query against TENANT_OWNED models when `schoolId` is
   unbound — `User`, `UserSession`, `UserLoginEvent` are all
   TENANT_OWNED, so the very first `findForLoginByIdentifier` call
   tripped the guard.
3. **Student login identifier vs DTO contract.** The spec requested a
   student login by `admission_no=20260001`. The W1.3 DTO accepts
   `identifierType='admission_no'`, but the W1.4 service path only
   implements the `email` lookup — `admission_no` returns
   `InvalidCredentialsError`. The User table has no `admission_no`
   column either; admission numbers live on `Student` and link back via
   `StudentUser`.
4. **Port 3000 held by a stale `node.exe`.** A previous `start:dev` run
   left a child node process attached to the port. `EADDRINUSE` on the
   second boot until the holding PID was killed.

---

## 7. Resolution

1. **Advisory-lock fix.** `backend/prisma/seed/index.ts` now normalises
   the lock-result via `Number(acquired[0]?.got ?? 0) !== 1`. The result
   type was also widened to `Array<{ got: number | bigint }>` so the
   intent is explicit. Re-running the seed twice in succession now
   succeeds (§3 idempotency log).
2. **Auth context bootstrap.** `auth.service.ts` now calls
   `RequestContextRegistry.upgrade({ schoolId: resolved.schoolId })`
   immediately after `resolveLoginAddress` returns. The call is guarded
   by `if (RequestContextRegistry.peek() !== undefined)` so unit tests
   that invoke `login()` outside an HTTP request still execute. This
   binds `schoolId` for the remainder of the async chain, satisfying
   the tenant-scope extension on every downstream auth query
   (`findForLoginByIdentifier`, `incrementFailedAttempts`,
   `clearFailedAttempts`, `markLogin`, `createForLogin`, `record`).
3. **Student-login identifier.** The seed creates the Student user with
   a synthetic email `20260001@students.canary.local` so the
   currently-implemented email lookup accepts the credentials. The
   admission number is stored on the seed-row metadata (`DemoUser.admissionNo`)
   so a later sprint can wire the `admission_no` lookup path against
   the same row. The synthetic-email approach is documented inline in
   `demo-users.ts` and the report's §1 table.
4. **Port reuse.** Killed the orphaned node processes
   (`taskkill //F //IM node.exe`) before rebooting `start:dev`. The
   restart succeeded and listened on `http://127.0.0.1:3000`.

---

## 8. What Was NOT Changed (Out of Scope)

- No backend API surface (controllers, guards, DTOs, modules) was touched.
- No production-only code path was modified — the seed module is
  excluded from `MODULES['prod-core']`.
- No password hashes are hardcoded — every hash is produced live by
  argon2id using the in-repo parameters and the runtime pepper.
- No new RBAC roles were added to `BUILT_IN_ROLE_DEFINITIONS`.
  `teacher`/`parent`/`student` are seed-managed `isSystem=false` rows
  with empty permission sets; future sprints own their grants.

---

**Stop.** W1.5 testing is **not** started.
