# RequestContext Interceptor — PoC Feasibility Review

**Type:** Proof-of-Concept feasibility review. **No code written. No code changes proposed.**
**Date:** 2026-06-28
**Trigger:** Determine whether a single global `RequestContextInterceptor` — added without touching middleware, guard, strategy, repository, or Prisma extension — closes all six remaining authentication 500s, OR whether something more is required.

---

## 1. Current architecture (recap, kept intact for this PoC)

Unchanged components, in execution order on every HTTP request:

1. `TenantResolverMiddleware` — populates `req.resolvedTenant` from host. No ALS touch.
2. `RequestContextMiddleware` — `storage.run(F0_public, () => next())`. Binds frame F0 with `actorScope:'public'`, `schoolId:undefined`. Lives for the whole request.
3. `JwtAuthGuard` (global APP_GUARD)
   - Skips on `@Public()` routes.
   - Otherwise: invokes `JwtStrategy.validate(payload)`.
     - Strategy calls `RequestContextRegistry.upgrade({...})` → `storage.enterWith(F1)` on its current async resource, then runs its own tenant-scoped reads.
     - Returns `AuthPrincipal` to passport.
   - `handleRequest` runs in passport's callback, sets `req.user = principal` and calls a second `upgrade(...)` → `enterWith(F2)` on the guard's resource.
4. `PermissionsGuard` — unchanged.
5. Other global interceptors (`ResponseEnvelopeInterceptor`, `AuditInterceptor`, …).
6. Controller handler → AuthService → Repositories → `tenantScopeExt` reads via `RequestContextRegistry.peek()`.

Runtime evidence (post Patches 1 + 2):

| Route | Status | Why |
|-------|--------|-----|
| `POST /auth/login` | ✅ 200 | `@Public()`; AuthService.login does its own `upgrade()` synchronously inside F0 → its continuations inherit. |
| `GET /auth/me` | ✅ 200 | Strategy's F1 happens to chain into describeMe's queries via the same async resource. |
| `POST /auth/logout` | ❌ 500 | Controller's `auth.logout(...)` continuation reverts to F0 (`scope: 'public'`). |
| `POST /auth/logout-all` | ❌ 500 | Same. |
| `POST /auth/first-login/change-password` | ❌ 500 | Same. |
| `POST /auth/refresh` | ❌ 500 | `@Public()` route — strategy never runs, no upgrade, controller's first DB call hits F0. |
| `POST /auth/password-reset/request` | ❌ 500 | Same as refresh. |
| `POST /auth/password-reset/confirm` | ❌ 500 | Same as refresh. |

Constraint set for this PoC: every component listed in §1 stays exactly as-is. The only thing we may add is one new interceptor file plus its global registration.

## 2. Proposed PoC

**Single addition:** a global `RequestContextInterceptor` registered via `APP_INTERCEPTOR` in `core.module.ts`, ordered AHEAD of `AuditInterceptor` and BEHIND `JwtAuthGuard`/`PermissionsGuard` (guards always run before interceptors in NestJS, so this is automatic).

**Behavior:**
1. On `intercept(execCtx, next)`, read `req.user` (set by `JwtAuthGuard` if route is authenticated; `undefined` for `@Public()` routes) and `req.resolvedTenant` (set by `TenantResolverMiddleware`).
2. Build `finalCtx` by inheriting from the current peek frame (F0/F1/F2 — whatever Nest hands us) and overriding with `{ schoolId, userId, actorScope, roleIds }` derived from `req.user`. For `@Public()` routes without `req.user`, the override is a no-op — `finalCtx` equals F0 (envelope only, `actorScope:'public'`, no `schoolId`).
3. Wrap `next.handle()` in a `storage.run(finalCtx, () => …)` so every controller await runs under `finalCtx`. The Observable plumbing pattern (well-known from `nestjs-cls`) is `new Observable(sub => storage.run(finalCtx, () => next.handle().subscribe(sub)))`.

The middleware, strategy, guard, repositories, and Prisma extension are not touched. The strategy's `enterWith(F1)` still runs — it just no longer matters, because the interceptor's `storage.run(F3)` shadows it before any controller code executes.

## 3. Expected request lifecycle (with PoC added)

Authenticated route (`POST /auth/logout`):

```
Middleware: storage.run(F0_public, () => next())
  └── Guard:    strategy.validate → enterWith(F1)        [F1 dies at the callback boundary]
                handleRequest      → enterWith(F2), sets req.user
  └── Interceptor.intercept(ctx, next):
        finalCtx = inherit(peek) with { schoolId, userId, actorScope, roleIds } from req.user
        return wrap(storage.run(finalCtx, () => next.handle()))
        └── Controller.logout(principal, req)            [runs inside F3 = finalCtx]
              └── auth.logout(principal, ctx)
                    └── sessions.revokeChain({ chainId, ... })
                          └── prisma.userSession.updateMany(...)
                                └── tenantScopeExt → peek() returns F3 with schoolId  ✓
```

Public-tenant-scoped route (`POST /auth/refresh`):

```
Middleware: storage.run(F0_public, () => next())
  └── Guard:    @Public → short-circuit                  [no validate, no req.user]
  └── Interceptor.intercept(ctx, next):
        finalCtx = inherit(F0) with overrides from req.user (undefined)
                 = F0 (still actorScope:'public', schoolId:undefined)
        return wrap(storage.run(finalCtx, () => next.handle()))
        └── Controller.refresh(body, req)                [runs inside F0-equivalent]
              └── auth.refresh({ refreshToken, ... })
                    └── this.prisma.transaction(async tx => {
                          await sessions.findByTokenHash(hash, tx)   [TENANT_OWNED — needs schoolId]
                                └── tenantScopeExt → peek().schoolId === undefined
                                      throws TenantContextMissingError  ✗
```

This is the proof point: the interceptor cannot bind a tenant-scoped context for a public route that has no principal and whose tenant identity is locked inside an opaque refresh token. The token must be decoded — by the service — before the schoolId is knowable. The interceptor runs strictly before the service executes.

## 4. Pros

- **Solves the three authenticated failures outright** (`logout`, `logout-all`, `first-login/change-password`). For these, `req.user` is populated by the guard, `req.user.schoolId` is the tenant, the interceptor builds `finalCtx` correctly, and the controller awaits all run inside one explicit `storage.run` — no async-boundary fragility.
- **Additive.** One new file, one registration line. No deletions. No signature changes. No DTO change. No API contract change. Existing tests that did not rely on F0/F1/F2 timing continue to pass.
- **Eliminates the dependence on `enterWith` for the controller phase.** Strategy and guard can keep their existing `upgrade()` calls — they become harmlessly redundant. We are not removing them; we are no longer relying on them past the guard boundary.
- **Trivially reversible.** Remove the registration line → behavior reverts to today's. The interceptor is opt-out via configuration if a regression appears.
- **Same shape as the §6 architecture in `REQUEST_CONTEXT_ARCHITECTURE_REVIEW.md`,** minus the strategy/guard cleanup phases. It is the first step of the 6-phase plan, taken in isolation.
- **No risk to existing successful routes.** `/auth/login` (Public) — login still works because AuthService.login derives its own ctx inside the service. `/auth/me` (Authenticated) — switches from "accidentally inheriting F1" to "deliberately inheriting F3"; observable behavior identical.

## 5. Cons

- **Does NOT solve the three public-tenant-scoped failures.** `/auth/refresh`, `/auth/password-reset/request`, `/auth/password-reset/confirm` all require the tenant to be known to scoped reads, but the interceptor has no principal and no host-derived tenant for these (tests run against `localhost`, host resolution returns `scope:'public'`). The interceptor binds `actorScope:'public'` and the first service-level Prisma call still throws.
- **Layers a third "upgrade" mechanism on top of the existing two.** We now have: `middleware run()` + `strategy enterWith()` + `guard enterWith()` + `interceptor run()`. Coherent today, but if a future developer reads only one of them, the mental model is muddled. The 6-phase migration would remove the first two from the request path; the PoC keeps them.
- **The interceptor's `finalCtx` shadows whatever `enterWith(F1/F2)` placed onto the stack.** If any code path between the guard and the controller had been (covertly) depending on F1/F2 being visible to its peek, it will now see F3 instead. Audit-trail interceptors / response-envelope interceptors that read `peek().userId` will see the same `userId` they see today (the interceptor copies `req.user` faithfully), so this is not believed to be a regression — but it must be verified.
- **Public-route partial fix discipline.** Until the three refresh/password-reset routes are also addressed, the surface still has 500s. A clean PoC report can claim "interceptor closes 3 of 6"; an honest fix needs a companion piece for the other 3.

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Interceptor ordering bug: registered after `AuditInterceptor`, so audit reads old F0/F1 | Medium | Audit rows mis-attribute actor | Order is explicit in `core.module.ts`; add a single integration test asserting audit sees the principal. |
| Observable-wrapping subtleties (error propagation, cancellation, multi-emit) | Low-medium | Lost errors, leaked subscriptions | Copy the vetted pattern from `nestjs-cls`; do not invent. |
| Nested ALS contexts (F0 ⊃ F3): something deeper does `storage.getStore()` after F3's run() returns | Low | Reverts to F0 unexpectedly | `storage.run` is properly scoped — nothing escapes F3 unless a controller fires-and-forgets a Promise. Document and ban that pattern in services that need ctx. |
| Strategy's `enterWith(F1)` still mutates the bound frame inside F0 before the interceptor's `run(F3)` opens | Low | None — F3 overrides everything inside its callback | Verified by ALS semantics: `run(F3, fn)` pushes a fresh frame regardless of what `enterWith` did to F0. |
| `@Public()` routes that don't need tenant context (e.g., `/auth/login`) accidentally regress | Very low | login breaks | Login does its own `upgrade()` from inside AuthService.login; that `enterWith` runs on the F3-wrapped resource and persists for the controller's awaits. Same shape as today. |
| Logger child binding reads ctx before the interceptor runs | Low | Early log lines tagged as `public` instead of actor | Already true today (logger runs at middleware time, before guard). No regression. |
| AsyncLocalStorage edge case: `enterWith` inside a `run` callback persists past `run`'s end | Negligible | Frame leakage between requests | Node's docs are explicit: `run`'s callback restores the previous store on return. Verified in node:async_hooks tests. |

## 7. Is this PoC sufficient?

**No — not on its own.** It is *necessary* but not *sufficient*.

The interceptor closes the three authenticated routes (`logout`, `logout-all`, `first-login/change-password`) cleanly because `req.user` carries the tenant. It does **not** close the three `@Public()` routes (`refresh`, `password-reset/request`, `password-reset/confirm`) because:

1. `JwtAuthGuard` short-circuits on `@Public()` — no `req.user`.
2. Their tenant identity is locked inside opaque request payloads (refresh token, email, password-reset token) that the interceptor cannot decode (it has no access to the auth/password-reset services without circular DI, and decoding tokens in an interceptor is itself an architectural mistake).
3. `TenantResolverMiddleware` returns `scope:'public'` for `localhost`/`127.0.0.1` requests (the entire verification environment), so `req.resolvedTenant` carries no tenant either.

The interceptor therefore has no source from which to bind a tenant-scoped `finalCtx` for these three routes. Whatever it binds is `actorScope:'public'`, and the first scoped Prisma call inside the controller throws.

## 8. If not sufficient, why exactly

The three failures fall into one root cause: **public-tenant-scoped routes acquire their tenant inside the service, not before it.** Compare:

| Route | Tenant becomes known at… |
|-------|--------------------------|
| `/auth/login` (Public) | Service: from body `schoolId` OR `tenantSlug` lookup OR `resolvedTenant` (Patch 1). |
| `/auth/refresh` (Public) | Service: from `sessions.findByTokenHash(hash)` — which is itself a TENANT_OWNED query that needs the tenant context. **Circular.** |
| `/auth/password-reset/request` (Public) | Service: from email-to-user lookup, which is tenant-scoped. **Circular.** |
| `/auth/password-reset/confirm` (Public) | Service: from token-to-user lookup, same. **Circular.** |
| `/auth/logout` (Authenticated) | Guard, via JWT `tenant_id` claim → `req.user.schoolId`. |
| `/auth/me` (Authenticated) | Same as logout. |

`/auth/login` works because the lookup tables it consults to derive the tenant (`School` by slug, `School` by id) are PLATFORM_ONLY — `tenantScopeExt` does not require a bound `schoolId` for them. The refresh / password-reset paths start by consulting `UserSession` and `User` (TENANT_OWNED), so they need the tenant to *already* be bound before they can derive it.

The interceptor lives strictly before the controller. It cannot resolve a chicken-and-egg lookup that is encoded into the route's design.

**The minimal additional change** (still additive, still allowed by the constraint set) is to have AuthService.refresh / .requestPasswordReset / .confirmPasswordReset wrap their tenant-scoped work in `RequestContextRegistry.run(derivedCtx, () => …)` after they've derived the schoolId. For refresh, this means: first do a *non-tenant-scoped* lookup to find the schoolId for the token (e.g., a query against a chain-index helper, or a direct lookup with the existing bypass `__schoolosCtx.bypassTenantScope` marker that the Prisma extension already supports — though the user has forbidden new bypass methods, the existing supported marker is in scope to use). Then run the rest of the work inside the derived ctx.

This sits cleanly inside the service. It does not modify the strategy, guard, middleware, repository layer, or Prisma extension. It does require accepting that *some* lookup must precede the ctx bind for these three routes — there is no architectural shortcut that bypasses this requirement.

## 9. Estimated implementation size

| Change | Files | LOC |
|--------|-------|-----|
| `RequestContextInterceptor` (new) | 1 (new) | ~50 |
| Global registration in `core.module.ts` | 1 (edit) | ~5 |
| Integration test: interceptor binds finalCtx for authenticated route | 1 (new) | ~40 |
| **PoC subtotal (interceptor only)** | **3 (1 new module file, 1 module edit, 1 test)** | **~95** |
| AuthService.refresh — bind ctx before tenant-scoped tx work | 1 (edit) | ~15 |
| AuthService.requestPasswordReset — bind ctx after email→schoolId lookup | 1 (edit) | ~15 |
| AuthService.confirmPasswordReset — bind ctx after token→schoolId lookup | 1 (edit) | ~15 |
| Helper: `runInTenantContext(schoolId, fn)` (avoids drift across the three) | 1 (new tiny util) | ~15 |
| Tests for the three public-route fixes | 1 (new) | ~50 |
| **Full fix (PoC + service-side bind for public routes)** | **8 (3 new, 5 edits)** | **~205** |

For comparison, the 6-phase migration was estimated at ~150 LOC plus broader test updates — but spread across structural changes (strategy refactor, guard refactor, repository bypass methods, middleware demotion). The PoC + companion fix lands ~50 LOC heavier but with zero structural change.

## 10. Final recommendation

**Adopt the interceptor PoC AND a small, additive service-layer companion fix.** Treat them as one minimal patch with two parts:

1. **`RequestContextInterceptor` (the core PoC).** One new file, one registration. Closes `/auth/logout`, `/auth/logout-all`, `/auth/first-login/change-password`. ~95 LOC including a test.
2. **Service-layer `RequestContextRegistry.run(derivedCtx, fn)` wraps inside `AuthService.refresh`, `requestPasswordReset`, `confirmPasswordReset`.** Three small edits + one shared helper. Closes the remaining three. ~110 LOC including tests.

Together: ~205 LOC, 8 files (3 new, 5 edits), zero structural change, no migration phases, no removal of middleware/strategy/guard/extension behavior. The 6-phase architecture stays on the shelf as the eventual cleanup but is NOT required to close the immediate runtime failures.

**Why not the interceptor alone?** Because three of the six failing routes are by design `@Public()` and derive their tenant from request payload content. No pre-controller hook (middleware, guard, interceptor) can solve those without either (a) decoding tokens at the wrong layer or (b) leaving them broken. The companion service-layer fix is the smallest honest closure.

**Why not the 6-phase migration?** Because the immediate runtime failures do not require it. The migration is the right *long-term* architecture; the PoC + companion fix is the right *now* delivery. We can revisit the larger redesign on its own merit, separately from "auth is on fire."

**Verification gate:** the existing `verify_auth.js` probe is the acceptance test. All six failing routes must return their canonical success or domain-error status (204 / 200 / 401), and none of them may emit `TenantContextMissingError` to the log. The PoC alone will move 3 of 6 to green; the companion fix will move the remaining 3.

---

## Stop point

Per directive scope:
- ✅ Feasibility review only. No code written. No code changed.
- ✅ No middleware change proposed in the PoC.
- ✅ No strategy / guard / repository / Prisma extension change proposed.
- ✅ Honest verdict: PoC is necessary but not sufficient on its own.
- ✅ Companion fix described at the same additive, in-scope level.
- ❌ Not implementing the interceptor.
- ❌ Not implementing the companion fix.
- ❌ Not starting the 6-phase migration.
