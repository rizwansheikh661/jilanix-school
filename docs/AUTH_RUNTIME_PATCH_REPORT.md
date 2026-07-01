# Authentication Runtime Patch — Implementation Report

**Scope:** Two surgical fixes identified by the Runtime Audit — Patch 1 (Platform Admin host resolution) and Patch 2 (JwtStrategy context upgrade timing). No architectural redesign. No frontend change. No new endpoints.
**Date:** 2026-06-28
**Source of truth:** Runtime Audit directive.
**Out of scope:** RequestContextMiddleware, AsyncLocalStorage primitive, Prisma tenantScopeExt, repository bypass model, JwtAuthGuard lifecycle, W1.5.

---

## 1. Files modified

| Path | Change kind |
|------|-------------|
| `backend/src/core/auth/auth.service.ts` | Added `resolvedTenant?: ResolvedTenant` to `LoginInput`. Refactored `resolveSchoolId()` to consume `req.resolvedTenant` when `schoolId`/`tenantSlug` are absent. Added `PLATFORM_SCHOOL_SLUG = 'platform'` constant and `lookupSchoolIdBySlug()` helper. |
| `backend/src/core/auth/auth.controller.ts` | `login()` now forwards `(req as RequestWithResolvedTenant).resolvedTenant` into `AuthService.login()`. |
| `backend/src/core/auth/token/jwt.strategy.ts` | Added `RequestContextRegistry.upgrade(...)` call inside `validate()` BEFORE the tenant-scoped `sessions.isActiveById` / `users.findActiveById` reads. Guarded by `RequestContextRegistry.peek() !== undefined` so unit tests outside an HTTP context still work. |

No DTO change. No repository change. No Prisma extension change. No middleware change. No JwtAuthGuard change. No new dependencies.

## 2. Root cause fixed

### Patch 1 — Platform Admin host resolution

**Before:** `AuthService.resolveSchoolId()` only consulted `input.schoolId` and `input.tenantSlug`. A POST to `/auth/login` from `admin.schoolos.in` carrying just `{email, password}` (the approved Platform Admin login shape) reached `resolveSchoolId()` with both fields empty and immediately threw `TenantNotFoundError` → 401. `TenantResolverMiddleware` had already populated `req.resolvedTenant = { scope: 'platform', source: 'platform-host', host }`, but nothing downstream consumed it.

**After:** Controller forwards `req.resolvedTenant` into `LoginInput`. When the body omits `schoolId`/`tenantSlug`, `resolveSchoolId()` falls back to the resolved tenant:
- `scope === 'tenant'` with `schoolId` → uses that schoolId directly.
- `scope === 'platform'` → looks up the synthetic School row with `slug = 'platform'` (created by `prisma/seed/platform/demo-users.ts`'s `ensurePlatformSchool`) and returns its id.

This makes Platform Admin login work with `Email + Password` only, exactly as specified.

### Patch 2 — JwtStrategy context upgrade timing

**Before:** `JwtStrategy.validate()` immediately performed two tenant-scoped DB reads (`sessions.isActiveById`, `users.findActiveById`) against TENANT_OWNED tables (`UserSession`, `User`). Those reads run inside the request's ALS frame, which `RequestContextMiddleware` had bound with `actorScope: 'public'` and `schoolId: undefined`. The Prisma `tenantScopeExt` rejected them with `TenantContextMissingError` → 500. `JwtAuthGuard.handleRequest` (which DOES upgrade the context) only runs AFTER Passport finishes calling `validate()` — too late for the strategy's own queries.

**After:** `validate()` calls `RequestContextRegistry.upgrade({ schoolId, userId, actorScope, roleIds })` BEFORE the repo calls. The upgrade uses `enterWith()` semantics, binding the upgraded frame on the current async resource so the two subsequent strategy-internal reads succeed. The existing idempotent upgrade in `JwtAuthGuard.handleRequest` is left in place.

## 3. Platform Admin verification

Direct curl against the fresh boot, using `Host: admin.schoolos.in` and a body that contains neither `schoolId` nor `tenantSlug`:

```http
POST /api/v1/auth/login
Host: admin.schoolos.in
Content-Type: application/json

{ "email": "platform.admin@schoolos.local", "password": "Admin@123" }
```

Result: **200 OK** with `data.accessToken`, `data.refreshToken`, `data.user` populated.

JWT claims (decoded from the returned access token):

| Claim | Value | Meaning |
|-------|-------|---------|
| `sub` | `<platform-admin uuid>` | The platform admin user id. |
| `tenant_id` | `null` | Global actor — no tenant binding. |
| `scope` | `"global"` | Global actor scope. |
| `role_ids` | `[<platform_admin role uuid>]` | Single role. |
| `iss` / `aud` | match `auth.jwt.issuer` / `auth.jwt.audience` config. |

Pre-patch state: 401 `tenant_not_found` because `resolveSchoolId()` had nothing to resolve. Post-patch: 200 via host resolution. Validation confirms `TenantResolverMiddleware` → `req.resolvedTenant.scope = 'platform'` → controller forwards → `resolveSchoolId()` looks up `slug = 'platform'` → AuthService proceeds.

## 4. Tenant verification (5 personas)

Server: `http://127.0.0.1:3000/api/v1`, post-restart, with `prisma/seed/platform/demo-users` applied.

Login probe (`POST /v1/auth/login`):

| Persona | Login shape | Status | JWT `scope` | JWT `tenant_id` |
|---------|-------------|--------|-------------|-----------------|
| `platform_admin` | `{schoolId: <platform uuid>, email, password}` (legacy shape) | **200** | `global` | `null` |
| `platform_admin` | `Host: admin.schoolos.in` + `{email, password}` (new shape) | **200** | `global` | `null` |
| `school_admin` | `{schoolId: <canary uuid>, email, password}` | **200** | `tenant` | canary uuid |
| `teacher` | `{schoolId: <canary uuid>, email, password}` | **200** | `tenant` | canary uuid |
| `parent` | `{schoolId: <canary uuid>, email, password}` | **200** | `tenant` | canary uuid |
| `student` | `{schoolId: <canary uuid>, email, password}` | **200** | `tenant` | canary uuid |

All five personas mint tokens. All `role_ids` arrays are non-empty. All `sid`/`chain_id`/`jti` are strings.

`GET /v1/auth/me` with the `school_admin` Bearer token:

| Probe | Status | Notes |
|-------|--------|-------|
| Pre-patch | 500 `TenantContextMissingError` | Documented in `AUTH_CONTROLLER_WIRING_PATCH_REPORT.md` §4. |
| Post-patch | **200** | Returns `userId, schoolId, actorScope, roleIds, sessionId, roles, permissions, schoolSlug, locale, timezone, featureFlags`. |

Patch 2 closes the `/auth/me` blocker for tenant principals because the strategy now binds `schoolId` to the ALS frame before `JwtAuthGuard.handleRequest` re-upgrades it, and `describeMe`'s enrichment helpers (`loadRoleKeys`, `loadPermissions`, `loadSchoolSummary`, `loadFeatureFlags`) execute inside that upgraded frame.

Auth-without-bearer probe (`GET /v1/auth/me` with no Authorization header): **401** (unchanged — guard rejects before strategy).

## 5. Runtime verification

| Step | Command | Result |
|------|---------|--------|
| Prisma client | `npx prisma generate` | ✅ Generated after killing the stale dev watcher that held `query_engine-windows.dll.node`. No schema change in this patch. |
| TypeScript | `npx tsc --noEmit` | ✅ Zero new errors. The two pre-existing errors carried over from prior waves (`test/sprint14/helpers.ts:122`, `test/sprint4_5/branch.e2e-spec.ts:65`) remain — unrelated. |
| Nest build | `npm run build` | ✅ `nest build` completed cleanly. |
| Boot | `npm run start:dev` | ✅ `Nest application successfully started`, listening on `http://127.0.0.1:3000`. |

Compiled `dist/src/core/auth/token/jwt.strategy.js` was inspected post-build and contains the `RequestContextRegistry.upgrade(...)` call before the repository reads.

Login + refresh + logout + logout-all + /me probe (`verify_auth.js`) reran end-to-end. Honest outcome table:

| Route | Status | Notes |
|-------|--------|-------|
| `POST /auth/login` (all 5 personas, legacy schoolId shape) | ✅ 200 | Tokens minted, JWT claims correct. |
| `POST /auth/login` (platform admin via host) | ✅ 200 | New shape works. |
| `GET /auth/me` (school_admin Bearer) | ✅ 200 | Patch 2's primary target. |
| `POST /auth/login` rememberMe true vs false | ✅ 200 / 200 | 30d vs 1d TTLs distinct (unchanged from W1.4). |
| `POST /auth/login` `tenantSlug + identifier + identifierType=email` | ✅ 200 | Slug path still works (unchanged from W1.4). |
| `POST /auth/login` invalid creds | ✅ 401 `invalid_credentials` | Envelope intact. |
| `POST /auth/login` validation error (bad UUID) | ✅ 400 envelope | Pipe intact. |
| `POST /auth/refresh` valid | ❌ 500 `TenantContextMissingError` | See §6.A. |
| `POST /auth/refresh` reused | ❌ 500 `TenantContextMissingError` | Same root cause as above. |
| `POST /auth/refresh` invalid token | ❌ 500 `TenantContextMissingError` | Same root cause. |
| `POST /auth/logout` (school_admin Bearer) | ❌ 500 `TenantContextMissingError` | See §6.B. |
| `POST /auth/logout-all` (school_admin Bearer) | ❌ 500 `TenantContextMissingError` | Same root cause as logout. |
| `POST /auth/logout-all` (platform Bearer) | ❌ 500 `TenantContextMissingError` | Same; platform-side has its own R-12 pre-existing gap. |
| `POST /auth/password-reset/request` | ❌ 500 `TenantContextMissingError` | See §6.A — `@Public()` route, strategy never runs. |
| `POST /auth/password-reset/confirm` (bad token) | ❌ 500 `TenantContextMissingError` | Same. |
| `POST /auth/first-login/change-password` (wrong current pw) | ❌ 500 `TenantContextMissingError` | See §6.B. |
| `POST /auth/password/change` (does not exist) | ✅ 404 | Routing intact. |

The directive's "No TenantContextMissingError should remain" goal is **partially met**: Patches 1 and 2 specifically eliminate the errors that fall within their scope (login + `/auth/me` for tenant principals). The remaining 500s are explained in §6 — they are NOT caused by the two patches and CANNOT be fixed without changes the directive explicitly forbade ("Do NOT redesign the authentication architecture", "Do NOT modify… RequestContextMiddleware, AsyncLocalStorage, Prisma Extension, Repository bypass, JwtAuthGuard lifecycle").

## 6. Remaining authentication blockers

### A. `@Public()` routes that read TENANT_OWNED tables

`POST /auth/refresh`, `POST /auth/password-reset/request`, and `POST /auth/password-reset/confirm` are decorated `@Public()`, so `JwtAuthGuard` short-circuits and `JwtStrategy.validate()` never runs. Their `AuthService` handlers (`refresh`, `requestPasswordReset`, `confirmPasswordReset`) then issue tenant-scoped reads (`refreshTokens.findByHash`, `userRepository.findActiveById`, etc.) inside the ALS frame that `RequestContextMiddleware` bound with `actorScope: 'public'` and `schoolId: undefined`. Prisma's `tenantScopeExt` throws.

Patch 2 was scoped to the JwtStrategy and cannot fix this — these routes never reach the strategy. The fix would require either (a) a refresh-token tenant resolver middleware that decodes the token's chain → schoolId before the controller runs, or (b) repository-layer bypass markers for refresh-token lookups. Both are explicitly out of scope per "Do NOT redesign the authentication architecture."

### B. Authenticated routes whose service work runs in the controller's async frame

`POST /auth/logout`, `POST /auth/logout-all`, and `POST /auth/first-login/change-password` all pass the JwtStrategy (which now succeeds — verified, no strategy-level error in the logs) and the JwtAuthGuard (which also upgrades the ALS frame). However, the subsequent `AuthService` work (`sessions.revokeChain`, `sessions.revokeAllForUser`, `users.changePassword`) executes in the controller's async chain, where Pino-http exception logs still show `"scope":"public"` at throw time.

Diagnosis: `RequestContextRegistry.upgrade()` uses `AsyncLocalStorage.enterWith()`, which binds the upgraded context onto the CURRENT async resource and any resources created from it. Passport/NestJS appear to invoke `validate()` and `handleRequest()` from a slightly different async resource than the one that subsequently dispatches into the controller method — so the upgrade does not propagate down the request's main chain. `/auth/me` accidentally works because `describeMe` queries PLATFORM_ONLY models (`School` global lookup, `Role`, `RolePermission`) plus tenant-scoped reads that happen to inherit a frame that was upgraded earlier on the same await chain; `logout` etc. hit `UserSession`/`User` updates after the chain diverges.

The proper fix is one of:
1. Move the upgrade into a per-route NestJS interceptor that runs synchronously between `JwtAuthGuard` and the controller — keeps the upgrade on the controller's exact async resource.
2. Replace `enterWith` with a scoped `storage.run(ctx, () => next())` re-entry at the guard layer.
3. Have `RequestContextMiddleware` defer its initial `run()` until the auth layer has decided on the principal.

All three options touch components the directive forbade modifying (`AsyncLocalStorage primitive`, `JwtAuthGuard lifecycle`, `RequestContextMiddleware`). Reporting them here as the next-wave remediation target.

### C. Other gaps unchanged by this patch

These were already documented in `AUTH_CONTROLLER_WIRING_PATCH_REPORT.md` and remain open:
- `displayName`, `email`, `mustChangePassword` absent from `/auth/me` (W1.2 `UserRepository` does not expose the shaped query).
- `admission_no` identifier path rejected at `AuthService` (deferred to student-login wave).
- MFA challenge/verify not implemented.
- Platform-side `logout-all` (R-12) is also gated by §6.B above.

---

## Stop point

Per directive scope:
- ✅ Patch 1 landed: Platform Admin login via `Host: admin.schoolos.in` returns 200 with no body schoolId/tenantSlug.
- ✅ Patch 2 landed: JwtStrategy's own DB reads succeed; `/auth/me` for tenant principals returns 200.
- ✅ All 5 personas log in successfully.
- ❌ Not investigating / patching the §6.A `@Public()`-route gap (would require new middleware or repository bypasses — out of scope).
- ❌ Not investigating / patching the §6.B context-propagation gap (would require touching forbidden components — out of scope).
- ❌ Not starting W1.5.
- ❌ Not modifying the frontend.
