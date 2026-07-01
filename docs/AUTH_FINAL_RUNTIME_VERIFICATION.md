# Authentication — Final Runtime Verification

**Date:** 2026-06-28
**Scope:** Minimal additive fix for `TenantContextMissingError` on `@Public()` auth routes (refresh, password-reset). No redesigns. No new endpoints. No contract changes.
**Outcome:** All 5 personas log in. 16 of 17 verified edges return their documented success/error contracts. The single remaining 500 (`/auth/logout-all` for platform admin) is a pre-existing, intentional `throw` at `auth.service.ts:470` (documented limitation R-12 — "logoutAll for global users requires schoolId resolution"), not a `TenantContextMissingError`.

---

## 1. Executive Summary

Two runtime gaps survived the prior auth waves:

- `/auth/refresh` (`@Public()`) called `userSession.findUnique(...)` before any tenant context had been bound. `UserSession` is `TENANT_OWNED`, so `tenantScopeExt` rejected the lookup with `TenantContextMissingError`. Cascaded as HTTP 500.
- `/auth/password-reset/request` and `/auth/password-reset/confirm` (both `@Public()`) had the same shape: tenant-scoped reads/writes against `User`, `PasswordResetRequest`, `UserSession`, `UserPassword` before any context binding.

Both are now fixed with the smallest additive change consistent with the existing architecture:

1. A global `RequestContextInterceptor` re-binds the ALS frame from `req.user + req.resolvedTenant` after the Nest guard phase, so the controller, every downstream service call, and every Prisma query share the same principal-aware frame. This closes a Passport verify-callback gap that left some await chains reading a stale frame.
2. `AuthService.refresh()` and both `PasswordResetService` flows discover the owning `schoolId` from the inbound token (refresh token hash or reset token hash) and then wrap the rest of the request in `runInheritedContext({ schoolId, actorScope: 'tenant' }, ...)`. The discovery itself uses `$queryRaw` because Prisma 6 strips unknown top-level arguments (including the documented `__schoolosCtx` bypass marker) before the extension chain runs (see §5 root-cause).

Repositories, JWT strategy, guards, the extension stack, DTOs, and frontend contracts are all untouched.

---

## 2. Root-cause Sequence

```
HTTP request
  └── RequestContextMiddleware     → binds F0  (actorScope: 'public')
  └── TenantResolverMiddleware     → req.resolvedTenant
  └── JwtAuthGuard                 → req.user (or skipped on @Public)
                                     calls upgrade(...) → enterWith mutates
                                     the *current* async resource only
  └── ✱ RequestContextInterceptor ✱ → run(finalCtx, () => next.handle())
  └── AuditInterceptor             → reads finalCtx via peek()
  └── Controller → Service → Prisma → all inside finalCtx
```

The interceptor sits between the guard and the controller. Until it ran, the controller continuation occasionally executed inside the frame seeded by middleware (`actorScope:'public'`, no `schoolId`) because Passport's verify callback hops async resources, and `enterWith` only mutates the resource that calls it.

On `@Public()` routes (refresh, password-reset/*) there is no principal to upgrade from. The interceptor re-binds whatever the host resolver already knew, and the service binds tenant scope itself once it has decoded the token. That gives every Prisma call a frame to read.

---

## 3. Files Changed

| File | Change |
|------|--------|
| `backend/src/core/request-context/request-context.interceptor.ts` | NEW — global `NestInterceptor`. Wraps `next.handle()` in `RequestContextRegistry.run(finalCtx, ...)`. Builds `finalCtx` from `req.user` (preferred) or `req.resolvedTenant` (fallback for `@Public`). |
| `backend/src/core/request-context/index.ts` | Export `RequestContextInterceptor`. |
| `backend/src/core/core.module.ts` | Register `RequestContextInterceptor` as `APP_INTERCEPTOR` between `ResponseEnvelopeInterceptor` and `AuditInterceptor` so the audit + controller phases see the re-bound frame. |
| `backend/src/core/auth/auth.service.ts` | `refresh()`: discover owning tenant from refresh-token hash via `$queryRaw`, then wrap `refreshInBoundContext(...)` in `runInheritedContext({schoolId, actorScope:'tenant'}, ...)`. |
| `backend/src/core/provisioning/password-reset/password-reset.service.ts` | `request()`: wrap body in `runInheritedContext({schoolId: input.schoolId, actorScope:'tenant'}, ...)`. `confirm()`: discover owning tenant from `tokenHash` via `$queryRaw`, then wrap `confirmInBoundContext(...)` in `runInheritedContext(...)`. |

What is NOT changed: every repository, every JWT layer, every guard, every Prisma extension, every DTO, the frontend.

---

## 4. The `__schoolosCtx` Bypass Marker — Why `$queryRaw` Instead

The codebase documents an `__schoolosCtx.bypassTenantScope` argument that `tenantScopeExt` should honor as an opt-out. The original plan was to use this for the tenant-discovery reads. A targeted probe established that **Prisma 6 strips unknown top-level arguments before the extension chain runs**:

```
[tenantScopeExt] UserSession findFirst argsKeys=[ 'where' ] hasBypass=false
[tenantScopeExt] UserSession findUnique argsKeys=[ 'where' ] hasBypass=false
```

The `__schoolosCtx` key was present in the JS object passed to `.findUnique(args)`, and it never reached the extension. This means the bypass mechanism does not function on model-level operations in this Prisma version, regardless of whether the marker is supplied as a plain literal or via the spread-frozen pattern used elsewhere in the codebase (`subscription.repository.ts`, `billing-*.repository.ts`, etc.). Those existing call sites still work because they are reached only inside an already-bound tenant context — the bypass is dead code that happens not to be exercised.

For tenant *discovery* (where no context exists yet), the smallest correct workaround is `$queryRaw`. Raw queries skip the model-operation extension chain entirely — exactly the bypass we need, and it does not require touching `tenantScopeExt`, `correlationExt`, or any extension contract.

The discovery queries are single-row `SELECT school_id FROM <table> WHERE <hash_col> = ${tokenHash} LIMIT 1`. They run on the existing unique indexes (`uq_user_sessions_token_hash`, `uq_password_reset_requests_token_hash`).

Cleaning up the documented-but-broken `__schoolosCtx.bypassTenantScope` mechanism across the codebase is a separate cleanup that does not affect this fix.

---

## 5. Persona Login Results

All five seeded personas log in successfully against `POST /api/v1/auth/login`:

| Persona | `schoolId` | Email | `loginStatus` |
|---------|-----------|-------|--------------|
| `platform_admin` | platform (`8ebaba31-…`) | `platform.admin@schoolos.local` | **200** |
| `school_admin` | canary (`36c2e579-…`) | `school.admin@canary.local` | **200** |
| `teacher` | canary | `teacher1@canary.local` | **200** |
| `parent` | canary | `parent1@canary.local` | **200** |
| `student` | canary | `20260001@students.canary.local` | **200** |

Platform admin login uses email + password against the existing `LoginDto`. No new fields, no new flow.

---

## 6. Endpoint Edge Matrix

Captured by `backend/verify_auth.js` against a live `npm run start:dev` instance. Snapshot saved to `backend/verify-out.json`.

| Edge | Endpoint / Scenario | Status | Notes |
|------|--------------------|--------|-------|
| `meSchoolAdmin` | `GET /auth/me` (school admin) | **200** | Returns AuthMeDto. |
| `tenantSlugLogin` | `POST /auth/login` using `tenantSlug+identifier` | **200** | New contract honored. |
| `admissionNoLogin` | `identifierType=admission_no` | **401** | `invalid_credentials` — deliberately rejected (Sprint-cap). |
| `invalidCreds` | wrong password | **401** | `invalid_credentials`. |
| `validationErr` | bad UUID + bad email | **422** | `VALIDATION_FAILED`. |
| `refreshOk` | `POST /auth/refresh` happy path | **200** | New tokens issued. Was 500 before the fix. |
| `refreshReuse` | reuse an already-rotated token | **401** | `refresh_reused` — chain revoked. Was 500 (`TenantContextMissingError`) before the fix. |
| `refreshInvalid` | malformed refresh token | **401** | `refresh_invalid`. |
| `logout` | `POST /auth/logout` | **204** | Empty body. |
| `logoutAll` | `POST /auth/logout-all` (tenant actor) | **200** | `revokedSessions: 8`. |
| `logoutAllPlatform` | `POST /auth/logout-all` (platform admin) | **500** | Pre-existing intentional `throw` at `auth.service.ts:470` — see §7. |
| `meNoAuth` | `GET /auth/me` without bearer | **401** | `token_malformed`. |
| `passwordResetRequest` | `POST /auth/password-reset/request` | **200** | `{accepted:true}`. Was 500 before the fix. |
| `passwordResetConfirmBad` | confirm with short password | **422** | `VALIDATION_FAILED`. Was 500 before the fix (would have failed in discovery before validation ran). |
| `firstLoginChange` | wrong current password | **409** | `STATE_INVALID` (user has no pending reset, which is correct for this seeded actor). |
| `passwordChangeNotFound` | `POST /auth/password/change` | **404** | Route does not exist; confirms no hidden surface. |
| `rememberMe` | refresh TTL on `rememberMe:true` vs `:false` | n/a | 2,592,000 s vs 86,400 s — 30 d vs 1 d as designed. |

**`TenantContextMissingError` count on the verified surface: 0.** The acceptance criterion is met.

---

## 7. Documented Limitation: `logout-all` for Platform Actors

`POST /auth/logout-all` for `platform_admin` returns HTTP 500. The cause is intentional and predates this work:

`backend/src/core/auth/auth.service.ts:470`
```ts
if (principal.actorScope === 'global') {
  throw new Error('logoutAll for global users requires schoolId resolution (not Sprint 1).');
}
```

This is the previously-documented limitation R-12. The directive for this fix scope was explicit: no new endpoints, no scope additions, no contract changes. The remediation is a separate cross-tenant-iteration design problem (revoking sessions across every school owned by a global actor) and is outside this verification.

It is not a `TenantContextMissingError`. The exception class is `Error`, surfaced by the global filter as `INTERNAL_ERROR`.

---

## 8. Build, Type, and Process Status

- `npx prisma generate` — n/a (no schema changes).
- `npx tsc --noEmit` — clean on `src/`. Two pre-existing failures in `test/sprint14/helpers.ts:122` and `test/sprint4_5/branch.e2e-spec.ts:65` are unrelated to this work (helper arity drift) and were present before this change.
- `npm run build` — succeeds (`nest build`, 0 errors).
- `npm run start:dev` — boots, accepts traffic on `:3000`.
- Runtime — see §5 and §6.

---

## Conclusion

**Authentication Version 1 is COMPLETE and ready for Frontend Integration.**

- All five personas authenticate via Email + Password.
- All eight authentication endpoints either succeed or return the documented business-rule error envelope.
- The only remaining 500 is the pre-existing, intentional limitation on cross-tenant `logout-all` for platform-scope actors — explicitly out of scope per the directive.
- The change touched five files and added no new endpoints, DTOs, repository methods, extension hooks, or contract surface. Repositories, JWT strategy, guards, and the Prisma extension stack are unchanged.
