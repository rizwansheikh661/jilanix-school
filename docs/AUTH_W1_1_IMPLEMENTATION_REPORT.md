# Wave W1.1 — Authentication Foundation Infrastructure (Implementation Report)

**Plan reference:** `docs/AUTHENTICATION_PATCH_PLAN.md` (Rev 3.1)
**Wave scope:** Infrastructure only — env config, additive Prisma columns, tenant
resolver, middleware ordering, FeatureFlagModule wiring into AuthModule.
**Date:** 2026-06-28

## 1. Scope Confirmation

This implementation deliberately stays inside the W1.1 boundary defined by
the plan. No behavioural changes are introduced to login, refresh, logout,
DTOs, repositories, AuthService, JwtAuthGuard, RBAC, password reset, or the
parent/teacher/student login surfaces. Those flows are tracked for later
waves.

## 2. Files Created

| Path | Purpose |
|------|---------|
| `backend/src/core/request-context/tenant-resolver.service.ts` | Resolves `Host` header (and `X-Tenant-Slug` fallback) to a `ResolvedTenant` (`scope`, `schoolId`, `slug`, `source`). Caches `slug → schoolId` in-process with a 60s TTL. Reads `School` via the existing PrismaService (`PLATFORM_ONLY` scope, no tenant context required). |
| `backend/src/core/request-context/tenant-resolver.middleware.ts` | NestMiddleware that calls `TenantResolverService.resolve()` and attaches the result onto `req.resolvedTenant`. Never short-circuits the request — a missing/unknown tenant lands as `scope: 'public'`. |
| `backend/prisma/schema/migrations/20260702010000_w1_1_user_account_protection/migration.sql` | Additive migration: adds `users.failed_login_count` and `users.locked_until`. |

## 3. Files Modified

| Path | Change |
|------|--------|
| `backend/src/core/config/env.schema.ts` | Added 4 new keys under a new `AUTH PATCH — V1 (Wave W1.1)` section: `AUTH_REFRESH_TTL_DEFAULT_SECONDS` (default 86_400), `AUTH_REFRESH_TTL_REMEMBER_ME_SECONDS` (default 2_592_000), `AUTH_LOCKOUT_MAX_ATTEMPTS` (default 5), `AUTH_LOCKOUT_DURATION_SECONDS` (default 900). Existing `JWT_REFRESH_TTL_SECONDS` kept untouched for backward compatibility. |
| `backend/src/core/config/types.ts` | New `AuthConfig` interface; new `auth` block on `AppConfiguration`; reads the four keys above in `buildAppConfiguration(env)`. |
| `backend/src/core/config/index.ts` | Export the new `AuthConfig` type. |
| `backend/prisma/schema/identity.prisma` | Added two additive columns to `User`: `failedLoginCount Int @default(0)` and `lockedUntil DateTime?`. No existing columns modified, no indexes touched. |
| `backend/src/core/request-context/request-context.module.ts` | Registered `TenantResolverService` and `TenantResolverMiddleware` as providers and exports. Imported `PrismaModule` via `forwardRef` (see §6 below). |
| `backend/src/core/request-context/index.ts` | Re-exported `TenantResolverMiddleware`, `TenantResolverService`, `ResolvedTenant`, `TenantResolverSource`, `RequestWithResolvedTenant`. |
| `backend/src/infra/prisma/prisma.module.ts` | Wrapped `RequestContextModule` import in `forwardRef` to break the new dependency cycle introduced by W1.1 (see §6). |
| `backend/src/core/core.module.ts` | Middleware order now: `TenantResolverMiddleware` → `RequestContextMiddleware`, applied to `forRoutes('*')`. Comment in the configure() block documents the rationale. |
| `backend/src/core/auth/auth.module.ts` | Added `FeatureFlagModule` to the `imports` array. No new provider, controller, or service added — reuse only. |

## 4. Tenant Resolution Rules

`TenantResolverService.resolve(host, headers)` returns a `ResolvedTenant`:

| Host pattern | Scope | schoolId | Notes |
|--------------|-------|----------|-------|
| `admin.schoolos.in` | `platform` | absent | No DB read. Source: `platform-host`. |
| `<slug>.schoolos.in` | `tenant` if slug resolves; otherwise `public` | from `schools.slug` lookup | Slug is sanitised (`^[a-z0-9][a-z0-9-]{0,99}$`); cached for 60s, bounded at 512 entries. Source: `slug-host`. |
| `app.schoolos.in` | `tenant` if `X-Tenant-Slug` header resolves; otherwise `public` | from header → slug lookup | Used by mobile / unified web app. Source: `header`. |
| `localhost` / `127.*` / `::1` / `0.0.0.0` | `tenant` if `X-Tenant-Slug` resolves; otherwise `public` | from header lookup | Development fallback. Source: `header` or `none`. |
| Any other host with `X-Tenant-Slug` | resolves via header | from header lookup | Defensive default for staging hosts not yet enumerated. |
| Anything else | `public` | absent | Tenant-aware routes will reject downstream. |

Resolution failures (DB errors, etc.) are logged at WARN level and downgraded
to `scope: 'public'` so the request never 500s at the middleware layer — the
authenticated routes in later waves are responsible for rejecting the absence
of a tenant.

The middleware writes `req.resolvedTenant`. **It does not yet upgrade the
RequestContext.** That lift (placing the resolved `schoolId` into the bound
`RequestContext`) belongs to the auth/JWT layer in a later wave and is
deliberately out of scope here per the plan.

## 5. Migration

* **Name:** `20260702010000_w1_1_user_account_protection`
* **SQL:** `ALTER TABLE users ADD COLUMN failed_login_count INT NOT NULL DEFAULT 0, ADD COLUMN locked_until DATETIME(3) NULL;`
* **Application path:** the dev database has unrelated pre-existing drift in
  earlier migrations (a documented Prisma workaround using nullable computed
  columns for partial-unique indexes — see migrations `20260623000000_*`,
  `20260620180000_*`, etc.), which prevents `prisma migrate dev` from
  running cleanly without a reset. To avoid destroying dev data, the W1.1
  migration was applied via `prisma db execute` and registered with
  `prisma migrate resolve --applied 20260702010000_w1_1_user_account_protection`.
  The migration file itself is committed under `prisma/schema/migrations/`
  and will apply normally in clean environments via `prisma migrate deploy`.

## 6. Architectural Note — Circular Module Dependency

W1.1 introduces a reciprocal import between `PrismaModule` and
`RequestContextModule`:

* PrismaModule has always imported RequestContextModule (its extension stack
  reads the ALS carrier).
* `TenantResolverService` (in RequestContextModule) now injects
  `PrismaService` to perform the slug → schoolId lookup.

This creates a construction-time cycle that Nest can't resolve without help.
Both sides are wrapped in `forwardRef`:

* `PrismaModule.imports = [ConfigModule, forwardRef(() => RequestContextModule)]`
* `RequestContextModule.imports = [forwardRef(() => PrismaModule)]`
* `TenantResolverService` constructor: `@Inject(forwardRef(() => PrismaService))`

This is the standard Nest idiom for module cycles. The two modules are both
`@Global`, both eagerly bootstrap, and the cycle exists only at the
DI-resolution layer (no runtime cycle).

## 7. Configuration Surface

| Env key | Default | Notes |
|---------|---------|-------|
| `AUTH_REFRESH_TTL_DEFAULT_SECONDS` | `86400` (1 day) | Refresh-token TTL when "remember me" is NOT requested. |
| `AUTH_REFRESH_TTL_REMEMBER_ME_SECONDS` | `2592000` (30 days) | Refresh-token TTL when the login form's remember-me is checked. |
| `AUTH_LOCKOUT_MAX_ATTEMPTS` | `5` | Counter increments on `INVALID_CREDENTIALS`; at this threshold the account locks until `lockedUntil`. Behaviour wired in a later wave. |
| `AUTH_LOCKOUT_DURATION_SECONDS` | `900` (15 min) | Lock duration after threshold is hit. |

Existing `JWT_REFRESH_TTL_SECONDS` (default `2_592_000`) is preserved
unchanged for backward compatibility. Consumers will be migrated to the new
keys in W1.2+.

`AuthConfig` is consumable via `ConfigService.get<AppConfiguration>('config').auth`.

## 8. Verification Results

| Step | Command | Result |
|------|---------|--------|
| Prisma client | `npx prisma generate` | ✅ Generated cleanly (Prisma 6.19.3). |
| Migration applied | `npx prisma db execute --file …/migration.sql` + `npx prisma migrate resolve --applied …` | ✅ Script executed successfully; migration marked applied. |
| Type check | `npx tsc --noEmit` | ⚠️ 0 errors in W1.1 surface. **Two pre-existing errors** (`test/sprint14/helpers.ts:122` — `TrialExpiryJobHandler` constructor now takes 6 args, fixture passes 4; `test/sprint4_5/branch.e2e-spec.ts:65` — `BranchService` now takes 3 args, fixture passes 2). Neither touches anything W1.1 modified. |
| Build | `rm -rf dist && npm run build` | ✅ `nest build` completes with 0 errors. |
| Boot | `npm run start:dev` | ⚠️ See §9. W1.1 wiring is clean; boot is blocked on a pre-existing DI mis-wire in `BillingModule` unrelated to this wave. |

## 9. Boot Verification — Pre-existing Blocker

`npm run start:dev` fails on:

```
UnknownDependenciesException: Nest can't resolve dependencies of the
BillingSubscriptionIntegrationService (?, InvoiceService,
BillingAccountService, BillingSettingsService). Please make sure that the
argument SubscriptionService at index [0] is available in the BillingModule
module.
```

Diagnosis:
* `BillingSubscriptionIntegrationService` (in `BillingModule`) injects
  `SubscriptionService`.
* `SubscriptionService` is exported by `SubscriptionModule`, which is **not**
  `@Global`.
* `BillingModule` does **not** import `SubscriptionModule`.

The fix is one line: `BillingModule.imports += [SubscriptionModule]` (with a
`forwardRef` if a downstream cycle surfaces). However, this is **outside the
W1.1 scope** (BillingModule and SubscriptionModule are not touched by this
wave) and is explicitly NOT on the do-list.

**Pre-existence verified:** with my AuthModule and TenantResolver changes
fully reverted to baseline (FeatureFlagModule import removed,
TenantResolverService deregistered, middleware ordering restored), `npm run
start:dev` reproduces the **exact same** Billing/Subscription DI error.
File mtimes on the affected modules (`billing.module.ts`, `subscription.module.ts`,
`billing-subscription-integration.service.ts`) are all 2026-06-25 — three
days before W1.1.

**Action recommendation:** track as a follow-up patch outside the Auth Patch
plan (e.g. a one-line BillingModule import fix in the next sprint). W1.1 is
not the right place to ship that change.

## 10. Files NOT Modified (per scope guard)

* `backend/src/core/auth/auth.service.ts` — login/refresh/logout flows untouched.
* `backend/src/core/auth/auth.dto.ts` — no DTO changes.
* `backend/src/core/auth/repositories/*` — no repository changes.
* `backend/src/core/auth/jwt-auth.guard.ts` — guard untouched.
* `backend/src/core/auth/token/*` — refresh token / access token services untouched.
* `backend/src/core/auth/password/password.service.ts` — password hashing untouched.
* `backend/src/core/rbac/**` — RBAC layer untouched.
* `backend/src/core/feature-flag/**` — reused as-is; no new service, endpoint, or schema.
* Frontend — no changes.

## 11. Issues Encountered & Resolutions

| # | Issue | Resolution |
|---|-------|------------|
| 1 | `prisma migrate dev` reported drift in prior unrelated migrations and offered to reset the dev DB, which would have destroyed in-progress data. | Wrote the W1.1 migration SQL by hand, applied via `prisma db execute`, then `prisma migrate resolve --applied` to register it in `_prisma_migrations`. The migration file is on disk and will apply normally in clean environments. |
| 2 | First boot attempt failed with `UndefinedModuleException` for RequestContextModule — `PrismaModule` import in RequestContextModule formed a cycle with `RequestContextModule` import in PrismaModule. | Wrapped both sides in `forwardRef`. Service injection in `TenantResolverService` also wrapped via `@Inject(forwardRef(() => PrismaService))`. Build now clean; the cycle is resolved at DI time. |
| 3 | After fixing #2, boot fails on a pre-existing `BillingSubscriptionIntegrationService` DI error. | Verified pre-existence via revert-and-retry. Out of W1.1 scope; documented above as §9. Recommended to schedule a one-line BillingModule fix as a separate follow-up. |
| 4 | Two pre-existing `tsc` errors in `test/sprint14/helpers.ts` and `test/sprint4_5/branch.e2e-spec.ts` (constructor-signature drift on unrelated services). | Out of W1.1 scope; flagged in §8 for the next test-hygiene sweep. |

## 12. Stop Point

W1.1 implementation complete. **Not** continuing to W1.2.

Recommended next step before starting W1.2: schedule a separate
infrastructure fix to import `SubscriptionModule` into `BillingModule` so the
dev server boots cleanly, then re-run the W1.1 boot verification to close
out §9.
