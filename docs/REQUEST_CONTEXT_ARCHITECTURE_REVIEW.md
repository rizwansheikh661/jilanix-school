# RequestContext Architecture Review

**Type:** Architecture Decision Review (ADR-style). **No code changes proposed.**
**Date:** 2026-06-28
**Trigger:** Patches 1 + 2 in `AUTH_RUNTIME_PATCH_REPORT.md` closed the login/`/auth/me` path but five authenticated/public routes still produce `TenantContextMissingError` despite a "principal-aware" upgrade in `JwtStrategy.validate()`. Root cause is not a bug — it is a structural mismatch between Node's `AsyncLocalStorage` semantics and the Nest + Passport request lifecycle. This document evaluates the architecture, not the symptom.

---

## 1. Current lifecycle (what actually happens today)

Trace of one authenticated request to `POST /api/v1/auth/logout`:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. pino-http   stamps req.id (or echoes X-Request-Id)                    │
│ 2. TenantResolverMiddleware                                              │
│       reads Host header → sets req.resolvedTenant =                      │
│       { scope: 'tenant'|'platform'|'public', schoolId?, slug?, source }  │
│       does NOT touch ALS                                                  │
│ 3. RequestContextMiddleware                                              │
│       builds ctx = { actorScope:'public', schoolId:undefined, ... }      │
│       storage.run(ctx, () => next())  ◄── ALS frame F0 opens here       │
│ 4. JwtAuthGuard.canActivate()           [still inside F0]                │
│       → AuthGuard('jwt').super.canActivate()                             │
│            → passport.authenticate('jwt', verifyCb)                      │
│                 → JwtStrategy.validate(payload)  [still inside F0]       │
│                       RequestContextRegistry.upgrade(...)                │
│                       ◄── storage.enterWith(F1) on CURRENT async resrc   │
│                       sessions.isActiveById(...)  [reads F1 — OK]        │
│                       users.findActiveById(...)   [reads F1 — OK]        │
│                       returns AuthPrincipal                              │
│                 → passport invokes verifyCb(null, principal)             │
│                      ◄── Passport's continuation hops async resource     │
│                 → handleRequest(err, user, info, ctx)                    │
│                       upgradeRequestContext(principal)                   │
│                       ◄── storage.enterWith(F2) on guard's resource      │
│            super.canActivate() resolves true                             │
│ 5. PermissionsGuard.canActivate()                                        │
│ 6. (other interceptors)                                                  │
│ 7. AuthController.logout(principal, req)                                 │
│       this.auth.logout(principal, ...)                                   │
│           sessions.revokeChain(chainId)                                  │
│             prisma.userSession.updateMany(...)                           │
│               tenantScopeExt → RequestContextRegistry.peek()             │
│               ▼                                                          │
│               returns ??? — see §3 for why this is F0 (public), not F2  │
│               throws TenantContextMissingError                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Observed runtime evidence** (from `verify_auth.js` post-Patch-2):
- `POST /auth/login` → 200 (works because `AuthService.login` calls `RequestContextRegistry.upgrade` from inside its own service code, executed synchronously inside F0 before any await).
- `GET /auth/me` → 200 (works because `describeMe`'s enrichment helpers happen to execute on the same async resource as Patch-2's `enterWith` inside `validate()`).
- `POST /auth/logout`, `/auth/logout-all`, `/auth/first-login/change-password` → 500 `"scope":"public"` at throw time.
- `POST /auth/refresh`, `/auth/password-reset/*` → 500 (these are `@Public()`; the strategy never runs, so no upgrade ever happens; controller hits ALS frame F0 directly).

**Diagnosis:** The lifecycle leans on `enterWith` to "swap" the store for the rest of the request. That assumption is incorrect. See §3.

## 2. NestJS request lifecycle

Authoritative order for every HTTP request:

```
1. Middleware (in registration order)         — req/res only, no DI scope
2. Guard.canActivate() (global → controller → handler)
3. Interceptor (before)                       — wraps the handler Observable
4. Pipe (param transformation/validation)
5. Controller handler
6. Interceptor (after)                        — operates on the response
7. Exception filter (if anything threw)
```

Two structural facts matter here:

- **Middleware terminates by calling `next()`**. Anything middleware wraps (`storage.run(ctx, () => next())`) holds for the entire request — guards, interceptors, handlers — because `next()` is the entry point of the rest of the chain. This is the only place `storage.run` can be "request-wide."
- **Guards return `boolean | Promise<boolean> | Observable<boolean>`**. They do NOT wrap downstream execution. A guard can mutate `req`, throw, or resolve — but it cannot insert a new async scope around the controller call.
- **Interceptors wrap `next.handle()`**, which returns an Observable representing controller execution and the response. This is the only Nest extension point AFTER the guard's principal decision and BEFORE the controller runs that can wrap an async scope around everything downstream. This is the lever the current architecture is not pulling.

## 3. AsyncLocalStorage lifecycle (the core of the problem)

Two operations from `node:async_hooks`:

| Operation | Effect | Scope |
|-----------|--------|-------|
| `storage.run(store, fn)` | Push `store` onto a *new* frame, invoke `fn`, pop on return. All async resources created inside `fn` inherit `store`. **Correct for request scoping.** | The closure of `fn` and its async tree. |
| `storage.enterWith(store)` | Mutate the store binding for the **current async resource** going forward. Sibling resources and the parent are *not* affected. | Only resources spawned by or after `enterWith` on the current execution path. |

The current design composes them like this:

```
RequestContextMiddleware:
  storage.run(F0_public, () => next())     ← parent frame

JwtStrategy.validate (inside next()):
  storage.enterWith(F1_upgraded)           ← only this resource sees F1
  await sessions.isActiveById(...)         ← inherits F1 → OK

… Passport callback hops async resource …

JwtAuthGuard.handleRequest (inside next()):
  storage.enterWith(F2_upgraded)           ← only THIS resource sees F2

… Nest hands control back up to the request dispatcher …

AuthController.logout:
  await sessions.revokeChain(...)          ← which frame does this see?
```

**The trap:** `enterWith` does not "replace the parent's run-frame." When the controller finally executes, it does so on a continuation of the original `next()` call, which was started by `storage.run(F0_public, ...)`. That call is still on the call stack waiting for the request to finish. Any continuation that the dispatcher resumes from *outside* the specific async resource that called `enterWith(F1/F2)` reads F0.

Whether a continuation sees F1/F2 or F0 depends on which async resource (microtask, callback, timer) Passport and Nest used to bridge the gap. Empirically:
- `AuthService.login` is called *synchronously* from the same resource that ran `storage.run`, so its own `enterWith` is visible to its subsequent awaits → ✓.
- `describeMe` on `/auth/me` happens to inherit the strategy's F1 → ✓ by accident.
- `revokeChain` on `/auth/logout` does NOT → ✗.

This is not a Node bug. It is documented behavior: **`enterWith` is a "best-effort" tool intended for entry points where you cannot wrap with `run`**. The Node docs themselves recommend `run` whenever possible. Mixing them — `run` at middleware time, `enterWith` later inside the same request — is a known anti-pattern because the parent `run` frame always wins for any continuation that bypasses the upgraded resource.

## 4. Passport lifecycle (NestJS adapter)

`@nestjs/passport`'s `AuthGuard('jwt')` flow:

```
canActivate(execCtx):
  request = execCtx.switchToHttp().getRequest()
  return new Promise((resolve, reject) => {
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
      // Passport invokes this callback from a *different* async resource
      // than the one that called passport.authenticate — typically a
      // microtask scheduled by the verify callback's Promise.then.
      try {
        const principal = this.handleRequest(err, user, info, execCtx);
        request.user = principal;
        resolve(true);
      } catch (e) { reject(e); }
    })(request, response, next);
  });
```

Key points:
- `JwtStrategy.validate()` is invoked by Passport's internal `JwtStrategy.authenticate` → `verify(payload, done)`. Its return value is consumed via `done(null, user)` → callback chain.
- The "verifyCallback hop" is the boundary at which the async resource changes. Any `enterWith` inside `validate` lives on the resource that the verify Promise was settled on. The continuation that calls `handleRequest` is a separate microtask.
- `handleRequest` calls `request.user = principal` — this is the only side-effect that reliably persists across the boundary (because it's a plain object mutation, not async-context-bound).

The architectural takeaway: **the only data that survives the Passport boundary intact is what's attached to `request`.** ALS upgrades do not.

## 5. Answers to the seven review questions

**Q1. Is `RequestContextMiddleware` correctly responsible for binding a default 'public' context?**

Partially. Stamping `requestId`, `traceId`, `ip`, `userAgent`, `route`, `method`, `locale` at the HTTP edge IS correct — those values are knowable without auth and are needed by the logger and audit. But binding `actorScope: 'public'` via `storage.run` at this point is the architectural mistake: it commits a frame that downstream code cannot cleanly replace. The middleware should either (a) defer the `storage.run` until the auth decision is known, or (b) bind only the "envelope" fields and let a later step bind the principal fields in a fresh `run`.

**Q2. Should authenticated requests continue inside the same AsyncLocalStorage scope?**

No. They should continue inside a *new* scope whose store contains the principal. This is the only way to guarantee every continuation — whether driven by the controller, an interceptor, or a deferred microtask — reads the authenticated context. Trying to "patch the original scope" via `enterWith` is what produces today's failures.

**Q3. Is `RequestContextRegistry.upgrade()` using `enterWith()` the correct mechanism?**

No. `enterWith` is appropriate for entry points that cannot wrap their downstream work in a callback (e.g., stamping context onto an event emitter handler at the top of a stack you don't control). Inside a Nest request, we DO control the downstream work — it is `next.handle()` from an interceptor or `next()` from middleware. Using `enterWith` to "swap" the store mid-request is a leaky abstraction: it works for any continuation that happens to chain off the upgrading resource and silently fails for anything else.

**Q4. Would `storage.run()` be more appropriate?**

Yes — but it has to be called at a point where we can wrap the rest of the request. Middleware is too early (no principal yet). Guards can't wrap (they return a boolean). The right place is a **global interceptor** registered after the auth guard via `APP_INTERCEPTOR`. Its `intercept(execCtx, next)` returns `next.handle()`, which we wrap in `storage.run(finalCtx, () => next.handle())`. Every emission on that Observable runs inside `finalCtx`.

**Q5. Should the context upgrade occur in middleware, guard, strategy, or interceptor?**

| Layer | Suitable? | Reason |
|-------|-----------|--------|
| Middleware | ❌ for the principal upgrade | Runs before guards; principal isn't known yet. ✅ for stamping envelope fields onto the request object. |
| Guard | ❌ for ALS upgrade | Returns a boolean. Cannot wrap the controller invocation in a new async scope. Can correctly *set `request.user` and `request.principal`*, which is exactly what Passport already does. |
| Strategy | ❌ | Runs inside Passport's verify callback, on an async resource the controller does not inherit. Today's Patch 2 places the upgrade here because it was the cheapest local fix; that does not make it the right architectural home. |
| Interceptor | ✅ | Only Nest lifecycle hook that runs AFTER guards (principal decided) AND can wrap the controller invocation's async chain (via `storage.run` around `next.handle()`). |

**Q6. Would changing AsyncLocalStorage behaviour introduce regressions elsewhere?**

We cannot change ALS itself (Node primitive). We are deciding how to USE it. The risk surface for changing usage is:

- **Logger bindings.** Pino-http reads `req.id` from the request, not ALS. The logger child binding pattern (if any) that reads ctx via `RequestContextRegistry.peek()` would need the new lifecycle to still bind the envelope ctx before any log line is emitted. Mitigation: keep the middleware's envelope-only bind; only the principal-bind moves to the interceptor.
- **Prisma `tenantScopeExt`.** Reads via `RequestContextRegistry.peek()` synchronously inside the model query. As long as the controller's awaits run inside the interceptor's `storage.run`, this just works — and in fact works *better* than today (no more accidental F0/F1/F2 confusion).
- **Audit / queue enqueue.** Same as Prisma — reads via `peek()`. Same fix applies.
- **Non-HTTP entry points (seeds, jobs).** Already use `RequestContextRegistry.makeSystemContext()` + their own `run(...)`. Unaffected.
- **`@Public()` routes.** These don't have a principal. The interceptor must handle them: either bind a "public" ctx, or, for routes like `/auth/refresh` that need tenant context derived from the token, allow the controller to call a helper that re-runs `storage.run` with a derived ctx. This is a real new requirement and is why the current architecture can't simply be "fixed at the interceptor" without also rethinking how public-but-tenant-scoped routes acquire their tenant binding.

**Q7. Cleanest long-term architecture.**

A four-layer split (see §6).

## 6. Recommended architecture

```
┌─ HTTP edge ──────────────────────────────────────────────────────────────┐
│ Layer A — TenantResolverMiddleware                                       │
│   Populates req.resolvedTenant from Host header.                         │
│   Pure request-mutation, no ALS.                                          │
│                                                                          │
│ Layer B — RequestContextMiddleware                                       │
│   Stamps requestId / traceId / ip / route / method / locale onto req.    │
│   Does NOT call storage.run. Does NOT bind ALS yet.                      │
│   (Alternative: bind a minimal envelope-only ctx for logger early-line   │
│    correlation. The interceptor will REPLACE this with the full ctx.)    │
│                                                                          │
│ Layer C — JwtAuthGuard / PermissionsGuard                                │
│   Verify JWT, set req.user = AuthPrincipal.                              │
│   Verify permissions.                                                    │
│   Does NOT call storage.run, does NOT call enterWith.                    │
│   The strategy's own DB reads (isActiveById, findActiveById) need        │
│   tenant context — solve by passing schoolId explicitly OR by giving     │
│   the strategy a repository method that bypasses tenantScopeExt for      │
│   the narrow case of "is this session row alive". This decouples auth    │
│   from the per-request ALS scope entirely.                               │
│                                                                          │
│ Layer D — RequestContextInterceptor (global, APP_INTERCEPTOR)            │
│   Reads req.id, req.resolvedTenant, req.user.                            │
│   Builds the final RequestContext (principal + tenant + envelope).       │
│   Wraps next.handle() in storage.run:                                    │
│                                                                          │
│     intercept(execCtx, next) {                                            │
│       const ctx = buildContext(req)                                       │
│       return new Observable(subscriber =>                                 │
│         storage.run(ctx, () => next.handle().subscribe(subscriber))      │
│       )                                                                   │
│     }                                                                     │
│                                                                          │
│   Every controller method, every service call, every Prisma query,       │
│   every audit interceptor that runs AFTER this one, sees the same ctx.   │
│                                                                          │
│ Layer E — Controller / Service / Repository                              │
│   Reads ctx via RequestContextRegistry.peek().                           │
│   No upgrade, no enterWith, no swap.                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key properties:**
- One `storage.run` per request, called once, at the latest point that has all the inputs.
- No `enterWith` anywhere in the HTTP pipeline.
- `JwtStrategy` does not depend on ALS for its own queries — those reads either receive `schoolId` as an argument (already true for `isActiveById`) or use a tenant-scope-bypassed repository method (`findUserForAuthentication(userId)` that the extension treats as `PLATFORM_ONLY`). Treats auth as the bootstrap step it actually is.
- `@Public()` routes that need tenant context (e.g., `/auth/refresh`) acquire it explicitly: the controller decodes the token, resolves the schoolId, and either passes it through service calls OR calls `RequestContextRegistry.run(derivedCtx, () => …)` inside the controller for the duration of the tenant-scoped work. This is a deliberate, visible promotion — not an implicit middleware effect.
- The interceptor ordering matters: `RequestContextInterceptor` must run AFTER guards (so `req.user` exists) and BEFORE every other interceptor that reads context (audit, response envelope's actor-aware fields). With `APP_INTERCEPTOR`, ordering is by registration order in the module — explicit and reviewable.

**Why this is "enterprise-clean":**
- Each layer has exactly one responsibility.
- The ALS scope's lifetime is a single, traceable function call (`storage.run(ctx, () => …)`) — no hidden mutation.
- The auth strategy is testable in isolation without an ALS frame (today it requires one — see the guard in Patch 2 that uses `peek() !== undefined`).
- Public-but-tenant-scoped routes have to declare their tenant binding explicitly. This catches a class of bugs (silently running queries against `actorScope: 'public'`) at code-review time.
- Adding a new ingress (gRPC, background job, message queue) is the same pattern: build ctx, `storage.run(ctx, work)`. No ALS magic.

## 7. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Refactor breaks existing tests that assert on the F0/F1 timing | High | Replace those assertions with behavioral tests on observable side effects (Prisma where-clause, audit row, log line). |
| `RequestContextInterceptor` ordering bug — runs before guard sets `req.user` | Medium | Globals run in registration order; the module file is the single ordering surface. Add a guard test that asserts `req.user` is set when the interceptor begins. |
| Strategy stops working under tests that exercised `validate()` outside an HTTP context | Medium | Remove the `peek() !== undefined` guard added in Patch 2; strategy no longer touches ALS. Tests inject a fake repo instead. |
| `tenantScopeExt` starts throwing on routes that previously "worked by accident" (got F1) | Low | Audit shows only `/auth/me` is in this category. After migration it works correctly inside the interceptor's `storage.run`. |
| `@Public()` routes that need tenant context — additional code per route | Medium | One-time pattern. Centralize in a `runInTenantContext(schoolId, fn)` helper to avoid drift. |
| Observable-wrapping around `storage.run` subtleties (cancellation, errors) | Low-medium | Well-known pattern in nestjs-cls and similar libraries; pattern-copy from a vetted implementation. |
| Logger child bindings emit log lines before the interceptor binds ctx | Medium | Keep the middleware's envelope-only bind in Layer B; logger uses that. The interceptor REPLACES it for the controller phase only. |
| Audit interceptor reads ctx before `RequestContextInterceptor` runs | Medium | Register `RequestContextInterceptor` BEFORE `AuditInterceptor` in the global provider list. Add an integration test. |

## 8. Migration strategy

**Phase 0 — Preserve the current behavior; add the new layer side-by-side.**
- Implement `RequestContextInterceptor` but do NOT register it globally yet.
- Add an opt-in route decorator `@UseContextInterceptor()` and apply to one canary route (`/auth/logout`).
- Verify with `verify_auth.js` that the canary now returns 204 without 500.

**Phase 1 — Make the strategy ALS-free.**
- Add `userRepository.findUserForAuthentication(userId, schoolId)` that bypasses `tenantScopeExt` (already a supported `__schoolosCtx.bypassTenantScope` marker — no extension change).
- Add `sessionRepository.findSessionForAuthentication(sessionId)` likewise.
- `JwtStrategy.validate()` calls those instead of the tenant-scoped variants. Remove the Patch-2 `enterWith` call from the strategy.
- Strategy now has zero coupling to ALS.

**Phase 2 — Make the guard ALS-free.**
- Remove `upgradeRequestContext` from `JwtAuthGuard.handleRequest`. Guard only sets `req.user`.
- All existing routes still pass at this point because their controllers still inherit F0 — but Phase 0's canary route now provably needs the interceptor.

**Phase 3 — Flip the interceptor global.**
- Register `RequestContextInterceptor` as `APP_INTERCEPTOR` AHEAD of `AuditInterceptor` in `core.module.ts`.
- Remove `@UseContextInterceptor()` from the canary.
- Re-run `verify_auth.js`. All five 500s become 200/204/401 as appropriate.

**Phase 4 — Adapt `@Public()` tenant-scoped routes.**
- `/auth/refresh` — controller calls `tokenService.decodeChainFor(refreshToken)` → schoolId → wraps `auth.refresh(...)` in `RequestContextRegistry.run(derivedCtx, ...)`. Centralize via a `runInTenantContext` helper.
- `/auth/password-reset/request` — same pattern with email-to-schoolId lookup against a non-tenant-scoped table.
- `/auth/password-reset/confirm` — token carries the schoolId; controller derives ctx from the token.

**Phase 5 — Demote middleware to envelope-only.**
- `RequestContextMiddleware` no longer calls `storage.run`. It only mutates the request object.
- Logger child binding reads `req.id` directly (already true for pino-http).
- The optional "envelope-only ALS" frame for early log lines remains, scoped by a tiny `storage.run` wrapper inside the middleware that ends before `next()` returns. Decide based on whether any pre-interceptor log line needs ctx.

**Phase 6 — Cleanup.**
- Remove `RequestContextRegistry.upgrade()` entirely (no remaining call site).
- `enterWith` is no longer used anywhere in the codebase. ALS usage is exclusively `storage.run`.
- Update `AUTHENTICATION_ARCHITECTURE_REVIEW.md` and `BACKEND_ARCHITECTURE.md` to reflect the new lifecycle.

Each phase is independently shippable, observable via the existing `verify_auth.js` probe, and reversible by leaving the previous phase's code in place until the new phase is verified.

## 9. Final recommendation

**Adopt the layered architecture in §6.** The current design fails because it asks `AsyncLocalStorage.enterWith` to perform a task — atomic frame replacement across the Passport boundary — that the primitive is not designed for. No amount of strategy-layer or guard-layer patching will close this gap; every patch will leak in at least one direction (the `@Public()` routes have no strategy, the strategy boundary has no shared async resource with the controller).

The recommended fix is structural:

> **Bind the per-request ALS frame exactly once, in a global interceptor that runs after the auth guard and wraps the entire controller invocation in `storage.run`.**

This eliminates `enterWith` from the HTTP path, removes ALS coupling from the strategy, and makes the request-context lifecycle a single, reviewable function call. The migration is six phases, each independently verifiable, with no destructive intermediate state.

**Cost:** roughly 4–6 files added, 3–4 files simplified, one new interceptor, two new repository methods on the bypass path, ~150 LOC. No DB migration. No API contract change. No frontend change.

**Benefit:** all five remaining 500 errors close in Phase 3. The strategy becomes unit-testable without ALS. The pattern generalizes cleanly to gRPC and queue ingresses. The architecture reads top-to-bottom as one responsibility per layer instead of "middleware sets a default and three later layers try to swap it."

---

## Stop point

Per directive scope:
- ✅ Review only. No code modified.
- ✅ No middleware change.
- ✅ No AsyncLocalStorage change.
- ✅ No JwtAuthGuard change.
- ✅ No strategy change.
- ✅ Recommendation written. Migration strategy documented.
- ❌ Not implementing the recommendation.
