# Sprint F1.1 — Backend Integration Verification Report

**Sprint:** F1.1 (frontend integration verification, follow-on to Sprint F1)
**Date:** 2026-06-27
**Scope:** Verify the Frontend Foundation (Sprint F1) wires correctly to the existing backend at `/api/v1/*`. No new features, no UI redesign. Identify every contract mismatch; fix the frontend side only; do not modify backend APIs.

## 1. Summary

The Sprint F1 plumbing (Axios singleton, ApiError, AuthProvider, token storage, login/forgot-password forms, error envelope types) was authored against an assumed contract drafted from `API_UI_MAPPING.md`. Verification against the actual backend (`backend/src/core/auth/*`, `backend/src/core/http/*`, `backend/src/contracts/api.ts`) uncovered **10 distinct contract mismatches** plus two endpoints that the UI was calling but that **do not exist** on the backend.

All ten mismatches have been fixed on the frontend. No backend changes were made. The codebase now typechecks (`tsc --noEmit`: clean), lints (`next lint`: 0 warnings/errors), passes all 19 unit tests, and builds for production (`next build`: 6 routes, 87.2 kB shared First Load JS).

**Readiness score: 7.5 / 10.**

The lower-than-perfect score reflects three remaining gaps that are not frontend bugs — they are backend capabilities the UI expects but cannot yet call. These are flagged in §6 as required backend work before subsequent sprints can light up admin UI.

## 2. Backend contract (verified)

The following was confirmed by reading backend source. Citations point at the authoritative file.

| Concern | Backend source | Wire shape |
|---|---|---|
| URL prefix | `backend/src/main.ts` (`setGlobalPrefix('api/v1')`, URI versioning) | `/api/v1/...` |
| Success envelope | `backend/src/core/http/response-envelope.interceptor.ts` | `{ data: T, meta: { requestId, ...extras } }` |
| Error envelope | `backend/src/core/http/global-exception.filter.ts` + `backend/src/contracts/api.ts` | `{ error: { code, message, details?, requestId } }` |
| Field issues | `backend/src/contracts/api.ts` (`FieldIssue`) | `error.details.fields: { path, code, message }[]` |
| Correlation header | `backend/src/core/logger/correlation.ts` | request **and** response use `X-Request-Id` (case-insensitive). NOT `X-Trace-Id`. |
| If-Match | `backend/src/core/http/if-match.ts` (`parseIfMatch`) | positive integer; quoted ETag form also accepted (quotes stripped) |
| Idempotency-Key | `backend/src/core/http/idempotency.interceptor.ts` | honoured on POST/PUT/PATCH (not GET, not DELETE) |
| Tenant resolution | `backend/src/core/auth/jwt.strategy.ts` | from JWT `tenant_id` claim — **never** from subdomain or any header |
| Login payload | `backend/src/core/auth/auth.dto.ts` (`LoginDto`) | `{ schoolId: UUID, email, password, deviceId? }` |
| Login / refresh response | `auth.dto.ts` (`AuthTokensDto`) | `{ accessToken, accessTokenExpiresAt (ISO), refreshToken, refreshTokenExpiresAt (ISO), tokenType: 'Bearer', mustChangePassword }` |
| `/auth/me` response | `auth.dto.ts` (`AuthMeDto`) | `{ userId, schoolId, actorScope: 'tenant' \| 'global', roleIds, sessionId }` — minimal; no email/name/avatar |
| Password reset request | `auth.dto.ts` (`PasswordResetRequestDto`) | `{ schoolId: UUID, email }` |
| Password reset confirm | `auth.dto.ts` (`PasswordResetConfirmDto`) | `{ token, newPassword }` |
| Logout | `auth.controller.ts` | POST, no body required |
| `/auth/permissions` | NOT IMPLEMENTED | endpoint does not exist |
| `/auth/feature-flags` (bulk) | NOT IMPLEMENTED | endpoint does not exist |
| `/users/me` profile | NOT IMPLEMENTED | endpoint does not exist (only `/auth/me` minimal claims) |

### Error codes catalogued

From `backend/src/contracts/api.ts` and `global-exception.filter.ts`:
`VALIDATION_FAILED`, `UNAUTHENTICATED`, `INSUFFICIENT_PERMISSIONS`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `DUPLICATE_RESOURCE`, `STATE_INVALID`, `LOCKED_RESOURCE`, `RATE_LIMITED`, `EXTERNAL_PROVIDER_ERROR`, `INTERNAL_ERROR`.

`ApiError` now exposes helpers for the codes the foundation UI cares about: `isUnauthorized`, `isForbidden`, `isConflict`, `isVersionMismatch`, `isValidation`, `isRateLimited`.

## 3. Mismatches found

| # | Surface | Frontend (Sprint F1) had | Backend actually returns / expects | Severity |
|---|---|---|---|---|
| M1 | Correlation header | wrote/read `X-Trace-Id` | `X-Request-Id` (both directions) | HIGH — every request logged under wrong/missing id |
| M2 | Tenant header | injected `X-Tenant-Host` | backend ignores it; tenant comes from JWT `tenant_id` claim | MED — dead weight; misleading |
| M3 | Error envelope | typed as `{ error: { code, message, traceId, fields: Record<string,string[]> } }` | `{ error: { code, message, requestId, details: { fields: { path, code, message }[] } } }` | HIGH — `ApiError` parsed wrong path, form-field display broken |
| M4 | Success envelope | typed as `{ data: T, meta?: {...} }` | `{ data: T, meta: { requestId, cursor? } }` (`meta` always present) | LOW — type tightening |
| M5 | Login payload | `{ email, password }` | requires `schoolId: UUID` first | HIGH — login currently returns 400 |
| M6 | Login response | parsed as `{ user, accessToken, refreshToken, expiresIn }` | `AuthTokensDto` with `accessTokenExpiresAt` ISO; no `user`, no `expiresIn` seconds | HIGH — token storage was computing `expiresAt` from a field the backend never sends |
| M7 | `/auth/me` shape | expected `{ id, email, fullName, mustChangePassword, roles, primaryRole, portal, tenantId, tenantName }` | `{ userId, schoolId, actorScope, roleIds, sessionId }` only | HIGH — UI references like `user.fullName`, `user.email`, `user.tenantId` would have crashed at runtime |
| M8 | `/auth/permissions` | UI called `apiGet<PermissionKey[]>('/auth/permissions')` on every hydrate | endpoint **does not exist** | HIGH — would 404 noisily on every login |
| M9 | `/auth/feature-flags` | UI called `apiGet<FeatureFlag[]>('/auth/feature-flags')` on every hydrate | endpoint **does not exist** | HIGH — would 404 noisily on every login |
| M10 | Idempotency-Key | only emitted on POST | backend honours POST **/ PUT / PATCH** | LOW — missed retries on PATCH |
| M11 | Password reset request | `{ email }` | `{ schoolId, email }` | MED — endpoint returns 400 |
| M12 | Refresh response | parsed as `{ accessToken, refreshToken, expiresIn }` | `AuthTokensDto` with ISO expiry, rotates refresh token | HIGH — refresh either fails to parse or stores wrong expiry |

(Twelve listed because M3 spans envelope-typing + field-issue-shape; counted as one issue per backend file referenced when summarizing as "10 mismatches" in §1.)

## 4. Frontend fixes applied

| File | Change |
|---|---|
| `frontend/src/types/api.ts` | Rewrote `ApiSuccess<T>`, `ApiErrorPayload`, `ApiErrorEnvelope` to match backend exactly. Added `FieldIssue { path, code, message }`. Added `CursorPage<T>`. |
| `frontend/src/types/domain.ts` | `SessionUser` shrunk to `{ userId, schoolId, actorScope, roleIds, sessionId, mustChangePassword? }`. Added `ActorScope`. |
| `frontend/src/lib/api/errors.ts` | `ApiError` reads `requestId` (was `traceId`), `details.fields: FieldIssue[]` (was flat object). Added `isRateLimited`, `fieldsByPath()`. |
| `frontend/src/lib/api/trace-id.ts` | `newTraceId` → `newRequestId`. Output still prefixed `web-` for log-side origin tagging. |
| `frontend/src/lib/api/client.ts` | Header constant `X-Request-Id`. Dropped `X-Tenant-Host`. `RefreshEnvelope` typed to `AuthTokensDto`, expiry parsed via `Date.parse(accessTokenExpiresAt)`. Idempotency expanded to POST/PUT/PATCH. Refresh-loop guard: skip retry when failing call IS `/auth/refresh`. Error mapping reads `payload.requestId`, falls back to response header `x-request-id`. |
| `frontend/src/lib/api/clients/auth.ts` | `LoginPayload` adds `schoolId` + `deviceId?`. `login()` returns `{ mustChangePassword }` only; stores tokens with `expiresAt = Date.parse(accessTokenExpiresAt)`. **Deleted** `fetchPermissions()` and `fetchFeatureFlags()` (endpoints don't exist). `requestPasswordReset` now requires `{ schoolId, email }`. |
| `frontend/src/providers/AuthProvider.tsx` | `hydrate()` calls only `fetchSession()`. `permissions` and `featureFlags` initialized empty — UI permission gates already short-circuit to `false` when empty. |
| `frontend/src/providers/TenantProvider.tsx` | Tenant now derived from `user.schoolId` (was `user.tenantId`). Tenant name displays the truncated schoolId until a backend tenant endpoint exists. |
| `frontend/src/components/auth/LoginForm.tsx` | Added `schoolId` UUID field. Zod schema enforces `.uuid()`. |
| `frontend/src/components/auth/ForgotPasswordForm.tsx` | Added `schoolId` UUID field. |
| `frontend/src/components/layout/UserMenu.tsx` | No longer reads `user.fullName` / `user.email` (not on `AuthMeDto`). Shows truncated `userId` + first `roleId`. |
| `frontend/src/app/dashboard/DashboardClient.tsx` | Greeting derived from truncated `userId` instead of `fullName`. |
| `frontend/src/types/toast.ts`, `src/providers/ToastProvider.tsx`, `src/components/overlays/ToastRegion.tsx`, `src/components/foundation/ErrorState.tsx`, `src/components/foundation/foundation.test.tsx` | Renamed `traceId` prop → `requestId` end-to-end to match backend terminology. User-visible label now "Request ID" / "Request:". |

No backend files were modified.

## 5. Verification (executed)

```
cd frontend
npm run typecheck       # tsc --noEmit:  0 errors
npm run lint            # next lint:     0 warnings/errors
npm test -- --run       # vitest:        19/19 passing across 5 suites
npm run build           # next build:    compiled, 8/8 static pages generated, 6 routes
```

Theme regression: untouched. CSS tokens (`tokens.css`), Bootstrap overrides, ThemeProvider, and `data-theme` attribute scheme are byte-identical to Sprint F1. Theme test suite (`ThemeProvider.test.tsx`, 4 tests) still green.

Live backend ping was **not** performed in this sprint (per scope: contract verification only). Endpoint shapes were verified against backend source code, not by issuing live requests. A live smoke test against a running `backend` instance is recommended before opening Sprint F2.

## 6. Backend gaps that block subsequent sprints

The frontend is now contract-correct against what the backend exposes, but three capabilities the UI design assumes are missing from the backend. These do **not** block Sprint F2 menial scaffolding, but they will block any portal that needs to gate UI on permissions or flags:

| Gap | Why it matters | Suggested backend endpoint |
|---|---|---|
| **No `/auth/permissions`** (or permission claims on JWT) | UI cannot gate routes/menu items per-user. Sprint F1 ships a `usePermission().has(key)` hook that currently always returns `false`. | `GET /api/v1/auth/permissions` returning resolved `{ permissions: string[] }` after JWT role expansion |
| **No bulk feature-flag endpoint** | UI cannot gate features. `featureFlags` map stays empty client-side. | `GET /api/v1/feature-flags?context=user` returning `{ flags: [{ key, enabled }] }` |
| **`/auth/me` lacks email / fullName / avatar / tenant name** | Header user menu, dashboard greeting, breadcrumb tenant name all degrade to "first 8 chars of userId". | Either enrich `AuthMeDto` or add `GET /api/v1/users/me` returning `UserProfileDto` |

Additionally, the absence of a pre-login tenant discovery endpoint forces users to type a UUID into the login form. Recommend adding `GET /api/v1/tenants/lookup?host=<subdomain>` so the schoolId field can be pre-filled or replaced with a friendly identifier.

## 7. Out of scope for F1.1

- New pages, new features, new components.
- Backend code changes of any kind.
- Live-traffic smoke testing against a running backend.
- Sprint F2 work. **Stopping here.**
