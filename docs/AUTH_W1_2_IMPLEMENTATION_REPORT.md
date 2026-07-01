# Wave W1.2 — Authentication Foundation Repository Layer (Implementation Report)

**Plan reference:** `docs/AUTHENTICATION_PATCH_PLAN.md` (Rev 3.1)
**Wave scope:** Repository layer only — additive `UserRepository` methods,
new `RefreshTokenService` options bag, extended `LoginEventType` union, and
a typed `ConfigService.auth` accessor. No behavioural changes to login,
refresh, logout, AuthService, controllers, DTOs, guards, middleware, RBAC,
or any other layer.
**Date:** 2026-06-28

## 1. Scope Confirmation

This wave stays entirely inside the W1.2 boundary defined by the plan:

- `UserRepository` gained four additive methods.
- `RefreshTokenService.generate()` now accepts an optional options bag; the
  no-arg call retains the pre-W1.2 contract verbatim.
- `LoginEventRepository` gained two new union members (`account_locked`,
  `account_unlocked`) — TypeScript only, no Prisma / database change.
- `ConfigService` gained an `auth` getter so the new TTL keys (added in
  W1.1) become typed-accessor-reachable for `RefreshTokenService`.
- `SessionRepository` was **not** modified — its existing API already
  supports caller-supplied `expiresAt`, which is sufficient for refresh-
  chain expiry preservation.

No DTO, controller, service-flow, guard, middleware, tenant-resolver,
feature-flag, RBAC, password-reset, or login-surface code was touched.

## 2. Files Modified

| Path | Change |
|------|--------|
| `backend/src/core/config/config.service.ts` | Imported `AuthConfig` type; added `public get auth(): AuthConfig` accessor returning `this.snapshot.auth`. No other accessor altered. |
| `backend/src/core/auth/repositories/user.repository.ts` | Added new exported `UserLoginRow` interface (extends `UserRow` with `failedLoginCount: number` and `lockedUntil: Date \| null`). Added four additive methods: `findForLoginByIdentifier`, `incrementFailedAttempts`, `clearFailedAttempts`, `applyLockUntil`. `findForLogin`, `findActiveById`, `markLogin`, `upgradePasswordHash` are unchanged. |
| `backend/src/core/auth/repositories/login-event.repository.ts` | Added `'account_locked' \| 'account_unlocked'` to the `LoginEventType` union. No schema, no Prisma migration, no behaviour change. |
| `backend/src/core/auth/token/refresh-token.service.ts` | Added new exported `GenerateRefreshTokenOptions` interface. Refactored `generate()` to accept an optional options bag while preserving the no-arg legacy contract. Added private `resolveTtlSeconds(options?)` helper. |

## 3. Files Created

None. The wave is implemented entirely as additive edits to existing files.

## 4. Files NOT Modified (per scope guard)

* `backend/src/core/auth/repositories/session.repository.ts` — left alone;
  see §6 for why no change was required.
* `backend/src/core/auth/auth.service.ts` — login / refresh / logout flows
  untouched.
* `backend/src/core/auth/auth.controller.ts`, `auth.dto.ts`,
  `jwt-auth.guard.ts`, `token/jwt.strategy.ts`, `password/*` — untouched.
* `backend/src/core/request-context/**` — untouched.
* `backend/src/core/feature-flag/**`, `core/rbac/**` — untouched.
* `backend/prisma/schema/**` — no schema changes; no new migration.

## 5. Repository Methods Added

### `UserRepository`

| Method | Signature | Notes |
|--------|-----------|-------|
| `findForLoginByIdentifier` | `(schoolId: string, identifier: string) => Promise<UserLoginRow \| null>` | Same lookup shape as `findForLogin` but returns the W1.1 lockout columns (`failedLoginCount`, `lockedUntil`) in the row. Treats `identifier` as the email (case-insensitive). Returns `null` when the user or its `userPassword` row is missing. |
| `incrementFailedAttempts` | `(schoolId: string, userId: string) => Promise<number>` | Atomic `increment: 1` on `failed_login_count`; returns the post-write counter so the caller can decide whether the threshold has been crossed without a second SELECT. Uses the composite-PK `schoolId_id` shorthand. |
| `clearFailedAttempts` | `(schoolId: string, userId: string) => Promise<void>` | Resets `failed_login_count = 0` and `locked_until = null`. Idempotent; safe to call on a clean row. |
| `applyLockUntil` | `(schoolId: string, userId: string, lockedUntil: Date) => Promise<void>` | Persists the lockout deadline. The caller computes the deadline from `auth.lockoutDurationSeconds`; this method only writes it. |

`UserRow` (existing) is preserved verbatim. `UserLoginRow` is a new
type that **extends** `UserRow` rather than replacing it, so existing
callers of `findForLogin` continue to compile against the same shape.

### `RefreshTokenService`

`generate()` overload — the public method now accepts an optional
`GenerateRefreshTokenOptions`:

```ts
interface GenerateRefreshTokenOptions {
  readonly rememberMe?: boolean;
  readonly ttlOverrideSeconds?: number;
  readonly chainExpiresAt?: Date;
}
```

TTL resolution rules (encapsulated in `resolveTtlSeconds`):

| Call form | TTL source |
|-----------|------------|
| `generate()` (no args) | `config.jwt.refreshTtlSeconds` — legacy contract preserved. |
| `generate({ rememberMe: true })` | `config.auth.refreshTtlRememberMeSeconds` (30d default). |
| `generate({ rememberMe: false })` or `generate({})` | `config.auth.refreshTtlDefaultSeconds` (1d default). |
| `generate({ ttlOverrideSeconds: N })` | Explicit override beats remember-me. |

Chain expiry preservation: when `options.chainExpiresAt` is supplied the
returned `expiresAt` is clamped to `min(now + ttl, chainExpiresAt)`, so a
rotated session can never outlive the chain it inherits.

`hash(token)` and `isWellFormed(value)` are unchanged.

### `LoginEventRepository`

`LoginEventType` union gained two values:

```ts
export type LoginEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'refresh_rotated'
  | 'refresh_reused'
  | 'session_revoked'
  | 'account_locked'      // W1.2
  | 'account_unlocked';   // W1.2
```

No Prisma schema or migration touched — `user_login_events.event_type` is
already a `VARCHAR(32)` accepting any string, so the column already stores
these values. The change is purely TypeScript so future callers gain
compile-time guarantees.

## 6. SessionRepository Changes

**None.** A full pass through `session.repository.ts` against the W1.2
requirements confirmed:

- Refresh-chain expiry preservation is caller-driven via the existing
  `CreateSessionInput.expiresAt: Date` parameter. `createForLogin` and
  `createForRotation` already accept the value verbatim; clamping to the
  chain deadline is `RefreshTokenService.generate({ chainExpiresAt })`'s
  job, not the repository's.
- Remember-me does not change session-row shape — only the deadline.
- Lockout state lives on the `users` row, not `user_sessions`.

Therefore `SessionRepository` is intentionally untouched. Modifying it
would have been a redesign, which the plan explicitly forbids.

## 7. RefreshTokenService Changes

Detailed in §5. The key invariant: the legacy no-arg path is byte-for-byte
identical to pre-W1.2 behaviour. The existing unit-spec
(`refresh-token.service.spec.ts`) constructs the service with a
`makeConfig(refreshTtlSeconds)` mock that only exposes
`jwt.refreshTtlSeconds`; that mock continues to satisfy the no-arg path
because `resolveTtlSeconds(undefined)` reads exclusively from
`config.jwt.refreshTtlSeconds`. The new options-driven path consults
`config.auth.*`, but the spec never exercises that path.

## 8. LoginEventRepository Changes

Detailed in §5. Union-only; Prisma schema and database tables are
untouched.

## 9. Verification Results

| Step | Command | Result |
|------|---------|--------|
| Prisma client | `npx prisma generate` | ✅ Generated cleanly (Prisma 6.19.3). |
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors in W1.2 surface. Two pre-existing errors (`test/sprint14/helpers.ts:122`, `test/sprint4_5/branch.e2e-spec.ts:65`) persist — both pre-date this wave and are documented in `docs/AUTH_W1_1_IMPLEMENTATION_REPORT.md` §8. No new errors introduced. |
| Build | `npm run build` | ✅ `nest build` completes with 0 errors. |
| Boot | `npm run start:dev` | ✅ `Nest application successfully started`, `listening on http://127.0.0.1:3000`. No DI errors. The Billing/Subscription DI fix from `docs/BILLING_DI_FIX_REPORT.md` is in place; W1.2 added no new module wiring. |

### Boot transcript (relevant lines)

```
[ 9:48:48 am] Found 0 errors. Watching for file changes.
[bootstrap] schoolos-api@0.1.0 listening on http://127.0.0.1:3000
INFO  Nest application successfully started   {"context":"NestApplication"}
```

## 10. Issues Encountered & Resolutions

| # | Issue | Resolution |
|---|-------|------------|
| 1 | First boot attempt failed at runtime with `PrismaClientInitializationError: Can't reach database server at localhost:3307`. | Environmental — the MySQL container (`schoolos-mysql`) had been stopped between sessions. Restarting the container (it became `Up (healthy)` on `0.0.0.0:3307->3306/tcp`) and re-running `npm run start:dev` produced a clean boot. Not a W1.2-introduced issue and required no code change. |
| 2 | Existing unit tests for `RefreshTokenService` mock `ConfigService` as `{ jwt: { refreshTtlSeconds } }` only. If the new `generate({...})` path ever read `config.auth.*` for the no-arg case, the mock would break. | The implementation isolates the legacy path in `resolveTtlSeconds(undefined)`, which reads exclusively from `config.jwt.refreshTtlSeconds`. The `auth` accessor is consulted only when `options` are supplied. Existing tests remain green by construction. |
| 3 | Pre-existing tsc errors in `test/sprint14/helpers.ts:122` and `test/sprint4_5/branch.e2e-spec.ts:65`. | Out of W1.2 scope; flagged in §9 — they are a known carry-over from W1.1. |

## 11. Backward Compatibility Notes

- `UserRepository.findForLogin` is unchanged. Existing AuthService login
  call sites continue to compile and behave identically.
- `RefreshTokenService.generate()` (no args) is unchanged. Existing
  AuthService login + refresh paths continue to receive a token whose
  TTL is `config.jwt.refreshTtlSeconds`.
- `LoginEventRepository.record(event)` is unchanged. Adding two members
  to the discriminated union is type-safe — existing callers still pass
  one of the original six values.
- `ConfigService.auth` is a new accessor; no existing accessor is altered.

## 12. Stop Point

W1.2 implementation complete. **Not** continuing to W1.3.
