# Authentication API — Contract Verification Report

**Sprint:** Authentication Patch Plan — pre-W1.5 contract verification
**Scope:** Read-only audit of every implemented `/v1/auth/*` route against
the approved contract (`docs/AUTHENTICATION_PATCH_PLAN.md` §1–12).
**Date:** 2026-06-28
**Methodology:** Static review (controllers, services, DTOs) plus a live
end-to-end probe (`backend/verify_auth.js`, output captured at
`/tmp/verify_out.json`) executed against the freshly seeded dev backend.
**Result:** 🔴 **Not frontend-ready.** Login works end-to-end for every
persona, but **6 of the 8 implemented routes fail with HTTP 500
`TenantContextMissingError`**. Frontend integration is blocked until the
`RequestContextRegistry.upgrade({ schoolId })` W1.4 fix that was applied
to `login()` is replicated on the other handlers.

---

## 1. Endpoint-by-Endpoint Verification

Routes mapped at boot (Nest `RouterExplorer`):

```
POST /api/v1/auth/login                              @Public
POST /api/v1/auth/refresh                            @Public
POST /api/v1/auth/logout                             auth required, 204
POST /api/v1/auth/logout-all                         auth required
GET  /api/v1/auth/me                                 auth required
POST /api/v1/auth/password-reset/request             @Public, 200
POST /api/v1/auth/password-reset/confirm             @Public, 204
POST /api/v1/auth/first-login/change-password        auth required, 204
```

Live behaviour table — every cell verified against `/tmp/verify_out.json`
(JSON node names in *italics*):

| Route | Spec status | Implemented | Live HTTP | Live result | Verdict |
|------|-------------|-------------|-----------|-------------|---------|
| `POST /auth/login` (5 personas) | 200 + tokens | yes | **200** | All 5 personas return populated `AuthTokensDto` (*personas.\**) | ✅ working |
| `POST /auth/refresh` (valid token) | 200 + new tokens | yes | **500** | `INTERNAL_ERROR` "Tenant context missing for tenant-scoped query" (*edges.refreshOk*) | 🔴 broken |
| `POST /auth/refresh` (reused token) | 401 `refresh_reused` | yes (logic) | **500** | Same tenant-context 500 (*edges.refreshReuse*) — never reaches reuse-detection branch | 🔴 broken |
| `POST /auth/refresh` (invalid token) | 401 `refresh_invalid` | yes | **401** | Correct envelope, `reason: refresh_invalid` (*edges.refreshInvalid*) | ✅ working |
| `POST /auth/logout` | 204 empty | yes | **500** | Tenant-context 500 (*edges.logout*) | 🔴 broken |
| `POST /auth/logout-all` (tenant user) | 200 `{ revokedSessions }` | yes | **500** | Tenant-context 500 (*edges.logoutAll*) | 🔴 broken |
| `POST /auth/logout-all` (platform admin) | documented R-12 limitation | yes | **500** | Generic `INTERNAL_ERROR` (the `Error('Global-scope users cannot logout-all')` from `auth.service.ts` is not mapped to a domain error) (*edges.logoutAllPlatform*) | ⚠️ documented but unfriendly |
| `GET /auth/me` (school admin) | 200 + full AuthMeDto | partial (5-field only) | **500** | Tenant-context 500 (*edges.meSchoolAdmin*) | 🔴 broken |
| `GET /auth/me` (no bearer) | 401 `token_malformed` | yes | **401** | Correct envelope (*edges.meNoAuth*) | ✅ working |
| `POST /auth/password-reset/request` | 200 always (`{accepted: true}`) | yes | **500** | Tenant-context 500 (*edges.passwordResetRequest*) | 🔴 broken |
| `POST /auth/password-reset/confirm` (bad token) | 401 / 422 | yes | **422** | Correct: validates `newPassword` min length 12 (*edges.passwordResetConfirmBad*) | ✅ working |
| `POST /auth/first-login/change-password` (wrong pw) | 401/422 | yes | **500** | Tenant-context 500 (*edges.firstLoginChange*) — never reaches password comparison | 🔴 broken |
| `POST /auth/password/change` | Wave 3 NEW (not yet shipped) | **no** | **404** | `RESOURCE_NOT_FOUND` "Cannot POST /api/v1/auth/password/change" (*edges.passwordChangeNotFound*) | ✅ correctly absent |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id` | future | no | n/a | not mapped | ✅ deferred |

**Root cause of the six 500s:** `auth.service.ts:145-147` calls
`RequestContextRegistry.upgrade({ schoolId })` *only inside the* `login()`
*path*. `refresh()`, `logout()`, `logoutAll()`, `passwordResetRequest()`,
`firstLoginChange()`, and `getMe()` all open Prisma transactions on
tenant-owned models without first upgrading the AsyncLocalStorage frame
with `schoolId`, so `tenant-scope.ext.ts` throws
`TenantContextMissingError` before the handler can complete. This is a
**plumbing bug**, not a contract bug — the DTOs, codes, and shapes are
fine.

---

## 2. Request Verification

### `POST /auth/login` (`LoginDto`)

| Field | Type / Constraint | Source | Spec match |
|-------|-------------------|--------|------------|
| `schoolId` | UUID (`@IsOptional`) | `auth.dto.ts:28` | ⚠️ spec V1 lists `tenantSlug` as canonical; both accepted for back-compat |
| `email` | `@IsEmail @MaxLength(255)` (`@IsOptional`) | `auth.dto.ts:31` | ⚠️ deprecated by V1; use `identifier` + `identifierType:'email'` |
| `password` | `@MinLength(8) @MaxLength(256)` | `auth.dto.ts:34` | 🔴 spec §6 raises floor to **12** in Wave 3; current min 8 |
| `deviceId` | `@MaxLength(64)` (`@IsOptional`) | `auth.dto.ts:37` | ✅ |
| `tenantSlug` | `@Matches(/^[a-z0-9-]{1,64}$/)` (`@IsOptional`) | `auth.dto.ts:40` | ✅ V1 additive |
| `identifier` | `@MaxLength(255)` (`@IsOptional`) | `auth.dto.ts:43` | ✅ V1 additive |
| `identifierType` | `@IsIn(['email','admission_no'])` (`@IsOptional`) | `auth.dto.ts:46` | ⚠️ `admission_no` rejected in V1 (`auth.service.ts` `resolveLoginAddress`) |
| `rememberMe` | `@IsBoolean` (`@IsOptional`) | `auth.dto.ts:49` | 🔴 accepted by DTO but ignored downstream — see §3.4 |

**Live validation envelope confirmed** (`edges.validationErr`): a bad UUID
+ bad email returns `422 VALIDATION_FAILED` with `details.fields[]`:

```json
{ "fields": [
    { "path": "schoolId", "code": "ISUUID",  "message": "schoolId must be a UUID" },
    { "path": "email",    "code": "ISEMAIL", "message": "email must be an email" }
] }
```

### `POST /auth/refresh` (`RefreshDto`)

| Field | Constraint | Source | Spec |
|-------|------------|--------|------|
| `refreshToken` | `@Length(30,64)` | `auth.dto.ts:57` | ✅ |

### `POST /auth/password-reset/request` (`RequestPasswordResetDto`)

| Field | Constraint | Source | Spec |
|-------|------------|--------|------|
| `schoolId` | `@IsUUID()` | `password-reset.controller.ts` | ⚠️ requires UUID — same multi-tenant UX gap as login |
| `email` | `@IsEmail @MaxLength(255)` | same | ✅ |

### `POST /auth/password-reset/confirm` (`ConfirmPasswordResetDto`)

| Field | Constraint | Source | Spec |
|-------|------------|--------|------|
| `token` | `@Length(32,200)` | same | ✅ |
| `newPassword` | `@Length(12,128)` | same | ✅ (matches §6's 12-char floor) |

### `POST /auth/first-login/change-password` (`FirstLoginChangePasswordDto`)

| Field | Constraint | Source | Spec |
|-------|------------|--------|------|
| `currentPassword` | `@Length(1,128)` | same | ✅ |
| `newPassword` | `@Length(12,128)` | same | ✅ |

---

## 3. Response Verification

### 3.1 `AuthTokensDto` — login response top-level shape

Top-level keys returned (every persona, *personas.\*.tokenTopLevelKeys*):

```
[ accessToken, accessTokenExpiresAt, mustChangePassword,
  refreshToken, refreshTokenExpiresAt, tokenType, user ]
```

| Field | Type | Source | Spec match |
|-------|------|--------|------------|
| `accessToken` | string | `auth.dto.ts:65` | ✅ |
| `accessTokenExpiresAt` | ISO timestamp | `auth.dto.ts:67` | 🔴 spec §3 uses `accessTokenExpiresIn` (seconds); current shape is `…ExpiresAt` (absolute) |
| `refreshToken` | string | `auth.dto.ts:69` | ✅ |
| `refreshTokenExpiresAt` | ISO timestamp | `auth.dto.ts:71` | 🔴 same shape mismatch (`…ExpiresIn` vs `…ExpiresAt`) |
| `tokenType` | `'Bearer'` literal | `auth.dto.ts:73` | ✅ |
| `mustChangePassword` | boolean | `auth.dto.ts:75` | ✅ |
| `user` | populated `AuthMeDto` | `auth.dto.ts:80`, populated by `AuthService.buildAuthMe()` | ✅ |

### 3.2 `AuthMeDto` — embedded in login response

Verified across all 5 personas. Every required + optional field is
populated on `login()` response (sample: *personas.school_admin.user*):

```jsonc
{
  // required
  "userId":     "0b5062b0-…",
  "schoolId":   "36c2e579-…",        // null for platform_admin
  "actorScope": "tenant",            // "global" for platform_admin
  "roleIds":   ["7829f6f9-…"],
  "sessionId": "55b0120b-…",

  // optional (all populated)
  "displayName":       "School Admin (canary demo)",
  "email":             "school.admin@canary.local",
  "roles":             ["school_admin"],            // ⚠️ see §3.3
  "permissions":       ["*"],
  "schoolSlug":        "canary",                    // absent for platform_admin
  "locale":            "en-IN",                     // absent for platform_admin
  "timezone":          "Asia/Kolkata",              // absent for platform_admin
  "mustChangePassword": false,
  "featureFlags":      { /* ~63 keys */ }
}
```

`platform_admin` omits `schoolSlug`/`locale`/`timezone` (global scope has
no canonical school) — verified at *personas.platform_admin.user*.

### 3.3 `roles` field shape mismatch

| Surface | Returned | Spec (`AUTHENTICATION_PATCH_PLAN.md` §3) |
|---------|----------|------------------------------------------|
| `user.roles` | `string[]` of role keys (e.g. `["teacher"]`) | `Array<{ id: string; key: string; scope: 'tenant'|'global' }>` |

This is a 🔴 contract gap. The frontend cannot route by role today
without re-looking up the role catalogue or doing a key-only switch
(which works but is brittle and undocumented).

### 3.4 `Remember Me` — DTO honoured, service ignores it

`edges.rememberMe` measured both branches against the same school admin:

| Request | Returned `refreshExpiresIn` |
|---------|-----------------------------|
| `rememberMe: true`  | **86400 s** (24 h) |
| `rememberMe: false` | **86400 s** (24 h) |

Spec §5 requires `true` → **30 days (2 592 000 s)** and `false` → **24 h
(86 400 s)**. The DTO accepts the field, but `AuthService.login()` does
not branch on it for refresh TTL. 🔴 contract gap.

### 3.5 `GET /auth/me` — divergent shape from login response

The controller (`auth.controller.ts`) returns a **5-field projection
straight from the JWT principal** — `{ userId, schoolId, actorScope,
roleIds, sessionId }`. It does **not** call `buildAuthMe()`, so the
optional 8 fields (`displayName`, `email`, `roles`, `permissions`,
`schoolSlug`, `locale`, `timezone`, `mustChangePassword`,
`featureFlags`) are absent — *even when the route works*.

Combined with the live `500` (*edges.meSchoolAdmin*), the practical
position is: **`GET /auth/me` is unusable**. The frontend should rely on
the embedded `user` from the login/refresh response and avoid
`/auth/me` until both the tenant-context fix and the `buildAuthMe()`
wiring land.

### 3.6 Error envelope shape

Every error response confirmed to match `contracts/api.ts`
`ErrorEnvelope`:

```json
{ "error": { "code": "<ERROR_CODE>", "message": "<human>", "requestId": "<ulid>",
             "details": { … }? } }
```

| Live case | HTTP | Code | Reason | Source |
|-----------|------|------|--------|--------|
| Wrong password | 401 | `UNAUTHENTICATED` | `invalid_credentials` | *edges.invalidCreds* |
| Bad UUID + bad email | 422 | `VALIDATION_FAILED` | `fields[]` array | *edges.validationErr* |
| Malformed refresh token | 401 | `UNAUTHENTICATED` | `refresh_invalid` | *edges.refreshInvalid* |
| No bearer on `/auth/me` | 401 | `UNAUTHENTICATED` | `token_malformed` | *edges.meNoAuth* |
| `admission_no` identifier | 401 | `UNAUTHENTICATED` | `invalid_credentials` | *edges.admissionNoLogin* (V1 rejects this path on purpose) |
| Short new password on reset | 422 | `VALIDATION_FAILED` | `fields[]` | *edges.passwordResetConfirmBad* |
| Wrong route | 404 | `RESOURCE_NOT_FOUND` | — | *edges.passwordChangeNotFound* |
| Tenant-context 500 | 500 | `INTERNAL_ERROR` | (no reason) | every broken edge |

✅ envelope shape is consistent and matches the contract.

---

## 4. JWT Verification

Sample claims confirmed identical across all 5 personas
(*personas.\*.jwtClaims*):

```
sub          (uuid, matches userId)
tenant_id    (uuid for tenant users; NULL for platform_admin)
scope        ('tenant' | 'global')
role_ids     (string[], length 1 in seed)
sid          (string)
chain_id     (string)
jti          (string)
iat / exp    (TTL = 900 s → 15 min for access token)
iss          'schoolos'
aud          'schoolos-api'
```

11 claims, all spec-compliant (`AUTHENTICATION_PATCH_PLAN.md` §3, §4).

| Persona | `sub` ≠ user.id? | `tenant_id` | `scope` | `role_ids.length` |
|---------|------------------|-------------|---------|-------------------|
| platform_admin | match | **null** | global | 1 |
| school_admin   | match | uuid     | tenant | 1 |
| teacher        | match | uuid     | tenant | 1 |
| parent         | match | uuid     | tenant | 1 |
| student        | match | uuid     | tenant | 1 |

Access-token TTL measured at **899–900 s** (target 900 s, drift from
clock skew at decode time). Refresh-token TTL measured at **86 400 s**
across all responses regardless of `rememberMe` — see §3.4.

---

## 5. RBAC Verification

Roles and permissions resolved end-to-end via
`UserRoleRepository → PermissionService.resolveForRoles →
AuthService.buildAuthMe → AuthMeDto.permissions`, matching
`BUILT_IN_ROLE_DEFINITIONS` byte-for-byte
(`backend/src/core/rbac/rbac.constants.ts`):

| Persona | `user.roles` | `user.permissions` |
|---------|--------------|--------------------|
| `platform.admin@schoolos.local`   | `["platform_admin"]` | `["*", "communication.*", "plan.*", "provisioning.*", "school.*"]` |
| `school.admin@canary.local`       | `["school_admin"]`   | `["*"]` |
| `teacher1@canary.local`           | `["teacher"]`        | `["attendance.create","marks.create","marks.update","messages.send","notices.create"]` |
| `parent1@canary.local`            | `["parent"]`         | `["attendance.read","fees.pay","fees.read","leave.apply","marks.read","messages.send","notices.acknowledge","report_cards.read","students.read"]` |
| `20260001@students.canary.local`  | `["student"]`        | `["homework.submit","library.read","marks.read","notices.read","timetable.read"]` |

✅ RBAC payload matches the source of truth (`docs/ROLES_AND_PERMISSIONS.md`
§3.2) for every demo persona.

**Gap (spec §3 only):** `user.roles` is a flat `string[]` of keys —
**not** the spec's `{ id, key, scope }` object array. See §3.3.

---

## 6. Feature Flag Verification

Every persona's login response carries a `user.featureFlags` map. Count
verified: **63 keys** for every persona (counted from
`personas.*.user.featureFlags`).

**Sample**: see `personas.school_admin.user.featureFlags` — every key
follows `<namespace>.<flag>` or `module.<name>` convention. Examples:

```
academic-content.allow_submissions        : true
attendance.biometric                      : false
billing.razorpay_enabled                  : false
comms.channel.email                       : true
events.allow_publish                      : true
examination.publish_results               : false
fees.allow_partial_payment                : true
module.academic-content                   : true
module.communication_center               : false
notifications.quiet_hours_enforced        : true
parent_portal                             : true
payments.gateway.razorpay                 : false
provisioning.allow_password_reset         : true
reporting.allow_bulk_operations           : true
student_portal                            : true
subscription.enforce_limits               : true
timetable.auto_generate                   : false
```

**Observation — no per-user / per-tenant axis.** All 5 personas — across
two distinct tenants (`platform` and `canary`) — receive the **same 63
flag values**. `FeatureFlagService` is iterating its in-process
`knownKeys()` registry with static defaults; no tenant-scoped overrides,
no role-scoped overrides, no environment overrides. This matches the
current implementation (no flag-store schema exists yet) but the
frontend should treat `featureFlags` as **read-only defaults** for now,
not as a tenant-aware switchboard.

---

## 7. Persona Coverage Matrix

| Persona | Login | JWT claims | `user.roles` | `user.permissions` | `featureFlags` | `actorScope` |
|---------|:-----:|:----------:|:-----------:|:------------------:|:--------------:|:-------------:|
| Platform Admin | ✅ | ✅ (`tenant_id=null`) | ✅ | ✅ (5 entries) | ✅ (63) | global |
| School Admin   | ✅ | ✅ | ✅ | ✅ (1) | ✅ (63) | tenant |
| Teacher        | ✅ | ✅ | ✅ | ✅ (5) | ✅ (63) | tenant |
| Parent         | ✅ | ✅ | ✅ | ✅ (9) | ✅ (63) | tenant |
| Student        | ✅ | ✅ | ✅ | ✅ (5) | ✅ (63) | tenant |

Login is universal. Every other authenticated route is broken for every
persona due to the missing context upgrade (§1).

---

## 8. Flow Coverage Matrix

| Flow | Implemented | Frontend-ready | Notes |
|------|:-----------:|:--------------:|-------|
| Login (email)             | ✅ | ✅ | All 5 personas verified |
| Login (tenantSlug)        | ⚠️ | 🔴 | DTO accepts it, but `tenantSlug:'canary'` returned **401** (*edges.tenantSlugLogin*). Slug resolution or canary slug case is misaligned — needs investigation. |
| Login (admission_no)      | ❌ | ✅ deferred | Service rejects in V1 with `invalid_credentials` (*edges.admissionNoLogin*) — documented. |
| Refresh                   | ✅ logic | 🔴 | 500 due to tenant context (§1) |
| Logout                    | ✅ logic | 🔴 | 500 |
| Logout-all (tenant)       | ✅ logic | 🔴 | 500 |
| Logout-all (global)       | ⚠️ R-12  | 🔴 | Throws raw `Error`, surfaces as generic `INTERNAL_ERROR` (no domain error mapping) |
| `GET /auth/me`            | ⚠️ partial | 🔴 | 500 *and* projection is too thin (§3.5) |
| Change Password (logged in) | ❌ | 🔴 | Wave 3 work — `password/change` not yet implemented (*edges.passwordChangeNotFound*) |
| Forgot Password           | ✅ logic | 🔴 | `password-reset/request` returns 500 |
| Reset Password            | ✅       | ✅ | `password-reset/confirm` validates + processes; 422 envelope verified |
| Must-Change-Password (banner) | ✅ surfaced | ✅ | `mustChangePassword` correctly emitted on login + AuthMeDto |
| Must-Change-Password (enforced redirect) | ❌ | 🔴 | No global guard exists; `first-login/change-password` route is the only writer and it 500s |

---

## 9. Remaining Gaps (frontend-blocking unless noted)

🔴 = blocker, ⚠️ = workaround possible, ℹ️ = informational.

1. 🔴 **Tenant-context plumbing missing on 6 routes.** `auth.service.ts`
   only calls `RequestContextRegistry.upgrade({ schoolId })` inside
   `login()`. Replicate the same call (or an equivalent `runWithSchool`
   wrapper) at the top of `refresh()`, `logout()`, `logoutAll()`,
   `getMe()`, `passwordResetRequest()`, and `firstLoginChange()`.
   Without this, the frontend has only one functional endpoint.
2. 🔴 **`GET /auth/me` returns a 5-field projection.** Even once (1) is
   fixed, the controller must be wired to `buildAuthMe()` so the
   response shape matches the embedded `user` from `login()`. Today the
   client cannot rehydrate session state from `/auth/me`.
3. 🔴 **`Remember Me` is a no-op.** DTO accepts `rememberMe`; service
   ignores it; both `true` and `false` yield 24 h refresh tokens.
   Spec §5 requires 30 d on `true`, 24 h on `false`, with platform
   admin always 24 h.
4. 🔴 **`user.roles` returns `string[]` of keys**, not the spec's
   `{ id, key, scope }` objects. Frontend routing has to key-switch on
   raw strings until this lands.
5. 🔴 **`AuthTokensDto` uses `…ExpiresAt` (ISO timestamps) instead of
   `…ExpiresIn` (seconds)** per spec §3. Either rename the DTO fields or
   amend the spec; clients have to decide which.
6. 🔴 **`POST /auth/password/change`** (Wave 3) is not implemented —
   confirmed 404 (*edges.passwordChangeNotFound*). Required for in-app
   password change of an already-authenticated user (distinct from
   first-login + reset-by-email).
7. 🔴 **No global `MustChangePasswordGuard`.** The flag is surfaced on
   login + AuthMe, but nothing on the server forces the rotation. The
   frontend can implement a redirect, but the contract should also be
   enforced server-side per spec §6.
8. 🔴 **`LoginDto.password` floor is 8** (`auth.dto.ts:34`). Spec §6
   raises this to **12** in Wave 3. Reset/confirm + first-login already
   enforce 12 — `LoginDto` needs to follow.
9. 🔴 **`tenantSlug` login path 401s in live test** with the canary
   tenant. DTO accepts it but `AuthService.resolveSchoolId` either looks
   up the wrong column or expects a different slug. Needs an integration
   trace before the frontend can drop the `schoolId` UUID requirement.
10. ⚠️ **Global `logout-all` throws raw `Error`**, surfacing as
    `INTERNAL_ERROR`. R-12 is a documented limitation, but the route
    should at least return `400`/`409` with a typed code so the client
    can detect the case instead of guessing on 500.
11. ⚠️ **`featureFlags` carries no tenant/role axis.** Same 63 values
    for every persona across both tenants. Acceptable as a Sprint-W1
    placeholder; client should treat as read-only defaults.
12. ⚠️ **`admission_no` identifierType returns generic `invalid_credentials`.**
    Functionally correct (V1 rejects it on purpose), but the client
    can't distinguish "wrong creds" from "feature off" — consider a
    dedicated `identifier_type_not_supported` reason once the lookup
    lands.
13. ℹ️ **No `GET /auth/sessions` or `DELETE /auth/sessions/:id`.**
    Future work — not blocking F1.3.

---

## 10. Frontend Readiness Score

**Surface-level inventory** (13 contract surfaces):

| # | Surface | State |
|---|---------|-------|
| 1 | Login (email path) | ✅ ready |
| 2 | Login (tenantSlug path) | 🔴 broken |
| 3 | JWT shape | ✅ ready |
| 4 | Embedded `user` on login response | ✅ ready (with field-shape caveats §3.3, §3.5) |
| 5 | Refresh | 🔴 broken |
| 6 | Logout | 🔴 broken |
| 7 | Logout-all | 🔴 broken |
| 8 | `GET /auth/me` | 🔴 broken + thin projection |
| 9 | Forgot password (request) | 🔴 broken |
| 10 | Reset password (confirm) | ✅ ready |
| 11 | First-login change password | 🔴 broken |
| 12 | In-app change password | 🔴 not implemented (Wave 3) |
| 13 | Remember-Me TTL | 🔴 not implemented |

**Score: 3 / 13 surfaces frontend-ready (≈ 23 %).**

**Verdict:** ❌ **NOT READY for frontend integration beyond a
login-and-redirect smoke flow.** A frontend can authenticate the user
and read their embedded `user`/`featureFlags`/`permissions` from the
login response, but it **cannot**:

- refresh the access token when it expires (15 min ceiling),
- log the user out,
- rehydrate the session from `/auth/me` on hard reload,
- run the forgot-password flow,
- enforce or complete a first-login password change,
- honour Remember-Me TTL.

The frontend can begin theming + UI scaffolding (Sprint F1.3 explicitly
covers this), but should treat any flow beyond `login() → redirect` as
**known-broken** until the backend ships the fixes enumerated in §9.1
through §9.8. The W1.4 `RequestContextRegistry.upgrade` pattern that
unblocked `login()` is the only mechanical change required for items
§9.1 — that one fix would lift readiness from ~23 % to ~70 %.

---

## 11. Appendix — Source of Truth

| Reference | Used to verify |
|-----------|----------------|
| `backend/src/core/auth/auth.controller.ts` | Route table, decorators, status codes |
| `backend/src/core/auth/auth.dto.ts` | Request + response DTO shapes |
| `backend/src/core/auth/auth.service.ts` | Login/refresh/logout logic; `buildAuthMe()`; context-upgrade location |
| `backend/src/core/auth/auth.types.ts` | `JwtClaims`, `AuthPrincipal`, `AuthTokenPair` |
| `backend/src/core/auth/auth.errors.ts` | Error reason union, code mapping |
| `backend/src/core/provisioning/password-reset/password-reset.controller.ts` | Password reset + first-login DTOs |
| `backend/src/core/rbac/rbac.constants.ts` | `BUILT_IN_ROLE_DEFINITIONS` grant set |
| `backend/src/contracts/api.ts` | `ErrorEnvelope`, `SuccessEnvelope`, `ERROR_CODES` |
| `docs/AUTHENTICATION_PATCH_PLAN.md` §1–12 | Canonical contract spec |
| `docs/ROLES_AND_PERMISSIONS.md` §3.2 | Per-role permission grants |
| `docs/AUTH_RBAC_ALIGNMENT_REPORT.md` | RBAC seed alignment (sibling sprint) |
| `backend/verify_auth.js` + `/tmp/verify_out.json` | Live HTTP probe results |

---

**Stop.** No backend code modified. No frontend integration started.
Next sprint (W1.5) should triage §9.1 first — it is mechanically the
single highest-leverage fix and unblocks five of the seven broken
surfaces in one diff.
