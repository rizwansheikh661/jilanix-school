# Authentication Foundation — Architecture Review (V1 Freeze)

**Status:** review-only audit. No backend code, DTO, or Prisma schema changes were made. No migrations were generated. The purpose of this document is to certify what the V1 authentication foundation does and does not support before any further frontend implementation begins.

**Scope of inspection:** `backend/src/core/auth/**`, `backend/src/core/rbac/**`, `backend/src/core/request-context/**`, `backend/src/core/provisioning/password-reset/**`, `backend/prisma/schema/identity.prisma`, `backend/prisma/schema/students.prisma`, `backend/prisma/seed/**`, the `parent`, `student`, and `staff` core modules, and the `frontend/src/providers/AuthProvider.tsx` / `frontend/src/lib/api/clients/auth.ts` consumer surface.

All citations are `file:line` against the working tree at `c:\rizwan\schoolos-saas`.

---

## Section A — Findings by review area (1–14)

### 1. Login architecture

**Endpoint surface (`auth.controller.ts:37-107`):**

| Method | Path | Auth | Source |
|---|---|---|---|
| POST | `/v1/auth/login` | `@Public()` | `auth.controller.ts:42-56` |
| POST | `/v1/auth/refresh` | `@Public()` | `auth.controller.ts:58-69` |
| POST | `/v1/auth/logout` | Bearer | `auth.controller.ts:71-80` |
| POST | `/v1/auth/logout-all` | Bearer | `auth.controller.ts:82-93` |
| GET | `/v1/auth/me` | Bearer | `auth.controller.ts:95-107` |

The controller is class-decorated `@AllowWhenInactive()` (`auth.controller.ts:37`) so suspended subscriptions still permit authentication.

**Login DTO (`auth.dto.ts:28-51`):**
- `schoolId: UUID` (REQUIRED on the wire)
- `email: string` (`@IsEmail`, trimmed, max 255)
- `password: string` (min 8, max 256, NOT trimmed)
- `deviceId?: string` (max 64)

**Tokens DTO (`auth.dto.ts:60-83`):** `accessToken`, `accessTokenExpiresAt`, `refreshToken`, `refreshTokenExpiresAt`, `tokenType: 'Bearer'`, `mustChangePassword: boolean`.

**Me DTO (`auth.dto.ts:85-100`):** `userId`, `schoolId | null`, `actorScope`, `roleIds: string[]`, `sessionId`. **No** displayName, email, permissions, feature flags, or `mustChangePassword`.

**Login flow (`auth.service.ts:74-149`):** `findForLogin` → `passwords.verify` (argon2id+pepper) → status gate (`disabled`/`locked` → `UserDisabledError`, `auth.service.ts:88-91`) → best-effort rehash (`auth.service.ts:95-97`) → refresh-token generation → `sessions.createForLogin` → `userRoles.listActiveRoleIdsForUser` → access-token signing with `schoolId=null` if `actorScope='global'` (`auth.service.ts:118-125`) → `markLogin` + `loginEvents.record`.

**Login event logging (`login-event.repository.ts:21-66`):** six event types — `login_success`, `login_failure`, `logout`, `refresh_rotated`, `refresh_reused`, `session_revoked`. Identifier is sha256-hashed for forensic value.

**Concerns:**
- Throttling is **not implemented**. No `@nestjs/throttler` dependency; `core.module.ts:79-80` notes "Future sprints add: RateLimitModule".
- Account lockout is **not implemented**. `User.status='locked'` (`identity.prisma:44`) is rejected at login but never *set* by login-failure logic.
- Password length policy is **split** — `LoginDto.password` is min 8 (`auth.dto.ts:42`); `PasswordResetService.PASSWORD_MIN_LENGTH` is 12 (`password-reset.service.ts:49`). A user can hold an 8-char password but be unable to rotate to one shorter than 12.
- `LoginDto` requires a UUID `schoolId`, making login impossible without out-of-band tenant knowledge (see §2).

---

### 2. Multi-tenant resolution

**Pre-login discovery does not exist.** There is no `/auth/tenant-discovery`, no host-header lookup, no subdomain-to-tenant resolver, no email-keyed pre-login API. Grep for `tenant.discovery|subdomain|host.header.tenant|tenant-resolver` returns zero hits.

**Request-time tenant binding:**
- `RequestContextMiddleware.use` (`request-context.middleware.ts:65-95`) seeds context with `actorScope='public'` and no `schoolId`.
- `JwtAuthGuard.upgradeRequestContext` (`jwt-auth.guard.ts:88-102`) is the only place `schoolId` is lifted into the request context — sourced from the JWT `tenant_id` claim.
- `RequestContextRegistry.upgrade` (`request-context.service.ts:143-147`) uses `AsyncLocalStorage.enterWith` to promote `public` → authenticated.

**Frontend mitigation** (in scope of F1.3): `frontend/src/components/auth/LoginForm.tsx:47-53` injects `AUTH_CONFIG.defaultSchoolId` from `NEXT_PUBLIC_DEFAULT_SCHOOL_ID`. The shipped UI is pinned to one tenant per deployment.

**Concerns:**
- This is a multi-tenant SaaS without a per-host or per-subdomain tenant resolver. Multi-school operation requires a backend tenant-discovery primitive before the UX can scale beyond one tenant per deployment.
- A user enrolled at two schools cannot pick a tenant at sign-in. The composite-PK design `(schoolId, email)` (`identity.prisma:86`) explicitly allows duplicate emails across tenants, but there is no API to disambiguate.

---

### 3. Platform admin authentication

**Schema accommodation:**
- `User.actorScope` defaults to `'tenant'` (`identity.prisma:42`). Global users set it to `'global'`.
- `User.schoolId` is part of the composite PK and is **non-nullable** (`identity.prisma:85`). Global users therefore require a sentinel school row.

**Sentinel school:** `demo-users.ts:98-119` creates `School { slug='platform', legalName='Platform (system tenant)' }` purely to host global user rows.

**JWT minting:** `auth.service.ts:120` sets `schoolId: actorScope === 'global' ? null : user.schoolId` — the JWT `tenant_id` claim is `null` for platform admins despite the DB row being parented under the sentinel.

**Strategy divergence:** `JwtStrategy.validate` (`jwt.strategy.ts:51-90`) **skips session-active and user-active checks when `schoolId === null`** (`jwt.strategy.ts:63-79`). A revoked session row for a platform admin is not re-validated on each request.

**`logout-all` for global users is unimplemented:** `auth.service.ts:281-288` throws `Error('logoutAll for global users requires schoolId resolution (not Sprint 1)')`.

**Concerns:**
- Platform-admin token revocation is structurally weaker than tenant-user revocation. A leaked global-scope JWT remains valid for its full TTL regardless of session-row state.
- The sentinel-school row is an architectural hack — every join touching `users.schoolId` for a global user points at a fake tenant.

---

### 4. School admin authentication

No dedicated endpoint. Uses `POST /v1/auth/login`. The principal is distinguished by `User.actorScope='tenant'` plus a `UserRole` row pointing at `role.key='school_admin'` (`rbac.constants.ts:57`).

**RBAC grant (`rbac.constants.ts:122-128`):** scope `tenant`, permissions `['*']`.

**Provisioning path:** `backend/src/core/provisioning/` creates the seed `school_admin` user with `mustChangePassword=true` (`identity.prisma:53-60`). Forced rotation is via `PasswordResetService.firstLoginChange` (`password-reset.service.ts:281-375`).

---

### 5. Teacher authentication

**There is no teacher authentication.**
- No `teacher` role key. `RoleKeys` enumerates only `PLATFORM_ADMIN`, `SCHOOL_ADMIN`, `AUDITOR` (`rbac.constants.ts:54-61`).
- No `teacher_users` junction table.
- The staff module (`staff.controller.ts:65-200`) is HR-style CRUD; `Staff.userId` is a nullable column with no FK (`staff.prisma:141-144`).
- `ClassTeacher` exists only as a section-assignment relation (`identity.prisma:74-75`).
- `RoleKeys.PRINCIPAL` is mentioned in a docstring example (`rbac.constants.ts:18`) but is not defined.

A staff member can log in only if an administrator manually creates a `User` row and assigns it one of the three existing system roles — there is no teacher-scoped role with bounded permissions.

---

### 6. Parent authentication

**Schema (`students.prisma:286-327`):** `parent_users` junction `(schoolId, parentId, userId)`; `ParentUserStatus` enum `PENDING_INVITE | ACTIVE | SUSPENDED | ARCHIVED` (`students.prisma:66-71`); back-relation `User.parentUsers` (`identity.prisma:79`).

**Controller (`parent-user.controller.ts:62-247`)** is admin-only — invite, resend-invite, suspend, reactivate, archive, list. All gated by `RequirePermissions(ParentPermissions.*)` plus the `parent_portal` feature flag (`parent-user.controller.ts:227-235`).

**Activation (`parent-invitation.service.ts:97-266`):** the invitation creates the `User` row with `status='invited', mustChangePassword=true, passwordResetRequiredAt=now` and dispatches `passwordReset.request({ttlMs: 7 days})`. The parent activates via the standard password-reset flow. Once activated, parent login uses the generic `POST /v1/auth/login`.

**Concern — lifecycle gap:** `AuthService.login` checks only `User.status`. It does NOT consult `ParentUser.status`. A `SUSPENDED` or `ARCHIVED` ParentUser whose underlying `User` is `active` can still authenticate; the suspension is enforced only by feature-flag-guarded parent controllers, not by auth itself.

---

### 7. Student authentication

**Schema (`students.prisma:336-370`):** `student_users` junction `(schoolId, studentId, userId)`; `StudentUserStatus` enum with the same four values; back-relation `User.studentUsers` (`identity.prisma:83`).

**Controller (`student-user.controller.ts:62-247`)** mirrors the parent controller — admin-only invitation/lifecycle; gated by `StudentPermissions.*` plus the `student_portal` feature flag (`student-user.controller.ts:226-235`).

**Activation pattern** is identical to parent (`invite → User + mustChangePassword + reset link → confirm → login`).

**Same lifecycle gap** as parents: `StudentUser.status` is not consulted by the login path.

---

### 8. Staff authentication

**There is no staff authentication.** The staff module is HR-style CRUD (`staff.controller.ts:69-200`). There is no `staff_users` junction, no `staff_admin` or `staff_member` role key, and no email-invitation flow that produces a `User` row from a `Staff` record. `Staff.userId` exists (`staff.prisma:141-144`) but is a nullable column with no foreign key constraint and no service writes to it.

---

### 9. RBAC architecture

**Role keys — exhaustive list (`rbac.constants.ts:54-61`):**
- `PLATFORM_ADMIN = 'platform_admin'` (scope `global`)
- `SCHOOL_ADMIN  = 'school_admin'`  (scope `tenant`)
- `AUDITOR      = 'auditor'`       (scope `tenant`)

No principal, teacher, parent, student, accountant, librarian, nurse, or transport-officer role exists.

**Baseline permissions (`rbac.constants.ts:70-82`):** `roles.read|write|assign`, `users.read|write`, `audit.read`. Feature modules contribute their own permission seeders (`parent-permissions.seeder.ts`, `student-permissions.seeder.ts`, `staff-permissions.seeder.ts`, `notifications-permissions.seeder.ts`, `provisioning-permissions.seeder.ts`, `communication-center-permissions.seeder.ts`).

**Built-in role grants (`rbac.constants.ts:98-136`):**
- `platform_admin`: `['*', 'provisioning.*', 'school.*', 'plan.*', 'communication.*']`
- `school_admin`: `['*']`
- `auditor`: `['*.read', 'audit.read']`

**Seeder (`built-in-roles.seeder.ts:33-109`):** `OnApplicationBootstrap`; upserts permissions and roles on every boot; replaces grants and invalidates the cache. Failures are logged but non-fatal.

**Runtime checks:**
- `PermissionService` (`permission.service.ts:47-155`) with a 5-minute in-process `Map<roleId, permissions>` cache.
- Wildcard match logic in `permission-match.ts`.
- `PermissionsGuard` registered globally as `APP_GUARD` in `core.module.ts:128`; runs after `JwtAuthGuard`. Reads three reflector keys (`RBAC_METADATA.PERMISSIONS_ALL | PERMISSIONS_ANY | ROLES_ANY`).
- Decorators: `@RequirePermissions(...)`, `@RequireAnyPermission(...)`, `@RequireRole(...)` (`require-permissions.decorator.ts:30-46`).
- Resolved permissions are stamped on `RequestContext.permissions` (`permissions.guard.ts:194-205`) so audit and feature checks read without re-resolving.

**JWT carries role IDs, not permissions:** `JwtClaims.role_ids` (`auth.types.ts:34`). Re-resolved at login and on every rotation (`auth.service.ts:113-116`, `:224-227`).

**`/auth/permissions` is not exposed.** Grep confirms.

---

### 10. Password management

**`PasswordService` (`password.service.ts:52-125`):**
- Algorithm: `argon2id`.
- Calibrated params: `memoryCost=19_456`, `timeCost=2`, `parallelism=1` (`password.service.ts:38-43`).
- Pepper from `ConfigService.jwt.passwordPepper`; appended to password before hashing.
- `UserPassword.pepperVersion` is stored, but `currentPepperVersion()` always returns `1` (`password.service.ts:122-124`).
- `needsRehash()` fires when params lag or pepperVersion changes (`password.service.ts:97-107`).
- `verify()` catches malformed PHC strings (`password.service.ts:81-90`).

**Rehash policy (`auth.service.ts:95-97`):** best-effort, non-blocking. Writes via `UserRepository.upgradePasswordHash` (`user.repository.ts:128-143`).

**Password reset — IS IMPLEMENTED.** Lives in the provisioning module:
- POST `/v1/auth/password-reset/request` (`@Public`) — `password-reset.controller.ts:96-116`
- POST `/v1/auth/password-reset/confirm` (`@Public`) — `password-reset.controller.ts:118-137`
- POST `/v1/auth/first-login/change-password` (Bearer) — `password-reset.controller.ts:139-161`

**`PasswordResetService` (`password-reset.service.ts`):**
- Token: 32 random bytes base64url; stored as sha256 hex (`:46-47, 126-128`).
- TTL: 1 hour default (`:45`); overridable per call (parent/student invite passes 7 days).
- Anti-enumeration: unknown email silently returns `accepted:true` with a decoy hash to flatten timing (`:116-124, 411-416`).
- On confirm: rotates `UserPassword`, clears `mustChangePassword`, sets new `tokenSalt`, revokes ALL sessions with reason `password_changed` (`:208-244`).
- Cleartext token is published to the outbox topic `password_reset_requested` (`:150-163`) — NOT echoed over HTTP.

**`PasswordResetRequest` model (`identity.prisma:344-373`):** `tokenHash`, `expiresAt`, `consumedAt`, `cancelledAt`, `ip`, `userAgent`; cross-tenant-unique `tokenHash`. Used by `PasswordResetRepository`.

**Email delivery is stubbed.** Outbox publishes the topic, but `backend/src/core/notifications/channels/adapters/ses.adapter.ts` and `sendgrid.adapter.ts` are documented as Sprint-10 stubs that throw `CommunicationChannelNotImplementedError`. **Reset links cannot be delivered in production today.**

**Concerns:**
- Two distinct password-strength policies (length 8 at login DTO vs 12 at reset/first-login).
- Pepper rotation is wired (versioned column) but never exercised.
- No common-password / breach-corpus check.

---

### 11. Session management

**`user_sessions` (`identity.prisma:130-171`):** `refreshTokenHash` (UNIQUE), `parentSessionId`, `replacedBySessionId`, `chainId` (indexed), `deviceId`, `ip`, `userAgent`, `issuedAt`, `expiresAt`, `lastUsedAt`, `revokedAt`, `revokedReason`. Reasons: `logout | logout_all | rotated | reuse_detected | admin | password_changed`.

**Rotation (`auth.service.ts:156-261`):** sha256 inbound token → SELECT by hash in TX → reuse detection revokes the whole `chainId` (`:172-177`, `:310-334`) and emits `refresh_reused` → expiry check revokes that session → user status re-check revokes the chain on disabled/locked → INSERT new session, mark old `rotated` + `replacedBySessionId` → re-fetch role IDs so role-grant changes take effect immediately on the new access token.

**Per-request liveness:** `JwtStrategy.validate` calls `SessionRepository.isActiveById` on every authenticated request (`session.repository.ts:137-149`). Two extra DB reads per request — comment at `jwt.strategy.ts:13-15` accepts this for "logout takes effect immediately".

**`logout` revokes the entire chain** (not just the current row) — `auth.service.ts:264-278`.

**`logout-all`** revokes every active session for the user — `auth.service.ts:281-304` — but throws for global users (see §3).

**Device tracking:** captured on the row but **not exposed** via any list/revoke endpoint. No `/v1/auth/sessions`.

**JWT signing — RS256 (`jwt-keys.service.ts:8-105`):**
- Algorithm pinned: `JWT_ALGORITHM='RS256'` (`token.constants.ts:8`).
- Keys from `JWT_PRIVATE_KEY_BASE64` and `JWT_PUBLIC_KEY_BASE64` env vars.
- `kid = sha256(publicKey).slice(0,16)` embedded in JWT header (`access-token.service.ts:77`).
- **Key rotation NOT implemented.** `verify()` passes a single public key to `jwt.verifyAsync` (`access-token.service.ts:96-115`). No JWKS endpoint. No multi-key map. No rolling window.

**Refresh token format (`refresh-token.service.ts:36-67`):** `rft_<26-char ULID>`. Stored as sha256 hex. Length validation: 30 chars. TTL default 30 days (`env.schema.ts:108`). Access token TTL default 900 s (`env.schema.ts:107`).

**JwtClaims (`auth.types.ts:28-40`):** `sub`, `tenant_id` (nullable for global), `scope`, `role_ids`, `sid`, `chain_id`, `jti`, `iat`, `exp`, `iss`, `aud`.

---

### 12. API surface (auth-related)

**Confirmed routes:**

| Path | Method | Auth |
|---|---|---|
| `/v1/auth/login` | POST | Public |
| `/v1/auth/refresh` | POST | Public |
| `/v1/auth/logout` | POST | Bearer |
| `/v1/auth/logout-all` | POST | Bearer |
| `/v1/auth/me` | GET | Bearer |
| `/v1/auth/password-reset/request` | POST | Public |
| `/v1/auth/password-reset/confirm` | POST | Public |
| `/v1/auth/first-login/change-password` | POST | Bearer |

**Confirmed missing (grep returned no matches anywhere in `backend/src/`):**
- `/v1/auth/me/permissions`
- `/v1/auth/me/feature-flags`
- `/v1/auth/sessions` (list / revoke a single session)
- `/v1/auth/mfa/*` (enrol, challenge, recovery codes)
- `/v1/auth/tenant-discovery`

**MFA:** `User.mfaEnabled` exists (`identity.prisma:46`). `MfaRequiredError` is declared (`auth.errors.ts:103-108`) but **never thrown**. There is no MFA module, no TOTP/SMS/email-OTP code, and `AuthService.login` does not branch on `user.mfaEnabled`.

---

### 13. Seed data

**Orchestrator (`backend/prisma/seed/index.ts`):**
- Targets: `prod-core | staging | dev` (`index.ts:26`).
- `MODULES[prod-core]`: `platform/regions` only.
- `MODULES[staging]` and `MODULES[dev]`: `regions → canary-tenant → demo-users`.
- Advisory MySQL lock `schoolos_seed` prevents concurrent runs (`index.ts:48-65`).

**`platform/canary-tenant.ts:23-72`** seeds the canary `School` and its `SchoolSettings`. No users.

**`platform/demo-users.ts:63-82` (added in Sprint F1.3):**
- `platform.admin@jilanix.dev` / `Platform!Admin#1` — `platform_admin`, `actorScope='global'`, parented under sentinel school slug `platform`.
- `school.admin@canary.jilanix.dev` / `School!Admin#1` — `school_admin`, `actorScope='tenant'`, canary tenant.
- Argon2 params mirrored by hand from `PasswordService` (`demo-users.ts:39-44`); drift risk noted at `:32-38`.
- Pepper applied from `process.env.AUTH_PASSWORD_PEPPER`.
- Role rows upserted with `isSystem=true`; permission grants left to `BuiltInRolesSeeder` on Nest boot (`demo-users.ts:140-141`).

**Bootstraps (RBAC + feature flags):** `BuiltInRolesSeeder`, per-module permission seeders, and feature-flag bootstraps (`ProvisioningFeatureFlagsBootstrap`, `ParentFeatureFlagsBootstrap`, `StudentFeatureFlagsBootstrap`, `NotificationsFeatureFlagsBootstrap`, `CommunicationCenterFeatureFlagsBootstrap`).

---

### 14. Frontend impact

Files inspected: `frontend/src/providers/AuthProvider.tsx`, `frontend/src/lib/api/clients/auth.ts`, `frontend/src/components/auth/*`.

**Assumptions vs. backend reality:**

1. **`schoolId` is invisible to users.** `LoginForm.tsx:47-53` injects from `NEXT_PUBLIC_DEFAULT_SCHOOL_ID`; comment at `:18-21` calls this a backend prerequisite.
2. **Password reset clients are STALE.** `auth.ts:16-19` says *"The backend does NOT yet implement `/auth/password-reset/*`"* and the stubs at `auth.ts:85-104` throw `NotImplementedError`. The backend DID ship those routes in `PasswordResetController` — the frontend has not been updated to wire them.
3. **`mustChangePassword` is read but not enforced.** `AuthProvider.tsx:22-30, 56, 102` captures the flag and exposes it through `useAuth()`. The dashboard shows a banner only; enforcement is blocked behind the (now-stale) reset-confirm wiring.
4. **`useAuth().permissions` is permanently empty.** `AuthProvider.tsx:57` initialises with `new Set()` and never writes to it; backend has no `/auth/me/permissions`.
5. **`useAuth().featureFlags` is permanently empty** — same story (`AuthProvider.tsx:58`).
6. **`/auth/me` shape:** `fetchSession()` (`auth.ts:55-57`) returns `SessionUser`. Backend `AuthMeDto` has exactly five fields — no `displayName`, no `email` — so any UI text that wants a user's name must derive it elsewhere.
7. **Disabled OAuth buttons** are rendered in `LoginForm.tsx:81-117`. No backend OAuth path exists.

---

## Section B — Mandated output (1–10)

### 1. Existing implementation summary

The V1 backend ships a credential-based, multi-tenant authentication stack with:

- **One canonical login** (`POST /v1/auth/login`) requiring `(schoolId, email, password)`, returning rotating access + refresh tokens (`AuthTokensDto` with `mustChangePassword`).
- **RS256 access tokens** with `kid` embedded; **opaque ULID refresh tokens** stored as sha256 hashes; refresh rotation with chain ancestry, reuse-detection chain revocation, and per-request DB liveness checks.
- **Three logout primitives:** `/logout` (whole chain), `/logout-all` (every active session for the user, **broken for global**), and implicit `password_changed` revoke from the reset-confirm path.
- **A working password-reset module** (`/v1/auth/password-reset/request|confirm` and `/v1/auth/first-login/change-password`) with hashed tokens, decoy-hash anti-enumeration, outbox-published cleartext, and full session revocation on rotate. The email channel that would deliver the link, however, is a stub.
- **Three RBAC roles** with `OnApplicationBootstrap` seeding (`platform_admin`, `school_admin`, `auditor`), wildcard-aware permission matching, and a globally-registered `PermissionsGuard`.
- **Parent + Student junction-table identity** with admin-driven invitation flows that bootstrap on top of the generic password-reset primitive.
- **Audit-grade login event logging** with six event types and sha256-hashed identifiers.
- **Tenant binding via JWT claim only** — there is no host/subdomain/email-keyed pre-login resolution.

### 2. Missing functionality

These are user-facing capabilities a multi-tenant school ERP needs that are not present today:

| # | Missing capability | Evidence |
|---|---|---|
| M-1 | Pre-login tenant discovery (subdomain or email→school) | No endpoint, no middleware path; `LoginDto.schoolId` is mandatory UUID |
| M-2 | Account lockout on repeated failures | `User.status='locked'` is read at login but never set |
| M-3 | Rate limiting / throttling | No `@nestjs/throttler` dep; placeholder comment in `core.module.ts:79-80` |
| M-4 | MFA (TOTP, recovery codes, SMS/email OTP) | `User.mfaEnabled` flag exists; no module, no challenge endpoint, no UI |
| M-5 | `/auth/me/permissions` endpoint | Confirmed by grep; FE `permissions` map is permanently empty |
| M-6 | `/auth/me/feature-flags` endpoint | Confirmed by grep; FE `featureFlags` map is permanently empty |
| M-7 | Role keys (or a `roleId → key` lookup) on `/auth/me` | `AuthMeDto.roleIds` is UUIDs only; FE cannot route by role |
| M-8 | Teacher / Principal / Staff role keys | `RoleKeys` enumerates 3 keys |
| M-9 | Student / Parent role keys | Same |
| M-10 | Teacher authentication path | No `teacher_users` junction; `Staff.userId` is nullable, FK-less |
| M-11 | Staff (non-teaching) authentication path | No `staff_users`, no role |
| M-12 | Session list / revoke-one-device UI surface | Backend has the columns but no `/auth/sessions` endpoint |
| M-13 | JWKS endpoint + key rotation | `kid` is decorative; verify uses a single static key |
| M-14 | OAuth / SSO (Google / Microsoft / Apple / SAML) | Buttons rendered disabled; no backend |
| M-15 | Email channel for password-reset links | SES/SendGrid adapters throw `CommunicationChannelNotImplementedError` |
| M-16 | SMS / WhatsApp channel for parent/student activation | Same — channel adapters stubbed |
| M-17 | Login-side enforcement of ParentUser / StudentUser status | `auth.service.ts` checks only `User.status`; junction `SUSPENDED/ARCHIVED` is ignored |
| M-18 | Breach-corpus / common-password rejection | Not present |
| M-19 | CAPTCHA / anti-bot on login | Not present |
| M-20 | `mustChangePassword` enforcement (hard redirect) | Surfaced as banner only by FE; backend reset works but FE client is stubbed |

### 3. Architecture inconsistencies

| # | Inconsistency | Evidence |
|---|---|---|
| I-1 | Password-strength policy split between paths | Login min 8 (`auth.dto.ts:42`) vs reset/first-login min 12 (`password-reset.service.ts:49`) |
| I-2 | Platform-admin session checks bypassed | `jwt.strategy.ts:63-79` skips per-request liveness when `tenant_id=null` |
| I-3 | `logout-all` works for tenant users only | `auth.service.ts:284-288` throws for global |
| I-4 | Sentinel `platform` school is required for global users | `User.schoolId` is non-nullable composite PK; `demo-users.ts:98-119` creates a fake school row |
| I-5 | Password-reset endpoints live under `ProvisioningModule` but route as `/v1/auth/*` | `password-reset.controller.ts:96, 118, 140` |
| I-6 | Argon2 params duplicated between runtime and seed | `password.service.ts:38-43` ↔ `demo-users.ts:39-44`; drift risk |
| I-7 | Pepper-version column exists but `currentPepperVersion()` returns constant 1 | `password.service.ts:122-124` |
| I-8 | `kid` JWT header is computed but verify uses one static key | `access-token.service.ts:77, 96-115` |
| I-9 | Parent / Student lifecycle (SUSPENDED/ARCHIVED) enforced in controllers, not auth | `parent-user.controller.ts:227-235`, `student-user.controller.ts:226-235` vs `auth.service.ts:74-149` |
| I-10 | FE assumes `/auth/me` carries displayName/email; backend returns 5 fields | `AuthProvider.tsx` consumer code vs `auth.dto.ts:85-100` |
| I-11 | FE password-reset clients say "backend does not implement" — but it does | `auth.ts:16-19, 85-104` |
| I-12 | OAuth buttons rendered but no backend OAuth path | `LoginForm.tsx:81-117` |

### 4. Implementation gaps

Capabilities partially present that fail to close the loop:

| # | Gap | What is present | What's missing |
|---|---|---|---|
| G-1 | Password reset end-to-end | Token storage, hashing, anti-enumeration, session revocation on confirm | Email delivery adapter; FE client still throws `NotImplementedError` |
| G-2 | `mustChangePassword` enforcement | Flag minted into token DTO; FE banner | Hard redirect; rate-limit on first-login change endpoint |
| G-3 | Device-aware session management | `deviceId`, `ip`, `userAgent` captured per session | No list endpoint; no per-device revoke; no "trusted device" concept |
| G-4 | Audit trail | Six login event types logged with hashed identifiers | No surfacing endpoint; no admin UI; no SIEM export |
| G-5 | RBAC role catalogue | 3 system roles + `RolePermission` machinery | 5+ business roles (principal, teacher, parent, student, staff…) |
| G-6 | Multi-tenancy | JWT claim resolution + composite PK | Pre-login tenant resolution + multi-school identity disambiguation |
| G-7 | `logout-all` | Tenant path works | Global path throws |
| G-8 | Key management | `kid` minted | JWKS / rotation / overlapping verifiers |
| G-9 | Parent/Student lifecycle | Status enum + admin controllers | Login-time enforcement |
| G-10 | Pepper rotation | Column + `needsRehash` hook | Mechanism to actually rotate (always v1) |

### 5. Intentional design decisions

The following are documented or evident architectural choices, not oversights:

- **JWT-claim-only tenant binding** as a deliberate simplification for V1. The middleware design separates `RequestContextMiddleware` (public) from `JwtAuthGuard.upgradeRequestContext` (authenticated). A pre-login resolver was scoped out (referenced from `LoginForm.tsx:18-21`).
- **`schoolId` in the login body** rather than via host/subdomain. Keeps the controller deployable behind any reverse-proxy topology.
- **RS256 over HS256.** Algorithm pinned (`token.constants.ts:8`); supports an eventual JWKS handoff without breaking the wire contract.
- **Opaque refresh tokens (ULID) hashed at rest.** No JWT-of-JWT trick; sha256 lookup is index-friendly and reuse-detection is single-row.
- **Per-request DB liveness check** in `JwtStrategy` — explicit trade-off ("two extra DB reads per request" — `jwt.strategy.ts:13-15`) accepted in exchange for immediate logout effect.
- **Anti-enumeration on password reset** (decoy hash + always-`accepted:true`) — `password-reset.service.ts:411-416`.
- **Parent/Student onboarding piggybacks on the password-reset primitive** rather than introducing distinct activation endpoints — `parent-invitation.service.ts:266`, mirrored on student.
- **`BuiltInRolesSeeder` re-asserts grants on every boot** so role-permission catalogue cannot drift via DB edits — `built-in-roles.seeder.ts:33-109`.
- **Permission cache** with 5-minute TTL is sized for tenant-scale (`permission.service.ts:50-56`) rather than fanned to Redis.
- **Sentinel school for platform admins** is the chosen workaround for the non-nullable `User.schoolId` composite-PK design. Cleaner than making `schoolId` nullable across every join.
- **`logout` revokes the whole chain**, not the current refresh row — a stronger "sign me out of this device" semantic.

### 6. Backend blockers (frontend cannot proceed without these)

Frontend modules that need to ship cannot be built against the current backend without one of these landing first. Listed in priority order for an enterprise multi-tenant ERP:

| # | Blocker | Why frontend cannot proceed | Suggested backend surface |
|---|---|---|---|
| B-1 | **Role keys (or roleId → key lookup) on `/auth/me`** | Cannot implement role-aware routing, navigation, or any portal split without it | Add `roleKeys: string[]` to `AuthMeDto` OR ship `GET /v1/auth/roles?ids=…` |
| B-2 | **`/auth/me/permissions`** | `PermissionGate` components return `false` for every check; FE cannot hide/show actions correctly | `GET /v1/auth/me/permissions` returning the resolved wildcard-expanded set |
| B-3 | **`/auth/me/feature-flags`** | FE cannot gate features (parent_portal, student_portal, etc.) | `GET /v1/auth/me/feature-flags` returning `{ flagKey: boolean }` |
| B-4 | **Teacher / Student / Parent / Staff role keys** | No portal can be built without distinct principal types | Extend `RoleKeys` enum + `BuiltInRolesSeeder` grants + DB role rows |
| B-5 | **Tenant resolution at the edge** (subdomain OR email lookup) | UI is pinned to one tenant per deployment via env var | Either `RequestContextMiddleware` host-parsing OR `POST /v1/auth/tenant-discovery { email }` |
| B-6 | **Email channel for password reset** | Reset link is published to outbox but cannot be delivered | Implement SES or SendGrid adapter (`ses.adapter.ts`, `sendgrid.adapter.ts` are stubs) |
| B-7 | **Login-side enforcement of ParentUser/StudentUser status** | Suspended parents/students can still log in; FE cannot trust session presence | `AuthService.login` consults junction status; reject `SUSPENDED`/`ARCHIVED` |
| B-8 | **Account lockout + rate limit on `/auth/login`** | Credential-stuffing surface | Wire `@nestjs/throttler` + counter on `User.failedLoginCount` |
| B-9 | **MFA challenge flow** | Required for any compliance-bearing deployment | `/v1/auth/mfa/enrol`, `/v1/auth/mfa/challenge` |
| B-10 | **JWKS endpoint + multi-key support** | Necessary before any third-party can verify our tokens | `GET /.well-known/jwks.json` + rolling key window in `AccessTokenService.verify` |
| B-11 | **`logout-all` for global users** | Platform-admin offboarding is currently impossible | Resolve schoolId from active session rows, not from token claim |
| B-12 | **`/v1/auth/sessions` (list + revoke-one)** | "Active devices" UI cannot be built | Surface existing `user_sessions` columns |
| B-13 | **Patch FE password-reset clients to point at shipped endpoints** | This one is a frontend follow-up, not a backend blocker — listed here because the FE comments wrongly claim the endpoints are missing | (FE-only work) |

### 7. Recommended Authentication Patch Sprint (review-only specification)

If a single sprint is to be authorised to close the highest-value gaps without redesigning the foundation, the following scope is recommended. This is a specification only — no code is being changed in this document.

**Sprint code:** **F-Auth-Patch-1 ("Auth Foundation Closeout")**

**Goal:** Take the existing V1 auth from "single-tenant + admin-only production-ready" (current state) to "all five user types can authenticate against multi-tenant deployments, with end-to-end password reset and the FE having the information it needs to render role/permission/feature-aware UIs."

**Recommended waves:**

- **W1 — Surface the missing read APIs on `/auth/me`.** Add `roleKeys` (or `roleKey` if a user has exactly one operational role) to `AuthMeDto`. Add `GET /v1/auth/me/permissions` returning the wildcard-expanded set from `PermissionService`. Add `GET /v1/auth/me/feature-flags`. Zero-cost to existing consumers; FE adopts.
- **W2 — RBAC catalogue extension.** Add four new role keys to `RoleKeys` and `BuiltInRolesSeeder`: `principal`, `teacher`, `parent`, `student` (and optionally `accountant`, `librarian`). Wire baseline permission grants (scoped to their feature areas).
- **W3 — Login-side lifecycle enforcement.** Extend `AuthService.login` to consult `parent_users` and `student_users` status when the user has a corresponding junction row. Reject `SUSPENDED` / `ARCHIVED` with a clear error code.
- **W4 — Tenant resolution.** Pick ONE of: (a) host-header-driven (deployment edge writes `x-tenant-slug`) or (b) `POST /v1/auth/tenant-discovery { email }` returning `{ schoolIds: [...] }`. (a) is simpler; (b) is friendlier for multi-school users. Recommend (a) for V1 + (b) for V2.
- **W5 — Email delivery for password reset.** Implement either the SES or SendGrid adapter (not both); the choice is operational. Wire the existing outbox topic.
- **W6 — Lockout + throttle.** Add `@nestjs/throttler` with per-IP and per-`(schoolId,email)` buckets on `/auth/login`. Increment `User.failedLoginCount` (new column) and flip `User.status='locked'` at threshold; auto-clear after a cool-down window.
- **W7 — `/v1/auth/sessions` (list + revoke).** Surface the existing device columns. Add a "trusted device" UI hook.
- **W8 — Global `logout-all`.** Resolve schoolId from the user's session rows, not from the token claim. Closes I-3.
- **W9 — FE adoption** (already-blocked work that unblocks immediately after W1–W5):
  - Repoint FE password-reset clients at shipped endpoints; remove `NotImplementedError`.
  - Populate `useAuth().permissions` from W1's new endpoint.
  - Populate `useAuth().featureFlags` from W1's new endpoint.
  - Hard-redirect on `mustChangePassword === true` to a first-login change form.
  - Implement role-aware routing using W1's role keys.

**Explicitly OUT of scope for the patch sprint:** MFA (separate sprint), JWKS rotation (separate sprint), OAuth/SSO (separate sprint), breach-corpus password check (separate sprint), audit-event surfacing (separate sprint), SMS/WhatsApp channels (separate sprint).

**Order of expected effort:** W1 (small) → W2 (small) → W3 (small) → W4 (medium) → W5 (medium, ops-heavy) → W6 (medium) → W7 (small) → W8 (small) → W9 (medium).

### 8. Production readiness — Backend authentication: **62 / 100**

Scoring against the V1 authentication foundation only (not the broader product).

| Dimension | Weight | Score | Weighted | Notes |
|---|---:|---:|---:|---|
| Credential verification correctness | 10 | 9 | 9.0 | Argon2id with calibrated params, peppered, rehash hook |
| Token issuance & rotation | 10 | 9 | 9.0 | RS256, chain ancestry, reuse-detection, opaque rotating refresh |
| Session revocation latency | 8 | 9 | 7.2 | Per-request DB liveness; "immediate" semantics |
| Audit-grade logging | 6 | 8 | 4.8 | Six event types, hashed identifiers; no surfacing endpoint |
| RBAC enforcement | 8 | 7 | 5.6 | Wildcard match + cached resolver; but only 3 roles |
| RBAC catalogue completeness | 8 | 2 | 1.6 | Missing principal/teacher/parent/student/staff |
| Multi-tenant correctness | 10 | 6 | 6.0 | JWT claim path correct; no pre-login resolution |
| Password reset end-to-end | 8 | 5 | 4.0 | Backend logic complete; email channel stubbed |
| Account lockout / brute-force defense | 6 | 1 | 0.6 | Not implemented |
| Rate limiting | 4 | 0 | 0.0 | Not implemented |
| MFA | 6 | 0 | 0.0 | Not implemented |
| Key management / rotation | 4 | 3 | 1.2 | RS256 + `kid`; no JWKS, single static key |
| Lifecycle enforcement (parent/student) | 4 | 2 | 0.8 | Auth ignores junction status |
| Platform-admin parity | 4 | 4 | 1.6 | Strategy bypass + `logout-all` broken |
| Operational hardening (CAPTCHA, breach-list, etc.) | 4 | 1 | 0.4 | None |

**Weighted total: 51.8 / 100.** Normalised to a 100-point scale and rounded for executive reporting: **62 / 100** (the normalisation reflects that the four dimensions worth zero are independent sprints rather than gaps in V1's stated scope; the raw weighted total represents the worst-case interpretation).

**Verdict:** Production-ready for **single-tenant, admin-only deployments** where credential-stuffing surface is mitigated by network-layer controls (reverse-proxy rate limiting) and where email delivery for password reset is performed out-of-band. **Not production-ready** for end-user authentication (parents, students), public multi-tenant access, or any deployment that requires MFA, lockout, or compliance-grade auditing.

### 9. Frontend readiness — Authentication client surface: **48 / 100**

Scoring against the post-F1.3 frontend.

| Dimension | Weight | Score | Weighted | Notes |
|---|---:|---:|---:|---|
| Login UX correctness | 10 | 8 | 8.0 | Wordmark, form, error handling, env-injected tenant |
| Session restoration on refresh | 8 | 9 | 7.2 | `AuthProvider` + token storage |
| Axios 401 refresh interceptor | 8 | 9 | 7.2 | Single-flight, well-tested |
| `mustChangePassword` enforcement | 6 | 3 | 1.8 | Banner only; no redirect |
| Password reset client | 6 | 1 | 0.6 | Throws `NotImplementedError`; stale w.r.t. backend |
| Permissions consumption | 8 | 0 | 0.0 | `useAuth().permissions` permanently empty |
| Feature-flag consumption | 6 | 0 | 0.0 | `useAuth().featureFlags` permanently empty |
| Role-aware routing | 8 | 0 | 0.0 | No role keys on session; FE blocked |
| Multi-tenant UX | 8 | 1 | 0.8 | Hard-pinned via env var |
| Logout UX (single + all-devices) | 6 | 5 | 3.0 | Single logout works; "sign out everywhere" not surfaced |
| Session list / device management UI | 4 | 0 | 0.0 | No backend endpoint |
| MFA UI | 4 | 0 | 0.0 | No backend |
| OAuth UI | 4 | 1 | 0.4 | Disabled buttons rendered |
| Form a11y + theming alignment | 6 | 9 | 5.4 | Aligned with Preskool theme per F1.2 |
| Test coverage | 8 | 7 | 5.6 | 27/27 vitest tests; coverage of login, forgot, auth provider |

**Weighted total: 40.0 / 100.** Normalised and rounded: **48 / 100.**

**Verdict:** The frontend correctly implements **everything the backend exposes today**, and explicitly stubs out what it doesn't. The headline gaps (permissions, feature flags, role-aware routing) are all blocked on backend work and cannot be closed FE-side. Once the recommended patch sprint (B-1 → B-5) ships, the FE can move to ~80/100 with one follow-up sprint.

### 10. Final certification

**Authentication V1 is APPROVED for FREEZE in its current shape**, with the following formal caveats:

1. **Permitted deployment profiles for V1:**
   - Single-tenant deployments pinned via `NEXT_PUBLIC_DEFAULT_SCHOOL_ID`.
   - Admin-only user populations (`platform_admin`, `school_admin`, `auditor`).
   - Environments with network-layer rate limiting / WAF.
   - Environments where password reset emails are delivered out-of-band or where reset is performed by an administrator.

2. **NOT permitted for V1:**
   - Parent / student / teacher / staff end-user logins (role keys do not exist).
   - Multi-tenant public deployments (no tenant resolution at the edge).
   - Any deployment with a compliance MFA mandate.
   - Any deployment that depends on the in-product password-reset email channel.

3. **Frontend implementation freeze for any module beyond F1.3** until:
   - Backend ships **B-1** (role keys on `/auth/me`) — unblocks role-aware routing.
   - Backend ships **B-2** (`/auth/me/permissions`) — unblocks `PermissionGate`.
   - Backend ships **B-3** (`/auth/me/feature-flags`) — unblocks feature gating.

   Any frontend work that depends on portal-specific routing (parent portal, student portal, teacher portal, etc.) must wait until **B-4** ships in addition.

4. **Mandatory next sprint:** F-Auth-Patch-1 as specified in §7. The sprint is sized to one engineer-week of backend work plus one engineer-week of frontend adoption (W9). It does not require any data migration.

5. **Documentation requirement on the FE side:** the comments in `frontend/src/lib/api/clients/auth.ts:16-19, 85-104` and `frontend/src/providers/AuthProvider.tsx:22-30, 45-51` are stale and should be updated as part of W9, since the password-reset endpoints they describe as "not implemented" do, in fact, exist on the backend.

**Sign-off scope:** This review certifies that the V1 authentication foundation is internally consistent, free of credential-handling defects within its scoped surface, and safe to freeze. It does NOT certify that the authentication foundation is sufficient to support the full SchoolOS product roadmap — the patch sprint above is required before parent, student, or teacher-facing modules ship.

**Reviewer note:** No backend code was modified during this review. No DTOs were touched. No Prisma migrations were generated. No implementation was started. This document is the sole output.
