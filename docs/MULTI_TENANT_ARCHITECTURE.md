# MULTI_TENANT_ARCHITECTURE

_Upstream: BUSINESS_RULES.md, PRODUCT_REQUIREMENTS.md. Downstream: DATABASE_STRATEGY.md, DATABASE_ARCHITECTURE.md, BACKEND_ARCHITECTURE.md._

How SchoolOS guarantees that one school never reads or writes another school's data, while still scaling to 1000+ tenants and 100k+ students on shared infrastructure.

---

## 1. Tenancy model decision

**Chosen model: Shared database, shared schema, with row-level `school_id` discrimination.**

Rejected alternatives:

| Model                          | Pros                                          | Cons                                                                        | Verdict for v1 |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| DB-per-tenant                  | Strongest isolation; per-tenant restore       | Connection pool blows up at 100+ tenants; migrations 1000x; ops nightmare   | Rejected       |
| Schema-per-tenant (MySQL)      | Some isolation; per-tenant restore            | MySQL has no real schemas; per-tenant DBs ≈ same problem                    | Rejected       |
| Shared DB + `school_id` rows   | Single connection pool; one migration; cheap  | Isolation is application-enforced — must be airtight                        | **Chosen**     |
| Shared DB + Postgres RLS       | DB-enforced isolation                         | We are on MySQL (per ERP_REQUIREMENTS); RLS not native                       | N/A on MySQL   |

We accept the trade-off: **isolation is application-enforced**, so we make enforcement systemic, redundant, and impossible to skip. See §3.

If MySQL becomes a constraint (e.g., we need RLS or per-tenant encryption-at-rest), DECISIONS.md tracks the option to migrate to Postgres or to hybrid sharding (popular tenants on dedicated DBs).

---

## 2. Tenancy primitives

### 2.1 The tenant ID
- Source of truth: `schools.id` (UUID v7 — sortable, opaque, collision-free).
- Every domain table has a non-null `school_id` column.
- Every domain table has a composite index starting with `school_id`.
- Foreign keys never cross tenants. (See §4.)

### 2.2 The tenant context
- A request enters with a JWT carrying `tenant_id` and `user_id`.
- A NestJS interceptor extracts `tenant_id` and stores it in **AsyncLocalStorage (ALS)** for the duration of the request.
- All database queries (Prisma) automatically inject `where: { schoolId: ALS.get('tenantId') }` via Prisma middleware.
- Bypassing ALS (e.g., system jobs) requires explicit opt-in via a typed `withTenantContext(tenantId, fn)` helper. Audit-logged.

### 2.3 The Super Admin context
- Super Admin requests carry `scope: "global"`.
- Cross-tenant queries are allowed only via the **AdminModule** routes; tenant-scoped routes reject `global` tokens.
- An impersonation token sets `tenant_id` to the impersonated school plus `impersonator_user_id`. It is logged.

---

## 3. Defense in depth

Tenant isolation is too important to rely on one mechanism. We layer four:

### Layer 1 — Auth boundary
- JWT carries the tenant ID claim.
- The token is issued by the auth module after authenticating against `users.school_id`.
- A user can hold tokens for only one tenant (no cross-tenant tokens).

### Layer 2 — Routing/host boundary
- Sub-domain or path identifies the tenant.
- A guard verifies the URL tenant matches the JWT tenant. Mismatch → 403, audit-logged.

### Layer 3 — Service-layer guard
- Every controller method takes a `@TenantId()` decorator parameter (resolved from ALS) and passes it explicitly to services. Services accept `tenantId` as a required argument; they do not read it from a global.
- Code review rule: a service method that does not take `tenantId` is rejected.

### Layer 4 — Data-access guard (Prisma middleware)
- Prisma middleware runs on every query. For every model that has `schoolId`:
  - Reads: forces `where.schoolId = ALS.tenantId`. If the caller already supplied a different `schoolId`, raise.
  - Writes: forces `data.schoolId = ALS.tenantId`. Mismatch → throw.
- Models without `schoolId` (platform-level: `Plan`, `FeatureFlagDefinition`, `Country`) are allow-listed.

### Layer 5 — Tests
- Every module has an integration test that:
  1. Creates two tenants A and B with same-shape data.
  2. Authenticates as a user of A.
  3. Calls the API expecting only A's data.
  4. Attempts to read B's resource directly by ID → expects 404 (not 403 — to avoid existence leakage).
- The test suite refuses to merge a module without this test.

### Layer 6 — Production canary
- A synthetic test runs in production every 5 min:
  - Two canary tenants C1 and C2 with sentinel data.
  - It calls APIs as C1 and asserts no C2 data ever appears.
- Failure pages on-call.

---

## 4. Data model rules

1. **Every table either has `school_id` or is in the platform-level allow-list.**
2. **Foreign keys never cross tenants.** When `student.parent_id → parent.id`, both `student.school_id` and `parent.school_id` must match. Enforced by a composite FK on `(parent_id, school_id)` referencing `(parent.id, parent.school_id)`. (Composite-FK pattern is verbose but airtight; the migration generator templates it.)
3. **No "global" lookup tables doubling as tenant data.** If a list (e.g., subjects) needs both default content and tenant overrides, the table is tenant-owned and seeded per-tenant on creation.
4. **Soft deletes** (`deleted_at`) are tenant-scoped; recoveries respect tenancy.
5. **All indexes** start with `school_id` for tenant-scoped queries:
   `CREATE INDEX ix_attendance_school_date ON attendance(school_id, date)`.
6. **Aggregations** (counts, sums) always filter by `school_id` first.

---

## 5. Files and storage

- S3 / object storage: each tenant has a prefix:
  `s3://schoolos-prod/<env>/tenants/<school_id>/...`
- Bucket policy denies cross-prefix access from a tenant-scoped IAM role.
- Signed URLs are tenant-checked (URL signer verifies tenant of caller vs. tenant of object).
- Backups are per-tenant exportable (tag-based).

---

## 6. Caching

- Cache keys always include `tenant_id`:
  `cache:tenant:<id>:students:list:<filters_hash>`.
- We never cache without a tenant key, even for "static" lookups, because most "static" data is tenant-owned.
- Cache invalidation is per-tenant; a cache-bust for one school does not affect others.

### 6.1 Invalidation on tenant state / plan changes

Any of the following events publishes a `tenant.invalidated` event and the cache layer flushes all keys with prefix `cache:tenant:<id>:*`:

- Subscription status change (`trial` → `active`, `active` → `suspended`, etc.)
- Plan change (entitlement flags rebuilt)
- Feature flag toggle (manual or bulk)
- Role / permission grant or revoke for a user in the tenant
- Tenant suspension or archival
- Branch added or removed

In-process caches (e.g., per-request memoization of feature-flag resolution) honor the same event via a pub/sub channel; a stale cache reading a flag right after a toggle is unacceptable for billing-sensitive flows.

---

## 7. Notifications and queues

- Every queued job carries `tenantId` in its payload and metadata.
- Consumers re-establish the tenant context (ALS) before processing.
- Per-tenant rate limits prevent one noisy tenant from starving others.
- Dead-letter queues are partitioned per tenant for easier triage.

---

## 8. Logging, metrics, traces

- Every log line includes `tenant_id` and `actor_id`.
- Every metric is tagged `tenant_id` (cardinality controlled — top-N tenants exported, the rest aggregated).
- Distributed traces propagate `tenant_id` in baggage.
- Production log search is filtered to allow looking at any tenant's logs.

---

## 9. Scaling strategy

### 9.1 Until ~200 tenants / ~30k students
- Single MySQL primary; a read replica is introduced only when reporting load warrants it (Reporting Foundation today is async/ledger-based on the primary — see DECISIONS D-031).
- Indexes on `school_id` carry us; queries are bounded per tenant.
- Background queue: single Redis + BullMQ workers.

### 9.2 200 → 1000 tenants
- Read replicas for reporting (planned; not in v1 per D-031).
- Move heavy reports to a pre-aggregated table refreshed nightly.
- Notification dispatch: dedicated workers per channel.
- Connection pooling tuned (PgBouncer-equivalent — ProxySQL for MySQL).

### 9.3 Beyond 1000 / sharding plan
- Hash-shard by `school_id` across multiple MySQL clusters. Each tenant lives entirely on one shard.
- Application layer adds a **Tenant→Shard router** (table mapping `school_id → shard_id`).
- Cross-shard queries (Super Admin only) go through a federated query layer or a BI warehouse fed by CDC (Debezium → ClickHouse/BigQuery). All of this is post-v1 — no warehouse exists today.
- Big tenants (>5k students) can be promoted to a dedicated shard or DB.

The application is **shard-ready from day one**:
- All queries are tenant-scoped.
- No cross-tenant joins exist anywhere in tenant code.
- The admin-side cross-tenant queries are isolated in `AdminModule` and can be redirected to a warehouse.

---

## 10. Disaster recovery and per-tenant operations

- **Per-tenant export**: the operator can request a full export of a tenant's data (DPDP "right to access"). Implemented as a background job that emits a zip of CSVs + a signed download link.
- **Per-tenant restore** (rare): reverse process. Requires confirmation + audit. Wipes existing rows for that tenant before insert (gated 4-eyes).
- **Per-tenant point-in-time**: not in v1. We have only DB-wide PITR. If a single tenant needs rollback, support staff use audit log + data snapshots.

---

## 11. Common pitfalls (do not regress)

- ❌ A query with no `where { schoolId }` clause and no Prisma middleware — possible to write but blocked by lint rule + middleware.
- ❌ A controller method that takes a resource ID without scoping it to the tenant. Always use `findById(tenantId, id)` patterns.
- ❌ A foreign key without `school_id` in the composite. Migrations linter rejects.
- ❌ A cache key without `tenant_id`. Code review rejects.
- ❌ A background job that fetches "all rows" without a tenant filter. Code review rejects.
- ❌ Logs printing tenant data without `tenant_id` field. Logger config enforces.

### 11.1 Cross-tenant probe detection

We actively watch for tenancy violations:

- Any 404 returned because URL-tenant-id != JWT-tenant-id is logged as `cross_tenant_probe` with severity warning.
- Any thrown `TenantMismatch` from Prisma middleware is logged as `cross_tenant_violation` with severity error and pages on-call.
- Spike detection: > 5 probes per minute from one actor → automatic session revocation + Super Admin alert.
- Quarterly red-team exercise: an authorized test attempts to read another tenant's data by every known path. Findings are tracked as bugs.

---

## 12. Reviewing changes for tenancy safety

When reviewing any PR, ask:

1. Does every new table have `school_id` (or is it allow-listed)?
2. Do all queries flow through Prisma middleware, or do they explicitly bypass it (and why)?
3. Are the integration tests asserting cross-tenant isolation?
4. Are foreign keys composite where they cross to other tenant-scoped tables?
5. Are caches keyed by tenant?
6. Are logs/metrics tagged with tenant?

If any answer is "no", the PR is not ready.
