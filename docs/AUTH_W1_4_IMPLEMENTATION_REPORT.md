# Authentication Wave W1.4 — Implementation Report

**Sprint:** Authentication Patch Plan
**Wave:** W1.4 — Business Logic
**Status:** ✅ Complete
**Date:** 2026-06-28

---

## 1. DTO Alignment Performed

Before W1.4 began, `LoginIdentifierType` was rebased to match the approved School ERP V1 launch contract.

**File:** `backend/src/core/auth/auth.dto.ts`

| Before (generic SaaS) | After (V1 School ERP) |
|-----------------------|----------------------|
| `'email' \| 'username' \| 'phone'` | `'email' \| 'admission_no'` |

Future-only identifier types are now documented on the type's JSDoc (no validation, no service path):

- `student_id` — internal student UUID, primarily for SSO bridges/admin tooling.
- `roll_number` — class-level identifier; needs a richer login payload than V1 carries (school + academic year + class tuple).

The companion runtime tuple `LOGIN_IDENTIFIER_TYPES` was updated in lockstep so `class-validator`'s `@IsIn(...)` accepts exactly the V1 values. The DTO contract is the only entry-point for identifier validation; AuthService still treats `admission_no` as not-yet-implemented and returns the generic `InvalidCredentialsError` (no enumeration leak).

**No other DTO fields were touched.**

---

## 2. Business Logic Implemented

The following nine items were delivered inside `AuthService` and its repositories only — no controller, guard, or RBAC changes.

### 2.1 AuthService login orchestration
`AuthService.login()` is now a single end-to-end orchestrator that:

1. Resolves the inbound login address (`resolveLoginAddress`) from either the legacy `{schoolId, email}` shape **or** the W1.3 additive `{tenantSlug, identifier, identifierType}` shape.
2. Loads the user via `UserRepository.findForLoginByIdentifier(schoolId, email)`.
3. Checks the lockout window before doing any password work.
4. Verifies the password against the peppered argon2id hash.
5. Runs the failed-attempt counter / lockout / unlock paths (see §2.3–2.4).
6. Best-effort upgrades stale hash params via `PasswordService.needsRehash`.
7. Mints a refresh token honouring Remember Me (§2.5) and chain expiry (§2.6).
8. Creates the session row, signs the access token, and records `login_success`.
9. Builds the `AuthMeDto` summary (§2.8) and returns the populated `AuthTokenPair` with `user` populated (§2.9).

### 2.2 Login validation
- `resolveLoginAddress(input)` enforces that exactly one of the two contracts is satisfied; otherwise throws `InvalidCredentialsError` (uniform response, no enumeration).
- V1 only accepts `identifierType === 'email'`; `admission_no` is wire-accepted but the service-layer lookup is not yet implemented and returns `InvalidCredentialsError`.
- `tenantSlug` resolves via `prisma.client.school.findFirst({ where: { slug, deletedAt: null } })`. Unknown slugs return `InvalidCredentialsError` (not `TenantNotFoundError`) to avoid tenant-existence leaks.
- Status check (`disabled`, `locked`) runs **after** password verify so a wrong password and a disabled account look identical on the wire.

### 2.3 Failed login counter
- On each `verify` failure, `UserRepository.incrementFailedAttempts(schoolId, userId)` increments and returns the new count.
- When the new count `>= auth.lockoutMaxAttempts` (default `5`), `UserRepository.applyLockUntil` sets `lockedUntil = now + auth.lockoutDurationSeconds` and the service emits `account_locked` audit.
- `login_failure` events carry `reason: 'invalid_password' | 'unknown_user' | 'tenant_not_found' | 'identifier_not_supported'` for downstream analytics.

### 2.4 Account lock
- `isLockedOut(user, now)` is called as the **first** post-fetch check. A live lock short-circuits the verify path entirely and throws `UserDisabledError` so timing is constant relative to a "locked-on-arrival" case.
- On successful password verify, if the user *was* locked previously (`failedLoginCount > 0` or `lockedUntil` set), `UserRepository.clearFailedAttempts` resets both columns and `account_unlocked` is emitted alongside `login_success`.

### 2.5 Remember Me behaviour
- `RefreshTokenService.generate({ rememberMe })` now picks `auth.refreshTtlRememberMeSeconds` (30d default) versus `auth.refreshTtlDefaultSeconds` (1d default) per call.
- DTO carries `rememberMe?: boolean`; controller forwards as-is. Default `false` when omitted.
- Persisted on `UserSession.expiresAt`; refresh-chain rotations clamp to this ceiling (see §2.6) so Remember Me does not extend silently across rotations.

### 2.6 Refresh token chain preservation
- `SessionRepository.findChainRoot(chainId)` was added — it returns the session row with `parentSessionId === null` whose `expiresAt` is the chain's original deadline.
- `AuthService.refresh()` reads the chain root inside the rotation transaction, computes `chainCeiling = chainRoot?.expiresAt ?? existing.expiresAt`, and passes it to `RefreshTokenService.generate({ chainExpiresAt })`. The generator clamps to `min(now + ttl, chainExpiresAt)`.
- Effect: the refresh chain cannot outlive the original login window even under heavy rotation, regardless of how many times the client refreshes.

### 2.7 Feature flag resolution
- `FeatureFlagService.knownKeys()` is iterated and each key is evaluated against `{ schoolId }` (no `userId` axis exists in the W1 evaluation context).
- `UnknownFeatureFlagError` is tolerated and skipped silently so a stale registry entry cannot 500 a login.
- Result is returned as `Readonly<Record<string, boolean>>` and embedded in `AuthMeDto.featureFlags`.

### 2.8 Populate AuthMeDto
`buildAuthMe()` collects:

| Field | Source |
|-------|--------|
| `userId`, `schoolId`, `actorScope`, `sessionId` | already on principal |
| `roleIds` | `UserRoleRepository.listActiveRoleIdsForUser` |
| `roles` (keys) | `RoleRepository.findManyByIds` then `.map(r => r.key)` |
| `permissions` | `PermissionService.resolveForRoles(roleIds)` |
| `displayName`, `email`, `mustChangePassword` | the `UserLoginRow` already loaded |
| `schoolSlug`, `locale`, `timezone` | direct `prisma.school.findFirst({ select: { slug, localeDefault, timezone } })` |
| `featureFlags` | §2.7 |

### 2.9 Populate AuthTokensDto.user
`toTokenPair()` was extended to accept an optional `user: AuthMeDto` parameter. When present (login path), it is spread into the returned `AuthTokenPair`. The refresh path deliberately omits `user` — the access token is already trusted there and the client can call `/auth/me` if it needs a fresh snapshot. Field is `?` on the type so refresh return shape remains valid.

---

## 3. Files Modified

| Path | Change |
|------|--------|
| `backend/src/core/auth/auth.dto.ts` | `LoginIdentifierType` rebased to `'email' \| 'admission_no'`; future-only types documented on JSDoc; `LOGIN_IDENTIFIER_TYPES` runtime tuple updated. |
| `backend/src/core/auth/auth.types.ts` | Added `user?: AuthMeDto` to `AuthTokenPair`; added type-only import of `AuthMeDto`. |
| `backend/src/core/auth/repositories/session.repository.ts` | Added `findChainRoot(chainId, tx?)` reader for chain-expiry preservation. |
| `backend/src/core/auth/auth.service.ts` | Full rewrite of `login()` orchestration; refresh-chain clamp; lockout pipeline; Remember Me; AuthMeDto/user population; feature-flag resolution; constructor expanded to 12 args (added `ConfigService`, `RoleRepository`, `PermissionService`, `FeatureFlagService`). |
| `backend/src/core/auth/auth.service.spec.ts` | Mocks aligned with new 12-arg constructor and renamed user-lookup method (`findForLogin` → `findForLoginByIdentifier`). |

No controller, guard, module-wiring, or schema changes.

---

## 4. Build Result

```
> @schoolos-saas/backend@0.1.0 build
> nest build

[done]  0 errors, 0 warnings
```

---

## 5. TypeScript Result

`npx tsc --noEmit` → **0 new errors**.

Two pre-existing carry-over errors remain (unrelated to W1.4):

- `test/sprint14/helpers.ts(122,20)` — pre-W1.4 helper drift.
- `test/sprint4_5/branch.e2e-spec.ts(65,15)` — pre-W1.4 spec drift.

Both predate this wave and are out of scope.

---

## 6. start:dev Result

```
[bootstrap] schoolos-api@0.1.0 listening on http://127.0.0.1:3000
[NestApplication] Nest application successfully started
```

All module bootstraps emitted clean (`AuthModule`, `RbacModule`, `FeatureFlagModule`, repositories), no missing-provider errors, no DI cycles. Config keys `auth.refreshTtlDefaultSeconds=86400`, `auth.refreshTtlRememberMeSeconds=2592000`, `auth.lockoutMaxAttempts=5`, `auth.lockoutDurationSeconds=900` all loaded.

---

## 7. Issues Encountered

1. **Prisma generate EPERM on Windows.** `prisma generate` failed with `EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp...'` because 16 stale `node.exe` processes from prior `start:dev` runs were holding the engine DLL.
2. **Test-spec constructor signature drift.** `auth.service.spec.ts` was authored against the 8-arg constructor used by W1.2. Expanding to 12 args broke compilation of the spec.
3. **Spec user-lookup method drift.** The spec mocked `users.findForLogin`, but W1.4 `login()` calls `users.findForLoginByIdentifier`. Tests would still type-check after fix #2, but would fail at runtime returning `undefined` from the mock.

---

## 8. Resolutions

1. **EPERM:** Killed stale node processes via `taskkill //F //IM node.exe` (16 processes), then re-ran `npx prisma generate` — succeeded on the second attempt. Generator output is deterministic; no schema regen needed.
2. **Constructor drift:** Extended `makeService()` in the spec to provide mocks for the four new collaborators (`ConfigService`, `RoleRepository`, `PermissionService`, `FeatureFlagService`) and updated the `new AuthService(...)` call site. Spec now compiles clean.
3. **Method rename:** `sed`-renamed the six occurrences of `findForLogin.mockResolvedValue` → `findForLoginByIdentifier.mockResolvedValue`. Each test scenario now drives the correct mock target so the runtime path matches the production wiring.

---

**Stop.** W1.5 is **not** started.
