# Auth Frontend Tenant Architecture — Review

**Date:** 2026-06-28
**Status:** Review only — no code changes
**Scope:** Front-end tenant resolution before any modification of `LoginForm.tsx`
**Primary sources of truth:**
- `docs/AUTHENTICATION_FREEZE_V1.md` (frozen V1 contract)
- `docs/AUTHENTICATION_PATCH_PLAN.md` (authoritative architecture vision)
- `docs/AUTH_FINAL_RUNTIME_VERIFICATION.md` (verified runtime)
- `docs/AUTH_RUNTIME_PATCH_REPORT.md`
- `docs/REST_API_DESIGN.md` §0.1, §1.2
- `docs/MULTI_TENANT_ARCHITECTURE.md` §3 Layer 2
- `docs/SUPER_ADMIN_ARCHITECTURE.md` §2.1, §6
- `docs/ROLES_AND_PERMISSIONS.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/frontend/API_UI_MAPPING.md`

**Secondary source of truth:** the current backend implementation rooted at
`backend/src/core/auth/*` and `backend/src/core/request-context/*`.

---

## 1. Production Authentication Flow

### 1.1 Canonical host triad (`REST_API_DESIGN.md:17-22`)

| Host | Audience | Tenant identification |
|------|----------|-----------------------|
| `https://{school-slug}.schoolos.in/api/v1` | School users (admin, teacher, parent, student) | Leftmost host label = slug → DB lookup → `schoolId` |
| `https://app.schoolos.in/api/v1` + `X-Tenant-Slug` header | Mobile apps (single host) | Header value = slug → DB lookup |
| `https://admin.schoolos.in/api/v1/admin` | Super Admin / Platform staff | Host literal = platform sentinel; `actorScope='global'` |

### 1.2 Implementation status — what is wired today

| Path | Backend file:line | Status |
|------|------------------|--------|
| `admin.schoolos.in` → `scope='platform'` | `tenant-resolver.service.ts:69-71` | ✅ live |
| `<slug>.schoolos.in` → slug → schoolId | `tenant-resolver.service.ts:83-91` | ✅ live |
| `app.schoolos.in` + `X-Tenant-Slug` | `tenant-resolver.service.ts:73-81` | ✅ live |
| localhost + `X-Tenant-Slug` (optional) | `tenant-resolver.service.ts:93-101` | ✅ live |
| Generic host + `X-Tenant-Slug` | `tenant-resolver.service.ts:103-108` | ✅ live |
| Slug-cache 60s LRU(512) | `tenant-resolver.service.ts:52-53,113-134` | ✅ live |
| `AuthService.resolveSchoolId` honours `req.resolvedTenant` | `auth.service.ts:526-551` | ✅ live |
| Platform sentinel = School row with slug `'platform'` | `auth.service.ts:126-132,546-547` | ✅ live |
| `LoginDto.schoolId` is `@IsOptional()` | `auth.dto.ts:81-89` | ✅ live since W1.3 |
| `LoginDto.tenantSlug` accepted as alternate | `auth.dto.ts:127-137` | ✅ live |
| `tenantSlugLogin` verified end-to-end | `AUTH_FINAL_RUNTIME_VERIFICATION.md:101` | ✅ 200 OK |

### 1.3 What every production POST `/auth/login` looks like (target)

Three valid wire shapes, **all reach the same `AuthService.login`**:

```
# Slug host (school) — minimal body
POST https://canary.schoolos.in/api/v1/auth/login
Content-Type: application/json
{ "identifier": "<email>", "identifierType": "email", "password": "<pw>" }

# Platform host (super admin)
POST https://admin.schoolos.in/api/v1/auth/login
{ "identifier": "<email>", "identifierType": "email", "password": "<pw>" }

# Generic / mobile host (app.schoolos.in)
POST https://app.schoolos.in/api/v1/auth/login
X-Tenant-Slug: canary
{ "identifier": "<email>", "identifierType": "email", "password": "<pw>" }
```

The schoolId UUID is never produced by the frontend in any of these shapes.

---

## 2. Platform Admin Flow

**Production URL:** `https://admin.schoolos.in`

**Expected to send:** neither `schoolId` nor `tenantSlug`. Tenant is the platform sentinel, derived from the literal host string.

**Flow:**

1. Browser POST `/api/v1/auth/login` to `admin.schoolos.in`.
2. `TenantResolverMiddleware` runs first — sees `Host: admin.schoolos.in`, sets `req.resolvedTenant = { scope: 'platform', source: 'platform-host' }` (`tenant-resolver.service.ts:69-71`).
3. `RequestContextMiddleware` seeds an `actorScope: 'public'` frame (intentionally does not bind a tenant — `request-context.middleware.ts:14-18`).
4. Route is `@Public()` so `JwtAuthGuard` short-circuits.
5. `AuthService.login` calls `resolveSchoolId(...)`:
   - No body `schoolId`, no body `tenantSlug` → falls through to `resolvedTenant.scope === 'platform'` branch (`auth.service.ts:546-547`).
   - `lookupSchoolIdBySlug('platform')` returns the sentinel UUID `8ebaba31-…`.
6. Service binds `actorScope='global'` and issues tokens with `tenant_id` = sentinel.
7. Operator console uses these tokens; tenant guards reject them on any other host (`SUPER_ADMIN_ARCHITECTURE.md:132-134`).

**Approved-document position:** `AUTHENTICATION_PATCH_PLAN.md:228-232` — "Login is the same `POST /v1/auth/login`; tenant context comes from the host (`admin.schoolos.in`)."

**Implementation position:** identical to the approved doc. ✅ no divergence.

---

## 3. School User Flow (School Admin)

**Production URL:** `https://{schoolSlug}.schoolos.in`

**Expected to send:** nothing tenant-related in body or header. Frontend posts only `{ identifier, identifierType, password, rememberMe? }`. Slug is the leftmost host label.

**Flow:**

1. Browser POST `/api/v1/auth/login` to e.g. `canary.schoolos.in`.
2. `TenantResolverMiddleware` parses host → leftmost label = `'canary'` → DB lookup via 60s-cached `lookupSlug('canary')` → returns `{ scope: 'tenant', schoolId, slug: 'canary', source: 'subdomain', host }` (`tenant-resolver.service.ts:83-91, 113-134`).
3. `AuthService.resolveSchoolId` consumes `resolvedTenant.schoolId` directly (`auth.service.ts:541-545`).
4. `AuthService.resolveLoginAddress` uses `identifier` (default type `email`) for the user lookup (`auth.service.ts:502-524`).
5. Tokens issued; `tenant_id` claim = canary schoolId.

**Approved-document position:**
- `REST_API_DESIGN.md:147-149` — `tenantSlug` body field is **optional** when host is a sub-domain.
- `AUTHENTICATION_PATCH_PLAN.md:220` — "School UUID is never exposed to the frontend. All slug↔UUID conversion is server-side."
- `MULTI_TENANT_ARCHITECTURE.md:58-61` — sub-domain identifies the tenant.

**Implementation position:** identical to the approved doc. ✅ no divergence.

---

## 4. Teacher Flow

Same host (`{schoolSlug}.schoolos.in`), same wire shape as §3. Differences are purely service-layer (`User.roleAssignments` resolves to `roles: ['teacher']` in the JWT and on `/auth/me`). No tenant-resolution divergence.

**Conclusion:** identical to §3. Frontend posts no `schoolId` and no `tenantSlug` when reaching the slug host.

---

## 5. Parent Flow

Same host, same wire shape as §3. Per `AUTHENTICATION_FREEZE_V1.md:75` Parent OTP login (R-10) is deferred; V1 parents log in with email + password through the same endpoint as teachers and school admins.

**Conclusion:** identical to §3.

---

## 6. Student Flow (V1)

Same host, same wire shape as §3 (`identifier=email` only). Admission-number login is wire-accepted but service-rejected per `AUTHENTICATION_FREEZE_V1.md:42-44` + `AUTH_FINAL_RUNTIME_VERIFICATION.md:101` (`admissionNoLogin: 401`).

For V1 the seeded student logs in with email `20260001@students.canary.local`.

**Conclusion:** identical wire shape to §3. Service-side identifier resolution is the only V1 limitation, not a tenant-resolution one.

---

## 7. Localhost Development Flow

The patch plan defines localhost as a first-class tenant-resolution case:

> `AUTHENTICATION_PATCH_PLAN.md:216`:
> | Development | `localhost:PORT` | `X-Tenant-Slug` header (required for tenant-scoped requests) | `tenant` or `public` |

The resolver code matches:

> `tenant-resolver.service.ts:93-101` — when host is `localhost` / `127.*` and `X-Tenant-Slug` is supplied → slug lookup; if absent → `scope: 'public'`.

Verification probes (curl) documented in the patch plan:

> `AUTHENTICATION_PATCH_PLAN.md:560-561`:
> - `curl -H 'Host: canary.localhost' …/v1/auth/me` resolves canary.
> - `curl -H 'X-Tenant-Slug: canary' …/v1/auth/me` resolves canary via header.

**Two viable localhost strategies, both already supported by the backend:**

| Strategy | Frontend change | Backend change | Production parity |
|----------|-----------------|----------------|-------------------|
| **Header injection.** `axios.defaults.headers['X-Tenant-Slug'] = NEXT_PUBLIC_TENANT_SLUG` | yes — one axios interceptor line | none | LOW (production never uses the header on the school host) |
| **Hosts file + Host header.** `127.0.0.1 admin.schoolos.local canary.schoolos.local demo.schoolos.local`, then fetch from `http://canary.schoolos.local:3001` | none beyond running on `:3001` and matching the dev server origin | minor: extend resolver's `.schoolos.in` suffix logic to also accept `.schoolos.local` (currently it accepts localhost only as a special case) | HIGH — exercises the production code path |

Backend support for hosts-file-style today: the resolver matches `host.endsWith('.schoolos.in')` (`tenant-resolver.service.ts:83-91`) and treats bare `localhost`/`127.*` specially. `*.schoolos.local` would fall through to the generic `X-Tenant-Slug`-header branch — usable today but not host-derived. A 2-line backend additive change would let `admin.schoolos.local` and `canary.schoolos.local` resolve identically to production (deferred — would require an unfreeze).

---

## 8. Review — `NEXT_PUBLIC_DEFAULT_SCHOOL_ID`

| Question | Answer |
|----------|--------|
| Approved-doc stance | **Obsolete.** `AUTHENTICATION_PATCH_PLAN.md:220` — "The Sprint F1.3 env var `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` is replaced by `NEXT_PUBLIC_TENANT_SLUG`." |
| Patch plan Wave 5 instruction | `AUTHENTICATION_PATCH_PLAN.md:656,667-668` — "replace `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` with `NEXT_PUBLIC_TENANT_SLUG`; add `X-Tenant-Slug` header to the axios client. … `frontend/.env.example` — replace UUID env with slug env". |
| Backend requirement | **None.** `LoginDto.schoolId` is `@IsOptional()` (`auth.dto.ts:81-89`). Backend resolves tenant from host/header/body in that order. |
| Verified runtime behaviour | `AUTH_FINAL_RUNTIME_VERIFICATION.md:101` — `tenantSlugLogin: 200` proves the slug shape works against the live server with no `schoolId` in the body. |
| Current FE code | `LoginForm.tsx:53-57` hard-blocks login when `AUTH_CONFIG.defaultSchoolId === null`. This is the only thing keeping the UUID env var alive. |
| Conclusion | **Should be replaced.** The variable is a Sprint F1.3 workaround for a backend gap that has since been closed. Both the patch plan and the verified runtime support removal. Keeping it past V1 ratification is a frontend-only legacy. |

---

## 9. Review — `NEXT_PUBLIC_TENANT_SLUG`

| Question | Answer |
|----------|--------|
| Approved-doc stance | **Recommended dev/staging env var.** `AUTHENTICATION_PATCH_PLAN.md:220, 656, 666-667`. |
| What the FE would do with it | (a) include in axios as `X-Tenant-Slug: <value>` for every request; (b) pre-populate the `tenantSlug` field on the login DTO (defence in depth). |
| Backend support | Header path: `tenant-resolver.service.ts:103-108`. Body path: `auth.service.ts:530-532` slug → schoolId. |
| Production usage | **Not needed in production.** On `{slug}.schoolos.in` the host already encodes the slug; on `admin.schoolos.in` it is the platform sentinel. The env var is a localhost / preview-deploy convenience. |
| Conclusion | **Adopt — but scope it to development.** The production hosts must never depend on the env var. The axios client should only inject the header when running off a non-`schoolos.in` host (or unconditionally if a build flag says we are in dev). |

---

## 10. Review — Hosts file approach

| Question | Answer |
|----------|--------|
| Mechanism | `C:\Windows\System32\drivers\etc\hosts` (Win) / `/etc/hosts` (Unix) maps `admin.schoolos.local`, `canary.schoolos.local`, `demo.schoolos.local` → `127.0.0.1`. Dev server runs on those hostnames. |
| Production parity | **Highest of the three options.** It exercises the same `host` parsing branch (`endsWith('.schoolos.in')`) once the resolver is extended to also recognise `.schoolos.local`. |
| Cost today | Backend resolver does NOT match `.schoolos.local` as a slug-bearing host. A 2-line backend change (currently frozen) would make this work without any FE coupling. Without that change, hosts-file targets only resolve when the FE also sends `X-Tenant-Slug` — which collapses to Option B at the wire layer. |
| Multi-developer friction | Every developer must edit a privileged system file. CI runners need hostfile config too. |
| Recommendation | **Defer.** Hosts file is the right *long-term* dev story (matches production), but the path of least friction today is the env-var + header injection. Promote to hosts-file when (a) backend resolver gains `.schoolos.local` recognition under an unfreeze and (b) the FE dev server is configured to bind to the slugged hostnames. |

---

## 11. Current `LoginForm.tsx` Validation Review

The code in question, `frontend/src/components/auth/LoginForm.tsx:53-57`:

```ts
const schoolId = AUTH_CONFIG.defaultSchoolId;
if (schoolId === null) {
  setTopError(
    'Tenant is not configured. Set NEXT_PUBLIC_DEFAULT_SCHOOL_ID in the frontend environment before signing in.',
  );
  return;
}
```

| Classification | Verdict | Reasoning |
|---------------|---------|-----------|
| Correct? | **No.** | The form's own comment at `LoginForm.tsx:22-23` claims the backend still requires `schoolId`. That stopped being true at W1.3 (`auth.dto.ts:81` — `@IsOptional()`). |
| Obsolete? | **Yes.** | The validation gate reflects the Sprint F1.3 alignment plan (`SPRINT_F1_3_AUTH_ALIGNMENT_REPORT.md`) which assumed a backend that hadn't yet shipped tenant resolution. Tenant resolution has shipped, been frozen, and been verified at runtime. |
| Temporary? | **Yes — explicitly so.** | `AUTHENTICATION_PATCH_PLAN.md:220` literally names this env var as the thing to be replaced. |
| Localhost-only? | **It is currently the ONLY localhost mechanism**, but it is not the only one supported by the backend. Both `X-Tenant-Slug` header and host-derived resolution are wired. |
| Should be replaced? | **Yes**, by either: (a) `NEXT_PUBLIC_TENANT_SLUG` + header injection in the axios interceptor, or (b) `NEXT_PUBLIC_TENANT_SLUG` + body-level `tenantSlug` on `/auth/login`, or (c) hosts-file + small backend resolver extension. |
| Should remain? | **No.** Keeping it indefinitely freezes the FE on a backend gap that no longer exists. |

**Why this is a real problem, not just a tidy-up:**
- Multi-tenant local testing today requires editing `.env.local` and restarting the dev server every time a different tenant is needed.
- The same FE build cannot run against both the canary school and the platform admin (different UUIDs).
- Any production deploy targeting `admin.schoolos.in` is impossible because there is no UUID for the platform sentinel that the FE can hard-code without leaking internal IDs.

---

## 12. Differences Between Approved Documents and Implementation

| # | Topic | Approved doc | Backend implementation | Frontend implementation | Authority |
|---|-------|--------------|------------------------|-------------------------|-----------|
| D1 | Tenant on the wire | UUID never exposed to FE (`PATCH_PLAN:220`) | `LoginDto.schoolId` still accepted, but optional (`auth.dto.ts:81-89`); slug accepted alongside | FE always sends `schoolId` UUID, never sends `tenantSlug` or `X-Tenant-Slug` (`LoginForm.tsx:53-57`, `auth.ts:42-53`) | **Patch plan is authoritative**; freeze cert §10 keeps both wire shapes accepted but the FE is not on the recommended path. |
| D2 | `X-Tenant-Slug` header injection | Required FE behaviour (`PATCH_PLAN:666`) | Resolver consumes it on every host branch (`tenant-resolver.service.ts:73-108`) | Axios client does NOT inject the header (`frontend/src/lib/api/client.ts:80-108`) | **Patch plan is authoritative**; FE is missing the wiring. |
| D3 | Env var name | `NEXT_PUBLIC_TENANT_SLUG` (`PATCH_PLAN:220, 667`) | n/a | `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` (`frontend/src/lib/config/app.ts:25`) | **Patch plan is authoritative.** |
| D4 | Subdomain-driven login without body tenant field | Listed as "future" in freeze §3 (`FREEZE_V1.md:49`) | Mechanism wired today (`tenant-resolver.service.ts:65-91`; `auth.service.ts:541-549`) | Not used | **Freeze cert understates implementation maturity.** The code path exists and `tenantSlugLogin` proves the analogous case works at runtime. The freeze caveat is about productisation (DNS / hosts), not about missing code. |
| D5 | Hosts file dev story | `PATCH_PLAN:560` shows `Host: canary.localhost` curl example | `localhost`/`127.*` branch (`tenant-resolver.service.ts:93-101`) does NOT recognise `*.schoolos.local` as slug-bearing | Not used | **Patch plan is aspirational on this point.** A small backend additive change would close the gap; today the resolver requires the header even with hosts file. |
| D6 | LoginForm comment vs reality | n/a | `auth.dto.ts:81-89` — schoolId optional | `LoginForm.tsx:22-23` comment claims schoolId is required | **Backend reality is authoritative.** The FE comment is stale. |

**Authority order applied here:** when the freeze certificate (`AUTHENTICATION_FREEZE_V1.md`) explicitly accepts both shapes (§5), and the patch plan (`AUTHENTICATION_PATCH_PLAN.md`) prescribes the slug-only one as the target, the patch plan is the long-term architecture; the freeze is the *minimum* contract V1 must support. Neither prohibits adopting the slug shape from the FE.

---

## 13. Final Recommended Architecture

### 13.1 Production

```
Browser
  └── Host: {slug}.schoolos.in  ─────────────────────────────────┐
       └── POST /api/v1/auth/login                                │
            body: { identifier, identifierType:'email', password }│
                                                                  │
Browser                                                           │
  └── Host: admin.schoolos.in  ──────────────────────────────────┤
       └── POST /api/v1/auth/login                                │
            body: { identifier, identifierType:'email', password }│
                                                                  ▼
                                       TenantResolverMiddleware (host-derived)
                                          ├─ admin.schoolos.in → scope='platform'
                                          ├─ {slug}.schoolos.in → resolve slug → schoolId
                                          └─ app.schoolos.in   → require X-Tenant-Slug header
                                                                  │
                                       AuthService.login          │
                                          ├─ resolveSchoolId reads req.resolvedTenant
                                          ├─ resolveLoginAddress uses identifier+identifierType
                                          └─ issues access + refresh tokens
```

Frontend never sends `schoolId`. Production deployments are pinned to their hosts via DNS, not via FE configuration. Single FE build artefact serves every tenant.

### 13.2 Development (localhost)

```
Frontend dev server on http://localhost:3001
  └── axios interceptor injects X-Tenant-Slug: ${NEXT_PUBLIC_TENANT_SLUG}
       └── POST /api/v1/auth/login (via http://localhost:3000)
            headers: { X-Tenant-Slug: 'canary', … }
            body:    { identifier, identifierType:'email', password }

To switch tenant locally: change NEXT_PUBLIC_TENANT_SLUG in .env.local
   - 'platform' (or omit) → admin sentinel
   - 'canary'             → canary school
```

Alternative localhost path (deferred — needs a 2-line backend additive change):
host `canary.schoolos.local` → leftmost label → slug → schoolId. Same code path as production. No env var required, but `*.schoolos.local` is not yet recognised by `TenantResolverService`.

### 13.3 Migration steps when LoginForm.tsx is unblocked

1. Add `NEXT_PUBLIC_TENANT_SLUG` to `frontend/.env.example`; keep `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` deprecated-but-honoured for one sprint to ease rollover.
2. In `frontend/src/lib/config/app.ts`, add `AUTH_CONFIG.tenantSlug` alongside `defaultSchoolId`.
3. In `frontend/src/lib/api/client.ts` (axios request interceptor), inject `X-Tenant-Slug: AUTH_CONFIG.tenantSlug` when the value is set.
4. In `frontend/src/components/auth/LoginForm.tsx`, drop the `defaultSchoolId === null` gate; send `{ identifier: values.email, identifierType: 'email', password, rememberMe }` instead of `{ schoolId, email, password }`. If `AUTH_CONFIG.tenantSlug` is set, also include `tenantSlug` in the body (defence in depth).
5. Refresh `frontend/src/lib/api/clients/auth.ts` types: deprecate `LoginPayload.schoolId`, add `tenantSlug` and `identifier`/`identifierType`.
6. Remove the stale `LoginForm.tsx:22-23` comment.

None of step 1-6 requires a backend change. None requires an unfreeze.

---

## 14. Final Recommendation — Before Modifying `LoginForm.tsx`

The architecture review confirms three blocking findings:

1. **`NEXT_PUBLIC_DEFAULT_SCHOOL_ID` is obsolete.** The backend has not required `schoolId` since W1.3, the freeze cert accepts the slug-based shape, and the runtime verification has it at 200 OK.

2. **The frontend is one of two implementations that drifted from the patch plan.** Backend completed the W1.3 path; frontend stopped at Sprint F1.3 alignment, which was a stop-gap. The patch plan Wave 5 (FE follow-up) was never executed.

3. **No backend or freeze change is required to unblock the FE.** Adopting `NEXT_PUBLIC_TENANT_SLUG` + header injection is purely additive on the frontend; the backend already supports the wire contract.

**Recommended sequencing:**

| Step | Owner | Effort | Risk |
|------|-------|--------|------|
| **R1** — Add `NEXT_PUBLIC_TENANT_SLUG` to env config + `.env.example` | FE | trivial | none |
| **R2** — Add `X-Tenant-Slug` injection to the axios interceptor (guarded on env var presence) | FE | small | none — header is harmless when not needed |
| **R3** — Migrate `LoginForm.tsx` to the `{ identifier, identifierType:'email', password, rememberMe }` body shape; remove the `defaultSchoolId === null` gate | FE | small | low — verified backend shape |
| **R4** — Keep `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` as a deprecated, no-op env var for one sprint to avoid breaking existing `.env.local` files | FE | trivial | none |
| **R5** — Update `SessionUser` and `LoginPayload` types: drop `schoolId` requirement, add `tenantSlug?` and `identifier`/`identifierType` | FE | small | none |
| **R6 (deferred)** — Backend resolver extension to recognise `*.schoolos.local` as slug-bearing in dev | BE | minor | requires an unfreeze decision |

**Do not** modify `LoginForm.tsx` ahead of R1–R5 being agreed; the form change without the axios + config + types changes is incomplete and would either keep sending `schoolId` or fail on localhost. R1–R5 are a single coherent unit and should ship together as Sprint F2.2 or a focused F2.1.1 follow-up.

**Success criteria met by this review:**

- ✅ How authentication works in production — §1, §2, §3.
- ✅ How authentication should work on localhost — §7, §13.2.
- ✅ Whether FE should continue using `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` — **No**, §8.
- ✅ Whether `tenantSlug` should replace it — **Yes, via `NEXT_PUBLIC_TENANT_SLUG`**, §9.
- ✅ Whether hosts file is the preferred development strategy — **Long-term yes, near-term no**, §10.
- ✅ Whether `LoginForm.tsx` should be modified before Sprint F2.2 begins — **Yes, but only as part of the coherent R1–R5 bundle**, §14.

---

## Stop

Review complete. No source code modified.
