# DATABASE_STRATEGY

_Upstream: BUSINESS_RULES.md, MODULES.md, MULTI_TENANT_ARCHITECTURE.md. Downstream: DATABASE_ARCHITECTURE.md, DATABASE_DESIGN.md, PRISMA_STRATEGY.md._

How SchoolOS stores data: engine choice, schema conventions, tenancy enforcement at the data layer, indexing, soft delete, audit, migrations, scaling.

> **Strategy vs architecture.** This doc defines the **patterns** every table follows. The concrete table list, columns, relationships, indexes, and ER explanation live in **`DATABASE_ARCHITECTURE.md`**. Read that doc for the schema; read this one for the rules every schema change must respect.

Tech stack: **MySQL 8.x + Prisma ORM**.

---

## 1. Engine choice

- **MySQL 8.x** is the primary OLTP engine (per ERP_REQUIREMENTS).
- **Redis** for cache + queue (BullMQ).
- **S3-compatible object storage** for files.
- **OpenSearch / Postgres FTS** (TBD) for tenant-scoped full-text search — defer to post-MVP if MySQL FULLTEXT indexes suffice early.
- **Read replica** of MySQL for reporting queries — planned for later scale; **not in v1**. Today's Reporting Foundation is async/ledger-based on the primary (see DECISIONS D-031).
- **BI warehouse** (ClickHouse or BigQuery via CDC) for fleet-level analytics — post-1000-tenants; no warehouse exists today.

MySQL chosen because the team and operational tooling are familiar with it, the Indian hosting market supports it well, and Prisma's MySQL adapter is mature. Trade-offs noted in DECISIONS.md (no native row-level security; we mitigate via Prisma middleware and code review).

---

## 2. Schema conventions

### 2.1 Naming
- `snake_case` for table and column names.
- Tables: plural (`students`, `fee_invoices`).
- Join tables: alphabetical, joined (`parent_students`).
- Booleans: `is_active`, `has_disability` — never negative (`is_not_paid`).
- Timestamps: `created_at`, `updated_at`, `deleted_at` (nullable) on every table.
- Soft-delete column: `deleted_at` (timestamp, nullable). NULL = live.

### 2.2 Primary keys
- **UUID v7** (`CHAR(36)` or BINARY(16) — TBD; see DECISIONS.md D-005). UUID v7 is time-sortable, indexable, opaque.
- Auto-increment used **only** for sequence-tied tables where gap-free ordering is mandated (invoices, receipts, TCs). These have a `seq INT UNSIGNED NOT NULL` column **per (tenant, fiscal_year)**, generated transactionally — see §10.

### 2.3 Tenancy column
- Every domain table includes `school_id CHAR(36) NOT NULL`.
- **Always** the first column of the primary index for that table's hot queries.
- A migration linter flag rejects any new table without `school_id` unless explicitly listed in the platform-level allow-list (`plans`, `feature_flag_definitions`, `permissions`, `roles_template`, `countries`, `gst_state_codes`, etc.).

### 2.4 Foreign keys
- Composite FKs across tenant-scoped tables: `(parent_id, school_id)` references `(parents.id, parents.school_id)`.
- The migration generator templates this pattern; manual FKs without `school_id` fail review.

### 2.5 Standard columns on every domain table
| Column        | Type            | Notes                                        |
| ------------- | --------------- | -------------------------------------------- |
| `id`          | CHAR(36)        | UUID v7 PK                                   |
| `school_id`   | CHAR(36)        | Tenant; first column of most indexes         |
| `created_at`  | DATETIME(3)     | UTC                                          |
| `updated_at`  | DATETIME(3)     | UTC, auto-updated                            |
| `deleted_at`  | DATETIME(3) NULL| Soft delete; queries filter `IS NULL`        |
| `created_by`  | CHAR(36) NULL   | User ID (nullable for system rows)           |
| `updated_by`  | CHAR(36) NULL   | User ID (last writer)                        |
| `version`     | INT UNSIGNED    | Optimistic-lock version, default 0           |

These standard columns are added by a Prisma fragment / mixin pattern — no copy-paste.

---

## 3. Tenancy enforcement at the data layer

### 3.1 Prisma middleware
- A Prisma client middleware runs on every operation.
- For every model whose schema declares `@@tenantScoped`, it:
  - Reads ALS `tenantId`.
  - For `findMany`/`findFirst`/`count`: injects `where.schoolId = tenantId`. If the caller passed a different `schoolId`, it raises.
  - For `findUnique`: rewrites to `findFirst` with composite filter `where: { id, schoolId: tenantId }`.
  - For `create`/`createMany`: forces `data.schoolId = tenantId`.
  - For `update`/`delete`: filters by `schoolId = tenantId`.
- Models without `@@tenantScoped` are checked against an explicit allow-list in code; unknown models throw.

### 3.2 Bypass paths
- A typed helper `runWithoutTenantScope(reason, fn)` exists for legitimate cases (Super Admin, system jobs, BI exports). Every call requires a `reason: string`, audit-logged. Code review rejects use without justification.

### 3.3 Read-only views (future)
- For BI warehouse exports we materialize per-tenant CSVs using the bypass path within a controlled exporter service, not from application code.

---

## 4. Indexing strategy

### 4.1 Defaults per table
- PK on `id`.
- Tenant-scoped lookup: `(school_id, ...)` for every common query shape.
- Soft-delete-friendly: filter `deleted_at IS NULL` is in queries; for very large tables, partial indexes (where supported) or a generated column.

### 4.2 Examples
- `students(school_id, admission_no)` UNIQUE — admission numbers unique per tenant.
- `students(school_id, class_id, section_id, deleted_at)` for class roster queries.
- `attendance(school_id, date, class_id)` for the daily mark-attendance screen.
- `attendance(school_id, student_id, date)` UNIQUE — one record per student per day per session.
- `fee_invoices(school_id, student_id, period_start)` for student fee history.
- `fee_invoices(school_id, status, due_date)` for defaulter scans.
- `marks(school_id, exam_id, subject_id, student_id)` UNIQUE.
- `audit_log(school_id, created_at)` partition-friendly.
- `users(school_id, email)` UNIQUE.
- `users(school_id, phone)` UNIQUE-or-multi (parents can share phone numbers — care needed; see BUSINESS_RULES §3).

### 4.3 No global indexes
- An index without `school_id` as the first column is reviewed carefully — usually only platform-level tables qualify.

### 4.4 Index hygiene
- Slow query log enabled in production.
- Weekly review of EXPLAIN plans on top 20 endpoints.
- Index changes ship via migrations — no production hotfixes.

---

## 5. Soft delete strategy

- All domain tables soft-delete via `deleted_at`.
- Default Prisma queries filter `deleted_at IS NULL` (middleware injected).
- A `withDeleted()` helper opts in (admin/audit views).
- Hard delete only at archival or explicit DPDP "right to erasure" — performed by an exporter+purger job that:
  1. Exports all rows for the tenant or subject.
  2. Anonymizes identifying columns.
  3. After retention window, hard-deletes.
- Audit log preserves the action even when underlying rows are purged.

---

## 6. Audit log

- Single `audit_log` table, tenant-partitioned logically (`school_id` first column of all indexes; physical partitioning by `created_at` monthly).
- Columns: `id`, `school_id` (nullable for platform-level actions), `actor_user_id`, `actor_scope` (`tenant` / `global`), `action`, `resource_type`, `resource_id`, `before_json`, `after_json`, `ip`, `user_agent`, `created_at`, `request_id`, `prev_hash`, `row_hash`.
- Append-only: there is no UPDATE permission in the application.
- Retention: 3 years for general; 7 years for financial actions (separate retention tag `retention=finance`).
- Read access: tenant admins see their own; Super Admin sees all.

### 6.1 Tamper-evidence (financial subset)

- For rows tagged `category = "finance"` (invoices, receipts, refunds, credit notes, fee waivers, mark edits), we maintain a **hash chain**: `row_hash = SHA256(prev_hash || canonical_json(row_without_hashes))`.
- The chain is per-tenant per-month.
- Each midnight, the latest `(tenant_id, month, last_hash)` is written to a **WORM-policy S3 bucket** (object-lock retention enforced). This produces an external anchor proving the chain existed as of date D.
- Verification job runs nightly: recomputes chain for past 7 days; alerts on mismatch.
- See DECISIONS D-021 — finance subset by Phase 4, full audit chain optional later.

### 6.2 Per-actor and per-tenant access

- Tenants can export their own audit log (CSV/PDF) — supports DPDP "right to access" for parents and internal compliance asks.
- Cross-tenant audit reads are platform-only and themselves audit-logged (audit-of-audit).

---

## 7. Numbering: gap-free sequences

For invoices, receipts, TCs:

- Table: `tenant_sequences(school_id, sequence_name, fiscal_year, last_value, updated_at)` PK `(school_id, sequence_name, fiscal_year)`.
- Atomic increment via `UPDATE … SET last_value = last_value + 1 … RETURNING last_value` inside the same transaction as the parent INSERT.
- This is **not** auto-increment. Auto-increment is per-table-global; we need per-tenant per-year.
- Throughput: at fleet scale, a single sequence row per tenant per year is fine (no school issues thousands of invoices/sec).
- Failure during the transaction → both insert and sequence increment rolled back; no gap created.

---

## 8. Migrations

- **Prisma Migrate** as the source of truth.
- One commit per migration; migrations checked into `database/migrations/`.
- **Backwards-compatible** migrations only — additive first, two-step rename, no destructive defaults.
- **No data migrations in schema migrations.** Heavy data backfills run as separate idempotent NestJS commands invoked by Super Admin.
- **Migration linter** (CI step) enforces:
  - Every new table has `school_id` (or is allow-listed).
  - Composite FKs include `school_id`.
  - `created_at`, `updated_at`, `deleted_at` present.
  - Indexes start with `school_id` for tenant tables.
- **Per-environment seed** scripts: dev/staging seeds; prod never seeded automatically.

---

## 9. Optimistic locking

- A `version INT` column on tables with concurrent edit risk: marks, attendance, fee structures, timetable.
- Update queries include `WHERE version = :expected_version` and `SET version = version + 1`. Mismatch → 409 Conflict at the API.
- Clients carry the expected version on the wire via the HTTP `If-Match: "<version>"` header (not in the request body). Missing header → `422 VALIDATION_FAILED` (`IF_MATCH_REQUIRED`); stale value → `409 VERSION_CONFLICT`. See `API_STANDARDS.md §0.2` and DECISIONS D-014.

---

## 10. Multi-tenant data partitioning roadmap

| Stage                    | Strategy                                                              |
| ------------------------ | --------------------------------------------------------------------- |
| 0–200 tenants            | Single primary; read-replica introduced only when reporting load warrants it (Reporting Foundation today is async/ledger on the primary — D-031). Indexes on `school_id`. |
| 200–1000                 | Multiple read-replicas; pre-aggregated reports tables; ProxySQL pool.  |
| 1000+                    | Hash-shard by `school_id` across MySQL clusters; tenant→shard router.  |
| Big tenants (>5k students)| Promote to dedicated shard or DB.                                     |
| BI / fleet analytics      | CDC (Debezium) → ClickHouse/BigQuery for cross-tenant queries (post-v1). |

The application layer is shard-ready from day one (no cross-tenant joins in tenant code; admin cross-tenant queries isolated in `AdminModule`).

---

## 11. Backups & restore

- Automated daily logical backups (mysqldump or Percona XtraBackup) → encrypted to S3 (different region for DR).
- Binlog point-in-time recovery for at least 7 days.
- Quarterly **restore drill**: spin up a replica from yesterday's backup; run smoke tests; tear down. Document RTO observed. Drill report stored under `docs/runbooks/dr-drill-<date>.md`.
- Per-tenant export-on-demand for DPDP compliance — see §5.

### 11.1 RPO / RTO targets

| Scenario                       | RPO         | RTO        | Strategy                                                |
| ------------------------------ | ----------- | ---------- | ------------------------------------------------------- |
| DB-wide point-in-time          | ≤ 5 min     | ≤ 4 h      | Binlog replay onto last snapshot                        |
| Full region outage (DR)        | ≤ 1 h       | ≤ 8 h      | Restore from cross-region S3 backup to standby region   |
| Single-tenant logical rollback | ≤ 24 h      | ≤ 24 h     | See §11.2 — Tenant restore primitive                    |
| Object storage corruption      | ≤ 24 h      | ≤ 12 h     | S3 versioning + cross-region replication                |

These targets are baselined; actual achieved RTO/RPO is measured in each drill and tracked.

### 11.2 Tenant restore primitive (DECISIONS D-024)

A common support ask is "restore *this one tenant* to yesterday at 14:00." We do **not** roll back the whole DB for one tenant.

- **Phase 1–4 procedure (manual, Option A):** restore the latest backup to a sidecar instance, export the tenant's rows, optionally diff against current, re-insert via the standard import path. Mandatory 4-eyes (super_admin + platform_engineer) and audit-logged.
- **Phase 7 procedure (Option B):** nightly per-tenant logical exports stored separately; restore replays export + forward-applies audit log diffs.
- The procedure is documented as a runbook (`docs/runbooks/tenant-restore.md`) — not a "we'll figure it out in the incident" plan.

### 11.3 Disaster recovery

- **Cross-region backup replication** to a second AWS region (ap-south-2 or ap-southeast-1; decision tracked in DECISIONS R-002).
- **Standby infrastructure** spec maintained as code (Terraform/Pulumi) — can be stood up cold in DR scenario; we do not pay for warm standby in v1.
- **DNS failover** plan documented; TTLs kept short (≤ 60s) for critical records.
- **Communication plan** for incidents > 15 min: status page (`status.schoolos.in`), in-app banner, WhatsApp to school admin contacts.
- **Annual full-DR exercise** (game day) starting Phase 8.

---

## 12. Encryption

- At rest: managed encryption on the MySQL instance (AWS RDS / DO managed DB).
- In transit: TLS 1.2+ for all DB connections.
- Application-level encryption for highly sensitive fields:
  - Aadhaar number (if stored): AES-256-GCM with per-tenant data keys, KMS-rooted.
  - Bank account / IFSC for staff: same treatment.
  - Passwords: Argon2id (no MD5/SHA, no bcrypt-without-pepper).

---

## 13. Performance baselines

- Reads on `students` by class: < 50ms p95 with cold cache.
- Writes (attendance bulk for 50 students): < 200ms p95.
- Heavy reports (fee defaulter list across school): < 2s with read-replica + indexed (read-replica is future per D-031; today the same target is served by async report runs against the primary).
- Slow query threshold: 500ms; logged + reviewed weekly.

---

## 14. ER overview (textual)

The full ER diagram lives in `database/er/` once schemas are written. High-level groupings:

- **Platform**: `plans`, `subscriptions`, `invoices_platform`, `payments`, `coupons`, `feature_flag_definitions`, `roles_template`, `permissions`.
- **Tenant identity**: `schools`, `branches`, `school_settings`, `school_seq`, `users`, `roles`, `role_permissions`, `user_roles`.
- **Academic**: `academic_years`, `terms`, `classes`, `sections`, `subjects`, `class_subjects`, `syllabi`, `academic_calendar`.
- **People**: `students`, `parents`, `parent_students`, `staff`, `teachers`, `qualifications`, `documents`.
- **Operations**: `attendance`, `staff_attendance`, `timetable`, `timetable_substitutions`, `holidays`.
- **Money**: `fee_structures`, `fee_components`, `fee_invoices`, `fee_invoice_lines`, `receipts`, `discounts`, `scholarships`, `fines`, `refunds`, `credit_notes`.
- **Exams**: `exams`, `exam_subjects`, `marks`, `grade_systems`, `report_cards`, `rank_rules`.
- **Logistics**: `transport_*`, `hostel_*`, `library_*`, `inventory_*`, `medical_*`, `visitor_*`.
- **Comms**: `notification_templates`, `notification_dispatches`, `delivery_receipts`, `recipient_preferences`, `credit_pools`, `credit_transactions`, `notices`, `notice_acknowledgements`.
- **Governance**: `audit_log`, `feature_flags_overrides`, `approvals`.

Detailed Prisma schema is created in Phase 1 (see DEVELOPMENT_ROADMAP).
