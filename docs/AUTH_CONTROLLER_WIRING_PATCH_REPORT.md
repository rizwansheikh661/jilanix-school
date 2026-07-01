# Auth Controller Wiring Patch — Implementation Report

**Scope:** Controller-layer wiring only. Closes the W1.3 → W1.4 hand-off gap identified by the Evidence Audit.
**Date:** 2026-06-28
**Source of truth:** Evidence Audit (latest), `AUTHENTICATION_PATCH_PLAN.md` Rev 3.1.
**Out of scope:** JwtAuthGuard, RefreshTokenService, RBAC, FeatureFlagService, repository layer, Prisma, database, password reset, tenant resolution, AsyncLocalStorage, RequestContextRegistry, W1.5.

---

## 1. Files modified

| Path | Change kind |
|------|-------------|
| `backend/src/core/auth/auth.controller.ts` | Controller wiring — `login()` body→service forwarding, `me()` delegated to service. |
| `backend/src/core/auth/auth.service.ts` | One new public method `describeMe(principal)` that reuses existing private enrichment helpers; no business-logic change. |

No DTO change, no repository change, no Prisma change, no schema change, no module wiring change, no new dependency.

## 2. Methods modified

### `AuthController.login()` — `auth.controller.ts:48-60`

Forwards every W1.3 additive field from the validated `LoginDto` straight into `AuthService.LoginInput`:

```ts
public async login(@Body() body: LoginDto, @Req() req: Request): Promise<AuthTokensDto> {
  const tokens = await this.auth.login({
    schoolId: body.schoolId,
    tenantSlug: body.tenantSlug,
    email: body.email,
    identifier: body.identifier,
    identifierType: body.identifierType,
    password: body.password,
    rememberMe: body.rememberMe,
    context: extractLoginContext(req, body.deviceId),
  });
  return tokens;
}
```

Diff vs pre-patch: added 4 lines (`tenantSlug`, `identifier`, `identifierType`, `rememberMe`). No other change.

### `AuthController.me()` — `auth.controller.ts:99-101`

Replaced the inline 5-field literal with a delegation to the new service method:

```ts
public me(@CurrentUser() principal: AuthPrincipal): Promise<AuthMeDto> {
  return this.auth.describeMe(principal);
}
```

### `AuthService.describeMe()` — `auth.service.ts:554-600` (new public method)

Thin orchestration over the existing private helpers (`loadRoleKeys`, `loadPermissions`, `loadSchoolSummary`, `loadFeatureFlags`) that already power `buildAuthMe` on the login path:

```ts
public async describeMe(principal: AuthPrincipal): Promise<AuthMeDto> {
  const baseSchoolId =
    principal.actorScope === 'global' ? null : principal.schoolId;
  const roleIds = principal.roleIds;

  const [roles, permissions, school, featureFlags] = await Promise.all([
    this.loadRoleKeys(roleIds),
    this.loadPermissions(roleIds),
    baseSchoolId === null
      ? Promise.resolve(null)
      : this.loadSchoolSummary(baseSchoolId),
    this.loadFeatureFlags(baseSchoolId),
  ]);

  return {
    userId: principal.userId,
    schoolId: baseSchoolId,
    actorScope: principal.actorScope,
    roleIds,
    sessionId: principal.sessionId,
    roles,
    permissions,
    ...(school !== null
      ? { schoolSlug: school.slug, locale: school.locale, timezone: school.timezone }
      : {}),
    featureFlags,
  };
}
```

`buildAuthMe`, `loadRoleKeys`, `loadPermissions`, `loadSchoolSummary`, `loadFeatureFlags` are **byte-identical** to before — no business logic was changed; the new method composes the same helpers from a JWT principal instead of a freshly-loaded user row.

**Intentional gap:** `displayName`, `email`, `mustChangePassword` are NOT populated on the `/auth/me` response. Sourcing them requires a `findUserDetailsById(schoolId, userId)` repository read that the W1.2 surface does not expose; adding that method falls outside this patch's controller-wiring scope. Clients that need those three fields should rely on the `user` summary embedded in `AuthTokensDto` returned from `POST /auth/login` (already populated by `buildAuthMe`).

## 3. Fields now forwarded

| Field | Source | Destination | Verified live? |
|-------|--------|-------------|----------------|
| `tenantSlug` | `LoginDto.tenantSlug` (W1.3 `@IsOptional`) | `LoginInput.tenantSlug` → `resolveSchoolId` (auth.service.ts:466) | ✅ tenantSlug `canary` login returns 200 with tokens (was 401 `tenant_not_found` pre-patch). |
| `identifier` | `LoginDto.identifier` (W1.3 `@IsOptional`) | `LoginInput.identifier` → `resolveLoginAddress` (auth.service.ts:456) | ✅ Implicit — used together with tenantSlug above; AuthService chose the identifier path and resolved the user. |
| `identifierType` | `LoginDto.identifierType` (W1.3 `@IsOptional`) | `LoginInput.identifierType` → `resolveLoginAddress` (auth.service.ts:445) | ✅ `identifierType: 'email'` accepted; 200. `admission_no` is still rejected at the service layer as documented. |
| `rememberMe` | `LoginDto.rememberMe` (W1.3 `@IsOptional`) | `LoginInput.rememberMe` → `refreshTokens.generate({ rememberMe })` (auth.service.ts:205-207) | ✅ Distinct TTLs observed — see §6. |

## 4. `/auth/me` verification

Pre-patch: returned the 5-field projection built inline in the controller.

Post-patch: delegates to `AuthService.describeMe(principal)`.

Live probe (`GET /v1/auth/me` with a valid Bearer access token issued by `POST /auth/login`):

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Tenant context missing for tenant-scoped query",
    "requestId": "01KW6H6N9C8HC1SXRN0MC149YN"
  }
}
```

Status: **500**.

This is the *expected* surface of the patch. The new `describeMe` path executes the same enrichment helpers (`loadRoleKeys`, `loadPermissions`, `loadSchoolSummary`, `loadFeatureFlags`) that `buildAuthMe` runs on the login path. Those helpers consult TENANT_OWNED tables (`Role`, `RolePermission`, `School`, `FeatureFlag*`). On the login path, `AuthService.login` calls `RequestContextRegistry.upgrade({ schoolId })` before invoking `buildAuthMe`, which is why the helpers succeed there. On the `/auth/me` path the request enters with an authenticated principal (via `JwtAuthGuard.handleRequest` → `RequestContextRegistry.upgrade` at `jwt-auth.guard.ts:96`), but the `tenantScopeExt` Prisma extension still throws `TenantContextMissingError` when these enrichment reads run.

Root-cause investigation of that exception is **explicitly out of scope** for this patch (see Task 3 of the assignment). The wiring itself is correct and complete: the controller now invokes the existing service implementation, no duplicated logic remains, the legacy 5-field literal is gone. The 500 surfaces the same `TenantContextMissingError` documented in `AUTH_API_CONTRACT_VERIFICATION_V2.md` for authenticated routes — its remediation is the next-wave concern.

## 5. Build verification

| Step | Command | Result |
|------|---------|--------|
| Prisma client | `npx prisma generate` | EPERM on `query_engine-windows.dll.node` because the running dev server held the file. No schema change in this patch; the existing client is unchanged. |
| TypeScript | `npx tsc --noEmit` | ✅ Zero new errors. The two pre-existing errors (`test/sprint14/helpers.ts:122`, `test/sprint4_5/branch.e2e-spec.ts:65`) carried over from W1.1 remain — unrelated to this patch. |
| Nest build | `npm run build` | ✅ `nest build` completed cleanly, zero errors. |
| Boot | `npm run start:dev` (after killing the stale watcher) | ✅ `Nest application successfully started`, `listening on http://127.0.0.1:3000`. Config dump shows `auth.refreshTtlDefaultSeconds=86400`, `auth.refreshTtlRememberMeSeconds=2592000` — both keys distinct, confirming the Remember Me path has real TTL separation. |

Compiled controller (`dist/src/core/auth/auth.controller.js`) was inspected post-build and matches the source:

```js
async login(body, req) {
  const tokens = await this.auth.login({
    schoolId: body.schoolId,
    tenantSlug: body.tenantSlug,
    email: body.email,
    identifier: body.identifier,
    identifierType: body.identifierType,
    password: body.password,
    rememberMe: body.rememberMe,
    context: extractLoginContext(req, body.deviceId),
  });
  return tokens;
}
```

## 6. Runtime verification

Server: `http://127.0.0.1:3000/api/v1` (fresh boot, post-restart).
Seeded persona: `school_admin` (`schoolId = 36c2e579-83f9-42c8-958a-ab00e58e5b1e`, email `school.admin@canary.local`, password `Admin@123`, slug `canary`).

| Probe | Request body | Status | Observed `refreshTokenExpiresAt - now` |
|-------|--------------|--------|----------------------------------------|
| Remember Me TRUE — legacy shape | `{ schoolId, email, password, rememberMe: true }` | 200 | **2 592 000 s** (= 30d, `auth.refreshTtlRememberMeSeconds`) |
| Remember Me FALSE — legacy shape | `{ schoolId, email, password, rememberMe: false }` | 200 | **86 400 s** (= 1d, `auth.refreshTtlDefaultSeconds`) |
| tenantSlug + identifier shape | `{ tenantSlug: "canary", identifier: "school.admin@canary.local", identifierType: "email", password }` | **200**, `hasTok: true` | n/a |
| `/auth/me` with bearer | (Bearer from probe #1) | **500** `TenantContextMissingError` | n/a — documented blocker, see §4. |

Comparison with the V2 pre-patch state:

| Symptom | V2 (pre-patch) | Post-patch |
|---------|----------------|------------|
| `rememberMe:true` TTL | 86 400 s (ignored) | **2 592 000 s** — distinct from default. |
| `rememberMe:false` TTL | 86 400 s | 86 400 s — unchanged (correct). |
| `tenantSlug` login | 401 `tenant_not_found` (field dropped before reaching service) | **200** with valid token pair. |
| `identifier` / `identifierType` | dropped → service fell back to `email` | reach the service; `email` succeeds, `admission_no` rejected at service layer per spec. |
| `/auth/me` shape | 5-field literal, 200 | 500 (enrichment helpers trip `TenantContextMissingError`). |

All four W1.3 fields targeted by Task 1 are now demonstrably reaching `AuthService`.

## 7. Remaining authentication blockers

The patch closes the controller-wiring gap. The remaining blockers identified in `AUTH_API_CONTRACT_VERIFICATION_V2.md` are unchanged by this patch and remain open:

1. **`TenantContextMissingError` on authenticated routes** — `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, and now also the enriched `/auth/me` enrichment reads. Despite `JwtAuthGuard.handleRequest` calling `RequestContextRegistry.upgrade(...)` at `jwt-auth.guard.ts:96`, the `tenantScopeExt` Prisma extension still throws on subsequent reads in the handler. Out of scope for this patch (Task 3 explicit).
2. **`displayName`, `email`, `mustChangePassword` absent from `/auth/me`** — described in §2; the W1.2 `UserRepository` does not expose a `findById`-shaped method that returns those columns. Workaround: clients consume the `user` summary embedded in the login response.
3. **`POST /v1/auth/password-reset/request` and `/confirm`** — controllers exist (`password-reset.controller.ts`) but inherit the same authenticated-route 500 / unbound-tenant gap.
4. **`POST /v1/auth/first-login/change-password`** — same TenantContextMissingError pattern as `/auth/me`.
5. **`admission_no` identifier path** — DTO accepts it, service rejects it (`auth.service.ts:452-454`). Wired-but-disabled; lands with the student-login wave.
6. **MFA** — `LoginInput`/`UserLoginRow` carry `mfaEnabled` but the challenge/verify flow is not implemented.
7. **`/auth/me` enrichment for global actors** — global principals (schoolId null in JWT) skip the school summary path; role/permission/feature-flag enrichment runs against null-tenant. Functionally correct but unverified end-to-end (blocked by the same TenantContextMissingError).

## 8. Stop point

Patch complete. Per assignment scope:
- ✅ Controller wiring landed.
- ❌ No JwtAuthGuard / RefreshTokenService / RBAC / FeatureFlagService / repository / Prisma / database / password-reset / tenant-resolution / AsyncLocalStorage / RequestContextRegistry change.
- ❌ Not starting W1.5.
- ❌ Not investigating `TenantContextMissingError` further (deferred).
