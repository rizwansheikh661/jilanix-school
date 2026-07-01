---
status: FROZEN
issued: 2026-06-28
supersedes:
  - docs/AUTH_FRONTEND_TENANT_ARCHITECTURE_REVIEW.md (preliminary)
references:
  - docs/AUTHENTICATION_FREEZE_V1.md
  - docs/AUTHENTICATION_PATCH_PLAN.md
  - docs/AUTH_FINAL_RUNTIME_VERIFICATION.md
  - docs/AUTH_RUNTIME_PATCH_REPORT.md
  - docs/REST_API_DESIGN.md
  - docs/MULTI_TENANT_ARCHITECTURE.md
  - docs/SUPER_ADMIN_ARCHITECTURE.md
  - docs/ROLES_AND_PERMISSIONS.md
  - docs/PRODUCT_REQUIREMENTS.md
  - docs/API_UI_MAPPING.md
scope: frontend authentication only; no backend changes proposed
mode: review only — no code modified
---

# Frontend Authentication — Final Architecture (Frozen)

This document is the **permanent reference** for all frontend authentication work. Once Sprint F2.2 begins, the architecture here is fixed; further redesign requires an explicit unfreeze.

It is grounded by direct file:line citations against the live backend and current frontend, not against assumptions.

---

## 1. Production Authentication Architecture

### 1.1 Two production origins, two flows

| Origin | Tenant scope | How the backend resolves it | What the frontend must send |
|---|---|---|---|
| `https://admin.schoolos.in` | platform (sentinel School row, slug `'platform'`, UUID `8ebaba31-773d-4847-8250-e3c555bdf087`) | `tenant-resolver.service.ts:69-71` matches the literal `PLATFORM_HOST`; emits `{ scope: 'platform' }`; `auth.service.ts:547` swaps in `PLATFORM_SCHOOL_SLUG` → platform schoolId. | **Nothing tenant-related.** No `schoolId`, no `tenantSlug`, no `X-Tenant-Slug`. Just `{ email, password, rememberMe? }`. |
| `https://{schoolSlug}.schoolos.in` (e.g. `canary.schoolos.in`) | tenant | `tenant-resolver.service.ts:83-91` strips the leftmost label, runs `sanitiseSlug`, calls `lookupSchoolIdBySlug(slug)`; emits `{ scope: 'tenant', schoolId, slug }`. | **Nothing tenant-related.** Same body shape as above. |

`https://app.schoolos.in` exists in the resolver (`tenant-resolver.service.ts:73-81`) but is mobile-only per `REST_API_DESIGN.md` §0.1; the web SPA does not run on that host in production. If it ever does, the `X-Tenant-Slug` header becomes load-bearing in production too.

### 1.2 Persona → origin mapping

| Persona | Origin | Resolver branch | FE injects |
|---|---|---|---|
| Platform Admin | `admin.schoolos.in` | platform-host | nothing |
| School Admin | `{slug}.schoolos.in` | slug-subdomain | nothing |
| Teacher | `{slug}.schoolos.in` | slug-subdomain | nothing |
| Parent | `{slug}.schoolos.in` | slug-subdomain | nothing |
| Student | `{slug}.schoolos.in` | slug-subdomain | nothing |

All five personas resolve **exclusively from the host**. No UUID, no env var, no header, no per-school FE bundle.

### 1.3 Confirmation against the directive

- **No UUID required** — ✅ confirmed. `LoginDto.schoolId` is `@IsOptional()` (`auth.dto.ts:79-89`); the resolver fills it from the host.
- **No tenant-slug env var required** — ✅ confirmed. The slug is derived from the URL the user typed, not from a build-time constant.
- **No frontend tenant configuration required** — ✅ confirmed. The production bundle is **tenant-agnostic**: the same compiled artifact serves `canary.schoolos.in`, `demo.schoolos.in`, and `admin.schoolos.in`.

### 1.4 Wildcard certificate / DNS

Production assumes a wildcard `*.schoolos.in` TLS certificate and a wildcard DNS A record. Both are standard SaaS infrastructure and not the FE's concern, but the FE architecture depends on them: without wildcard DNS the host-resolution model collapses and the FE would need a per-tenant build.

---

## 2. Local Development Architecture

Localhost has no wildcard DNS and no wildcard TLS — the host-resolution path that production relies on is unavailable. The backend already anticipates this with two dev-friendly branches:

1. **`isLocalHost(host)`** (`tenant-resolver.service.ts:93-101, 162-164`) — matches `localhost`, `127.*`, `::1`, `0.0.0.0`. If `X-Tenant-Slug` is present → resolves; otherwise → `{ scope: 'public' }`.
2. **Generic header fallback** (`tenant-resolver.service.ts:103-108`) — for any non-`.schoolos.in` host (including the hosts-file `*.schoolos.local` case), if `X-Tenant-Slug` is present → resolves; otherwise → `{ scope: 'public' }`.

In both branches, the FE must supply the slug via header. The only question is *how* the FE knows which slug to send.

### 2.1 Options analysed

#### Option A — `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` (status quo)

| | |
|---|---|
| **What it does** | FE reads a UUID from env (`AUTH_CONFIG.defaultSchoolId` in `frontend/src/lib/config/app.ts:8-26`), inserts it into the `LoginForm.tsx` body as `schoolId`. |
| **Advantages** | Already implemented. Zero ambiguity once configured. |
| **Disadvantages** | (1) Leaks UUIDs into the FE bundle — `AUTHENTICATION_PATCH_PLAN.md:220` explicitly says "School UUID is never exposed to the frontend." (2) UUIDs are hostile UX even in dev — copy/paste errors are common. (3) Bypasses the resolver — the FE has to know the database PK. (4) Cannot model the platform sentinel cleanly (the platform UUID is itself a magic constant). |
| **Production parity** | Zero. Production never sends a UUID; this path is dev-only and trains developers on a flow that does not exist in prod. |
| **Developer experience** | Acceptable once set; hostile to set initially (need to run a seed query to find the UUID). |
| **Long-term maintenance** | **Obsolete.** Both the patch plan (§2 L220) and the freeze cert (`AUTHENTICATION_FREEZE_V1.md:172`) flag this for replacement. Keeping it means perpetual divergence between dev and prod auth code. |

#### Option B — `NEXT_PUBLIC_TENANT_SLUG`

| | |
|---|---|
| **What it does** | FE reads a slug string from env, axios interceptor attaches `X-Tenant-Slug: <slug>` on every request. `LoginForm` posts `{ email, password, rememberMe? }` — no tenant body field. |
| **Advantages** | (1) Wire shape matches what `app.schoolos.in` would send — closer to production than Option A. (2) Slugs are human-readable. (3) Centralised in the axios layer; `LoginForm` is dumb about tenancy. (4) Works for every endpoint, not just `/auth/login` — the same header drives `/auth/me`, `/auth/password-reset/*`, and every business endpoint. (5) Compatible with the existing backend (`tenant-resolver.service.ts:51, 93-108`) with zero backend change. |
| **Disadvantages** | (1) Still a build-time tenant choice — switching tenant means rebuilding (mitigated: in dev, `npm run dev` re-reads env on restart). (2) Header is invisible to a naive `curl` test — needs to be set explicitly. |
| **Production parity** | High at the wire layer (header is the same one `app.schoolos.in` uses). Origin still differs from prod, but the request envelope is identical. |
| **Developer experience** | Excellent. One slug string in `.env.local`, set once. |
| **Long-term maintenance** | Clean. The env var disappears the moment hosts-file resolution lands (R6, deferred). |

#### Option C — `NEXT_PUBLIC_DEV_TENANT_SLUG`

Functionally identical to Option B; only the name differs. The `_DEV_` infix would make it self-documenting as a dev-only variable.

| | |
|---|---|
| **Advantages** | Self-documenting that the var has no production meaning. Reduces the risk that someone sets it in production by accident. |
| **Disadvantages** | Verbose. Slightly inconsistent with other `NEXT_PUBLIC_*` vars that don't carry a `_DEV_` infix (`NEXT_PUBLIC_API_BASE_URL` works in both envs). The Next.js convention is `NODE_ENV` / `next.config.js` for env gating, not name prefixes. |
| **Production parity** | Same as Option B. |
| **Developer experience** | Same as Option B. |
| **Long-term maintenance** | Same as Option B; one more character to remember. |

Verdict: Option B and Option C are the same option. Name is a paint colour.

#### Option D — Hosts file (`admin.schoolos.local`, `{slug}.schoolos.local`)

| | |
|---|---|
| **What it does** | Developer edits `C:\Windows\System32\drivers\etc\hosts` (or `/etc/hosts`) to map `*.schoolos.local` to `127.0.0.1`. The FE runs on `http://canary.schoolos.local:3001`, calls backend at `http://canary.schoolos.local:3000/api/v1/*`. |
| **Advantages** | (1) Highest production parity — the FE sends nothing tenant-related; the backend derives the slug from the host exactly as production does. (2) Identical persona walk-through to prod (you literally type `admin.schoolos.local` for platform, `canary.schoolos.local` for tenant). (3) No env vars. (4) Survives multi-tenant dev — open two browser tabs at two different slugs, no env-flip required. |
| **Disadvantages** | (1) **Does not work today.** `tenant-resolver.service.ts:83` only matches `.schoolos.in`; the `.schoolos.local` suffix falls to the generic header branch (L103-108), which still requires `X-Tenant-Slug`. So the hosts file alone gets you nothing without a backend change. (2) Requires every developer to edit a privileged system file. (3) Browsers don't trust `.local` TLS without local CA work (or the dev runs HTTP only). (4) `.local` is reserved by mDNS / Bonjour on macOS and Windows — collisions are possible. (5) The frozen auth module would need an additive (but real) edit to the resolver constants (`ROOT_DOMAIN` → `ROOT_DOMAINS`). |
| **Production parity** | Highest (post-backend change). |
| **Developer experience** | Best post-setup, worst at setup (admin hosts edit, optional TLS cert, optional mDNS conflict diagnosis). |
| **Long-term maintenance** | Best long-term — every code path is the same as production. But requires an auth-module unfreeze to get there. |

---

## 3. Recommended Development Strategy

**Choose Option B (`NEXT_PUBLIC_TENANT_SLUG`).** Defer Option D until after Version 1 ships.

### 3.1 Rationale

- **Zero backend change.** The frozen auth module stays frozen.
- **Wire shape matches a real production path** (the `app.schoolos.in` header path), so dev exercises code paths that prod exercises.
- **Centralised in axios.** `LoginForm` is tenant-agnostic, which matches the production behaviour where `LoginForm` is also tenant-agnostic.
- **Reversible.** When R6 (hosts-file resolver) eventually lands, the env var is removed in two places (axios interceptor + `.env.example`); no application code changes.
- **No UUID exposure.** Aligns with the patch plan's explicit prohibition (`AUTHENTICATION_PATCH_PLAN.md:220`).

### 3.2 Env var contract

| Property | Decision |
|---|---|
| **Name** | `NEXT_PUBLIC_TENANT_SLUG` (no `_DEV_` infix; align with `NEXT_PUBLIC_API_BASE_URL`). |
| **Scope** | **Development and staging only.** Production builds must not define it. |
| **Production behaviour** | If somehow set in production, axios still injects the header. The backend's host-resolution branch (`tenant-resolver.service.ts:69-91`) runs *before* the header branch (L93-108), so a stray header on `admin.schoolos.in` or `<slug>.schoolos.in` is **ignored** — the host wins. This makes the env var safe-by-default in production. |
| **Validation at boot** | `frontend/src/lib/config/app.ts` exports `AUTH_CONFIG.tenantSlug: string \| null`. If unset, **no error at module load** (production legitimately runs without it). |
| **Validation at request time** | The axios interceptor only injects the header when both `tenantSlug` is non-null **and** the runtime host is not `*.schoolos.in`. This prevents the "stray header in prod" case at the source. |
| **Format** | Lower-case kebab/alphanumeric, max 63 chars (matches `sanitiseSlug` regex at `tenant-resolver.service.ts:155-160`). |
| **Default** | None. If unset and the dev origin is `localhost`, the user sees a graceful login error from the backend (`TenantNotFoundError` → 404) rather than a cryptic FE crash. |
| **Documented in** | `frontend/.env.example` (replacing the current `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` line). |

### 3.3 Where does `LoginForm` learn about the tenant?

**It does not.** The `LoginForm` only knows about email, password, and remember-me. The tenant binding is the responsibility of the transport layer (axios). This is the same separation of concerns that production uses, where the host (not the form) carries the tenant identity.

This is a load-bearing simplification: when R6 lands, the form does not change.

### 3.4 Header on every request, not just `/auth/login`

`X-Tenant-Slug` rides on **every** outbound request, not just login. Reasons:

1. The backend's tenant resolver is global middleware (`request-context.middleware.ts`); every endpoint participates.
2. The `/auth/me` call that runs immediately after login also needs tenant context.
3. Business endpoints (students, classes, fees) all require the resolved tenant scope.

The cost is one trivial line in the axios request interceptor.

---

## 4. Hosts File Evaluation

### 4.1 Should we adopt hosts-file dev URLs?

**Eventually yes; not before Version 1.**

Production parity is the single best reason to use hosts files for dev — the same URL shape, the same resolver branch, the same auth code path. Once paid for, it is strictly better than `NEXT_PUBLIC_TENANT_SLUG`.

### 4.2 What does it cost?

**Backend work (minimal, but real):**

Two edits in `backend/src/core/request-context/tenant-resolver.service.ts`:

1. Replace the `ROOT_DOMAIN` constant (L48) with `ROOT_DOMAINS: readonly string[] = ['schoolos.in', 'schoolos.local']` (or read from config so prod can be `['schoolos.in']` and dev can include `'schoolos.local'`).
2. Generalise the `host.endsWith('.${ROOT_DOMAIN}')` check at L83 to a loop over `ROOT_DOMAINS`, applying `PLATFORM_HOST` / `APP_HOST` semantics per root if desired.

Estimate: 30 lines of code including unit tests for the resolver. One PR.

**Frontend work:** None at the application level. The dev tooling (`package.json` `dev` script) may need a host flag so Next.js binds to `0.0.0.0` rather than `localhost`; that is a tooling tweak, not architecture.

**Operational work:**
- A short developer guide for editing the hosts file across Windows / macOS / Linux.
- An optional self-signed wildcard cert if developers want HTTPS in dev (recommended but optional; HTTP is fine for cookie-less Bearer auth).
- Conflict diagnosis instructions for `.local` collisions with mDNS (especially macOS).

### 4.3 When?

| Phase | Decision |
|---|---|
| **Before Sprint F2.2** | **No.** Sprint F2.2 must not be blocked on a backend unfreeze. Ship F2.2 with Option B. |
| **After Sprint F2.2** | **Maybe.** If dev parity becomes a friction point during F2.2/F2.3 implementation, schedule the resolver extension as a short "auth dev-experience" mini-sprint. |
| **After Version 1 release** | **Yes, if not done sooner.** Before scaling onboarding to additional engineers post-V1, the hosts-file path becomes the dev story and the env var is retired. |

---

## 5. Environment Variable Strategy

### 5.1 Frontend environment variables — final catalogue

| Variable | Purpose | Required in | Production behaviour | Validation |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend `/api/v1` origin. | dev + staging + prod | E.g. `https://api.schoolos.in/api/v1`. | Required; module load error if missing. |
| `NEXT_PUBLIC_TENANT_SLUG` | Dev/staging tenant the FE attaches to via `X-Tenant-Slug`. | dev + staging | **Should be unset.** If set, harmless because host-resolution outranks header-resolution at `tenant-resolver.service.ts:69-91`. | Optional; if set and `sanitiseSlug` rejects it, axios should refuse to inject (fail loud rather than send garbage). |
| ~~`NEXT_PUBLIC_DEFAULT_SCHOOL_ID`~~ | (Obsolete) UUID legacy. | — | — | **Remove from `.env.example` and from `AUTH_CONFIG`.** |

### 5.2 Rules

1. **No tenant secret ever lives in the FE bundle.** Slugs are public (they appear in URLs); UUIDs were the issue, and they are gone.
2. **`NEXT_PUBLIC_TENANT_SLUG` is dev/staging only.** Production deployments must not define it. CI builds for production should fail if the var is present in the build env, or at minimum log a warning.
3. **Validation is at the boundary.** The axios layer (not the form, not the page) checks the slug shape and refuses to inject malformed values.
4. **Re-deploy to switch tenants in staging.** This is acceptable — staging is single-tenant per environment, and dev runs `npm run dev` which re-reads env on restart.

---

## 6. Axios Strategy

### 6.1 Responsibilities of the axios singleton

Currently (`frontend/src/lib/api/client.ts:80-108`) the request interceptor sets:

- `X-Request-Id`
- `Authorization: Bearer <accessToken>`
- `If-Match` (for optimistic concurrency where the caller provides an ETag)
- `Idempotency-Key` (for mutating POSTs)

**Add (post-R2):**

- `X-Tenant-Slug: <NEXT_PUBLIC_TENANT_SLUG>`, **conditionally**: only when the runtime `Host` is not `*.schoolos.in` (so production hosts never see a stray header) and the env var is non-null.

### 6.2 Single-flight 401 refresh

Existing (`frontend/src/lib/api/client.ts:110-138`). Unchanged. The refresh request must also carry the `X-Tenant-Slug` header so the backend can re-bind tenant context during the refresh roundtrip. (Today the refresh interceptor reuses the same instance, so it inherits the request interceptor automatically. R2 must preserve this property.)

### 6.3 What axios does *not* do

- Does not parse the URL of the current page.
- Does not maintain its own tenant state.
- Does not retry on `TenantNotFoundError`.
- Does not surface tenant errors to the user — that is the page's job (Toast).

### 6.4 Testing the interceptor

A unit test (`frontend/src/lib/api/client.test.ts`, to be added in R2) mounts a mock adapter and asserts:

1. With `NEXT_PUBLIC_TENANT_SLUG=canary` and origin `localhost:3001`, every outbound request carries `X-Tenant-Slug: canary`.
2. With `NEXT_PUBLIC_TENANT_SLUG=canary` and origin `canary.schoolos.in`, the header is **omitted** (host wins).
3. With the env var unset, the header is omitted unconditionally.
4. The header rides on `/auth/login`, `/auth/refresh`, `/auth/me`, and a representative business endpoint.

---

## 7. LoginForm Responsibility

### 7.1 What `LoginForm` owns

- Render email + password + remember-me + submit.
- Client-side validation (email format, password presence).
- Call `useAuth().login({ email, password, rememberMe })`.
- Surface backend errors via `useToast()`.
- On success, call `fetchSession()` then route via `resolveLandingPath(me)`.

### 7.2 What `LoginForm` does **not** own (post-migration)

- Tenant identity. No `schoolId`, no `tenantSlug`, no env-var read.
- Header injection. Axios does this.
- Tenant validation. The backend returns `TenantNotFoundError` if missing, and the form just shows the toast.
- The legacy `if (defaultSchoolId === null)` guard (`LoginForm.tsx:53-59`) is **deleted** in R3. It is currently obsolete (`auth.dto.ts:87` made `schoolId` optional at W1.3) and actively misleading — it tells developers the FE needs a tenant configuration when in fact the tenant is now resolved transport-side.

### 7.3 Why this matters

This separation means `LoginForm` is **identical in dev, staging, and production**. There is no `if (process.env.NODE_ENV === 'development')` branch. There is no env-var read. The form is portable, testable, and the dev/prod divergence collapses to a single line in axios.

It also means future personas (mobile webview, third-party SSO callback, admin impersonation page) reuse `LoginForm` unchanged.

---

## 8. Authentication Flow Matrix

| Scenario | Host | Env (`NEXT_PUBLIC_TENANT_SLUG`) | Axios injects `X-Tenant-Slug`? | Backend resolves tenant via | LoginForm body |
|---|---|---|---|---|---|
| Prod platform admin | `admin.schoolos.in` | unset | no (host is `*.schoolos.in`) | `PLATFORM_HOST` match (`tenant-resolver.service.ts:69`) | `{ email, password, rememberMe? }` |
| Prod school admin | `canary.schoolos.in` | unset | no | slug-subdomain (`tenant-resolver.service.ts:83-91`) | same |
| Prod teacher/parent/student | `canary.schoolos.in` | unset | no | same as above | same |
| Prod mobile app shell (if web) | `app.schoolos.in` | unset (or set, harmless) | yes (host is `app.schoolos.in`) — but mobile uses native HTTP | header branch (`tenant-resolver.service.ts:73-81`) | same |
| Dev localhost — tenant | `localhost:3001` | `canary` | yes | header branch (`tenant-resolver.service.ts:103-108`) | same |
| Dev localhost — platform | `localhost:3001` | `platform` | yes | header branch resolves to platform slug → platform schoolId | same |
| Dev hosts-file (post-R6) | `canary.schoolos.local` | unset | no (if R6 ships) | extended root-domain branch | same |
| Dev hosts-file (pre-R6, today) | `canary.schoolos.local` | `canary` | yes (host is not `*.schoolos.in`) | header branch — functionally identical to localhost case | same |
| Staging | `canary.staging.schoolos.in` (or similar) | depending on infra; typically unset and using slug subdomains | no if host matches; yes otherwise | host or header | same |
| Misconfigured dev (env unset) | `localhost:3001` | unset | no | header missing → `{ scope: 'public' }` → `TenantNotFoundError` | Toast surfaces backend error |

**Property preserved across every row:** the `LoginForm` body is always `{ email, password, rememberMe? }`. The only thing that varies is whether axios attaches the header.

---

## 9. Production vs Development Comparison

| Dimension | Production | Development (Option B) | Development (Option D, future) |
|---|---|---|---|
| Origin | `admin.schoolos.in` / `{slug}.schoolos.in` | `http://localhost:3001` | `http://{slug}.schoolos.local:3001` |
| Backend resolver branch | host (platform-host or slug-subdomain) | generic header | extended slug-subdomain |
| FE env var for tenant | none | `NEXT_PUBLIC_TENANT_SLUG` | none |
| Outbound `X-Tenant-Slug` | absent | present | absent |
| LoginForm code path | identical | identical | identical |
| Axios request interceptor | does not inject tenant header | injects header | does not inject |
| Switching tenants | type a different URL | restart dev with new env value | type a different URL |
| Backend changes required | none (frozen) | none (frozen) | resolver constants extended (unfreeze) |

The gap between production and Option B is exactly **one HTTP header** and **one env var**. The gap between production and Option D is zero.

---

## 10. R1–R5 Migration Review

The five migration steps from `AUTH_FRONTEND_TENANT_ARCHITECTURE_REVIEW.md` §14:

| Step | Scope | Order verdict |
|---|---|---|
| **R1** | Env: replace `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` with `NEXT_PUBLIC_TENANT_SLUG` in `frontend/.env.example`; update `frontend/src/lib/config/app.ts` to expose `AUTH_CONFIG.tenantSlug: string \| null`. | First. Pure config; no runtime impact until later steps wire it up. |
| **R2** | Axios: extend the request interceptor in `frontend/src/lib/api/client.ts:80-108` to inject `X-Tenant-Slug` when env is set and host is not `*.schoolos.in`. Add unit test per §6.4. | Second. Additive and harmless (no caller depends on the header yet, but having it ride the wire de-risks R3). |
| **R3** | LoginForm: drop the `schoolId` body field, drop the `defaultSchoolId === null` guard (`LoginForm.tsx:51-59`), update `LoginPayload` callers. Update `LoginForm.test.tsx` to assert the new body shape. | Third. Now the runtime path matches what production does. |
| **R4** | Backcompat: keep `LoginPayload.schoolId?: string` as `@deprecated` in TypeScript for one sprint so any external caller (none expected, but defence in depth) still type-checks; delete in R5. Also: keep the backend `schoolId` body field accepted (no FE-side enforcement needed — backend already supports both shapes per `auth.dto.ts:79-89`). | Fourth. Pure type-layer; no runtime change. |
| **R5** | Types: tighten `LoginPayload`, `AUTH_CONFIG` interface, and any stale comments in `auth.ts:12-15` and `app.ts:8-26`. Remove the deprecated `schoolId?` field from `LoginPayload`. | Fifth. Cleanup pass; the runtime is already correct by R3. |

**Verdict on ordering:** Correct. No dependency cycles. Each step compiles and ships independently. The patch plan's file list at `AUTHENTICATION_PATCH_PLAN.md:658-668` enumerates essentially the same files in essentially the same order.

**One refinement** to R4: there is no external consumer of `LoginPayload` (it is internal to the FE), so the deprecation pause can be skipped — R4 and R5 can merge. But keeping them separate is harmless and gives a one-sprint safety net. **Recommendation: keep R4 as a separate step but make it trivially small (one `/** @deprecated */` JSDoc tag).**

**Sprint packaging:** R1–R5 are a coherent bundle suitable for one short sprint (Sprint F2.2-prelude, ~1 day). They must land *before* Sprint F2.2 begins building persona dashboards, because dashboards will start hitting business endpoints that need the tenant header.

---

## 11. Future Scalability Review

The recommended architecture is verified to support every Version 1 module without redesign.

| Module | Auth need | Supported by this architecture? |
|---|---|---|
| **Platform Dashboard** | Platform-scope token; runs on `admin.schoolos.in`. | ✅ Host = `admin.schoolos.in` → resolver emits `scope: 'platform'` → `PLATFORM_SCHOOL_SLUG`. Zero new code. |
| **School Management (admin)** | Tenant-scope token; runs on `{slug}.schoolos.in`. | ✅ Host → slug → schoolId. Zero new code. |
| **Subscription Management** | Platform-scope. | ✅ Same as Platform Dashboard. |
| **Teacher Portal** | Tenant-scope, role=teacher. | ✅ Same shell as School Admin; role gating handled by `PermissionProvider`. |
| **Parent Portal** | Tenant-scope, role=parent. | ✅ Same. |
| **Student Portal** | Tenant-scope, role=student. | ✅ Same. Note: students log in by admission no, which is currently rejected by the backend (`AUTH_FINAL_RUNTIME_VERIFICATION.md` §6 lists admission-no path as service-rejected); when the backend lifts that, the FE adds a new identifier-type — no architecture change. |
| **Mobile App (native)** | Tenant-scope; hits `app.schoolos.in`. | ✅ Native HTTP client attaches `X-Tenant-Slug` per device-bound tenant. The header path (`tenant-resolver.service.ts:73-81`) was designed for exactly this. |
| **API Clients (third-party)** | Tenant-scope; arbitrary origin. | ✅ Third-party clients hit the API with `X-Tenant-Slug` plus their token. Architecturally identical to the mobile case. |

**Property:** Every future module uses **one of two patterns** — host-derived (web) or header-derived (mobile/3P). No module needs a third pattern. No module needs a new env var, a new resolver branch, or a new login form.

**Forward-compatibility with SSO:** When SAML/OIDC SSO lands, the SSO callback URL will be `{slug}.schoolos.in/auth/sso/callback` (host-resolved) or `admin.schoolos.in/auth/sso/callback` (platform). The tenant binding is the same. The login form is replaced by an SSO redirect, but the post-auth `/auth/me` path is identical.

**Forward-compatibility with MFA:** MFA challenges are sequential POSTs from the same `LoginForm` lifecycle. The header path carries them. No architecture change.

---

## 12. Final Architecture Decision

**Frozen architecture:**

1. **Production:** zero frontend tenant configuration. Host alone resolves tenant. The same compiled bundle serves every school subdomain and the admin sentinel.

2. **Development (Sprints F2.2 → V1):** `NEXT_PUBLIC_TENANT_SLUG` env var + axios `X-Tenant-Slug` header injection (conditional on host not being `*.schoolos.in`). LoginForm is tenant-agnostic.

3. **Development (post-V1):** hosts-file `*.schoolos.local` with extended backend resolver. Env var retired. LoginForm and axios unchanged from prod behaviour.

4. **Migration path:** R1 → R2 → R3 → R4 → R5, in that order, in one sprint, before Sprint F2.2 begins.

5. **Login wire format (frozen):** `{ email, password, rememberMe? }`. No `schoolId`, no `tenantSlug` in the body — both fields stay supported by the backend for backward compatibility, but the FE stops emitting them.

6. **Axios responsibility (frozen):** request interceptor injects `X-Tenant-Slug` if and only if `NEXT_PUBLIC_TENANT_SLUG` is set **and** runtime host is not `*.schoolos.in`. Header rides every outbound request (login, refresh, /auth/me, business endpoints).

7. **LoginForm responsibility (frozen):** identical code in dev and prod. Knows nothing about tenancy. Submits credentials and routes via `resolveLandingPath(me)` on success.

**This is the permanent architecture for Version 1.** Any change requires an explicit unfreeze of this document and the auth module.

---

## 13. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RK-1 | A developer sets `NEXT_PUBLIC_TENANT_SLUG` in a production build by accident. | Low | Low — backend host-resolution outranks header-resolution (`tenant-resolver.service.ts:69-91`), so the stray header is ignored on prod hosts. | CI lint that warns if the env is defined in a production build. |
| RK-2 | Backend tenant resolver behaviour drifts (e.g. someone re-orders the branches and header beats host). | Low | High — would let a header override the host in prod. | Lock the resolver with unit tests asserting host precedence; flag as part of the auth module freeze. |
| RK-3 | The slug-host branch produces an inconsistency with body-`tenantSlug` (browser on `canary.schoolos.in` posts `tenantSlug: 'demo'`). | Low (FE never posts `tenantSlug` post-R3) | Medium | Already mitigated: FE never emits a body `tenantSlug` field. Backend `resolveSchoolId` prefers body → defensive only. |
| RK-4 | `wildcard *.schoolos.in` cert/DNS lapse in prod. | Low | High (auth fully unavailable to subdomains) | Infrastructure concern; outside FE scope. Documented for handoff. |
| RK-5 | Hosts-file `.local` collisions with macOS Bonjour for new engineers when R6 ships. | Medium (post-V1) | Low (diagnostic friction) | Developer guide lists known mDNS pitfalls; provide a one-line workaround (use `.localhost` TLD instead of `.local` for affected machines). |
| RK-6 | `app.schoolos.in` browser usage in the future would silently fail without the env var. | Low | Medium | Axios injection is conditional on "host is not `*.schoolos.in`" — needs revision if `app.schoolos.in` ever runs a browser SPA. Add a TODO in the interceptor. |
| RK-7 | `mustChangePassword` enforcement is FE-only — a determined user could skip the redirect. | Medium | Medium (post-R3 sprint) | Backend `mustChangePassword` enforcement is deferred (`AUTHENTICATION_FREEZE_V1.md` §9). FE adds a route guard in Sprint F2.2; full enforcement waits on backend. |
| RK-8 | Student admission-no login path is service-rejected today (`AUTH_FINAL_RUNTIME_VERIFICATION.md` §6). | Certain | Medium | Not an architecture risk — when the backend lifts the rejection, FE adds an identifier-type field. No re-architecture. |

---

## 14. Items Explicitly Deferred

These are out of scope for the R1–R5 migration and Sprint F2.2; they will be addressed in future sprints with explicit decisions.

1. **Hosts-file dev URLs (Option D / R6).** Deferred until after Version 1. Requires backend resolver extension (auth-module unfreeze).
2. **Backend `mustChangePassword` enforcement.** Deferred per `AUTHENTICATION_FREEZE_V1.md` §9. FE adds a soft route guard in F2.2; hard guard waits on backend.
3. **Student admission-no login path.** Deferred per backend service-rejection (`AUTH_FINAL_RUNTIME_VERIFICATION.md` §6). FE will add identifier-type UI when backend lifts the block.
4. **`/auth/logout-all` 500 for platform admin** (`AUTH_FINAL_RUNTIME_VERIFICATION.md` R-12). FE handles the failure gracefully (finally-clear pattern); backend fix tracked separately.
5. **Tenant-picker UX for end users who don't know their subdomain.** Not needed for V1 (every email invite carries the subdomain URL). Tracked for V2.
6. **Subdomain-vanity routing on the FE** (e.g. `canary.schoolos.in` shows a school logo before login). Tracked for V2; today every login page is generic.
7. **Multi-tenant browser sessions** (one user signed in to two schools in two tabs). Token storage is keyed per-school but localStorage is per-origin, so this currently requires two browser profiles. Tracked for V2.
8. **SSO (SAML/OIDC) callbacks.** Not in V1 scope; architecture supports it (see §11).
9. **MFA / WebAuthn.** Not in V1 scope; architecture supports it (see §11).
10. **Automated cross-persona E2E suite (Playwright/Cypress).** Out of F2.1 scope; should land alongside F2.2 dashboards.

---

## 15. Final Recommendation

1. **Adopt the frozen architecture above** as the permanent reference for all Version 1 frontend authentication.

2. **Execute R1–R5 as a single short pre-sprint** (estimated 1 day) before Sprint F2.2 starts. Order: env → axios → LoginForm → backcompat → types. R4 can be a one-line JSDoc deprecation; do not let it grow.

3. **Do not modify the backend auth module.** It is frozen and the frontend migration requires no backend change.

4. **Defer hosts-file dev URLs** until after Version 1. When adopted, it cleanly retires the env var with zero application-code change.

5. **Treat this document as canonical.** Any future authentication work that contradicts the decisions here requires an explicit unfreeze, an updated revision of this document, and a sign-off in the same way the backend auth module is unfrozen.

6. **Success criterion met:** after this review, there are no remaining open architecture questions for frontend authentication in Version 1. The remaining work is implementation (R1–R5) and feature delivery (F2.2 onward) — both of which fit inside the architecture frozen here.

---

## Stop

Issued: 2026-06-28. Review-only. No source code modified.
