# BACKEND_ARCHITECTURE

_Upstream: PRISMA_STRATEGY.md, DATABASE_DESIGN.md, MULTI_TENANT_ARCHITECTURE.md, ROLES_AND_PERMISSIONS.md. Downstream: API_STANDARDS.md, REST_API_DESIGN.md._

How the SchoolOS backend is structured, how requests flow through it, and how the cross-cutting concerns (auth, tenancy, RBAC, logging, audit) are implemented at the framework layer.

Stack: **NestJS 10+ (TypeScript) + Prisma ORM + MySQL 8.x + Redis + BullMQ**.

> **Scope.** This doc is the *implementation contract* for the backend. The *what* (entities, isolation rules, scopes) lives in `DATABASE_ARCHITECTURE.md`, `MULTI_TENANT_ARCHITECTURE.md`, `ROLES_AND_PERMISSIONS.md`, `API_STANDARDS.md`. This doc is the *how*.
>
> **No code.** Concrete TypeScript lives in the repo once Phase 1 starts.

---

## 1. Architectural posture

- **Modular monolith** — one deployable backend, organized into Nest modules with strict boundaries. Not microservices in v1. We extract a service only when a measurable scaling or deployment boundary justifies it (DECISIONS-style ADR required).
- **Layered inside each module** — controller → service → repository → Prisma. Each layer has one job; no skipping.
- **Cross-cutting concerns** are framework-level: middleware, guards, interceptors, filters. They are not re-implemented per module.
- **Tenant-safe by default** — a developer who forgets tenancy concerns still gets safe behavior (Prisma middleware injects scope; service signatures require tenant id).
- **Domain events over direct calls between modules** — modules talk via an in-process event bus (`@nestjs/event-emitter`) backed by an outbox table for cross-module side effects that must be transactional. No module imports another module's repository.

---

## 2. Tech inventory

| Concern              | Choice                                  | Reason                                                                 |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| HTTP framework       | NestJS (Express adapter)                | Opinionated DI, decorators, mature ecosystem                           |
| ORM                  | Prisma                                  | Type safety, migrations, middleware hooks for tenancy                  |
| DB                   | MySQL 8.x                               | Stack constraint                                                       |
| Cache                | Redis                                   | Per-tenant caching, idempotency keys, rate-limits                      |
| Queue                | BullMQ (Redis-backed)                   | Familiar, durable, retry primitives                                    |
| Validation           | `class-validator` + `class-transformer` | Native Nest fit                                                        |
| Logging              | Pino                                    | Fast, structured JSON                                                  |
| Tracing              | OpenTelemetry SDK                       | Vendor-neutral; ship to Jaeger / Honeycomb / Datadog                   |
| Metrics              | `prom-client` exposed at `/metrics`     | Pull from Prometheus or its API-compatible peers                       |
| Config               | `@nestjs/config` + `zod` schema         | Fail-fast on missing/invalid env vars                                  |
| Secrets              | AWS Secrets Manager (prod), `.env` (dev)| Explicit env-aware loader                                              |
| Testing              | Jest + supertest + Testcontainers       | Real MySQL + Redis in integration tests                                |
| Lint / format        | ESLint + Prettier + custom rule pack    | Tenancy and migration linters live here                                |
| Type-only build pkgs | `tsup` for shared libs                  | Fast dual-format builds                                                |

Versions are pinned in `package.json`; this doc names the role, not the SemVer.

---

## 3. Repo & folder structure

The repo is a **pnpm workspaces monorepo**:

```
schoolos-saas/
├── apps/
│   ├── backend/              # this document covers this app
│   ├── frontend/             # tenant-facing web app
│   └── frontend-admin/       # operator console
├── packages/
│   ├── shared-types/         # DTOs, enums, error codes shared backend ↔ frontend
│   ├── shared-utils/         # pure utilities (date, money, strings)
│   ├── ui/                   # frontend component library
│   └── eslint-config/        # custom lint rules incl. tenancy linter
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── infrastructure/           # Terraform / Pulumi
├── scripts/                  # one-off ops scripts
└── docs/
```

### 3.1 `apps/backend/` layout

```
apps/backend/
├── src/
│   ├── main.ts                       # bootstrap (entry)
│   ├── app.module.ts                 # root module — wires globals + features
│   │
│   ├── config/                       # env + feature config (validated via zod)
│   │   ├── env.schema.ts
│   │   ├── config.module.ts
│   │   └── feature-flags.config.ts
│   │
│   ├── core/                         # framework primitives — used by every feature
│   │   ├── prisma/                   # Prisma client + tenancy middleware
│   │   ├── tenancy/                  # ALS context, tenant resolver, request scope
│   │   ├── auth/                     # guards, strategies, decorators
│   │   ├── rbac/                     # permission registry, resolver, guards
│   │   ├── audit/                    # AuditPublisher service, decorator
│   │   ├── logging/                  # Pino setup + redaction + correlation
│   │   ├── errors/                   # error taxonomy + global filter
│   │   ├── http/                     # interceptors, pipes, common DTOs
│   │   ├── cache/                    # tenant-aware cache module
│   │   ├── queue/                    # BullMQ wiring + base job classes
│   │   ├── outbox/                   # transactional outbox publisher
│   │   ├── files/                    # signed-URL service + S3 client
│   │   └── observability/            # tracing, metrics
│   │
│   ├── platform/                     # platform-cluster modules (Super Admin scope)
│   │   ├── tenants/                  # CRUD on schools (operator console)
│   │   ├── plans/
│   │   ├── subscriptions/
│   │   ├── platform-billing/
│   │   ├── feature-flags-admin/
│   │   ├── audit-admin/              # cross-tenant audit reads
│   │   └── support/
│   │
│   ├── features/                     # tenant-cluster modules (school users)
│   │   ├── identity/                 # users, sessions, MFA, OTP
│   │   ├── tenancy/                  # schools (read), branches, settings
│   │   ├── academic/                 # academic years, classes, sections, subjects
│   │   ├── students/
│   │   ├── guardians/
│   │   ├── staff/
│   │   ├── attendance/
│   │   ├── timetable/
│   │   ├── examinations/
│   │   ├── fees/
│   │   ├── communications/           # notification templates + dispatch
│   │   ├── reports/
│   │   ├── library/
│   │   ├── transport/
│   │   ├── hostel/
│   │   ├── inventory/
│   │   ├── visitors/
│   │   ├── medical/
│   │   ├── discipline/
│   │   ├── certificates/
│   │   └── notices/
│   │
│   ├── integrations/                 # outbound third-party adapters
│   │   ├── razorpay/
│   │   ├── msg91/                    # SMS
│   │   ├── gupshup/                  # WhatsApp
│   │   ├── meta-cloud/               # WhatsApp (alt)
│   │   ├── ses/                      # Email
│   │   ├── sendgrid/                 # Email (alt)
│   │   ├── fcm/                      # Push
│   │   └── irp/                      # GST e-invoicing portal (Phase 7)
│   │
│   ├── jobs/                         # background workers (BullMQ processors)
│   │   ├── billing/
│   │   ├── notifications/
│   │   ├── reports/
│   │   ├── exports/
│   │   ├── audit/
│   │   └── cleanup/
│   │
│   └── health/                       # /health, /ready, /metrics
│
├── test/
│   ├── e2e/                          # supertest end-to-end (per feature)
│   ├── tenancy/                      # cross-tenant isolation suite
│   └── fixtures/                     # seed builders for tests
│
├── prisma/                           # symlink or relative ref to repo-root prisma/
├── package.json
└── tsconfig.json
```

### 3.2 Why these top-level boundaries

- **`core/`** — framework. Imports nothing from `features/` or `platform/`. Other code depends on it.
- **`features/`** — tenant-scoped business modules. Cannot import from `platform/`. Can import `core/` and other `features/` *only via their public service interface*, never the repository.
- **`platform/`** — Super Admin / operator-console code. Can call into `features/` services (read), but every call uses `runWithoutTenantScope(reason, fn)` and is audit-logged.
- **`integrations/`** — third-party adapters. Each behind an interface defined in `core/` or the feature that owns it. Swappable.
- **`jobs/`** — workers. Their handlers live here; their queues are registered in `core/queue/`.

These boundaries are enforced by an ESLint rule (`no-restricted-imports`) — not a convention, a hard error.

---

## 4. Module structure (anatomy of one feature module)

Every module follows the same shape. Predictability > cleverness.

```
features/students/
├── students.module.ts                # Nest module wiring
├── students.controller.ts            # HTTP routes; thin
├── students.service.ts               # business logic; tenant-aware
├── students.repository.ts            # Prisma calls; only place
├── students.events.ts                # event names + payload types this module emits/listens to
├── students.permissions.ts           # permission codes this module owns (registered with RBAC)
├── dto/
│   ├── create-student.dto.ts
│   ├── update-student.dto.ts
│   ├── list-students.query.ts
│   └── student.response.ts
├── mappers/
│   └── student.mapper.ts             # Prisma row ↔ DTO
├── policies/                         # ABAC checks beyond RBAC
│   └── student.policy.ts             # e.g., "teacher can edit only own section's students"
├── jobs/                             # any background processors owned by this module
│   └── student-promotion.processor.ts
├── tests/
│   ├── students.service.spec.ts
│   ├── students.controller.e2e.ts
│   └── students.tenancy.e2e.ts
└── README.md                         # module's own doc per DEVELOPMENT_ROADMAP rule
```

Layer contracts:

| Layer        | Responsibility                                                       | Forbidden                                                |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| Controller   | HTTP shape: routes, decorators, guards, DTO validation, response map | Business logic, DB calls                                 |
| Service      | Business rules, orchestration, events, audit emission                | Direct Prisma calls, raw HTTP, `req`/`res` access        |
| Repository   | All Prisma calls; one queries-and-mutations file per aggregate       | Business rules, cross-aggregate logic                    |
| Mapper       | Pure transforms                                                      | Side effects                                             |
| Policy       | Authorization checks beyond RBAC (object-level, ABAC)                | DB writes, audit emission                                |

A service receives `tenantId` (or the full `RequestContext`) as the **first argument** to every method. There is no global access from inside a service — `RequestContext` is passed explicitly so services are unit-testable without ALS.

Modules expose a **public service interface** (re-exported from the module file). Cross-module calls go through that interface only. Reach-into a module's repository is a lint error.

---

## 5. Request lifecycle (the pipeline)

A request flows through a strict, ordered pipeline. Every concern has exactly one place where it runs:

```
1. NGINX/ALB                  TLS termination, IP allowlist (operator console)
2. Helmet middleware          Security headers
3. CORS middleware            Origin allowlist per surface
4. Body parser                Size limits per route
5. Correlation middleware     X-Request-Id (read or generate); attach to ALS
6. Logger middleware          Request-start log line
7. Rate-limit guard           Per IP + per user + per tenant
8. Auth guard                 JWT verification, populate `req.user`
9. Tenancy middleware         Resolve tenant from JWT/host; populate ALS
10. RBAC guard                Permission check (decorator-driven)
11. Policy guard              ABAC / object-level (per-route opt-in)
12. Validation pipe           DTO + sanitization
13. Controller method         Parse, hand off to service
14. Service                   Business logic
15. Prisma + tenancy hook     Inject school_id
16. Response interceptor      Envelope, ETag, deprecation headers
17. Logger middleware         Request-end log line
18. Error filter              Translate to error envelope (last resort)
```

Steps 5–17 are NestJS-managed (middleware/guards/interceptors/filters). Step 9 is the pivot: from this point on, ALS carries the `RequestContext` (`tenantId`, `userId`, `scope`, `requestId`, `clientName`, `clientVersion`, `traceId`).

Background jobs follow the same pipeline minus HTTP: a job pulls a `RequestContext` from its payload (set when the job was enqueued) and runs through steps 9 → 15 → audit emission.

---

## 6. API strategy

Conventions live in `API_STANDARDS.md`. Backend implementation specifics:

- **Versioning**: global prefix `api` + URI versioning via `app.enableVersioning({ type: VersioningType.URI, prefix: 'v' })`. Path-based `/api/v1/*`, `/api/v2/*`. Per-controller `@Version('1')`. Deprecation/Sunset headers via the response interceptor reading a registry.
- **Routing namespaces**:
  - `/api/v1/admin/*` — operator console; protected by global-scope guard.
  - `/api/v1/{tenant}/*` or `/api/v1/*` (tenant from JWT) — tenant-scoped; default.
  - `/api/v1/auth/*` — login/refresh/MFA; scope-agnostic.
  - `/api/v1/public/*` — no-auth (e.g., signup intake, status page).
  - `/api/v1/webhooks/{provider}` — provider callbacks (Razorpay, MSG91 DLR, etc.); IP-allowlisted, signed-payload verified.
- **DTOs**: every endpoint has request and response DTOs. No leaking Prisma types past the repository. No `any`.
- **Idempotency**: write endpoints accept `Idempotency-Key` header; backend stores `(tenant_id, key, request_hash, response, expires_at)` in Redis for 24h. Replays return the stored response.
- **Pagination**: cursor by default; `?cursor&limit`. Helper service generates opaque cursors (base64 of last sort key + id).
- **Filtering / sorting**: vetted-fields-only allow-list per resource. Free-form filtering not supported (prevents query injection and accidental table scans).
- **Response envelope**: `{ data, meta?, errors? }`. ETags on read endpoints where the resource is cacheable.
- **Errors**: typed application errors thrown from services → mapped to envelope by global filter. No HTTP details inside services.
- **OpenAPI**: generated from Nest decorators + `class-validator` metadata. Published at `/api/v1/openapi.json` (admin-only) and rendered for internal use.
- **Streaming**: large exports use Node streams + chunked transfer; never load full result sets in memory.

---

## 7. Authentication strategy

### 7.1 Identities and scopes
- Two scopes: `tenant` (school users) and `global` (Super Admin / platform staff). The JWT carries `scope` and a `tenant_id` (NULL for global).
- A user is exactly one identity (DECISIONS D-015) — tenant or global, never both. Re-auth required to switch.

### 7.2 Login flows (per surface)

| Surface          | Primary credential        | MFA                         |
| ---------------- | ------------------------- | --------------------------- |
| Operator console | Email + password          | TOTP **mandatory**; WebAuthn for `super_admin` |
| School admin / staff (web) | Email or phone + password | TOTP optional; mandatory for `school_admin` of paid plans |
| Teacher (web)    | Email/phone + password    | Optional                    |
| Parent (web)     | Phone + OTP (no password) | OTP itself; biometric on mobile |
| Student (web)    | School-issued credentials | Optional                    |
| API integrations | API key (header)          | N/A; key has own rate limit |

### 7.3 Token model
- **Access token** — short-lived JWT (~10 min). Signed with rotating asymmetric keys (RS256/EdDSA). Public key advertised at `/.well-known/jwks.json` so future services can verify without sharing the private key.
- **Refresh token** — opaque, server-stored (`refresh_tokens`), 30-day TTL, **rotated on every use** (single-use). Revocation cascades on logout, password change, role change, or suspicious activity.
- **Session record** (`user_sessions`) — server-side metadata bound to the refresh token chain. Logout revokes the session.
- **Impersonation token** — tenant-scoped, ≤30 min, carries `impersonator_user_id`. Cannot be refreshed.

### 7.4 Strategies (Passport)
- `JwtStrategy` — verifies access token, attaches `req.user = { id, scope, tenantId, roles, sessionId, impersonatorId? }`.
- `LocalStrategy` — email/password.
- `OtpStrategy` — phone + OTP for parents.
- `ApiKeyStrategy` — header-based; loads the key, scopes the request.
- `WebAuthnStrategy` — for super_admin hardware keys.

A request hits exactly one strategy; the auth guard picks based on the route's `@AuthMethod()` decorator.

### 7.5 Guards
- `JwtAuthGuard` — global, opt-out per route via `@Public()`.
- `RolesGuard` / `PermissionsGuard` — see §8.
- `ScopeGuard` — rejects global-scope tokens on tenant routes and vice versa (DECISIONS D-015).
- `MfaRequiredGuard` — for high-risk routes that demand recent MFA assertion (e.g., refund, suspend tenant).

### 7.6 Other auth concerns
- **Password storage**: Argon2id with sane parameters.
- **OTP**: 6-digit, 5-min TTL, hashed at rest, rate-limited per phone (5/hour).
- **Magic links**: signed, single-use, 15-min TTL.
- **Account lockout**: 10 failed attempts in 15 min → 30-min cool-down + email notification.
- **Session inactivity**: 30 days hard cap; sliding 7 days for high-trust roles, 24 hours for super_admin.
- **JWT key rotation**: every 90 days; old `kid` accepted for the access-token TTL window.

---

## 8. RBAC strategy

### 8.1 Model recap (from `ROLES_AND_PERMISSIONS.md`)
- Roles aggregate permissions.
- A user can hold multiple roles (per branch, with validity windows).
- Effective permissions = union of role permissions ± `permission_overrides` (deny wins).

### 8.2 Permission registry
- A central registry (`core/rbac/permissions.registry.ts`) is the **single source of truth** for permission codes. Every code is registered with: `code`, `description`, `owning_module`, `category`, `is_dangerous` (forces 4-eyes).
- Modules contribute their codes via `students.permissions.ts` etc., imported at boot.
- Migration check: every code referenced in a `@Permissions(...)` decorator must exist in the registry; CI fails otherwise.

### 8.3 Decorators
- `@Permissions('students.read')` — single permission required.
- `@Permissions('students.write', 'students.read')` — all required.
- `@AnyPermission('reports.read', 'admin.reports.read')` — at least one.
- `@RequireScope('tenant' | 'global')` — scope guard hint.
- `@RequireMfa()` — recent MFA assertion required.
- `@RequireApproval('action_code')` — emits an `approvals` row instead of executing immediately; second approver triggers execution.
- `@Audit({ action, resource })` — declares audit metadata (see §11).

### 8.4 Resolution at request time
1. `RolesGuard` reads the user's role assignments (cached per session in Redis with 5-min TTL; flushed on role change events).
2. Builds the effective permission set (with branch scope applied where relevant).
3. Compares against the route's required permissions.
4. Falls through to `PolicyGuard` for object-level / ABAC checks.

### 8.5 Object-level / ABAC
Permissions answer "may this user invoke this *action*?" Policies answer "on this *object*?"

Examples:
- `students.write` ✓ but the teacher's branch ≠ the student's branch → policy denies.
- `marks.write` ✓ but the exam edit window has closed → policy denies (with override permission `marks.write.after_window`).
- `fees.refund` ✓ but amount > ₹10,000 → `@RequireApproval('fees.large_refund')` triggers.

Policies live next to the feature (`policies/student.policy.ts`). They are pure functions: `(actor, resource, ctx) → Allow | Deny | NeedApproval`.

### 8.6 Cache invalidation
A `tenant.flags.changed` or `user.roles.changed` event flushes the user's permission cache (and all caches for the tenant on flag changes). See `MULTI_TENANT_ARCHITECTURE.md` §6.1.

---

## 9. Multi-tenant middleware strategy

Tenancy is enforced in **layers** (DATABASE_ARCHITECTURE §4). The middleware layer sits between auth and business logic.

### 9.1 Tenant resolution

The tenant id is determined in this strict order:

1. **JWT claim** (`tenant_id`) — authoritative for authenticated tenant requests. If present and valid (school is `active` or `trial`), it's used.
2. **Host header** (`<slug>.schoolos.in`) — for unauth routes that need a tenant context (e.g., `/api/v1/public/<slug>/contact`).
3. **Path prefix** (`/api/v1/<slug>/...`) — fallback when sub-domain not used (DECISIONS D-002).
4. **Header `X-Tenant-Slug`** — only honored on developer/admin paths in non-production.

If sources disagree (e.g., JWT says A but host says B), the request is **rejected** with `tenant_mismatch` and logged as a `cross_tenant_probe`.

### 9.2 ALS (AsyncLocalStorage) context

A `RequestContext` is built once per request and stored in ALS:

```
RequestContext {
  tenantId: string | null   // null only for global-scope requests
  userId:   string | null   // null for /public routes
  scope:    'tenant' | 'global' | 'public'
  roles:    string[]
  permissions: Set<string>  // pre-resolved
  branchScope?: string[]    // for branch-scoped roles
  requestId: string
  traceId: string
  clientName: string        // X-Client-Name
  clientVersion: string
  ip: string
  impersonatorUserId?: string
}
```

This context is **read** (never written) downstream. Services accept it explicitly as their first argument; the framework primes it from ALS for HTTP, and from job payloads for workers.

### 9.3 Prisma middleware (the L2 enforcer)

A Prisma client middleware runs on every operation:

- **Read** ops: injects `where: { school_id: ctx.tenantId }` automatically into the top-level `where` for tenant-scoped models.
- **Create** ops: injects `school_id: ctx.tenantId` into `data`.
- **Update / delete** ops: validates that the matched rows all belong to `ctx.tenantId` (uses an internal pre-check or refuses bare ID-only operations).
- **Aggregations / raw queries**: rejected unless wrapped in `runWithoutTenantScope(reason)`.

Bypass is explicit:

- `runWithoutTenantScope(reason: string, fn: () => Promise<T>): Promise<T>` — only callable from `platform/`, jobs marked `platform_scope`, or migrations. Every call writes an audit row with `actor_scope = "global"`.

The middleware reads from a **scope registry** that maps each Prisma model to one of the four scope classes (DATABASE_ARCHITECTURE §3) — adding a new model without registering it is a startup-time error.

### 9.4 Tenant cache module

`core/cache/` exposes:

- `TenantCache.get/set(key, value, ttl)` — auto-prefixes with `cache:tenant:<tenantId>:`.
- `TenantCache.invalidate(scope)` — flushes `cache:tenant:<tenantId>:*`.
- `PlatformCache.*` — for platform-scope data.

There is no "global cache" API exposed to feature modules.

### 9.5 Event-driven invalidation

Events that mutate tenant state (`tenant.suspended`, `tenant.plan_changed`, `tenant.flags_changed`, `user.roles_changed`) are published; subscribers in `core/cache/` and `core/rbac/` invalidate accordingly. See `MULTI_TENANT §6.1`.

### 9.6 Tenancy linter

A custom ESLint rule rejects:
- `prismaClient.<model>.findMany({ where: { ... } })` outside `core/prisma/` (force repos).
- `prismaClient.$transaction` calls without a `RequestContext` argument.
- Any service method whose first parameter is not a `RequestContext` or `string` named `tenantId`.

These rules are project-level; turning them off requires a documented `// rbac-bypass:` annotation that's grep-able.

---

## 10. Logging strategy

### 10.1 Format
- **JSON, one event per line** (Pino). Logs go to stdout; collected by the platform.
- Every line carries: `ts`, `level`, `msg`, `request_id`, `trace_id`, `tenant_id`, `user_id`, `scope`, `route`, `client_name`, `client_version`, `latency_ms` (where applicable).
- Log levels: `fatal`, `error`, `warn`, `info`, `debug`. Default: `info`. `debug` only in non-prod.

### 10.2 Correlation
- `X-Request-Id` is read from the request or generated. Returned in the response headers.
- Linked to OpenTelemetry `trace_id` so logs and traces join.
- Background jobs propagate `request_id` and `trace_id` from their payload.

### 10.3 Redaction
- A redaction list is enforced in the Pino config: `password`, `token`, `secret`, `authorization`, `cookie`, `card_number`, `cvv`, `aadhaar`, `pan`, `dob`, `phone_e164` (in some routes), `email` (in some routes).
- DTOs that contain PII are flagged with a `@Sensitive()` decorator; the response interceptor sets the route's redaction policy automatically.
- Whole-payload logging is **never** done in production. Errors log a payload **shape** (keys + types), not values.

### 10.4 Sampling
- 100% of `error` and above.
- 100% of audit-relevant info events (writes).
- 10% sample of read-only `info` to manage volume; configurable per tenant for support cases.
- Trace sampling: head-based 1% in prod with always-on for errors and slow requests.

### 10.5 Retention
- Hot tier (queryable): 14 days.
- Warm tier (compressed, S3): 90 days.
- Beyond: only `audit_log` rows in MySQL (different mechanism, see §11).

### 10.6 What never logs
- Request bodies that include passwords, OTPs, payment instruments, or full PII payloads.
- Full Prisma query strings with parameters (parameter-stripped form is OK).
- Full webhook payloads from providers (excerpted; full payload only stored in `payment_provider_webhooks` / `delivery_receipts` tables behind RBAC).

---

## 11. Audit strategy

The DB design (`audit_log`, hash chain, anchors) is in `DATABASE_ARCHITECTURE §9`. This section is how the backend **produces** audit rows.

### 11.1 What gets audited

| Action                                                | Audited? | Category   |
| ----------------------------------------------------- | -------- | ---------- |
| Any write to a tenant-owned table                     | Always   | `general`  |
| Any write to a finance entity (invoice, receipt, refund, credit note, mark) | Always | `finance`  |
| Any role/permission grant or revocation               | Always   | `security` |
| Any auth event (login, logout, MFA enrol, password change) | Always | `security` |
| Tenant lifecycle (create, suspend, archive)           | Always   | `tenancy`  |
| Feature-flag toggles                                  | Always   | `general`  |
| Cross-tenant scope bypass                             | Always   | `tenancy`  |
| Failed auth attempts                                  | Always (rate-limited at the writer) | `security` |
| Read of a "sensitive" resource (e.g., medical info)   | Optional, per policy | `security` |
| Plain reads                                           | Never    | —          |

### 11.2 Producer mechanics

- **Decorator-driven**: `@Audit({ action: 'student.update', resource: 'student' })` on a service method causes the audit interceptor to record `before`/`after` snapshots and emit an `audit_log` row in the same transaction as the business write.
- **Programmatic**: `AuditPublisher.emit(ctx, event)` for cases where the decorator doesn't fit (compound operations, conditional auditing).
- **Transactional guarantee**: the audit insert is in the same DB transaction as the business write. If the business write rolls back, no audit row exists. If the business write commits, the audit row commits with it. Outbox + chain-hashing (for finance category) is computed inside the same transaction.
- **No retroactive audit**: any path that writes to a domain table without going through the audit-aware service is a bug. The repo lint rule reinforces this.

### 11.3 Hash chain (finance subset)

- Within the same transaction, the audit producer fetches the previous `row_hash` for `(school_id, category='finance', month_partition)`, computes `row_hash = SHA256(prev_hash || canonical_json(row))`, and writes both.
- A nightly anchor job writes the latest hash for the day to a WORM-policy S3 bucket; the response (object ETag, `s3://...` URL) is stored in `audit_anchors`.
- A daily verification job recomputes the chain for the past 7 days; mismatch pages on-call.

### 11.4 Audit access patterns

- Tenants read their own audit log via `/api/v1/audit/*` — RBAC permission `audit.read.tenant`.
- Super Admin reads any tenant's via `/api/v1/admin/audit/*` — permission `audit.read.cross_tenant`. Every such read is itself audited (audit-of-audit).
- Tenant export-on-demand for DPDP "right to access" produces a CSV bundle of the requesting party's audit rows.

### 11.5 What audit is **not**
- Not the metrics pipeline (that's logs + Prometheus).
- Not the analytics pipeline (that's `analytics_events`).
- Not the change-data-capture pipeline (that's a future warehouse concern).

Audit is **business non-repudiation**. It must be tamper-evident, retained per regulation, and always available in support and incident workflows.

---

## 12. Other cross-cutting concerns

### 12.1 Errors
- Domain errors are typed classes in `core/errors/` (`NotFoundError`, `ConflictError`, `BusinessRuleError`, `ForbiddenError`, `RateLimitedError`, `ValidationError`, `IntegrationError`).
- Services throw domain errors; controllers do not catch them.
- A global `HttpExceptionFilter` translates domain → HTTP envelope using a stable `error_code` taxonomy (per `API_STANDARDS.md`).
- Unknown errors map to `internal_error` with the `request_id`; the original error is logged.

### 12.2 Validation
- DTOs use `class-validator` + `class-transformer`. A global `ValidationPipe` runs with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
- Cross-field validation lives in DTO methods or custom validators.
- Domain invariants validated in services, not DTOs (DTOs validate shape, services validate meaning).

### 12.3 Transactions
- Repositories expose transactional helpers; services that span multiple repos use Prisma's `$transaction`.
- The `RequestContext` flows through transactions so middleware can still inject `school_id`.
- Long-running operations don't run in DB transactions; use the **outbox** pattern instead.

### 12.4 Outbox
- `outbox_events` table holds events to publish after a transaction commits.
- A worker polls and dispatches to the in-process event bus or external systems (webhooks).
- Idempotency on the consumer side; deduped by `event_id`.

### 12.5 Caching
- Tenant-aware (§9.4). Cached entries are short-lived (default 5 min), invalidated on the relevant event.
- Read-through pattern: `service.findById` checks cache → loads from repo → fills cache.
- Cache poisoning defense: the cache layer never accepts a value computed under a `null` tenant id.

### 12.6 Background jobs
- BullMQ queues defined in `core/queue/`. Per-queue concurrency configured.
- Job payload always carries: `tenantId`, `userId` (or `system`), `requestId` (origin), `traceId`.
- Processors restore `RequestContext` from the payload before doing work.
- Jobs are **idempotent** — payload includes a stable key; processor checks "already done" before performing.
- Retries: exponential backoff; cap configurable; failed jobs go to a DLQ inspected daily.
- Scheduled jobs (cron) defined via `@Cron(...)` on a class registered as a `JobsModule` provider; running from one node per cluster (leader election via Redis Redlock).

### 12.7 Feature flags at runtime
- `FeatureFlagsService.isEnabled(ctx, flag)` resolves role > tenant > plan > default. Cached per request (`ctx.flags`).
- A guard `@RequireFlag('module.fees')` short-circuits routes whose module is disabled for the tenant.

### 12.8 Configuration
- All env vars validated by a `zod` schema at boot. Missing/invalid → process exits.
- No env-var lookups inside business logic — only via the typed config service.
- Secrets pulled from AWS Secrets Manager in prod; rotated transparently to the app.

### 12.9 Health and observability
- `/health` — liveness (process is up).
- `/ready` — readiness (DB reachable, Redis reachable, migrations applied).
- `/metrics` — Prometheus exposition.
- Standard metrics: HTTP latency histograms, DB query latency, queue depth and processing time, cache hit rate, integration provider success rate, per-tenant credit-pool drains.
- OpenTelemetry: HTTP, DB, Redis, BullMQ, outbound HTTP all instrumented.

### 12.10 Rate limiting
- Per IP, per user, per tenant — three independent counters in Redis.
- Defaults: 60 req/min per user; 600 req/min per tenant; 1000 req/min per IP for public surfaces.
- Per-route overrides via `@RateLimit(...)`.
- Exceeding returns `429` with `Retry-After`.

---

## 13. Testing strategy

### 13.1 Pyramid
- **Unit** — services tested with mocked repos; pure functions in mappers/policies tested directly. Fast.
- **Integration** — repository + Prisma against a real MySQL via Testcontainers; verifies queries, indexes used, soft-delete behavior.
- **E2E (per feature)** — supertest against a booted Nest app + real DB + real Redis. Validates the full pipeline including guards.
- **Cross-tenant isolation suite** — a dedicated test app boots with two seeded tenants and exercises *every* route under both, confirming tenant A cannot see tenant B's data. **Runs on every PR.**
- **Contract** — OpenAPI snapshot test; breaking changes flagged in CI.
- **Performance** — k6 scripts for hot paths (login, list students, list invoices). Baselines tracked per release.

### 13.2 Test data
- A `fixtures/` builder library produces seeded scenarios (e.g., `aSchool().withStudents(50).withFees().build()`).
- Tests never share state across cases; each gets a clean transaction wrapped via Prisma's `$transaction` rollback.

### 13.3 Mandatory coverage gates
- All services covered ≥80% lines.
- Every controller has at least one e2e test.
- Every cross-tenant-relevant route is in the isolation suite.

---

## 14. Deployment & runtime topology

- **Containerized** (Docker) Node 20 LTS image, multi-stage build.
- **Orchestrator**: ECS or EKS (decided in `infrastructure/`).
- **Two roles per service**:
  - `web` — handles HTTP traffic.
  - `worker` — processes BullMQ queues and scheduled jobs.
  - Shares the same image; differs by entrypoint.
- **Horizontal scaling** based on CPU + queue depth.
- **Connection pool**: Prisma PG-Bouncer-style pool; per-process connection limit tuned to total = (max_connections / replicas) − headroom.
- **Graceful shutdown**: 30s drain on SIGTERM; in-flight requests finish; queues stop accepting new jobs and let current jobs complete.
- **Single-region in v1** (ap-south-1). Region failover plan in `DATABASE_STRATEGY §11.3` and `infrastructure/`.

---

## 15. What is intentionally **not** in this doc

- Specific Nest module decorator setups, dependency-injection wiring code.
- Concrete Prisma middleware function bodies.
- ESLint rule source.
- Sample DTOs.
- Test code.

These belong in the repo and live alongside the code that uses them. This document is the **contract** they all must obey.

---

## 16. Open architecture questions (linked to DECISIONS)

- **D-022** — Mobile token storage (Keychain / Encrypted Shared Prefs). Backend implication: refresh-token rotation must work without web cookies; current design supports it.
- **D-021** — Audit hash chain rollout: backend supports it from day one for the finance category; full coverage gated by Phase 4 launch.
- **R-001** — KMS strategy for encrypted-at-rest columns; backend exposes a `Crypto` service today with a "current key id" pointer, ready for per-tenant data keys when decided.
- **R-003** — Public SLA: backend's observability supports `/api/v1/admin/sla` once defined; v1 publishes "best effort 99.9%."

These open items are tracked in `DECISIONS.md`; this doc is updated when each resolves.
