# Sprint F2.2 — Frontend Auth Contract Convergence

**Date:** 2026-06-29
**Status:** Complete — all checks green
**Scope:** Implement R1–R5 from `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md` §10 so the frontend matches the frozen backend authentication contract.
**Backend touched:** None.

---

## 1. Files Modified

### Modified

| Path | Change |
|------|--------|
| `frontend/.env.example` | Added `NEXT_PUBLIC_DEV_SCHOOL_SLUG` (dev-only tenant slug) and a "Tenant resolution" comment block. `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` kept with a deprecation note for one migration cycle. |
| `frontend/src/lib/config/app.ts` | `AUTH_CONFIG` now exposes `devSchoolSlug` (read from `NEXT_PUBLIC_DEV_SCHOOL_SLUG`). `defaultSchoolId` retained, JSDoc-marked `@deprecated`. Module docstring rewritten to describe host-derived tenant resolution. |
| `frontend/src/lib/api/client.ts` | Added `resolveTenantSlug()` — the **single source of truth** for tenant resolution. Request interceptor and the standalone refresh call both attach `X-Tenant-Slug` when the resolver returns a slug. |
| `frontend/src/components/auth/LoginForm.tsx` | Removed the `AUTH_CONFIG` import, the `defaultSchoolId === null` gate, the "Tenant is not configured" error string, and the `schoolId` field from the `login(...)` body. Form is now fully tenant-agnostic. UI markup, styling, and Preskool theme classes unchanged. |
| `frontend/src/components/auth/ForgotPasswordForm.tsx` | Same treatment — dropped `AUTH_CONFIG`, the gate, and the `schoolId` field from `requestPasswordReset(...)`. |
| `frontend/src/lib/api/clients/auth.ts` | `LoginPayload.schoolId` and `PasswordResetRequestPayload.schoolId` made optional and `@deprecated`. Added optional `LoginPayload.tenantSlug` (also `@deprecated`). File docstring updated to describe the new contract. |
| `frontend/src/components/auth/LoginForm.test.tsx` | Removed the "missing env" test (gate is gone); removed `schoolId` from the expected payload and added an explicit `not.toHaveProperty('schoolId')` assertion; removed dependence on the `AUTH_CONFIG` mock. |
| `frontend/src/components/auth/ForgotPasswordForm.test.tsx` | Same — payload assertion is now `{ email }` only, with `not.toHaveProperty('schoolId')`. |
| `frontend/src/providers/AuthProvider.test.tsx` | Dropped the obsolete `schoolId: 's'` arg from the test login call. |

### Not Touched (intentional)

- `frontend/src/components/auth/ResetPasswordForm.tsx` — already tenant-agnostic (uses URL token).
- `frontend/src/components/auth/FirstLoginChangePasswordForm.tsx` — already tenant-agnostic (authenticated; tenant in JWT).
- `frontend/src/providers/AuthProvider.tsx` — forwards `LoginPayload` opaquely; no schoolId logic.
- `frontend/src/types/domain.ts` — `SessionUser` shape unchanged.
- `frontend/src/lib/auth/token-storage.ts`, `landing.ts`, `errors.ts`, `http.ts`, `trace-id.ts` — no touch.
- Theme assets, `AuthShell`, `PasswordInput`, `Spinner` — no touch.
- Backend code — no touch (per directive).

---

## 2. Implementation Summary

### R1 — Frontend Configuration
- New dev variable `NEXT_PUBLIC_DEV_SCHOOL_SLUG` documented in `.env.example` with explicit "dev/staging only — leave UNSET in production" guidance.
- `AUTH_CONFIG.devSchoolSlug` exposed as `string | null` (empty/missing → null).
- `AUTH_CONFIG.defaultSchoolId` retained but JSDoc-marked `@deprecated`. The application no longer reads it; only kept on the type surface for one migration cycle.

### R2 — Axios Tenant Injection (single source of truth)
- New `resolveTenantSlug()` helper in `lib/api/client.ts` decides tenant per request:
  - **Localhost / 127.x / ::1 / 0.0.0.0** → `AUTH_CONFIG.devSchoolSlug` (or `null`).
  - **`admin.<root>` / `www.<root>` / bare 2-label hostname** → `null` (no header — platform admin and marketing don't get a tenant header).
  - **`{slug}.<root>` (any other subdomain in production)** → first label of hostname.
- Request interceptor attaches `X-Tenant-Slug` when the resolver returns a non-null slug, never overwriting an explicit per-call header.
- Refresh-token POST in `refreshAccessToken()` also attaches the header (so the refresh roundtrip carries tenant context).
- No other layer sets `X-Tenant-Slug`. No form, no page, no provider parses `window.location.hostname`.

### R3 — LoginForm Migration
- Removed all dependencies on `AUTH_CONFIG.defaultSchoolId`, the `defaultSchoolId === null` gate, the "Tenant is not configured" copy, and the `schoolId` field in the `login(...)` body.
- Form is now completely tenant-agnostic — it does not know what tenant it belongs to.
- UI / styling / Preskool theme classes unchanged (visual diff is zero).
- Login body shape on the wire: `{ email, password, rememberMe }`.

### R3b — ForgotPasswordForm Migration
- Same surgery as LoginForm: dropped `AUTH_CONFIG` dependency, the gate, and the `schoolId` field. Body shape on the wire: `{ email }`.

### R4 — Frontend Types
- `LoginPayload`: required fields are now `{ email, password }`; optional `rememberMe`, `deviceId`. `schoolId` and `tenantSlug` are present but JSDoc-marked `@deprecated` (kept optional for backwards compatibility).
- `PasswordResetRequestPayload`: required field is `email`; `schoolId` optional + `@deprecated`.
- Obsolete F1.3 docstrings replaced with F2.2 contract description.

### R5 — Cleanup
- Stale "F1.3 — backend requires schoolId" comments removed from `LoginForm.tsx`, `ForgotPasswordForm.tsx`, `auth.ts`, and `app.ts`.
- Tests rewritten to assert the new contract (no `schoolId` in payload, no env-var gate behaviour).
- `AuthProvider.test.tsx` updated to drop the obsolete `schoolId: 's'` argument.

---

## 3. Runtime Verification

### 3.1 Build & static checks (all green)

| Command | Result |
|---------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ clean — 0 errors |
| `npm run lint` (`next lint`) | ✅ clean — 0 warnings, 0 errors |
| `npx vitest run` (8 spec files) | ✅ 27/27 tests passing |
| `npm run build` (`next build`) | ✅ compiled, 9/9 static pages generated |

Page sizes (post-migration build output):
```
Route (app)                              Size     First Load JS
├ ○ /first-login                         4.28 kB         149 kB
├ ○ /forgot-password                     3.29 kB         148 kB
├ ○ /login                               4.58 kB         149 kB
└ ○ /reset-password                      3.68 kB         148 kB
```

### 3.2 Wire-format verification

What the FE now puts on the wire (verified by reading the request interceptor and the body construction in each form):

| Endpoint | Body | Headers (added by axios) |
|---|---|---|
| `POST /auth/login` | `{ email, password, rememberMe }` | `X-Request-Id`, `X-Tenant-Slug` (when resolver returns a slug), `Idempotency-Key` |
| `POST /auth/refresh` | `{ refreshToken }` | `X-Request-Id`, `X-Tenant-Slug` (when resolver returns a slug) |
| `GET /auth/me` | — | `X-Request-Id`, `Authorization: Bearer …`, `X-Tenant-Slug` |
| `POST /auth/logout` | `{}` | + `Idempotency-Key` |
| `POST /auth/logout-all` | `{}` | + `Idempotency-Key` |
| `POST /auth/password-reset/request` | `{ email }` | + `Idempotency-Key` |
| `POST /auth/password-reset/confirm` | `{ token, newPassword }` | + `Idempotency-Key` |
| `POST /auth/first-login/change-password` | `{ currentPassword, newPassword }` | + `Authorization`, `Idempotency-Key` |

No body contains `schoolId`. Every authenticated and tenant-scoped request carries `X-Tenant-Slug` when the resolver yields one.

### 3.3 Persona / flow walk-through coverage

The test suite covers the wire-shape contract change directly. A live end-to-end persona walk-through against a running backend was not in scope for this sprint (no automated E2E harness landed yet). The recipe for manual verification is in §4 (Local Development Flow) below.

| Flow | Coverage |
|---|---|
| Login (all five personas) | Wire-format asserted by `LoginForm.test.tsx`. Persona credentials and routing target identical to F2.1; `resolveLandingPath()` unchanged. |
| Remember Me | Asserted by `LoginForm.test.tsx` (rememberMe: true in the body). |
| Refresh (single-flight 401) | Unchanged from F2.1; refresh call now also carries `X-Tenant-Slug`. |
| Logout | Unchanged; clears tokens in `finally` regardless of server response. |
| Logout All | Unchanged; existing 500 for platform admin still surfaces (backend limitation R-12). |
| Forgot Password | `ForgotPasswordForm.test.tsx` asserts `{ email }` body only. |
| Reset Password | Unchanged from F2.1 — token-based, tenant-agnostic. |
| First-login change-password | Unchanged from F2.1 — authenticated, tenant in JWT. |
| `/auth/me` | Hydration path unchanged in `AuthProvider.tsx`; now rides the tenant header. |

---

## 4. Local Development Flow

```
Developer machine
└─ http://localhost:3001       (next dev)
   └─ axios singleton
      └─ resolveTenantSlug()
         hostname === 'localhost' → AUTH_CONFIG.devSchoolSlug
                                    (NEXT_PUBLIC_DEV_SCHOOL_SLUG)
         → 'canary'  ───────────►  X-Tenant-Slug: canary
                                       │
                                       ▼
http://localhost:3000/api/v1/auth/*
└─ backend TenantResolverMiddleware
   └─ generic header branch (tenant-resolver.service.ts:103-108)
      → resolves schoolId from slug → request runs in canary scope
```

**Setup:**
```bash
cd c:/rizwan/schoolos-saas/frontend
cp .env.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_DEV_SCHOOL_SLUG=canary      # (or any other seeded slug)
# Leave NEXT_PUBLIC_DEFAULT_SCHOOL_ID unset.
npm run dev
```

**Switching personas (all five):**
- Platform Admin → `NEXT_PUBLIC_DEV_SCHOOL_SLUG=platform` (or unset — see §4.1).
- School Admin / Teacher / Parent / Student → `NEXT_PUBLIC_DEV_SCHOOL_SLUG=canary`.
- After editing `.env.local`, restart `npm run dev` (Next.js inlines `NEXT_PUBLIC_*` at boot).
- Clear browser localStorage (`localStorage.clear()`) before each persona switch.

### 4.1 Platform Admin in development

The backend's tenant resolver consumes `X-Tenant-Slug: platform` and looks up the sentinel slug → returns the platform schoolId. Two equivalent setups work in dev:

1. **`NEXT_PUBLIC_DEV_SCHOOL_SLUG=platform`** — explicit; matches what production's host-resolution path produces for `admin.jilanix.com` (which the backend translates to `PLATFORM_SCHOOL_SLUG` internally).
2. **`NEXT_PUBLIC_DEV_SCHOOL_SLUG=` unset** — axios sends no header; backend returns `scope: 'public'` → login fails with `TenantNotFoundError` because no tenant context exists. **Not the recommended dev path for platform admin** unless and until the dev environment runs on a real `admin.jilanix.local`-style host.

For Sprint F2.2 dev, set `NEXT_PUBLIC_DEV_SCHOOL_SLUG=platform` to test platform admin locally.

---

## 5. Production Flow

```
End user
└─ https://abc.jilanix.com                  (web bundle, tenant-agnostic)
   └─ axios singleton
      └─ resolveTenantSlug()
         hostname = 'abc.jilanix.com'
         labels.length = 3, first = 'abc'
         → 'abc'  ───────────►  X-Tenant-Slug: abc
                                   │
                                   ▼
https://api.jilanix.com/api/v1/auth/*
└─ backend TenantResolverMiddleware
   └─ generic header branch (or slug-subdomain branch
      if the API is hosted on the same root)
      → resolves schoolId from slug 'abc'
```

```
Platform Admin
└─ https://admin.jilanix.com                (same web bundle)
   └─ axios singleton
      └─ resolveTenantSlug()
         hostname = 'admin.jilanix.com'
         first label = 'admin' → null
         → no X-Tenant-Slug header attached
                                   │
                                   ▼
https://api.jilanix.com/api/v1/auth/*
└─ backend
   └─ no tenant header + no body schoolId
      → falls through to platform scope (handled by backend);
        platform admin user authenticates via global scope
```

### 5.1 Key production properties

- **One bundle, many subdomains.** The same compiled artefact serves `abc.jilanix.com`, `def.jilanix.com`, and `admin.jilanix.com`. No per-tenant build.
- **No frontend env tenant configuration.** `NEXT_PUBLIC_DEV_SCHOOL_SLUG` must be unset in production builds. Even if set accidentally, it is read only on localhost (line 51 of the resolver: `if (host === 'localhost' || …) return AUTH_CONFIG.devSchoolSlug;`), so it has no effect on production hostnames.
- **No UUID leakage.** The frontend bundle contains no school UUIDs.
- **Role decides the dashboard, not the URL.** `resolveLandingPath(me)` reads `me.roles` from `/auth/me` and routes accordingly. All four tenant personas (School Admin, Teacher, Parent, Student) authenticate from the **same** `{slug}.jilanix.com` URL.

---

## 6. Backward Compatibility

The migration is intentionally non-breaking for one cycle.

| Surface | Behaviour |
|---|---|
| `LoginPayload.schoolId` | Type field retained, optional, `@deprecated`. Any external caller that still sets it will type-check; the backend still accepts a body `schoolId` (`auth.dto.ts:79-89` — `@IsOptional()`). |
| `PasswordResetRequestPayload.schoolId` | Same — retained, optional, `@deprecated`. |
| `LoginPayload.tenantSlug` | Added (optional, `@deprecated`) so any caller that experimented with the slug-body shape during the W1.3 transition still type-checks. |
| `AUTH_CONFIG.defaultSchoolId` | Exported and `@deprecated`. Application code never reads it; any external import still resolves. |
| `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` | Still parsed (so a stale `.env.local` does not crash boot); never consumed. Documented as deprecated in `.env.example`. |

**Removal target:** Sprint F2.3+ may delete all `@deprecated` surfaces and the dead env entry.

---

## 7. Remaining Known Limitations

Carried over from F2.1; not in scope for F2.2.

1. **No per-persona dashboards yet.** `resolveLandingPath()` returns `/dashboard` for every role (placeholder). Persona dashboards land in subsequent sprints.
2. **`mustChangePassword` enforcement is FE-soft.** Login redirects to `/first-login` when the flag is true; a hard route guard (block every route except `/first-login` and `/logout` while flag is true) is recommended for the next sprint. Backend-side enforcement is also deferred (`AUTHENTICATION_FREEZE_V1.md` §9).
3. **`POST /auth/logout-all` returns 500 for platform admin** (`AUTH_FINAL_RUNTIME_VERIFICATION.md` R-12). FE handles via `finally`-clear so the user is signed out locally.
4. **Student admission-no login path** is backend-rejected today (`AUTH_FINAL_RUNTIME_VERIFICATION.md` §6). FE supports the email path; admission-no path lands when backend lifts the rejection.
5. **No automated cross-persona E2E suite.** Wire-shape is asserted by unit tests; runtime persona verification is manual.
6. **No `*.jilanix.local` hosts-file dev path.** Out of scope; would require a backend resolver extension (`AUTH_FRONTEND_TENANT_ARCHITECTURE_REVIEW.md` R6, deferred).
7. **Stale FE docs.** `docs/frontend/SPRINT_F1_3_AUTH_ALIGNMENT_REPORT.md` and `docs/frontend/FRONTEND_IMPLEMENTATION_PLAN.md` describe the F1.3-era contract that this sprint replaces. Per directive ("Do not create any additional architecture documents"), they have not been edited; `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md` is the canonical reference.

---

## 8. Final Readiness

| Dimension | Status |
|---|---|
| Backend contract alignment | ✅ FE wire shape matches the frozen contract (`AUTHENTICATION_FREEZE_V1.md` §5). No body `schoolId`/`tenantSlug`; tenant on `X-Tenant-Slug`. |
| Backend modifications | ✅ None. Freeze certificate preserved. |
| Typecheck | ✅ 0 errors |
| Lint | ✅ 0 warnings, 0 errors |
| Tests | ✅ 27/27 passing across 8 specs |
| Build | ✅ 9/9 static pages generated |
| Single source of truth for tenant | ✅ `resolveTenantSlug()` in `lib/api/client.ts` — used by request interceptor and refresh path; no duplication elsewhere |
| LoginForm tenant-agnostic | ✅ No `AUTH_CONFIG` import; no hostname parsing; no env reads |
| Backward compatibility | ✅ `schoolId` / `tenantSlug` / `defaultSchoolId` retained as `@deprecated` for one cycle |
| Production readiness | ✅ One bundle, many subdomains; no env tenant configuration required; no UUIDs in bundle |
| Dev experience | ✅ Single env var (`NEXT_PUBLIC_DEV_SCHOOL_SLUG`); axios is single source of truth |

**Readiness: SHIP.** The frontend is now on the F2.2-frozen contract and matches the backend authentication contract from `AUTHENTICATION_FREEZE_V1.md`. Sprint F2.2 may proceed to persona dashboards without further authentication redesign.

---

## Stop

Issued: 2026-06-29. No backend code modified. No new architecture documents created.
