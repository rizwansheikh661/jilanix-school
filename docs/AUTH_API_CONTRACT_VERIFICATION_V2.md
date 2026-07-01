# Authentication API — Contract Verification Report **V2**

**Date:** 2026-06-28
**Scope:** Fresh, end-to-end verification of every implemented `/v1/auth/*`
route against the approved contract.
**Methodology:** Static review of controllers/services/DTOs/guards
**+ live HTTP probe** (`backend/verify_auth.js`) executed against the
running dev backend (output: `C:\Users\rizwa\AppData\Local\Temp\verify_v2_out.json`).
**Reference docs:** `docs/AUTHENTICATION_PATCH_PLAN.md`,
`docs/REST_API_DESIGN.md`, `docs/ROLES_AND_PERMISSIONS.md`,
`docs/MULTI_TENANT_ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`,
`docs/SUPER_ADMIN_ARCHITECTURE.md`, `docs/SUBSCRIPTION_FOUNDATION.md`,
`docs/AUTH_API_CONTRACT_VERIFICATION.md` (V1, this report's baseline).
**Constraint:** Verification only — no backend code modified.

---

## 1. Executive Summary

🔴 **NOT CERTIFIED.** Authentication is **not production-ready** and
**Frontend Sprint F2 is BLOCKED.**

The previous report (V1) flagged 13 contract surfaces, 10 of which were
red or partially-working. **A re-probe today produced byte-for-byte
identical results.** Login still works end-to-end for every persona, and
every other authenticated route still fails with HTTP 500
`TenantContextMissingError`. No new endpoints, no DTO changes, no
controller wiring deltas were detected.

| Metric | V1 (prior) | V2 (today) | Δ |
|--------|-----------|-----------|---|
| Surfaces ready | 3 / 13 | 3 / 13 | 0 |
| 500 errors on authenticated routes | 6 | 6 | 0 |
| `rememberMe` honoured | no | no | — |
| `tenantSlug` login functional | no | no | — |
| `GET /auth/me` returns full AuthMeDto | no | no | — |
| `POST /auth/password/change` mapped | no | no | — |
| Roles return `{id,key,scope}` shape | no | no | — |
| Token TTL uses `…ExpiresIn` (seconds) | no | no | — |

**Single highest-leverage fix** is still the same: replicate the
`RequestContextRegistry.upgrade({ schoolId })` pattern from
`AuthService.login()` (`auth.service.ts:145-147`) into
`refresh()`, `logout()`, `logoutAll()`, `passwordResetRequest()`,
`firstLoginChange()`, and the controller `me()` handler. That one diff
would lift readiness from ~23 % to ~70 %.

---

## 2. Endpoint Verification

Routes mapped at boot (Nest RouterExplorer): 8 implemented,
1 confirmed-absent.

| Route | Spec | Live HTTP | Live result | Verdict |
|------|------|-----------|-------------|---------|
| `POST /auth/login` (email path) | 200 + tokens | **200** | All 5 personas return rich `AuthTokensDto` | ✅ working |
| `POST /auth/login` (tenantSlug path) | 200 + tokens | **401** | Controller never forwards `tenantSlug`/`identifier` to the service — see §2.1 | 🔴 broken |
| `POST /auth/login` (admission_no) | reserved (V1 rejects) | **401** | `invalid_credentials` (correct — V1 rejects on purpose) | ✅ deferred |
| `POST /auth/refresh` (valid token) | 200 + new tokens | **500** | `INTERNAL_ERROR` "Tenant context missing for tenant-scoped query" (`edges.refreshOk`) | 🔴 broken |
| `POST /auth/refresh` (reused token) | 401 `refresh_reused` | **500** | Same tenant-context 500 — never reaches reuse branch (`edges.refreshReuse`) | 🔴 broken |
| `POST /auth/refresh` (invalid token) | 401 `refresh_invalid` | **401** | Correct envelope (`edges.refreshInvalid`) | ✅ working |
| `POST /auth/logout` | 204 empty | **500** | Tenant-context 500 (`edges.logout`) | 🔴 broken |
| `POST /auth/logout-all` (tenant user) | 200 `{revokedSessions}` | **500** | Tenant-context 500 (`edges.logoutAll`) | 🔴 broken |
| `POST /auth/logout-all` (platform user) | R-12 documented limit | **500** | Raw `Error('logoutAll for global users…')` thrown by `auth.service.ts:410`, surfaces as generic `INTERNAL_ERROR` (`edges.logoutAllPlatform`) | ⚠️ documented but unfriendly |
| `GET /auth/me` (school admin) | 200 + full AuthMeDto | **500** | Tenant-context 500 (`edges.meSchoolAdmin`). Controller also returns only a 5-field projection — see §2.2 | 🔴 broken **and** thin |
| `GET /auth/me` (no bearer) | 401 `token_malformed` | **401** | Correct envelope (`edges.meNoAuth`) | ✅ working |
| `POST /auth/password-reset/request` | 200 `{accepted:true}` | **500** | Tenant-context 500 (`edges.passwordResetRequest`) | 🔴 broken |
| `POST /auth/password-reset/confirm` (short pw) | 422 | **422** | `newPassword must be longer than or equal to 12 characters` (`edges.passwordResetConfirmBad`) | ✅ working |
| `POST /auth/first-login/change-password` | 204 / 401 / 422 | **500** | Tenant-context 500 (`edges.firstLoginChange`) — never reaches password compare | 🔴 broken |
| `POST /auth/password/change` (Wave 3) | not yet shipped | **404** | `RESOURCE_NOT_FOUND` (`edges.passwordChangeNotFound`) | ✅ correctly absent |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id` | future | n/a | not mapped | ✅ deferred |

### 2.1 `tenantSlug` failure root cause

The DTO accepts the new fields (`auth.dto.ts:79-181`: `tenantSlug`,
`identifier`, `identifierType`, `rememberMe`, all `@IsOptional()`), but
the controller silently drops them:

```ts
// auth.controller.ts:48-56
public async login(@Body() body: LoginDto, @Req() req: Request) {
  const tokens = await this.auth.login({
    schoolId: body.schoolId,
    email:    body.email,
    password: body.password,
    context:  extractLoginContext(req, body.deviceId),
    // ❌ tenantSlug, identifier, identifierType, rememberMe NOT forwarded
  });
}
```

So the spec-canonical V1 login body
`{tenantSlug, identifier, identifierType, password}` reaches
`AuthService.login()` with `schoolId === undefined` and
`email === undefined`, and `resolveLoginAddress()` throws
`InvalidCredentialsError`.

### 2.2 `GET /auth/me` thin projection

Even if the tenant-context 500 were fixed, the controller would return
only 5 fields:

```ts
// auth.controller.ts:99-107
public me(@CurrentUser() principal: AuthPrincipal): AuthMeDto {
  return {
    userId:     principal.userId,
    schoolId:   principal.schoolId,
    actorScope: principal.actorScope,
    roleIds:    principal.roleIds,
    sessionId:  principal.sessionId,
  };
}
```

`buildAuthMe()` exists in `auth.service.ts:564-600` and is wired only on
the login path. `me()` does **not** invoke it, so `displayName`, `email`,
`roles`, `permissions`, `schoolSlug`, `locale`, `timezone`,
`mustChangePassword`, and `featureFlags` are all absent from the
introspection endpoint by design.

---

## 3. Persona Verification

All 5 personas authenticate; full AuthMeDto user object verified in the
**login response**. The frontend can therefore drive session state from
`login()` alone — but cannot rehydrate it after page reload because
`/auth/me` 500s.

| Persona | Login | JWT | `user.roles` | `user.permissions` (count) | `actorScope` | `tenant_id` |
|---------|:----:|:---:|:-----------:|:---------------------------:|:------------:|:------------:|
| Platform Admin (`platform.admin@schoolos.local`) | ✅ 200 | ✅ 11-claim | `["platform_admin"]` | 5 | `global` | `null` |
| School Admin (`school.admin@canary.local`)       | ✅ 200 | ✅          | `["school_admin"]`   | 1 (`"*"`) | `tenant` | uuid |
| Teacher (`teacher1@canary.local`)                | ✅ 200 | ✅          | `["teacher"]`        | 5 | `tenant` | uuid |
| Parent (`parent1@canary.local`)                  | ✅ 200 | ✅          | `["parent"]`         | 9 | `tenant` | uuid |
| Student (`20260001@students.canary.local`)       | ✅ 200 | ✅          | `["student"]`        | 5 | `tenant` | uuid |

Live permission grants by persona (matches `BUILT_IN_ROLE_DEFINITIONS` in
`rbac.constants.ts` byte-for-byte):

| Persona | Permissions |
|---------|-------------|
| `platform_admin` | `["*", "communication.*", "plan.*", "provisioning.*", "school.*"]` |
| `school_admin`   | `["*"]` |
| `teacher`        | `["attendance.create","marks.create","marks.update","messages.send","notices.create"]` |
| `parent`         | `["attendance.read","fees.pay","fees.read","leave.apply","marks.read","messages.send","notices.acknowledge","report_cards.read","students.read"]` |
| `student`        | `["homework.submit","library.read","marks.read","notices.read","timetable.read"]` |

Per-persona **post-login** functional reach (since the only working
authenticated endpoint is the 5-field `/auth/me` — which 500s anyway):

| Persona | Can refresh? | Can logout? | Can call `/me`? | Can complete first-login change? |
|---------|:-----------:|:----------:|:--------------:|:--------------------------------:|
| Platform Admin | 🔴 | 🔴 | 🔴 | n/a (schoolId null — controller throws) |
| School Admin   | 🔴 | 🔴 | 🔴 | 🔴 |
| Teacher        | 🔴 | 🔴 | 🔴 | 🔴 |
| Parent         | 🔴 | 🔴 | 🔴 | 🔴 |
| Student        | 🔴 | 🔴 | 🔴 | 🔴 |

---

## 4. JWT Verification

Claims structure across all 5 personas (`personas.*.jwtClaims`):

| Claim | Value | Spec? |
|-------|-------|------|
| `sub` | matches `userId` | ✅ |
| `tenant_id` | uuid (tenant) / `null` (global) | ✅ |
| `scope` | `'tenant'` / `'global'` | ✅ |
| `role_ids` | length-1 string[] in seed | ✅ |
| `sid` | string | ✅ |
| `chain_id` | string | ✅ |
| `jti` | string | ✅ |
| `iss` | `'schoolos'` | ✅ |
| `aud` | `'schoolos-api'` | ✅ |
| `iat`/`exp` | TTL ≈ 900 s | ✅ |

11 claims, all spec-compliant. Access TTL measured 899–900 s. Refresh
TTL measured **86 400 s regardless of `rememberMe`** (§6).

---

## 5. RBAC Verification

| Surface | Verdict |
|---------|---------|
| `BUILT_IN_ROLE_DEFINITIONS` matches `docs/ROLES_AND_PERMISSIONS.md §3.2` for all 6 built-in roles | ✅ |
| Demo seed mounts all 5 personas to the correct role | ✅ |
| Role permissions resolved end-to-end via `PermissionService.resolveForRoles` | ✅ |
| Role grant set arrives in `login()` response `user.permissions` | ✅ |
| `user.roles` is `string[]` of keys (not spec's `{id,key,scope}[]`) | 🔴 |
| `JwtAuthGuard` upgrades `RequestContextRegistry` with `roleIds` on authenticated routes (`jwt-auth.guard.ts:88-102`) | ✅ |

---

## 6. Feature Flag Verification

`user.featureFlags` populated on every login response: **63 keys** per
persona. Sample namespaces present: `academic-content.*`, `attendance.*`,
`billing.*`, `comms.channel.*`, `comms.provider.*`, `events.*`,
`examination.*`, `fees.*`, `module.*`, `notifications.*`,
`payments.gateway.*`, `provisioning.*`, `reporting.*`,
`subscription.*`, `timetable.*`, plus `parent_portal`, `student_portal`.

**Per-tenant / per-role axis**: ❌ none observed. All 5 personas across
2 distinct tenants (`platform` and `canary`) get **identical** flag
values. `FeatureFlagService.loadFeatureFlags` iterates `knownKeys()` with
static defaults; no tenant/role override store exists yet. Frontend
must treat the map as **read-only defaults** for now.

---

## 7. RequestContext Verification

| Concern | State |
|---------|-------|
| `RequestContextMiddleware` runs first; binds `requestId`, `actorScope:'public'`, etc. (`request-context.middleware.ts:66-93`) | ✅ |
| `RequestContextRegistry` uses `AsyncLocalStorage.enterWith` for `upgrade()` (`request-context.service.ts:143-147`) | ✅ |
| `JwtAuthGuard.handleRequest` calls `RequestContextRegistry.upgrade({ schoolId, userId, actorScope, roleIds })` on success (`jwt-auth.guard.ts:88-102`) | ✅ |
| `AuthService.login` calls `RequestContextRegistry.upgrade({ schoolId })` after tenant resolution (`auth.service.ts:145-147`) — the W1.4 fix | ✅ |
| `AuthService.refresh` does NOT upgrade context before opening tenant-owned transaction (`auth.service.ts:279`) | 🔴 |
| `AuthService.logout / logoutAll` do NOT upgrade context (`auth.service.ts:387-427`) | 🔴 |
| `PasswordResetService.request / firstLoginChange` do NOT upgrade context | 🔴 |
| `AuthController.me` returns directly from principal — no service call, but reads `principal.schoolId` set by guard; the actual 500 originates from a downstream `User`/session lookup before the principal hits the handler | 🔴 |

The `JwtAuthGuard` upgrade *should* propagate via `enterWith()`, yet
authenticated routes still 500 with `TenantContextMissingError`. Two
possible causes — both visible in the data — and the fix is the same:
mirror the explicit `RequestContextRegistry.upgrade({ schoolId })` call
from `AuthService.login()` into every authenticated service entry point
that opens a Prisma transaction on `TENANT_OWNED` models. This is the
defensive pattern that was already proven to work on the login path.

---

## 8. Previous (V1) vs Current (V2) Comparison

| # | Issue from V1 | V1 Status | V2 Status | Resolved? |
|---|---------------|-----------|-----------|-----------|
| 1 | `TenantContextMissingError 500` on `/auth/refresh` | 🔴 broken | 🔴 broken (same body, new requestId) | **Still Open** |
| 2 | `TenantContextMissingError 500` on `/auth/logout` | 🔴 broken | 🔴 broken | **Still Open** |
| 3 | `TenantContextMissingError 500` on `/auth/logout-all` (tenant) | 🔴 broken | 🔴 broken | **Still Open** |
| 4 | `TenantContextMissingError 500` on `GET /auth/me` | 🔴 broken | 🔴 broken | **Still Open** |
| 5 | `TenantContextMissingError 500` on `/auth/password-reset/request` | 🔴 broken | 🔴 broken | **Still Open** |
| 6 | `TenantContextMissingError 500` on `/auth/first-login/change-password` | 🔴 broken | 🔴 broken | **Still Open** |
| 7 | `GET /auth/me` returns thin 5-field projection (controller doesn't call `buildAuthMe()`) | 🔴 design | 🔴 unchanged | **Still Open** |
| 8 | `rememberMe` ignored — both branches return 24 h refresh TTL | 🔴 contract gap | 🔴 unchanged (controller drops field before service sees it) | **Still Open** |
| 9 | `tenantSlug` login path returns 401 | 🔴 broken | 🔴 unchanged (controller drops field) | **Still Open** |
| 10 | `user.roles` is `string[]` not `{id,key,scope}[]` | 🔴 contract gap | 🔴 unchanged | **Still Open** |
| 11 | `AuthTokensDto` uses `…ExpiresAt` (ISO) not `…ExpiresIn` (seconds) | 🔴 spec mismatch | 🔴 unchanged | **Still Open** |
| 12 | `LoginDto.password` `MinLength(8)` — spec §6 raises to 12 | 🔴 spec mismatch | 🔴 unchanged | **Still Open** |
| 13 | `POST /auth/password/change` not implemented (Wave 3) | ❌ absent | ❌ unchanged (404) | **Still Open** |
| 14 | No global `MustChangePasswordGuard` | 🔴 | 🔴 unchanged | **Still Open** |
| 15 | `logoutAll` for global user throws raw `Error` → generic 500 | ⚠️ | ⚠️ unchanged | **Still Open** |
| 16 | `featureFlags` has no tenant/role axis | ⚠️ informational | ⚠️ unchanged | **Still Open** |
| — | Login (email path) end-to-end across 5 personas | ✅ ready | ✅ ready | **No regression** |
| — | JWT claim shape + TTL | ✅ ready | ✅ ready | **No regression** |
| — | Login response embeds full `AuthMeDto` user | ✅ ready | ✅ ready | **No regression** |
| — | Error envelope shape (`{error:{code,message,requestId,details}}`) | ✅ ready | ✅ ready | **No regression** |
| — | `password-reset/confirm` validates `newPassword ≥ 12` | ✅ ready | ✅ ready | **No regression** |
| — | RBAC permission resolution per persona | ✅ ready | ✅ ready | **No regression** |

**Net change since V1: 0 resolved, 0 partially fixed, 0 regressions, 16
still open.** The fresh probe reproduced the V1 output byte-for-byte
across every persona and every edge case (only request IDs and JWT
`iat`/`exp` differ, as expected).

---

## 9. Remaining Blockers (priority order)

🔴 = blocks Sprint F2. ⚠️ = workaround possible. ℹ️ = informational.

1. 🔴 **Tenant-context plumbing missing on 6 authenticated/public routes.**
   Apply the `RequestContextRegistry.upgrade({ schoolId })` pattern from
   `auth.service.ts:145-147` to:
   - `AuthService.refresh()` (`auth.service.ts:270` — wrap the `prisma.transaction` body so it runs with `existing.schoolId` bound after the session row is looked up)
   - `AuthService.logout()` (`auth.service.ts:387`)
   - `AuthService.logoutAll()` (`auth.service.ts:404`)
   - `PasswordResetService.request()`
   - `PasswordResetService.firstLoginChange()`
   - `AuthController.me()` (or an equivalent `me`-bound service method)
   - Until this lands the only functional auth surface is `POST /auth/login`.

2. 🔴 **`AuthController.login` drops 4 spec-canonical fields.** Pass
   `tenantSlug`, `identifier`, `identifierType`, `rememberMe` through to
   `AuthService.login()` (`auth.controller.ts:48-56`). The DTO and
   service layer already accept them; only the wiring is missing.

3. 🔴 **`GET /auth/me` returns a thin 5-field projection.** Wire the
   controller to `buildAuthMe()` so the introspection shape mirrors the
   login response's embedded `user`.

4. 🔴 **`user.roles` is `string[]`, spec wants `{id,key,scope}[]`.**
   Update `AuthService.loadRoleKeys()` to return the richer shape and
   widen the `AuthMeDto.roles` field type.

5. 🔴 **`AuthTokensDto` uses `…ExpiresAt` not `…ExpiresIn`.** Either
   rename DTO fields to seconds-from-now or amend the spec. Clients
   need a single source of truth.

6. 🔴 **`LoginDto.password` floor is 8; spec §6 raises to 12.** Reset
   + first-login already enforce 12 — login DTO is the outlier.

7. 🔴 **Remember-Me TTL is a no-op.** Even once #2 is fixed, ensure
   the refresh-token TTL branches: `rememberMe:true → 30 d (2 592 000 s)`,
   `rememberMe:false → 24 h (86 400 s)`, platform admin always 24 h.

8. 🔴 **`POST /auth/password/change` not implemented.** Wave 3. Required
   for in-app password change of an already-authenticated user (distinct
   from first-login-change and from email-token reset).

9. 🔴 **No global `MustChangePasswordGuard`.** Flag is surfaced on
   login + AuthMe, but nothing forces the rotation server-side. Spec §6
   requires enforcement.

10. ⚠️ **`logoutAll` for global users throws raw `Error`.** R-12
    documented limitation. Should return a typed `400`/`409` so the
    client can disambiguate from a real 500.

11. ⚠️ **`featureFlags` has no tenant/role axis.** Acceptable as a
    placeholder; document as read-only defaults.

12. ⚠️ **`admission_no` identifierType returns generic
    `invalid_credentials`.** V1 rejects on purpose. Consider an
    `identifier_type_not_supported` reason when the lookup lands.

13. ℹ️ **No `GET /auth/sessions` / `DELETE /auth/sessions/:id`.**
    Future work — not blocking F1.x.

---

## 10. Readiness Scores

### 10.1 Per-Persona Frontend Readiness

| Persona | Login | Session rehydrate | Refresh | Logout | First-login change | Password reset | Score |
|---------|:----:|:----------------:|:------:|:-----:|:------------------:|:--------------:|:----:|
| Platform Admin | ✅ | 🔴 | 🔴 | 🔴 | n/a (no schoolId) | n/a (would need schoolId) | **17 %** |
| School Admin   | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **17 %** |
| Teacher        | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **17 %** |
| Parent         | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **17 %** |
| Student        | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **17 %** |

Each persona can authenticate once and read its full
roles/permissions/featureFlags from the login response. Beyond that, no
post-login HTTP round-trip succeeds.

### 10.2 Macro Readiness

| Axis | Score | Notes |
|------|-------|-------|
| **Backend Readiness** | **30 %** | Code structure + DTOs + RBAC + JWT signing are solid. 6 of 8 handlers crash on tenant-context plumbing. Controller drops 4 spec fields. |
| **Frontend Readiness** | **17 %** | Login-and-render-once is the only complete flow. Refresh, logout, `/me`, password flows all unusable. |
| **Security Readiness** | **55 %** | argon2id + pepper + chained refresh + reuse detection + anti-enumeration on reset = solid foundations. Blocked items: password floor (8→12), no `MustChangePassword` enforcement, raw-`Error` leak on global logout-all (info-leak via 500 noise). |
| **API Readiness** | **23 %** | 3 of 13 surfaces wire-correct (login, password-reset/confirm, refresh-invalid). 10 of 13 either 500 or off-spec. |
| **Overall Auth Readiness** | **🔴 ~25 %** | Unchanged from V1. |

---

## 11. Final Certification

❌ **NOT PRODUCTION-READY.**
❌ **Frontend Sprint F2 is BLOCKED.**

### Blockers in priority order (mirrors §9)

1. 🔴 **P0 — Tenant-context plumbing on 6 routes.** One-pattern fix; without it auth has only `/login`.
2. 🔴 **P0 — `AuthController.login` field-forwarding.** Restores `tenantSlug`/`identifier`/`identifierType`/`rememberMe`.
3. 🔴 **P0 — `GET /auth/me` rewired to `buildAuthMe()`.** Required for session rehydration on page reload.
4. 🔴 **P1 — `user.roles` shape change to `{id,key,scope}[]`.** Required for role-based routing.
5. 🔴 **P1 — Token TTL field rename (`…ExpiresAt` → `…ExpiresIn`).** Pick one and align spec ↔ code.
6. 🔴 **P1 — `LoginDto.password` floor raised to 12.**
7. 🔴 **P1 — Remember-Me TTL branching.**
8. 🔴 **P2 — `POST /auth/password/change` implementation.**
9. 🔴 **P2 — `MustChangePasswordGuard`.**
10. ⚠️ **P3 — `logoutAll` global-user typed error.**
11. ⚠️ **P3 — `featureFlags` tenant axis (or accept as placeholder).**

### What Sprint F2 *can* start on without backend changes
- Theming, layouts, navigation shells.
- Login page wired to `POST /auth/login` (email path only).
- Reading roles/permissions/featureFlags **from the login response's
  embedded `user`** and stashing in client state.

### What Sprint F2 *cannot* ship until P0–P1 lands
- Anything that requires a working `/auth/refresh` (i.e. any session
  living beyond 15 min).
- Anything that requires `/auth/me` for session rehydration after page
  reload.
- Logout (besides client-side token deletion, which is half a logout).
- Forgot/reset password flows (reset *confirm* works; *request* 500s).
- First-login forced password change.
- Multi-tenant URL/slug-based login.

### Re-certification condition

When the 6 P0 items resolve, this report should be re-run and the
Overall Auth Readiness should land at ≥ 75 % to certify Frontend Sprint
F2 to start.

---

## 12. Source-of-Truth References

| Reference | Used to verify |
|-----------|----------------|
| `backend/src/core/auth/auth.controller.ts` | Route table, controller field-forwarding, `me()` projection |
| `backend/src/core/auth/auth.dto.ts` | `LoginDto`, `RefreshDto`, `AuthMeDto`, `AuthTokensDto` |
| `backend/src/core/auth/auth.service.ts` | Login + refresh + logout + `buildAuthMe()` + context-upgrade location |
| `backend/src/core/auth/auth.errors.ts` | Error reason taxonomy |
| `backend/src/core/auth/jwt-auth.guard.ts` | Principal upgrade onto `RequestContext` |
| `backend/src/core/auth/token/refresh-token.service.ts` | Refresh TTL branching on `rememberMe` (unreachable from controller) |
| `backend/src/core/provisioning/password-reset/password-reset.controller.ts` | Reset + first-login DTO surface |
| `backend/src/core/request-context/request-context.service.ts` | `enterWith` upgrade semantics |
| `backend/src/core/request-context/request-context.middleware.ts` | Initial context binding |
| `backend/src/core/rbac/rbac.constants.ts` | `BUILT_IN_ROLE_DEFINITIONS` grants |
| `backend/src/contracts/api.ts` | `ErrorEnvelope` / `SuccessEnvelope` |
| `docs/AUTHENTICATION_PATCH_PLAN.md` §1–12 | Canonical contract |
| `docs/ROLES_AND_PERMISSIONS.md` §3.2 | Role grant set |
| `docs/REST_API_DESIGN.md` | Envelope conventions |
| `docs/MULTI_TENANT_ARCHITECTURE.md` | Tenant resolution expectations |
| `docs/SUPER_ADMIN_ARCHITECTURE.md` | Global-scope semantics |
| `docs/SUBSCRIPTION_FOUNDATION.md` | `@AllowWhenInactive()` decorator on auth controllers |
| `docs/AUTH_API_CONTRACT_VERIFICATION.md` | V1 baseline (this report's comparison axis) |
| `backend/verify_auth.js` | Live probe script (8 endpoints × 5 personas + edges) |
| `C:\Users\rizwa\AppData\Local\Temp\verify_v2_out.json` | Today's raw probe output |

---

**Stop.** Verification only — no backend code modified, no frontend
implementation started, Sprint F2 not started. Next action belongs to
backend: ship the §11 P0 items, then re-run this verification.
