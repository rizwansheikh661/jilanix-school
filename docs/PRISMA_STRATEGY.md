# PRISMA STRATEGY — SchoolOS SaaS

_Upstream: DATABASE_DESIGN.md, MODEL_INVENTORY.md, DATABASE_ARCHITECTURE.md. Downstream: BACKEND_ARCHITECTURE.md, REST_API_DESIGN.md._

> How we use Prisma ORM in SchoolOS: model organization, multi-tenant enforcement, soft delete, audit, migrations, seeds, transactions, repositories, middleware, jobs, files, performance.
>
> Read this before writing any `.prisma` file or repository method. Pairs with `BACKEND_ARCHITECTURE.md` (NestJS layer), `DATABASE_DESIGN.md` (table specs), `REST_API_DESIGN.md` (consumers).
>
> Stack: **Prisma 5.x + MySQL 8.x**. Single shared database, **140 models across 25 schema files** (as of Sprint 16), `school_id` isolation on every tenant-owned row, composite FKs as defense layer 1.

---

## 1. MODEL GROUPING STRATEGY

Prisma supports **one schema file by default**, but with 140 models that becomes unreadable and merge-conflict-prone. We use **multi-file schema** (Prisma 5.15+, `prismaSchemaFolder` preview feature) and group models by domain.

### 1.1 Schema Files (actual layout)

The Prisma schema lives in `backend/prisma/schema/` as **25 domain files** plus `_generator.prisma` (datasource + generator block) and a `migrations/` folder. Every file is part of the same generation unit; cross-file relations use unqualified model names. Per-file model counts as of Sprint 16:

| #  | File                       | Models | Scope (primary)                          |
| -- | -------------------------- | -----: | ---------------------------------------- |
|  1 | `platform.prisma`          |      5 | PLATFORM_ONLY (includes `Plan` catalogue)|
|  2 | `organization.prisma`      |      2 | PLATFORM_ONLY                            |
|  3 | `schools.prisma`           |      4 | mixed                                    |
|  4 | `branches.prisma`          |      2 | TENANT_OWNED                             |
|  5 | `identity.prisma`          |      9 | mixed (users + RBAC + sessions/MFA)      |
|  6 | `flags.prisma`             |      5 | TENANT_SHARED_PLATFORM + overrides       |
|  7 | `subscriptions.prisma`     |      6 | mixed (`PlanFeature` PLATFORM_ONLY; `Subscription`, `SubscriptionHistory`, `SchoolUsage`, `UsageEvent`, `UsageThresholdState` TENANT_OWNED) |
|  8 | `audit.prisma`             |      2 | TENANT_OWNED (partitioned)               |
|  9 | `academic.prisma`          |      8 | TENANT_OWNED                             |
| 10 | `academic-content.prisma`  |      8 | TENANT_OWNED                             |
| 11 | `students.prisma`          |      6 | TENANT_OWNED                             |
| 12 | `staff.prisma`             |      8 | TENANT_OWNED                             |
| 13 | `houses.prisma`            |      2 | TENANT_OWNED                             |
| 14 | `rooms.prisma`             |      2 | TENANT_OWNED                             |
| 15 | `attendance.prisma`        |      6 | TENANT_OWNED (partitioned)               |
| 16 | `fees.prisma`              |     13 | TENANT_OWNED                             |
| 17 | `examination.prisma`       |     10 | TENANT_OWNED                             |
| 18 | `timetable.prisma`         |      8 | TENANT_OWNED                             |
| 19 | `events.prisma`            |      6 | TENANT_OWNED                             |
| 20 | `calendar.prisma`          |      3 | TENANT_OWNED                             |
| 21 | `notifications.prisma`     |      8 | TENANT_OWNED + cross-tenant ledger       |
| 22 | `files.prisma`             |      2 | TENANT_SHARED_PLATFORM                   |
| 23 | `ops.prisma`               |      7 | mixed (outbox, jobs, idempotency, sequences) |
| 24 | `reporting.prisma`         |      8 | TENANT_OWNED                             |
|    | **Total**                  | **140** |                                          |

> Earlier drafts of this doc grouped models under filenames that were never created (`billing.prisma`, `exams.prisma`, `rbac.prisma`, `modules.prisma`, `support.prisma`, `operational.prisma`). They do not exist on disk. Examinations live in `examination.prisma`; RBAC tables live in `identity.prisma`; the per-school subscription ledger (Sprint 15) lives in `subscriptions.prisma`; the `Plan` catalogue model lives in `platform.prisma`. Tenant-billing (invoices/dunning/GST), tenant↔operator support tickets, and adjacent modules (library/transport/hostel/...) are **not yet implemented**.

### 1.2 Cross-File Relations

Prisma's multi-file schema treats every file as part of the **same generation unit**. Relations across files use unqualified model names; no imports required. Conventions:

- A model lives in **the file of its primary cluster** (the one that "owns" its lifecycle).
- Relations across clusters use plain `@relation` references with explicit `name` to make the link readable from either side.
- Junction tables (`parent_student_links`, `role_permissions`, `staff_section_assignments`) live in the file of the **higher-traffic** parent.

### 1.3 Composite Keys & FKs Across Files

All within-tenant FKs are composite `(school_id, id) → (school_id, id)`. The composite is declared on the child side; the parent exposes a `@@unique([school_id, id])` to satisfy MySQL FK rules. This is enforced uniformly regardless of which file holds either side.

### 1.4 What NOT to Group

- Do **not** create a "shared.prisma" of generic enums/types. Enums live in the file of their primary domain.
- Do **not** split a single domain across files for size reasons alone. If `students.prisma` grows beyond ~600 lines, extract `student_documents` to `files.prisma` rather than `students-extras.prisma`.

---

## 2. PRISMA FOLDER STRUCTURE

```
prisma/
├── schema/                          # multi-file schema (prismaSchemaFolder)
│   ├── _generator.prisma            # generator + datasource block (single file)
│   ├── platform.prisma
│   ├── organization.prisma
│   ├── schools.prisma
│   ├── branches.prisma
│   ├── identity.prisma
│   ├── flags.prisma
│   ├── subscriptions.prisma
│   ├── audit.prisma
│   ├── academic.prisma
│   ├── academic-content.prisma
│   ├── students.prisma
│   ├── staff.prisma
│   ├── houses.prisma
│   ├── rooms.prisma
│   ├── attendance.prisma
│   ├── fees.prisma
│   ├── examination.prisma
│   ├── timetable.prisma
│   ├── events.prisma
│   ├── calendar.prisma
│   ├── notifications.prisma
│   ├── files.prisma
│   ├── ops.prisma
│   ├── reporting.prisma
│   └── migrations/                  # generated by `prisma migrate` (lives inside schema/)
│       ├── 20260618_000001_init/
│       │   ├── migration.sql
│       │   └── README.md            # human-written intent + risk notes
│       ├── 20260620_103000_add_fee_late_fine_policy/
│       └── migration_lock.toml
│
├── manual-migrations/               # SQL we author by hand (partitions, FKs Prisma can't model)
│   ├── 20260618_001000_partition_attendance_by_month.sql
│   ├── 20260618_001500_create_audit_hash_chain_trigger.sql
│   └── README.md                    # order rules; how to bake into next migration
│
├── seed/                            # programmatic seeding
│   ├── index.ts                     # entry; dispatches by env
│   ├── platform/
│   │   ├── plans.ts
│   │   ├── permissions.ts
│   │   ├── feature-flags.ts
│   │   └── countries-states.ts
│   ├── tenant/
│   │   ├── _factory.ts              # createDemoTenant()
│   │   ├── academic-year.ts
│   │   ├── classes-sections.ts
│   │   ├── students.ts
│   │   ├── staff.ts
│   │   └── fees-structures.ts
│   └── fixtures/                    # JSON/YAML reference data
│       ├── states.in.json
│       ├── boards.json
│       ├── hsn-sac.json
│       └── dlt-templates.seed.json
│
├── views/                           # CREATE VIEW SQL versioned alongside schema
│   ├── v_student_fee_balance.sql
│   ├── v_class_attendance_summary.sql
│   └── README.md
│
└── scripts/
    ├── reset-dev.ts                 # drop+migrate+seed for local dev
    ├── verify-tenant-isolation.ts   # canary: row-count parity by school_id
    ├── verify-audit-chain.ts        # walk hash chain per tenant
    └── pg-style-explain.ts          # collects EXPLAIN for top queries

src/
└── infra/
    └── prisma/
        ├── prisma.module.ts         # NestJS module
        ├── prisma.service.ts        # extends PrismaClient (with $extends)
        ├── extensions/
        │   ├── tenant-scope.ext.ts  # auto-injects school_id filters
        │   ├── soft-delete.ext.ts   # rewrites delete → update deleted_at
        │   ├── audit.ext.ts         # writes audit log on mutations
        │   ├── correlation.ext.ts   # attaches requestId to query tag
        │   └── slow-query.ext.ts    # logs queries above threshold
        ├── tracing/
        │   └── prisma-otel.ts       # OpenTelemetry spans per query
        └── types/
            ├── tenant-context.ts
            └── query-tag.ts
```

### 2.1 Why a separate `manual-migrations/`?

Prisma cannot model: native partitions, generated columns, full-text indexes, triggers, materialized views, fulltext stopwords, character-set overrides per column. We author these as SQL files. The CI step rolls them into the **next** `prisma migrate diff` output and commits the merged migration. Never run from `manual-migrations/` in production — only from `migrations/`.

### 2.2 `views/` is read-only

Views are created via `manual-migrations` and the SQL is duplicated into `views/` for diff readability. Repos never write to view-backed models; Prisma marks them `@@map` + `@ignore` to keep them out of mutations.

---

## 3. NAMING CONVENTIONS

Single source of truth so that searching for a name in DB, Prisma, and TS code all converge.

### 3.1 Database (MySQL)

- **Tables:** `snake_case`, plural — `students`, `fee_invoices`, `parent_student_links`.
- **Columns:** `snake_case`, singular — `school_id`, `created_at`, `is_active`.
- **Booleans:** prefix `is_` / `has_` / `can_` — `is_active`, `has_mfa`, `can_pickup`.
- **Timestamps:** `*_at` (UTC, `TIMESTAMP(3)`) — `created_at`, `paid_at`, `published_at`.
- **Dates:** `*_on` or `*_date` for calendar dates — `joining_date`, `valid_from`.
- **Foreign keys:** `<singular>_id` — `student_id`, `parent_id`, `school_id`.
- **Composite unique constraints:** `uq_<table>_<col1>_<col2>` — `uq_students_school_id_admission_no`.
- **Indexes:** `ix_<table>_<col1>_<col2>` — `ix_attendance_school_id_date`.
- **Foreign-key constraints:** `fk_<child>_<parent>` — `fk_fee_invoices_students`.
- **Enums (MySQL):** we use `VARCHAR(32)` + CHECK constraints rather than `ENUM` (see §4).

### 3.2 Prisma Schema (PascalCase / camelCase)

- **Models:** PascalCase singular — `Student`, `FeeInvoice`, `ParentStudentLink`.
- **Fields:** camelCase — `schoolId`, `createdAt`, `isActive`. Mapped to snake_case via `@map("school_id")`.
- **Model→table map:** every model has `@@map("snake_plural")` — `@@map("fee_invoices")`.
- **Relations:** named for clarity when ambiguous — `@relation("StudentPrimaryParent")`, `@relation("CreatedByUser")`.
- **Enums:** PascalCase singular — `StudentStatus`, `PaymentMethod`.
- **Composite ids/uniques:** `@@id([schoolId, id])`, `@@unique([schoolId, admissionNo])`.

### 3.3 TypeScript / NestJS

- **DTOs:** `<Resource><Verb>Dto` — `CreateStudentDto`, `UpdateInvoiceDto`, `QueryStudentDto`.
- **Repositories:** `<Resource>Repository` — `StudentRepository`. One per aggregate root.
- **Services:** `<Resource>Service` — `StudentService`. Orchestrate repos + outbox + events.
- **Permissions:** `<resource>.<action>` snake — `student.create`, `fee.invoice.void`.
- **Audit actions:** dot-path matching permission — `student.created`, `student.updated`, `fee.payment.captured`.

### 3.4 Common Reserved Column Names

Every tenant-owned table includes the exact same set, with identical types and order, to make repository helpers trivial:

```
id, school_id, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by, version
```

`created_by` / `updated_by` are `CHAR(36) NULL` referencing `users.id` (no FK to avoid cross-cluster cycles in writes; integrity verified by canary).

---

## 4. ENUM STRATEGY

MySQL `ENUM` is rigid: adding a value rewrites the table; renaming is impossible. We avoid it for any enum likely to evolve (status fields, categories, methods). We use it only for truly immutable taxonomies.

### 4.1 Decision Tree

| Characteristic                            | Use                                                    |
| ----------------------------------------- | ------------------------------------------------------ |
| Fixed forever (e.g. `GENDER ∈ {M,F,O}`)   | Prisma `enum` → MySQL `VARCHAR(16) + CHECK`            |
| May grow (e.g. `INVOICE_STATUS`)          | Prisma `enum` → MySQL `VARCHAR(32) + CHECK`            |
| Per-tenant configurable (e.g. fee categories) | Reference table (`fee_categories` with `school_id`) |
| Cross-tenant lookup (e.g. boards, states) | Platform reference table (`ref_boards`, `ref_states`)  |
| Free-form with autocomplete (e.g. religion) | Reference table with seed + ability to add per-tenant |

### 4.2 How We Render Enums

- **Prisma:** PascalCase enum, UPPER_SNAKE values — `enum StudentStatus { ACTIVE INACTIVE GRADUATED TC_ISSUED EXPELLED }`.
- **MySQL:** `VARCHAR(32) NOT NULL` + `CHECK (status IN ('ACTIVE',...))` named `chk_<table>_<col>`.
- **API:** sent over the wire as the same UPPER_SNAKE string. Display strings are resolved in the frontend i18n bundle (`enums.student.status.ACTIVE = "Active"`).

### 4.3 Adding / Renaming Enum Values

1. **Add a value:** schema change + migration adds value to CHECK; deploy backend before frontend; mention in release notes.
2. **Rename:** add the new value, deploy a dual-read service for one release, backfill rows, then drop the old value in a follow-up migration. Never rename in-place.
3. **Remove:** mark as deprecated in a comment for one release; ensure no rows have it via a guard query in the migration; then remove from CHECK.

### 4.4 Enums That Already Exist (anchor list)

`StudentStatus`, `Gender`, `BloodGroup`, `Relation`, `AcademicYearStatus`, `AttendanceStatus`, `LeaveStatus`, `LeaveType`, `FeeFrequency`, `InvoiceStatus`, `PaymentMethod`, `PaymentStatus`, `RefundStatus`, `ExamType`, `MarksEntryStatus`, `ResultStatus`, `NotificationChannel`, `NotificationStatus`, `MessageCategory`, `JobStatus`, `OutboxStatus`, `WebhookStatus`, `RoleScope`, `TenantStatus`, `SubscriptionStatus`, `DunningState`, `FeatureFlagSource`, `AuditCategory`, `ActorType`, `TimetableEntryType`.

(Full catalogue lives in `notifications.prisma` etc., but every enum is also exported as a TS type from a single barrel `src/contracts/enums.ts` to keep validation in sync with Prisma.)

---

## 5. MULTI-TENANT STRATEGY

Defense in depth — Prisma is **layer 4** of 7 (after composite FKs L1, middleware L2, service guards L3). Repositories never trust callers; the extension forcibly applies `school_id` filters on every tenant-owned model.

### 5.1 Scope Classes (recap from DATABASE_ARCHITECTURE)

| Class                       | Examples                                | Filter rule                              |
| --------------------------- | --------------------------------------- | ---------------------------------------- |
| `TENANT_OWNED`              | students, fee_invoices, attendance      | MUST filter by `schoolId`                |
| `TENANT_SHARED_PLATFORM`    | plans, permissions, feature_flag_defs   | Read-only for tenants; no filter         |
| `PLATFORM_ONLY`             | tenants, platform_invoices, audit_chain | Reject tenant access entirely            |
| `CROSS_TENANT_OPERATIONAL`  | notification_credit_ledger              | Filter by `schoolId` when actor=tenant   |

Each Prisma model declares its class via a custom comment annotation that the **`tenant-scope.ext.ts`** parses at boot:

```
/// @scope TENANT_OWNED
model Student { ... }
```

### 5.2 Request Context

`AsyncLocalStorage` carries `{ schoolId, userId, actorType, roleIds, permissions, requestId, impersonating? }` per request. The Prisma extension reads this on every query. If a `TENANT_OWNED` query runs without a `schoolId` in context, it **throws** `TenantContextMissingError` (caught by a global filter → `500 INTERNAL_ERROR` with alert).

### 5.3 Automatic Filter Injection

For every `findUnique` / `findFirst` / `findMany` / `count` / `aggregate` / `groupBy` on a `TENANT_OWNED` model, the extension merges `where: { schoolId: ctx.schoolId, AND: caller.where }`. Caller-supplied `schoolId` MUST equal `ctx.schoolId`; mismatches throw `TenantScopeViolationError` → fires a high-severity alert and counts toward the cross-tenant-probe metric.

### 5.4 Automatic Write Stamping

For `create` / `createMany` on `TENANT_OWNED` models, the extension stamps `schoolId`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`. Callers cannot override `schoolId`; the extension rejects writes where a different `schoolId` is supplied.

### 5.5 Composite FK Awareness

Prisma cannot enforce composite FK shapes itself, but the extension validates: any field name ending in `_id` on a tenant-owned model with a relation MUST also be accompanied by `schoolId` in the same row. The DB schema enforces it via FK; the extension fails fast at runtime so we don't blow up at COMMIT.

### 5.6 Platform Escape Hatch

Some flows legitimately need cross-tenant reads (Super Admin search, finance rollups). They opt out explicitly:

```ts
prisma.$withTenantScope({ skip: true }).student.findMany({ where: ... })
```

Granting `skip: true` requires `platform.*` permissions; the extension verifies, audit-logs the bypass, and emits a `tenant.scope.bypass` event with reason.

### 5.7 RawQuery Discipline

`$queryRaw` and `$executeRaw` are **banned** in feature modules. They are allowed only inside `src/infra/prisma/raw/` files, each annotated with a top-of-file `// @tenant-safe schoolIdParam=1` comment that the lint rule verifies.

### 5.8 Connection / Transaction Pinning

Within a single HTTP request, **all Prisma calls share one transaction** (see §10). The tenant scope context is captured at transaction start; nested calls inherit it. Long-running background jobs receive an explicit `TenantContext` argument that the worker pushes into ALS before opening Prisma.

### 5.9 Cache Invalidation

Tenant state changes (`tenants.status`, plan change, flag override) invalidate:
- Permission cache (key: `perm:<userId>`)
- Flag cache (key: `flags:<schoolId>`)
- Tenant settings cache (key: `tenant:<schoolId>`)

Invalidation happens **inside** the same DB transaction via a Redis pipeline scheduled on the outbox commit hook.

---

## 6. SOFT DELETE STRATEGY

We soft-delete almost everything tenant-owned to support audit, restore, compliance erasure with delay, and accidental-deletion recovery.

### 6.1 What gets soft-deleted vs hard-deleted

| Category                                    | Rule                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| Tenant master data (students, staff, fees)  | Soft delete                                              |
| Configuration (classes, sections, subjects) | Soft delete; reject if dependents exist                  |
| Transactional records (attendance rows)     | Soft delete only via parent (date lock); never per-row  |
| Audit logs                                  | **Never delete** (append-only)                           |
| Outbox / webhook events                     | Hard delete after retention window (30 days)             |
| Session / refresh tokens                    | Hard delete on revoke                                    |
| OTP, idempotency keys                       | Hard delete on TTL expiry                                |
| Notification messages                       | Soft delete for archive; raw bodies purged after 90 days |
| File uploads                                | Soft delete row + S3 lifecycle moves blob to Glacier     |

### 6.2 Schema Shape

Every soft-deletable model has:

```
deleted_at  TIMESTAMP(3) NULL,
deleted_by  CHAR(36) NULL,
```

All unique constraints that could otherwise prevent re-creating a "deleted" record include `deleted_at` via a generated column trick (see §6.4).

### 6.3 Extension Behaviour

The `soft-delete.ext.ts` extension rewrites:

- `prisma.student.delete({ where })` → `update({ where, data: { deletedAt: now, deletedBy: ctx.userId } })`
- `prisma.student.deleteMany({ where })` → `updateMany({ where: AND(where, deletedAt: null), data: {...} })`
- All read methods inject `deletedAt: null` automatically.

Restoring uses an explicit method: `repo.restore(id)` — never a magic flag.

### 6.4 Unique Constraints + Soft Delete

MySQL does not allow partial unique indexes. We use a **generated stored column** to combine the natural key with `deleted_at`:

```
admission_no             VARCHAR(40)  NOT NULL,
deleted_at               TIMESTAMP(3) NULL,
admission_no_active      VARCHAR(80)  GENERATED ALWAYS AS
                         (IF(deleted_at IS NULL, CONCAT(school_id, ':', admission_no), NULL))
                         STORED,
UNIQUE KEY uq_students_admission_active (admission_no_active)
```

This allows re-using the admission number after a soft-delete (TC-issued student re-admitted years later) while preventing duplicates among active rows.

### 6.5 Hard Delete (Tombstone Purge)

A scheduled job (`tombstone-purger.job.ts`) runs nightly and hard-deletes rows with `deleted_at < now - retentionDays`. Retention defaults per table; e.g. students=2920 days, attendance=730 days (after parent date is unlocked), outbox=30 days. Each purge writes an audit entry `<resource>.purged` with row counts.

### 6.6 DPDP / Right to Erasure

A separate "**erase**" flow (legal request) hard-deletes PII columns immediately (using `UPDATE ... SET name=NULL, ... WHERE id=?`) and writes an audit record with a sealed reason. Soft-delete and erase are different operations; never conflate.

### 6.7 Cascades

Prisma supports `onDelete: Cascade`, but we **do not use it** for tenant-owned models — risky and silent. We enforce dependency rules at the service layer (reject if children exist). For platform-owned cleanup (e.g. tenant purge), a dedicated `TenantPurgeJob` deletes in dependency order in batches of 1000.

---

## 7. AUDIT STRATEGY

Append-only audit log per tenant; finance subset is hash-chained and anchored to WORM S3 daily.

### 7.1 What Generates Audit Records

- **Decorator-driven:** `@Audit({ action: 'student.updated', category: 'ACADEMIC' })` on service methods.
- **Extension-driven:** the `audit.ext.ts` Prisma extension catches `create/update/delete` on any model marked `/// @audit` and writes an entry with `before`/`after` diff.
- **Manual:** services may call `auditService.record(...)` for non-CRUD events (login, MFA enrolment, impersonation, plan change).

### 7.2 Transactional Coupling

Audit rows are written **inside the same Prisma transaction** as the mutating SQL. No audit row means no business change committed. The extension uses `$transaction` interactive mode to ensure ordering. If the audit write fails, the entire transaction rolls back.

### 7.3 Before / After Diff

The extension fetches the row inside the transaction (snapshot read), executes the update, then writes the diff as `JSON_OBJECT` of only changed columns. Sensitive columns (`password_hash`, `mfa_secret`, raw tokens) are redacted to `"***"` via an allowlist.

### 7.4 Hash Chain (Finance Subset)

Audit entries with `category = 'FINANCE'` participate in a per-tenant hash chain:

```
hash = sha256(prev_hash || canonical_json(entry))
```

`prev_hash` is fetched with `SELECT ... FOR UPDATE` on the latest finance audit row for the tenant within the same transaction. A nightly job (`audit-anchor.job.ts`) writes the latest hash + signed timestamp to a WORM-locked S3 bucket and stores the receipt in `audit_anchors`. The verify endpoint (`GET /api/v1/audit/finance/verify`) re-walks the chain.

### 7.5 Audit Read Path

Audit reads bypass tenant scope filters internally (handled by `AuditRepository` with explicit `schoolId` argument) — but the API layer enforces tenant boundaries. Cross-tenant reads require `platform.audit.read`.

### 7.6 Retention & Partitioning

Audit table is partitioned by `RANGE (TO_DAYS(occurred_at))` monthly. We retain general audit 5 years, finance 8 years, security 5 years. Old partitions are exported to S3 + dropped via the partition-rotation job.

### 7.7 Performance Considerations

- Audit writes batched into the same transaction; no separate connection.
- Hash-chain rows have an exclusive serialization point per tenant; capped at a few hundred finance writes/sec/tenant — acceptable for the workload.
- Diff payloads capped at 64KB; over that, store as a file in `audit_payloads` table with FK.

---

## 8. MIGRATION STRATEGY

We use `prisma migrate` for the 90% case and **hand-written SQL** for the rest. Production migrations are always **zero-downtime, expand-then-contract**.

### 8.1 Environments & Commands

| Environment | Command                                                  |
| ----------- | -------------------------------------------------------- |
| Local dev   | `prisma migrate dev` (allows reset)                      |
| CI shadow   | `prisma migrate diff --from-schema --to-migrations` lint |
| Staging     | `prisma migrate deploy` (no dev features)                |
| Production  | `prisma migrate deploy` via ops runbook (see §8.6)       |

`migrate reset` is **banned** in any env above local.

### 8.2 Migration Naming

`YYYYMMDD_HHMMSS_<imperative_snake_case_summary>` — e.g. `20260618_103000_add_fee_late_fine_policy`. The directory contains `migration.sql` (Prisma's diff) and a **mandatory** `README.md` describing intent, blast radius, rollback plan, and whether the migration is online.

### 8.3 Expand → Migrate → Contract

Every non-trivial change ships in **three deploys**:

1. **Expand:** add the new column/table/index (nullable / additive). Backend writes both old and new shapes.
2. **Backfill:** background job (see §13) copies data. Verify with a count-equality query.
3. **Contract:** drop the old column / make new column NOT NULL / remove dual-write code.

A single PR creates only one migration; the three steps land in separate PRs across releases.

### 8.4 Online-DDL Rules (MySQL 8)

- `ADD COLUMN` (nullable / with default) → online (INSTANT for fixed-width).
- `ADD INDEX` → online (INPLACE).
- `DROP COLUMN` → online (INPLACE), but rejected on tables >100M rows without an off-hours window.
- `MODIFY COLUMN` changing nullability / type → **rejected** by migration linter; must be done via shadow column + backfill + cutover.
- `ALTER TABLE ... CONVERT TO CHARACTER SET` → forbidden in a normal migration; offline only.

### 8.5 Migration Linter (CI gate)

A custom script (`scripts/lint-migration.ts`) parses each `migration.sql` and rejects:
- `DROP TABLE` not preceded by a `_DEPRECATED_` rename in a prior migration.
- `DROP COLUMN` on hot tables (allowlist) without a "/* online: NO, off-hours */" header.
- `MODIFY COLUMN` that narrows type or flips NULL.
- Missing `CHECK` constraints for enum-typed columns.
- Any `DELETE FROM` (data migrations belong in seed/backfill jobs, not migrations).

### 8.6 Production Runbook

1. Announce in ops channel (link to PR + migration README).
2. Run `prisma migrate status` against prod — confirm pending matches PR.
3. Apply during quiet window (02:00–05:00 IST).
4. Run smoke checks: a) row counts on touched tables, b) sample query latency, c) error rate.
5. Tag deploy with migration hash.
6. If failure: rollback per the README plan (usually "expand was safe, leave new column unused"). Never `DROP` to roll back.

### 8.7 Cross-Region & Replica Lag

For multi-AZ MySQL: schema changes are applied to writer first; replicas catch up. For changes that re-write tables (>1GB), we run via `gh-ost` or `pt-online-schema-change` from the manual-migrations track to avoid replica stalls.

### 8.8 Versioning of Manual SQL (views, triggers, partitions)

Each `manual-migrations/*.sql` carries a header:

```sql
-- intent:     Partition attendance by month on RANGE(TO_DAYS(date))
-- online:     yes (initial creation), reorganize partition: yes
-- rollback:   ALTER TABLE attendance REMOVE PARTITIONING
-- depends_on: 20260618_000001_init
-- author:     <name>
-- ticket:     SCH-142
```

Prisma's `_prisma_migrations` ledger does not track these; we maintain a parallel `_manual_migrations` table populated by the deploy script with a checksum.

### 8.9 Seeds vs Migrations

Seeds are **NEVER** migrations. Reference-data inserts (states, boards, permissions, plans) belong in `seed/` and are re-applied idempotently. Migrations are pure DDL + structural data only.

---

## 9. SEED DATA STRATEGY

Three audiences for seeds: **production reference data** (must run), **demo tenant fixtures** (optional, marketing/sales), **local dev quickstart** (always).

### 9.1 Layered Seed Sets

| Layer            | Always run? | Contents                                                       |
| ---------------- | ----------- | -------------------------------------------------------------- |
| `platform/core`  | Yes (prod)  | Permissions catalogue, role definitions, feature-flag defs, plans (public), system templates, reference tables (states, boards, HSN/SAC) |
| `platform/demo`  | No          | A "Showcase Public School" tenant for sandbox env              |
| `tenant/onboarding-defaults` | Run at school create | Default subjects, default classes 1-12, default fee heads, default DLT templates |
| `dev/fixtures`   | Local only  | 1 demo tenant, 50 students, 5 staff, sample exams              |

### 9.2 Idempotency

All seed functions use `upsert` keyed by a stable natural key (`code` / `slug`). Re-running the seed never duplicates. Each seed module exports `{ apply, verify }` and the runner calls `verify` after `apply` to assert intended state.

### 9.3 Tenant-Onboarding Seeds (special path)

When a new tenant is created, `tenant/onboarding-defaults` runs **inside** the tenant-creation transaction (or via outbox+job for heavier sets). It uses the `prisma.$withTenantScope({ override: schoolId })` helper to write tenant-owned rows safely.

### 9.4 Environment Targeting

`prisma/seed/index.ts` switches on `SEED_TARGET`:

```
SEED_TARGET=prod-core  → platform/core only
SEED_TARGET=staging    → platform/core + platform/demo
SEED_TARGET=dev        → platform/core + dev/fixtures
```

Production CI/CD runs `prod-core` after every `migrate deploy`. The seed runner uses advisory locks (`SELECT GET_LOCK('schoolos_seed', 60)`) so concurrent deploys don't race.

### 9.5 Reference Data Source-of-Truth

JSON files under `prisma/seed/fixtures/` are the source of truth, version-controlled. Updating `hsn-sac.json` and merging triggers a CI job that creates a follow-up PR with the upsert diff for review.

### 9.6 Sensitive Seeds

No real PII in seeds. Demo phone numbers use the `+9180000xxxxx` test range; demo emails use `*@example.test`. The seed runner refuses to run in prod with a `SEED_INCLUDES_FIXTURES=true` envvar.

### 9.7 Validation

Each seed module declares a Zod schema for its fixture file; the runner validates before insert. Bad fixture → CI fails before merging.

---

## 10. TRANSACTION STRATEGY

We default to interactive transactions for any multi-statement write, and we strongly prefer **one transaction per request** for HTTP write endpoints.

### 10.1 Transaction Patterns

| Pattern                          | When to use                                                   |
| -------------------------------- | ------------------------------------------------------------- |
| **Single-statement** (no tx)     | Pure reads, simple `create`/`update`/`delete` with no audit  |
| **Request-scoped interactive**   | All HTTP `POST/PUT/PATCH/DELETE` handlers                    |
| **Batch interactive**            | Bulk imports, invoice generation jobs                        |
| **Sequential `$transaction([])`**| When a small set of independent writes must commit together   |
| **Distributed (saga)**           | When external systems are involved (payment, SMS) — use outbox, not 2PC |

### 10.2 Default: Request-Scoped Transaction

The NestJS `TransactionInterceptor` wraps each write handler in `prisma.$transaction(async (tx) => { ... })`. Services receive `tx` via the request context; repositories use `tx` instead of the root `PrismaClient`. Reads inside the same request also flow through `tx` to read-your-writes correctly.

### 10.3 Isolation Level

Default: `REPEATABLE READ` (MySQL default). For financial flows requiring strict serializability (refund processing, hash-chain audit append), we explicitly use `SERIALIZABLE`:

```ts
prisma.$transaction(fn, { isolationLevel: 'Serializable', timeout: 8000 })
```

### 10.4 Timeouts & Retries

- HTTP request transactions: timeout **5s**. Anything longer is a job, not a request.
- Background jobs: timeout **30s** per transaction; jobs split work into batches of 200-1000 rows.
- Retries on `40001` (deadlock) / `1213` (MySQL deadlock) / `P2034` (Prisma write conflict): **up to 3 times** with exponential backoff (50ms, 200ms, 800ms). Transient connection errors retried once.

### 10.5 Locking

- Default: optimistic concurrency via `version` column on contested entities (marks, attendance, fee_structures, timetable, student profile). The repository's `update` method increments `version` and uses `WHERE id = ? AND version = ?`; zero affected rows → throw `VersionConflictError` → 409.
- Pessimistic locks (`FOR UPDATE`) reserved for: fee invoice → payment apply, audit hash-chain append, sequence allocation. Acquired in a defined order to avoid deadlocks (see §10.7).

### 10.6 Outbox in Transactions

Any side effect (notification, webhook, search index) is written as an **outbox row** in the same transaction. A separate dispatcher publishes outbox events after commit. This is the only acceptable way to coordinate Prisma + external systems.

### 10.7 Lock Ordering

Defined global order to prevent deadlocks across services:

```
tenants → academic_years → classes → sections → students → fee_invoices → fee_payments → audit
```

Any transaction touching multiple aggregates acquires locks in this order. The repository linter flags writes that violate ordering.

### 10.8 Read Replica Strategy

Reads default to the primary; we'll introduce a replica when scale demands. The Prisma client is then constructed with a `$replica` extension; read-only repos opt in explicitly. We never read replica inside a write transaction.

### 10.9 What Not to Do

- No `$transaction([])` array form for >5 statements — switch to interactive.
- No nested transactions — Prisma will silently flatten; logic gets surprising. Pass `tx` down explicitly.
- No `await Promise.all(prisma.x, prisma.y)` writes outside a transaction — partial failure leaves data inconsistent.
- No long-running transactions wrapping HTTP calls or job loops.

---

## 11. REPOSITORY PATTERN STRATEGY

We adopt **light repositories**: one repository per aggregate root, exposing a stable query API. Services orchestrate; repositories own data access; Prisma is an implementation detail.

### 11.1 Why repositories?

- Centralise tenant scope, soft-delete, and audit conventions per entity.
- Make services testable with in-memory fakes.
- Keep Prisma types out of feature code; only DTOs and domain entities cross boundaries.
- Give us one place to add caching, optimistic locking, and query metrics.

### 11.2 Standard Repository Shape

```
StudentRepository
  findById(id): Promise<Student | null>
  findManyByQuery(query: StudentQuery): Promise<Page<Student>>
  findManyByIds(ids): Promise<Student[]>
  create(input: CreateStudentInput): Promise<Student>
  update(id, version, patch: UpdateStudentInput): Promise<Student>
  softDelete(id, reason): Promise<void>
  restore(id): Promise<Student>
  exists(id): Promise<boolean>
  countByQuery(query): Promise<number>
```

No `findAll`, no `raw`, no `transaction` exposed from repo. Transactions are handled by the interceptor; repo methods accept an optional `tx` parameter.

### 11.3 Layering Rules

- **Controllers** ↔ DTOs only (validated with class-validator / Zod).
- **Services** ↔ Domain entities (plain TS classes) + repository interfaces.
- **Repositories** ↔ Prisma models. Convert Prisma rows → domain entities on read; entity → Prisma create/update args on write.
- Prisma types **never** leak above the repository.

### 11.4 Query DSL

Each repo defines a typed `XQuery` shape (e.g. `StudentQuery = { classId?, status?, q?, cursor?, limit?, sort? }`). The repo translates this to Prisma `where`/`orderBy`/`take`/`cursor`. Public APIs accept the same shape, so swapping the persistence engine is a localised change.

### 11.5 Cursor Pagination Helper

A shared `paginateByCursor(tx, model, args, cursorKey='id')` helper enforces:
- `limit` clamped to [1, 200], default 50.
- Cursor opaque (base64 of `{id, sortKey}`); decoded by the helper.
- Always returns `{ items, nextCursor, prevCursor }`.

### 11.6 Caching at the Repository Edge

Cache reads with explicit keys; never auto-cache. Patterns:
- `findById` → wrap with Redis when invalidation is well-defined (tenant settings, plan, flag defs).
- `findManyByQuery` → never cache (too many cardinality combinations).
- Invalidation triggers piggyback on the transaction's outbox commit.

### 11.7 Cross-Aggregate Joins

Cross-aggregate reads belong in **query services** (CQRS-lite read models), not repositories. Example: `StudentDashboardQueryService.getDashboard(studentId)` fans out to student, attendance, fees, exams repos with a shared `tx`. Repos don't know about each other.

### 11.8 Repo Testing

Each repo has integration tests against a real MySQL (via Testcontainers) covering: scope enforcement, soft-delete behaviour, version conflict, composite FK violations, and pagination edge cases. Unit tests with Prisma mocks are forbidden — too fragile.

### 11.9 Naming & Location

```
src/features/<domain>/
  <domain>.controller.ts
  <domain>.service.ts
  <domain>.repository.ts
  <domain>.module.ts
  dto/
  entities/
  events/
```

---

## 12. PRISMA MIDDLEWARE STRATEGY

We use **Prisma Client Extensions** (`$extends`) — the modern replacement for `$use` middleware. Five composable extensions stacked on the base client.

### 12.1 Extension Stack (in apply order)

| # | Extension              | Responsibility                                                            |
| - | ---------------------- | ------------------------------------------------------------------------- |
| 1 | `correlationExt`       | Attach `requestId`, `userId`, `schoolId` as query tags (for slow-query logs and OTel spans) |
| 2 | `tenantScopeExt`       | Inject `schoolId` filter on reads; stamp `schoolId`, `createdBy`, etc. on writes; reject violations |
| 3 | `softDeleteExt`        | Rewrite deletes; inject `deletedAt: null` on reads                        |
| 4 | `auditExt`             | Capture before/after diff; write audit row in same transaction            |
| 5 | `slowQueryExt`         | Log + metric queries exceeding threshold; sample explain plan on top offenders |

Stack order matters: tenant scope **before** soft delete (so we don't waste a row scan), audit **after** soft delete (so audit sees the rewritten op).

### 12.2 Annotation-Driven Behaviour

Each model declares opt-ins via `///` comments parsed at boot:

```
/// @scope TENANT_OWNED
/// @softDelete
/// @audit category=ACADEMIC sensitiveFields=password_hash
model Student { ... }
```

The extensions build a per-model behaviour table at startup; per-query logic becomes a single map lookup → minimal overhead.

### 12.3 Banned Patterns

- `prisma.$use(...)` — old middleware API; harder to type, harder to test.
- Mutating `args.where` in place — extensions must return a new `args`.
- Side effects in extensions other than auditing/logging — no business logic.

### 12.4 Testing Extensions

Each extension has its own test suite that stacks it on a real Prisma client against a Testcontainer MySQL. We test: filter injection correctness, write rejection, recursion (e.g. nested writes), and interaction with `$transaction`.

### 12.5 Performance Guard

We measure per-extension overhead with `bench/prisma-extensions.bench.ts`. Total stack budget: ≤200µs per query on dev hardware. Anything above is investigated before merging.

### 12.6 Bypass Hatches (audited)

Every extension exposes a typed bypass: `prisma.$withTenantScope({ skip: true })`, `prisma.$withSoftDelete({ includeDeleted: true })`, `prisma.$withAudit({ skip: true, reason: 'system replay' })`. Bypasses require an explicit `reason` and emit a security event.

### 12.7 OpenTelemetry

`prisma-otel.ts` spans every query using Prisma's `events` API + the `@prisma/instrumentation` package. Attributes include `db.statement` (truncated, no PII), `db.tenantId`, `db.userId`, `db.queryName` (from the correlation tag).

---

## 13. BACKGROUND JOB STRATEGY

Jobs run in a separate worker process using **BullMQ on Redis**. Prisma is used identically inside workers (same extensions, same context), but with explicit tenant context passed via the job payload.

### 13.1 Job Categories

| Category               | Examples                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| **System**             | Outbox dispatch, tombstone purge, audit anchoring, partition rotation |
| **Tenant operations**  | Invoice generation, fee reminders, exam result computation, hall ticket PDF |
| **Notifications**      | Send queue per channel (SMS/WhatsApp/Email/Push), DLR poll        |
| **Imports / Exports**  | Student import, marks import, audit export                        |
| **Integrations**       | Razorpay reconciliation, MSG91 balance check, webhook retries     |
| **Scheduled**          | Daily attendance defaulter notice, monthly billing run            |

### 13.2 Queue Layout

| Queue                | Concurrency | Notes                                              |
| -------------------- | ----------- | -------------------------------------------------- |
| `default`            | 16          | Misc                                               |
| `notifications.sms`  | 32          | Throttled by provider QPS                          |
| `notifications.wa`   | 16          | WABA-compliant pacing                              |
| `notifications.email`| 32          |                                                    |
| `notifications.push` | 16          |                                                    |
| `billing`            | 8           | Long-running invoice generation                    |
| `reports`            | 4           | CPU-heavy; isolated worker                         |
| `imports`            | 4           | File parsing; isolated worker                      |
| `webhooks.outbound`  | 16          | Retries with backoff                               |
| `system`             | 4           | Cron-driven, single-shot                           |

### 13.3 Job Payload Contract

Every job payload carries:

```
{
  tenantContext: { schoolId, actorUserId, actorRoles, requestId },
  payload: { ... },
  attempt: 1,
  maxAttempts: 5,
  idempotencyKey: 'unique-...'
}
```

Workers push `tenantContext` into ALS before opening any Prisma transaction. Without this, the tenant-scope extension throws.

### 13.4 Idempotency

Every job declares an `idempotencyKey`. Before processing, the worker checks `idempotency_keys` table; if present with `status=succeeded`, the job is acked and skipped. On success, the row is written in the same transaction as the business effect.

### 13.5 Outbox Dispatcher

The single most-load-bearing job. Reads `outbox` rows in batches of 100 ordered by `created_at`, processes each, marks `status=DISPATCHED` in a transaction with the side effect. On failure, increments `attempts` with exponential backoff. After 10 attempts, moves to `outbox_dead_letter` with full payload for ops review.

### 13.6 Schedules

Scheduled jobs declared as code (no cron UI) in `src/jobs/schedule.ts`. Each entry: `{ name, cron, queue, payloadFactory }`. CI validates that schedules don't overlap windows for resource-heavy jobs.

### 13.7 Retries & Dead Letters

- Default: 5 attempts, exponential backoff (30s, 2m, 10m, 1h, 4h).
- Per-job overrides via metadata.
- DLQ: `<queue>:dead`. Operator dashboard exposes inspection and one-click retry.
- After 14 days in DLQ, archived to S3 and removed.

### 13.8 Observability

Each job emits: `job.started`, `job.succeeded`, `job.failed`, `job.retried` metrics with attributes `{ queue, jobName, tenantId, durationMs, attempt }`. Sentry breadcrumbs include the job context. Slow jobs (>10× p50) trigger an alert.

### 13.9 Worker Deployment

Workers are a separate deployment from the API. Horizontally autoscale by queue depth (KEDA-style). Two worker classes:
- `worker-default`: handles `default`, `notifications.*`, `webhooks.outbound`.
- `worker-heavy`: handles `billing`, `reports`, `imports`. Larger memory, separate node pool.

### 13.10 Transactions in Workers

Workers wrap each job execution in one or more Prisma transactions per §10. Job-level retry handles transient errors; transaction-level retry handles deadlocks. The two retry layers are explicitly separate.

---

## 14. FILE STORAGE STRATEGY

Files (logos, student photos, documents, report card PDFs, invoice PDFs, exports, audit anchors) live in S3 (or S3-compatible). Prisma stores only metadata.

### 14.1 Data Model

Two tables:

| Table        | Purpose                                                          |
| ------------ | ---------------------------------------------------------------- |
| `files`      | Metadata: id, schoolId, ownerType, ownerId, mimeType, size, sha256, s3Bucket, s3Key, status (`UPLOADING|UPLOADED|SCANNED|QUARANTINED`), expiresAt |
| `file_links` | Many-to-many between `files` and any entity (student doc, message attachment, exam answer sheet) with `purpose` discriminator |

### 14.2 Upload Flow (Pre-signed PUT)

1. Client `POST /api/v1/uploads` → `{ purpose, mimeType, sizeHint }`.
2. Server creates `files` row with `status=UPLOADING`, returns `{ fileId, uploadUrl, uploadFields, expiresIn }`.
3. Client uploads directly to S3.
4. Client `POST /api/v1/uploads/{fileId}/complete` → server verifies S3 object exists, captures size/etag/sha256, updates `status=UPLOADED`.
5. Client references `fileId` in the business resource (`POST /api/v1/students` with `documents: [{ type, fileId }]`).

No file content ever flows through the API server. Mobile uses the same flow.

### 14.3 Bucket Layout

```
s3://schoolos-files-ap-south-1/
  tenants/{schoolId}/students/{studentId}/{purpose}/{fileId}/{originalName}
  tenants/{schoolId}/invoices/{invoiceId}/{fileId}.pdf
  tenants/{schoolId}/reports/{reportCardId}.pdf
  platform/exports/{tenantId}/{jobId}.jsonl.gz
  platform/audit-anchors/{date}.json
```

Per-tenant prefixes simplify lifecycle rules, restores, and cost attribution. Bucket policy denies cross-prefix reads by app role.

### 14.4 Access Control

- Server issues short-lived (15 min) pre-signed GET URLs only after permission check.
- No public buckets except a CDN-fronted `assets` bucket for school logos (cache-friendly).
- Per-tenant KMS key (CMK) for encryption-at-rest of sensitive folders (student documents, finance PDFs); platform key for everything else.

### 14.5 Virus / Content Scan

`UPLOADED` triggers an async scanner job. On clean → `SCANNED`. On infected → `QUARANTINED`, original object moved to `quarantine/` prefix, business resource reference revoked, owner notified.

### 14.6 Soft Delete & Lifecycle

Deleting a file row sets `deleted_at`. After 30 days the lifecycle rule transitions the S3 object to Glacier Deep Archive; after 365 days it is permanently deleted. Audit-relevant files (finance, exams) are exempt — held for statutory retention.

### 14.7 Size & Type Policy

| Purpose             | Max size | Allowed mime types                       |
| ------------------- | -------- | ---------------------------------------- |
| Student photo       | 5 MB     | image/jpeg, image/png, image/webp        |
| Document            | 20 MB    | application/pdf, image/*                 |
| Message attachment  | 25 MB    | image/*, application/pdf, document types |
| Bulk import         | 50 MB    | text/csv, application/vnd.ms-excel*      |
| Export (server-side)| 500 MB   | application/jsonl, application/zip       |

Server enforces by capturing size at `complete` and rejecting if oversize; client also enforces pre-upload.

### 14.8 Image Variants

Logos and photos generate webp variants (thumb, medium, large) via a Lambda triggered on S3 PUT. Variants live alongside the original with suffix; the API returns a `variants` map per file.

### 14.9 Direct DB-stored Blobs

**Forbidden** — no BLOB columns. The only exception is `audit_payloads` (≤64KB) for large audit diffs, and even that is reviewed for migration to S3 if it grows.

### 14.10 Cross-Region

V1 is ap-south-1 only. We replicate the audit-anchors prefix to a second region (DR + WORM-locked). Per-tenant data does not yet replicate; restore RPO/RTO documented separately.

---

## 15. PERFORMANCE STRATEGY

We design for **1000 tenants × 1000 students × 5 years of history** without surprises. Performance is enforced in CI, not aspired to.

### 15.1 Indexing Discipline

- Every `school_id`-bearing table has indexes **led by `school_id`** — composite indexes start with `(school_id, ...)`. Single-column non-leading indexes are forbidden on tenant-owned tables.
- Every FK column has a covering index.
- For hot range queries (attendance by date, invoices by due date), composite `(school_id, foreign_id, date)`.
- For sort+filter pairs (students by class+rollNo), composite `(school_id, class_id, roll_no)`.
- A migration lint rule rejects any new `school_id`-bearing table without an `(school_id, id)` PK and at least one `(school_id, ...)` lookup index.

### 15.2 Query Budget per Endpoint

| Endpoint class                | Budget (p95)         |
| ----------------------------- | -------------------- |
| Auth (`/auth/login`, `/me`)   | 150 ms               |
| Simple read by id             | 80 ms                |
| List with filter+pagination   | 200 ms               |
| Cross-aggregate dashboard     | 400 ms               |
| Write (single aggregate)      | 250 ms               |
| Bulk write (≤1000 rows)       | 5 s                  |

Each endpoint emits an SLO metric; sustained budget violations open an incident.

### 15.3 N+1 Prevention

- Repositories expose `findManyByIds` and `loadRelations(ids)` patterns; controllers never loop and call `findById`.
- Prisma `include` used judiciously; deep includes (>2 levels) flagged in PR.
- Optional **DataLoader** layer for cross-aggregate batching inside a single request (when ≥3 different entity types load in parallel).
- A test mode logs every query within a request; assertions verify ≤N queries for known endpoints.

### 15.4 Partitioning

| Table                  | Partition by                          | Retention live | Archive       |
| ---------------------- | ------------------------------------- | -------------- | ------------- |
| `audit_entries`        | RANGE `TO_DAYS(occurred_at)` monthly  | 18 months hot  | S3 after 24m  |
| `attendance_daily`     | RANGE `TO_DAYS(date)` monthly         | 24 months hot  | Cold table    |
| `notification_messages`| RANGE `TO_DAYS(created_at)` monthly   | 6 months hot   | S3 after 12m  |
| `outbox`               | RANGE `TO_DAYS(created_at)` weekly    | 30 days hot    | Drop          |
| `webhook_deliveries`   | RANGE `TO_DAYS(created_at)` weekly    | 30 days hot    | Drop          |

Partition rotation job creates next-period partitions in advance and drops/archives old ones.

### 15.5 Read Models / Materialized Snapshots

Heavy aggregations (defaulter lists, monthly collection summary, attendance percentages) are pre-computed by jobs into report tables: `rpt_fee_outstanding_daily`, `rpt_attendance_monthly`, `rpt_collection_daily`. Refreshed on a schedule + on relevant outbox events. APIs read from `rpt_*` first; fall back to live aggregation only with explicit `?live=true` flag for admins.

### 15.6 Caching Layers

| Cache                       | TTL                | Invalidation                              |
| --------------------------- | ------------------ | ----------------------------------------- |
| Tenant settings             | 5 min              | On tenant update (Redis pub/sub)          |
| Feature flags per tenant    | 5 min              | On flag/plan change                       |
| Permission set per user     | 5 min              | On role change                            |
| Plan catalogue (public)     | 1 h                | On plan publish                           |
| Lookup tables (states etc.) | 24 h               | On seed run                               |
| Auth public JWKS            | 24 h               | On rotation                               |

No request-data caching at the HTTP layer — too risky for tenant safety.

### 15.7 Connection Pool

- API: pool size 10 per node; max ~200 across the fleet, well under MySQL `max_connections`.
- Workers: pool size 5 per worker.
- We use the Prisma data-proxy-less driver with `pool_timeout=10`. Long-running queries are killed at the pool, not the DB.

### 15.8 Slow Query Logging

`slow-query.ext.ts` thresholds:
- `>250ms` → log with query tag, no payload.
- `>1s` → log + capture explain plan asynchronously.
- `>5s` → emit alert + Sentry breadcrumb.

A dashboard surfaces top 20 slow queries per day with their tags; SREs review weekly.

### 15.9 EXPLAIN-on-PR

CI runs `scripts/pg-style-explain.ts` against a seeded MySQL: it executes a curated query corpus and diffs the explain plans against a checked-in golden file. Plan regressions (full table scan, filesort on hot path, key change) fail the PR.

### 15.10 Write Amplification

- Audit + outbox writes can double or triple a write's row count. Budgeted endpoints account for this.
- Bulk imports stream in batches of 500 with a single transaction per batch; never one transaction per row.
- For very large imports (>50k rows), the importer uses `LOAD DATA LOCAL INFILE` via a privileged helper rather than ORM inserts, with downstream rebuild of derived data.

### 15.11 Mobile / Low-Bandwidth Considerations

- All list endpoints support `fields=` projection so mobile asks only for what it renders.
- ETag on read-mostly endpoints (`students/{id}`, `timetable`) avoids re-fetching unchanged data.
- Response payloads gzipped + brotli where supported; binary responses (PDFs) served from S3 with CDN.

### 15.12 Sharding Trigger (when, not now)

Shared-DB shared-schema scales to ~1500 active tenants before we revisit. Triggers for sharding by tenant ID:
- `students` row count >300M, **OR**
- p95 read latency >400ms despite tuning, **OR**
- writer connection saturation >70% at off-peak.

When triggered, the path is: introduce a routing layer, move 5% of tenants to a second shard via the tenant-restore primitive, validate, then ramp. No code change required in feature modules because all queries are already `school_id`-led.

### 15.13 Monitoring Dashboards (must exist before launch)

- DB: QPS, p95/p99, slow queries, deadlocks, replication lag, connection pool saturation.
- App: request rate, p95/p99 per endpoint class, error rate, queue depth.
- Per-tenant: top 10 by request volume, top 10 by slow query rate.
- Cross-tenant probes: count of attempts to access foreign `school_id` (should be near zero).

---

**End of PRISMA_STRATEGY.md.** Cross-references: `BACKEND_ARCHITECTURE.md` (NestJS modules, request lifecycle, ALS), `DATABASE_DESIGN.md` (column-level specs), `DATABASE_ARCHITECTURE.md` (cluster + scope classes), `REST_API_DESIGN.md` (consumers, contracts), `SCRATCHPAD.md` (working principles).
