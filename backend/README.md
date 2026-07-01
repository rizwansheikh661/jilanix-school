# SchoolOS — Backend (`backend/`)

NestJS 11 + TypeScript 5.4 (strict) backend for SchoolOS, a multi-tenant
school ERP for Indian K-12 schools.

This README covers the **Sprint 1 modules already in tree**:

1. **NestJS Project Setup** — toolchain, lint/format, build, Docker, CI.
2. **Config Module** — Zod-validated, frozen, typed configuration.
3. **MySQL Setup** — MySQL 8 + Docker Compose, tuned for utf8mb4 / strict.
4. **Prisma Setup** — multi-file schema, 5-extension stack, seed runner.
5. **Logger Module** — Pino (JSON in prod, pretty in dev), request-id
   propagation, snake_case structured fields, PII redaction.
6. **Request Context** — `X-Request-Id` correlation, AsyncLocalStorage
   carrier, HTTP middleware that populates it before any handler runs.
7. **Audit Foundation** — `AuditService.record()`, `@Audit({...})`
   decorator + interceptor, deterministic canonical-JSON, finance hash
   chain, request-scoped intent buffer for the Prisma extension.

Subsequent sprints add Exception Filters, Response Interceptor, JWT Auth,
Refresh Tokens, RBAC, Permission Guards, and the audit anchor/WORM job.
See `../docs/SPRINT_1_PLAN.md`.

---

## Layout

```
backend/
├── apps/
│   └── api/main.ts                # bootstrap (Config → Nest → middleware → listen)
├── prisma/
│   ├── schema/                    # multi-file schema (Prisma 6 GA)
│   │   ├── _generator.prisma      # generator + datasource
│   │   ├── platform.prisma        # School, SchoolSettings, Region
│   │   ├── audit.prisma           # AuditLog (append-only), AuditAnchor
│   │   └── ops.prisma             # Outbox, IdempotencyKey, Job
│   ├── manual-migrations/         # SQL not expressible via Prisma DSL
│   │   └── 20260620_000100_apply_collation_charset.sql
│   └── seed/                      # idempotent seed runner (advisory-locked)
│       ├── index.ts               # GET_LOCK orchestrator, SEED_TARGET dispatch
│       └── platform/
│           ├── regions.ts         # IN + state lookups
│           └── canary-tenant.ts   # canary School + SchoolSettings (dev)
├── src/
│   ├── app.module.ts              # composition root
│   ├── contracts/                 # cross-cutting DTOs/types (placeholder)
│   ├── core/
│   │   ├── core.module.ts         # Config + Logger + Context + Prisma + Audit + Health
│   │   ├── config/                # Module 2
│   │   ├── logger/                # Module 5 — Pino
│   │   │   ├── pino-options.factory.ts
│   │   │   ├── redaction.ts
│   │   │   ├── correlation.ts     # X-Request-Id + traceparent + ULID
│   │   │   ├── logger.service.ts  # AppLogger (context-aware wrapper)
│   │   │   └── logger.module.ts
│   │   ├── request-context/       # Module 12/13 — ALS + HTTP middleware
│   │   │   ├── request-context.service.ts
│   │   │   ├── request-context.middleware.ts
│   │   │   ├── request-context.module.ts
│   │   │   └── helpers.ts
│   │   ├── audit/                 # Module 14 — Audit foundation
│   │   │   ├── audit.service.ts
│   │   │   ├── audit.recorder.ts  # request-scoped intent buffer (ALS)
│   │   │   ├── audit.decorator.ts # @Audit + @AuditCategory
│   │   │   ├── audit.interceptor.ts
│   │   │   ├── audit.bridge.ts    # bridge so Prisma ext can push intents
│   │   │   ├── audit.diff.ts      # diff + redaction + payload cap
│   │   │   ├── finance-chain/     # canonical JSON + sha256 chain
│   │   │   ├── repositories/audit.repository.ts
│   │   │   └── audit.module.ts
│   │   └── health/                # /health /ready /version
│   └── infra/
│       └── prisma/                # Module 4
│           ├── prisma.service.ts  # extended client + transactions + ping()
│           ├── prisma.module.ts   # @Global() module
│           ├── scope.ts           # MODEL_SCOPE registry, soft-delete & append-only sets
│           ├── errors.ts          # TenantContextMissingError, VersionConflictError, …
│           ├── types.ts           # PrismaTx, CursorPage, QueryAnnotations
│           └── extensions/        # 5-stage extension stack (apply order matters)
│               ├── correlation.ext.ts
│               ├── tenant-scope.ext.ts
│               ├── soft-delete.ext.ts
│               ├── audit.ext.ts
│               └── slow-query.ext.ts
├── scripts/
│   ├── validate-env.ts            # `npm run validate:env`
│   ├── check-env-example.ts       # CI drift-check
│   └── mysql-reset.sh             # `make db-reset` — local-only guard
├── test/
│   ├── jest-e2e.json
│   └── app.e2e-spec.ts
├── docker/
│   ├── api.Dockerfile
│   ├── docker-compose.yml
│   └── mysql/
│       ├── my.cnf                 # utf8mb4 / strict / slow-query log
│       ├── init.sql               # collation + non-SUPER app users
│       └── healthcheck.sh         # authenticated SELECT 1 (not mysqladmin ping)
├── .github/workflows/ci.yml
├── .env.example
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── .eslintrc.cjs
├── .prettierrc
├── jest.config.ts
├── Makefile
└── README.md  ← you are here
```

---

## Prerequisites

| Tool   | Version    | Notes                                          |
| ------ | ---------- | ---------------------------------------------- |
| Node   | 20.11 LTS  | pin via `.nvmrc` (`nvm use`)                   |
| npm    | 10.x       | bundled with Node 20                           |
| Docker | 24+        | only required for `make up` / image build      |

```bash
nvm install
nvm use
node -v   # → v20.11.0
```

---

## Quick start

```bash
cd backend
cp .env.example .env
npm ci
npm run validate:env         # confirms .env parses against the Zod schema

# Bring up MySQL 8 (compose service, healthchecked)
make db-up                   # = docker compose up -d mysql

# Apply migrations and seed dev data (idempotent, advisory-locked)
npm run prisma:migrate:dev   # creates the dev migration on first run
npm run prisma:seed          # SEED_TARGET=dev by default — adds canary tenant

npm run start:dev            # http://localhost:3000
```

You should see:

```
[Nest] LOG  ConfigService    Env files: .env (NN keys)
[Nest] LOG  ConfigService      app.env=development
[Nest] LOG  ConfigService      app.port=3000
...
[bootstrap] schoolos-api@0.1.0 listening on http://[::1]:3000
```

Verify the three probes (NOT under `/api/v1`):

```bash
curl -s http://localhost:3000/health  | jq
curl -s http://localhost:3000/ready   | jq
curl -s http://localhost:3000/version | jq
```

Swagger UI (gated by `SWAGGER_ENABLED`, forbidden in production):

```
http://localhost:3000/api/docs
```

---

## Available scripts

All wrapped by the `Makefile` for convenience.

| Script                       | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `npm run start:dev`          | Watch-mode dev server                                  |
| `npm run start`              | Compiled run (after `npm run build`)                   |
| `npm run build`              | TypeScript → `dist/`                                   |
| `npm run lint` / `lint:fix`  | ESLint (type-checked, banning `process.env` outside config) |
| `npm run format` / `format:check` | Prettier                                          |
| `npm run typecheck`          | `tsc --noEmit`                                         |
| `npm run test:unit`          | Jest unit tests                                        |
| `npm run test:e2e`           | Jest end-to-end smoke tests                            |
| `npm run validate:env`       | Bootstrap config and exit (used in CI / before deploy) |
| `npm run check:env-example`  | Verify every schema key is documented in `.env.example` |
| `npm run prisma:format`      | `prisma format` against `prisma/schema/*`              |
| `npm run prisma:validate`    | `prisma validate` (CI gate)                            |
| `npm run prisma:generate`    | Regenerate `@prisma/client`                            |
| `npm run prisma:migrate:dev` | Author/apply a dev migration                           |
| `npm run prisma:migrate:deploy` | Apply pending migrations (CI / staging / prod)      |
| `npm run prisma:migrate:status` | Diff DB vs `migrations/`                            |
| `npm run prisma:migrate:reset`  | **DEV ONLY** — drop and recreate                    |
| `npm run prisma:studio`      | Launch Prisma Studio at `:5555`                        |
| `npm run prisma:seed`        | Run the seed orchestrator (`SEED_TARGET=…`)            |
| `npm run db:up` / `db:down`  | Start/stop the MySQL compose service                   |
| `npm run db:reset`           | **DEV ONLY** — wipe MySQL volume + reseed              |
| `make up` / `make down`      | Docker compose API container                           |

---

## Configuration

### How config flows

1. `apps/api/main.ts` calls `ConfigService.bootstrap()` **before**
   `NestFactory.create()`. Anything that throws here aborts the process with
   a non-zero exit and a multi-line error listing **every** broken variable.
2. Files are loaded in cascade order (later wins), then validated against
   `EnvSchema` (Zod). Defaults fill in missing values; coercions normalise
   strings. The result is `Object.freeze`d.
3. `ConfigModule` (global) exposes the typed snapshot via `ConfigService`.
4. `ConfigService.logSnapshot()` runs once after `app.listen()`, writing a
   redacted summary so on-call can grep for the running configuration.

### Cascade order

```
.env
.env.<NODE_ENV>          # .env.development | .env.staging | .env.production
.env.local               # gitignored, dev/staging only
.env.<NODE_ENV>.local    # gitignored, dev/staging only
```

In `NODE_ENV=test`, the two `*.local` files are skipped so test runs are
deterministic.

### Production safety guards

`EnvSchema.superRefine` rejects production deployments that leave the
following misconfigured (each is its own validation error so all are
reported in one shot):

- `LOG_PRETTY=true` → must be `false`.
- `CORS_ORIGINS` containing `*` → wildcard forbidden.
- `FEATURE_DEBUG_ENDPOINTS=true` → must be `false`.
- `SWAGGER_ENABLED=true` → must be `false`.

### Reading config from feature code

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@core/config';

@Injectable()
export class SomeService {
  constructor(private readonly config: ConfigService) {}

  doThing() {
    if (this.config.app.isProduction) {
      // ...
    }
    return this.config.swagger.enabled;
  }
}
```

Direct `process.env.FOO` access is banned by ESLint everywhere except
`src/core/config/**` and `scripts/**`. Add new keys by editing `env.schema.ts`,
extending `types.ts`, and documenting the key in `.env.example`. CI fails if
any of those drift.

### Redaction

Anything matching `REDACTED_KEYS` or a known sensitive suffix
(`_SECRET`, `_KEY`, `_TOKEN`, `_PASSWORD`, `_DSN`, `_PEPPER`) — or a
camelCase path containing `secret`, `password`, `pepper`, `token`,
`privateKey`, `kmsKey`, `apiKey`, `dsn` — is masked as `***<last4> (len=N)`
in boot logs and any error surface.

---

## Health, readiness, version endpoints

All three are version-neutral: they live at `/health`, `/ready`, and
`/version`, **not** under `/api/v1/*`. This way, probes survive future API
version bumps.

| Endpoint    | Purpose                       | Sprint 1 behaviour                                    |
| ----------- | ----------------------------- | ----------------------------------------------------- |
| `/health`   | Liveness probe                | 200 + uptime + timestamp; relies on no dependency     |
| `/ready`    | Readiness probe               | 200 in Sprint 1; later checks DB/Redis/queues         |
| `/version`  | Build identity                | name, semver, commit SHA, build time, environment     |

`APP_BUILD_SHA` and `APP_BUILD_TIME` are injected at container build time
(`docker/api.Dockerfile`) and surfaced via `/version`.

---

## MySQL

### Compose topology

`docker/docker-compose.yml` defines two services:

- **`mysql`** — `mysql:8.0` with mounted config (`my.cnf`), init script
  (`init.sql`), an authenticated healthcheck, and named volumes for data
  and logs.
- **`api`** — depends on `mysql` with `condition: service_healthy`, so the
  API never tries to connect to a half-booted server.

```bash
make db-up        # start MySQL only
make db-shell     # `mysql -uapp -papp schoolos`
make db-down      # stop the stack
make db-reset     # DEV ONLY — wipes the data volume and reseeds
```

### Hardening (`docker/mysql/my.cnf`)

| Setting                              | Why                                                   |
| ------------------------------------ | ----------------------------------------------------- |
| `character_set_server=utf8mb4`       | Indic scripts + emoji (canary seed includes `🌱`)      |
| `collation_server=utf8mb4_0900_ai_ci`| Modern, case-insensitive, accent-insensitive          |
| `sql_mode=STRICT_TRANS_TABLES,…`     | Reject silent truncation, zero dates, division by 0   |
| `lower_case_table_names=1`           | Identical behaviour on Linux/macOS/Windows hosts      |
| `innodb_flush_log_at_trx_commit=1`   | Durable writes (financial data lives here)            |
| `slow_query_log=1`, `long_query_time=0.250` | Slow-query log surfaces N+1s and missing indexes |
| `max_allowed_packet=64M`             | Bulk imports / large attachment metadata              |

### Users (`docker/mysql/init.sql`)

- `app` — application user, **no `SUPER`/`FILE`** privileges. Owns DDL
  inside the `schoolos` database only.
- `app_ro` — read-only role used by Prisma Studio and ad-hoc queries.

### Healthcheck

`docker/mysql/healthcheck.sh` runs `SELECT 1` **as the `app` user** rather
than `mysqladmin ping`, so the probe also asserts the GRANTed user can
connect — this catches misconfigured `init.sql` early.

---

## Prisma

### Multi-file schema

Prisma 6 makes multi-file schemas GA. We point at the folder via
`package.json`:

```json
"prisma": {
  "schema": "prisma/schema",
  "seed": "ts-node --transpile-only prisma/seed/index.ts"
}
```

Files in `prisma/schema/`:

| File                  | Contents                                            |
| --------------------- | --------------------------------------------------- |
| `_generator.prisma`   | `generator client` + `datasource db` (mysql)        |
| `platform.prisma`     | `School`, `SchoolSettings`, `Region`                |
| `audit.prisma`        | `AuditLog` (append-only), `AuditAnchor`             |
| `ops.prisma`          | `Outbox`, `IdempotencyKey`, `Job`                   |

Naming follows the Prisma Strategy: PascalCase singular models map to
`snake_plural` tables (`@@map`), camelCase fields map to `snake_case`
columns (`@map`). Every TENANT_OWNED model uses `@@id([schoolId, id])`.

### Scope taxonomy

Every model is registered in `src/infra/prisma/scope.ts`:

| Scope                       | Models (Sprint 1)                                                  |
| --------------------------- | ------------------------------------------------------------------ |
| `PLATFORM_ONLY`             | `School`, `Region`                                                 |
| `TENANT_OWNED`              | `SchoolSettings`                                                   |
| `CROSS_TENANT_OPERATIONAL`  | `AuditLog`, `AuditAnchor`, `Outbox`, `IdempotencyKey`, `Job`       |

Querying a model that is not in `MODEL_SCOPE` throws — the scope
registry is the source of truth, and `PrismaService` fails fast on
typos at boot.

### Extension stack (apply order matters)

`PrismaService` extends the base client in this exact order:

1. **`correlationExt`** — stamps the active `RequestContext` onto the
   query args so downstream extensions and slow-query logs share a
   `requestId`.
2. **`tenantScopeExt`** — for TENANT_OWNED models: throws
   `TenantContextMissingError` if no `schoolId` is in context, injects
   `where.schoolId` on reads, stamps `data.schoolId` on writes, and
   throws `TenantScopeViolationError` if a caller passes a different
   `schoolId` than the context.
3. **`softDeleteExt`** — rewrites `delete` → `update({ deletedAt,
   deletedBy })` and injects `deletedAt: null` on reads (unless the
   caller explicitly opts in by passing `deletedAt`). Applies only to
   `SOFT_DELETE_MODELS = { School, SchoolSettings }`.
4. **`auditExt`** — captures before/after for mutations and pushes an
   intent into the request-scoped `AuditRecorder` buffer. The
   `AuditInterceptor` (or explicit `auditService.record(...)` inside a
   transaction) drains the buffer into `AuditLog`. `APPEND_ONLY_MODELS =
   { AuditLog }` is exempt from the audit pass to prevent recursion.
5. **`slowQueryExt`** — measures every operation with `hrtime` and emits
   `warn`/`error` logs above `DB_SLOW_QUERY_THRESHOLD_MS` (default 250 ms).

Read more in `src/infra/prisma/extensions/*.ts`.

### Using `PrismaService`

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(schoolId: string) {
    // tenantScopeExt injects schoolId; soft-delete filter is automatic.
    return this.prisma.client.schoolSettings.findFirst();
  }

  async tx(schoolId: string) {
    return this.prisma.transaction(async (tx) => {
      // tx is the un-extended Prisma.TransactionClient — extensions are
      // not active inside `transaction()`. Pass `schoolId` explicitly.
      return tx.schoolSettings.findFirst({ where: { schoolId } });
    });
  }
}
```

### `RequestContext`

Tenant scoping needs a `RequestContext` carrying `schoolId`/`userId`/
`actorScope`. The carrier and the HTTP middleware that populates it both
ship in Sprint 1 — see the [Request correlation & context](#request-correlation--context)
section below. System code that runs outside a request should use
`runWithSystemContext({ schoolId }, fn)` from `@core/request-context`.

### Migrations

```bash
npm run prisma:migrate:dev      # author + apply locally
npm run prisma:migrate:deploy   # CI / staging / prod (no DDL prompts)
npm run prisma:migrate:status   # diff against the DB
```

`prisma/manual-migrations/` contains SQL Prisma DSL can't express (e.g.
the utf8mb4 collation conversion). These are appended to a normal
migration on creation, never run standalone.

### Seeding

`prisma/seed/index.ts` is the orchestrator. It:

1. Acquires `GET_LOCK('schoolos_seed', 60)` — only one seeder can run.
2. Dispatches based on `SEED_TARGET`:
   - **`prod-core`** — lookups only (`Region`, …). Safe for any env.
   - **`staging`** — `prod-core` + masked staging fixtures.
   - **`dev`** — everything plus a canary tenant
     (`prisma/seed/platform/canary-tenant.ts`) with a 🌱 emoji marker
     that doubles as a utf8mb4 sanity check.
3. Each module exposes `apply()` and `verify()` and is idempotent —
   re-running the seed is always safe.

```bash
SEED_TARGET=dev       npm run prisma:seed   # local dev (default)
SEED_TARGET=staging   npm run prisma:seed   # staging boot
SEED_TARGET=prod-core npm run prisma:seed   # prod cold-start
```

### Optimistic concurrency

Mutable rows include a `version` column. Repository helpers (added in
later sprints) increment it on update and throw `VersionConflictError`
when the WHERE-by-version write affects 0 rows. The error class is
already exported from `src/infra/prisma/errors.ts`.

---

## Logger

Pino, wired via `nestjs-pino`. JSON in every non-dev environment; pretty
printer (`pino-pretty`) in dev and only in dev.

### Field shape (snake_case, per BACKEND_ARCHITECTURE §10.1)

| Key             | Source                                                |
| --------------- | ----------------------------------------------------- |
| `request_id`    | `RequestContext.requestId` (ULID or echoed upstream)  |
| `trace_id`      | parsed from W3C `traceparent` header                  |
| `tenant_id`     | `RequestContext.schoolId`                             |
| `user_id`       | `RequestContext.userId`                               |
| `scope`         | `RequestContext.actorScope` (`tenant`/`global`/`public`) |
| `route`         | matched route (query string stripped)                 |
| `client_name`   | `X-Client-Name` header                                |
| `client_version`| `X-Client-Version` header                             |
| `latency_ms`    | populated by pino-http on response                    |

### PII redaction

`src/core/logger/redaction.ts` lists the Pino redact paths — auth headers,
`*.password`, `*.token`, `*.mfaSecret`, `*.otp`, `*.cvv`, `*.aadhaar`,
`*.pan`, `*.cardNumber`, … — censored as `[REDACTED]`. Add new paths
**there**, not at log sites.

### Using `AppLogger` from feature code

```ts
import { Injectable } from '@nestjs/common';
import { AppLogger } from '@core/logger';

@Injectable()
export class InvoiceService {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('InvoiceService');
  }

  async issue(input: IssueInvoiceInput) {
    this.logger.info('invoice.issue.requested', { invoiceId: input.id });
    // request_id / tenant_id / scope are merged in automatically.
  }
}
```

`AppLogger` is `TRANSIENT`, so each consumer gets its own context binding.
Do not inject `PinoLogger` directly — go through `AppLogger` so the
RequestContext merge happens.

### Sampling and ignored paths

- `LOG_HTTP_EXCLUDE_PATHS` (default `/health,/ready,/version,/metrics`)
  suppresses access logs for liveness probes.
- `LOG_SAMPLE_RATE_INFO` (default `1`) keeps every info-band line. Set to
  `0.1` in busy environments to sample.
- `LOG_BASE_BINDINGS` toggles the `service`/`env`/`commit` base bindings
  on every line (off for local debugging is sometimes useful).

---

## Request correlation & context

Two AsyncLocalStorage-backed registries underpin everything else:

1. **`RequestContextRegistry`** — request-scoped tenant/actor metadata
   consumed by tenant-scope, audit, and slow-query extensions.
2. **`AuditRecorder`** — request-scoped intent buffer pushed into by the
   `auditExt` Prisma extension and drained by the audit interceptor.

### RequestContext shape

```ts
interface RequestContext {
  requestId: string;            // ULID we generated, or echoed upstream
  traceId?: string;             // from traceparent
  schoolId?: string;            // tenant id (when scope = 'tenant')
  userId?: string;
  actorScope: 'tenant' | 'global' | 'public';
  ip?: string;
  userAgent?: string;
  clientName?: string;
  clientVersion?: string;
  route?: string;               // matched route, query stripped
  method?: string;
  locale?: string;              // primary tag from Accept-Language
}
```

### Middleware pipeline

```
nestjs-pino (pino-http)  →  RequestContextMiddleware  →  controllers/services
        ↑                            ↓
    sets req.id                runs Registry.run(ctx, next)
```

- `X-Request-Id` is read case-insensitively; if absent, a 26-char ULID is
  generated. The same value is set on the response as `X-Request-Id`.
- Inbound IDs are accepted as-is when they pass an 8–128 ASCII safe-char
  check (rejected values get a fresh ULID instead).
- `traceparent` is parsed for the trace component only; we never fabricate
  trace IDs.

### From system code

```ts
import { runWithSystemContext } from '@core/request-context';

await runWithSystemContext({ schoolId }, async () => {
  await prisma.client.schoolSettings.findFirst();
});
```

Use `runInheritedContext(overrides, fn)` from inside a request to spawn
background work that should retain the same `request_id` / `trace_id`.

---

## Audit foundation

The pieces that ship in Sprint 1:

| Piece                        | Responsibility                                        |
| ---------------------------- | ----------------------------------------------------- |
| `AuditService.record(event)` | diff → redact → cap → chain hash → insert AuditLog    |
| `AuditRepository`            | thin Prisma access, also exposes `latestRowHash(...)` |
| `FinanceChainService`        | sha256 hash chain partitioned by (schoolId, category) |
| `canonicalize(value)`        | deterministic JSON (sorted keys, ISO dates, BigInt)   |
| `AuditRecorder` (ALS)        | per-request intent buffer                             |
| `auditExt` (Prisma)          | pushes intents into the buffer for write ops          |
| `AuditServiceBridge`         | module-static pointer so the extension can publish    |
| `@Audit({...})` + interceptor | declarative capture from controller/service methods  |

### Columns we write

| Column            | Notes                                                       |
| ----------------- | ----------------------------------------------------------- |
| `id`              | ULID                                                        |
| `schoolId`        | from context (`actorScope=tenant`) or explicit on the event |
| `actorId/Scope`   | from RequestContext                                         |
| `requestId`/`traceId` | from RequestContext                                     |
| `category`        | `general` \| `finance` \| `security` \| `tenancy`           |
| `action`          | dot.case verb, e.g. `invoice.issue`                         |
| `resourceType`/`Id` | model name + primary id                                   |
| `before`/`after`/`diff` | JSON, payload-capped at 64 KiB                        |
| `prevHash`/`rowHash` | sha256 chain over canonical JSON of the row              |
| `createdAt`       | server time                                                 |

### Declarative capture

```ts
import { Audit, AuditCategory } from '@core/audit';

@AuditCategory('finance')
@Injectable()
export class InvoiceService {
  @Audit({ action: 'invoice.issue', entityType: 'Invoice', idFrom: 'return.id' })
  async issue(input: IssueInvoiceInput): Promise<Invoice> {
    return this.prisma.transaction(async (tx) => {
      const invoice = await tx.invoice.create({ data: { ... } });
      // Same-tx audit (recommended for finance):
      await this.audit.record(
        { action: 'invoice.issue', category: 'finance',
          resourceType: 'Invoice', resourceId: invoice.id, after: invoice },
        { tx },
      );
      return invoice;
    });
  }
}
```

### Sprint 1 limitation: not yet same-tx by default

The `AuditInterceptor` records **after** the handler returns, outside the
caller's `prisma.transaction(...)`. That weakens the same-tx atomicity
rule from BACKEND_ARCHITECTURE §11.2. Two consequences for now:

- **Finance code must call `auditService.record(event, { tx })` inside
  its own transaction** rather than relying solely on `@Audit`.
- Audit-write failures are logged (`audit.write.failed`) but do **not**
  roll back the business write — see `audit.interceptor.ts`.

The transactional interceptor lands with Module 14 part 2 and flips
declarative audit to same-tx by default.

---

## Docker

```bash
# Build + run the API only (Sprint 1 has no DB/Redis/queue yet)
make up
make logs
make down
```

`docker/api.Dockerfile` is multi-stage:

- **builder** — installs deps, compiles TS, prunes dev deps.
- **runtime** — `node:20.11.0-alpine` + `tini`, runs as non-root user `app`,
  has a `HEALTHCHECK` against `/health`.

Build args wire the version endpoint:

```bash
docker build \
  --build-arg APP_BUILD_SHA=$(git rev-parse --short HEAD) \
  --build-arg APP_BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -f docker/api.Dockerfile -t schoolos-api:dev ..
```

---

## Testing

```bash
npm run test:unit         # ConfigService, redaction, etc.
npm run test:e2e          # boots Nest in-memory, hits /health /ready /version
```

E2E test layer:

- Forces `NODE_ENV=test` and `SWAGGER_ENABLED=false` before bootstrap.
- Verifies probes are reachable version-neutral and that 404 fires for
  unknown routes under `/api/v1/*`.

Unit coverage thresholds (60–70%) are enforced by `jest.config.ts`. Fail the
build by lowering coverage instead of relying on review vigilance.

---

## CI

`.github/workflows/ci.yml` runs on every PR/push to `main` whenever
`backend/**` changes:

1. `npm ci`
2. `lint` (ESLint, type-checked rules)
3. `format:check` (Prettier)
4. `typecheck` (`tsc --noEmit`)
5. `check:env-example` (drift between schema and `.env.example`)
6. `validate:env` (Zod accepts default env)
7. `test:unit --coverage`
8. `test:e2e`
9. `build`

A separate `docker` job builds the runtime image on `main` to catch
Dockerfile regressions early.

---

## What's intentionally NOT here yet

These belong to subsequent Sprint 1 modules and will be added in order:

- Exception filters & response envelope — Modules 6 + 7
- Auth/JWT, refresh tokens — Modules 8 + 9
- RBAC + permission guards — Modules 10 + 11
- Transactional audit interceptor (same-tx by default) — Module 14 part 2
- Audit anchor / WORM job — later in Sprint 1

Do not import from these paths — they don't exist yet.
