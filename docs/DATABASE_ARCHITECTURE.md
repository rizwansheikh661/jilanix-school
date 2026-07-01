# DATABASE_ARCHITECTURE

_Upstream: DATABASE_STRATEGY.md, MULTI_TENANT_ARCHITECTURE.md. Downstream: DATABASE_DESIGN.md, MODEL_INVENTORY.md, PRISMA_STRATEGY.md._

The concrete table-level design for SchoolOS. `DATABASE_STRATEGY.md` defines the *patterns* (multi-tenancy enforcement, soft delete, audit, partitioning rules); this document defines the *tables*.

Every choice here honors the strategy. If a table specification here contradicts the strategy, the strategy wins and this doc is wrong.

> **No DDL in this document.** Schemas live in Prisma (`prisma/schema.prisma`) and migrations (`prisma/migrations/`) once code begins. This document is the human-readable contract those files must implement.

---

## 1. ER diagram — explanation

The schema is a **hub-and-spoke graph** with `schools` (the tenant) as the central hub. Almost every domain table carries a `school_id` foreign key back to `schools`, and almost every relationship between domain tables is enforced **within the same `school_id`** via composite foreign keys (see §4).

There are exactly four logical clusters around the hub:

```
              ┌─────────────────────────────┐
              │   PLATFORM CLUSTER          │
              │   (no school_id)            │
              │   plans, platform_invoices, │
              │   subscriptions, super-admin│
              │   users, audit_log_platform │
              └─────────────┬───────────────┘
                            │ subscriptions.school_id
                            ▼
   ┌────────────────── schools ──────────────────┐
   │                       │                      │
   │  IDENTITY & ACCESS    │   ACADEMIC CORE      │
   │  users, sessions,     │   academic_years,    │
   │  user_roles,          │   classes, sections, │
   │  branches             │   subjects, students,│
   │                       │   guardians, staff   │
   └───────────┬───────────┴──────────┬───────────┘
               │                      │
   ┌───────────▼───────┐    ┌─────────▼──────────┐
   │  OPERATIONS       │    │  MONEY & MESSAGING │
   │  attendance,      │    │  fee_structures,   │
   │  exams, marks,    │    │  fee_invoices,     │
   │  timetable,       │    │  fee_receipts,     │
   │  notices, library,│    │  notification_     │
   │  transport, etc.  │    │  dispatches,       │
   │                   │    │  credit_pools      │
   └───────────────────┘    └────────────────────┘

           ┌────────────────────────────────┐
           │  AUDIT  (audit_log)            │  partitioned by month;
           │  TENANT_SEQUENCES              │  hash chain on finance subset
           │  FEATURE_FLAG_OVERRIDES        │
           │  FILE_ASSETS                   │
           │  JOBS / JOB_RUNS               │
           │  CROSS-CUTTING TABLES          │
           └────────────────────────────────┘
```

Five clusters, in plain words:

1. **Platform cluster** — tables that *do not* carry `school_id`. They describe the SaaS business itself: plans, platform invoices, subscriptions (which point *at* a school), super-admin users, platform audit. These are the only tables Super Admin queries cross-tenant freely.
2. **Identity & access** — users, sessions, roles, branches. Users always belong to one school **except** super-admin users (`school_id IS NULL`, scope = `global`). See §6.
3. **Academic core** — academic year, classes, sections, subjects, students, guardians, staff. The skeleton every other module hangs off.
4. **Operations** — modules that describe daily school life: attendance, timetable, exams, marks, library, transport, hostel, etc.
5. **Money & messaging** — fees (school → student) and notifications (school → parent). High-write, high-cost — gets its own credit-pool ledger and audit category.

A sixth, "**cross-cutting,**" carries the things every cluster uses: audit log, tenant sequences (for gap-free invoice numbering), feature-flag overrides, file assets, jobs.

---

## 2. Conventions

These apply to **every table** unless the table-level note overrides.

### 2.1 Naming
- `snake_case` table and column names.
- Table names are plural (`students`, not `student`).
- Join tables: `<a>_<b>` ordered by ownership (`student_guardians`, `role_permissions`).
- Boolean columns prefixed with `is_` or `has_` (`is_active`, `has_consent`).
- Timestamp columns suffixed `_at` (`created_at`, `submitted_at`).
- Money columns suffixed `_inr_paise` (always `BIGINT`).
- Foreign keys named `<referent>_id`.

### 2.2 Columns every domain table carries
- `id` `CHAR(36)` — UUID v7 PK (DECISIONS D-005).
- `school_id` `CHAR(36) NOT NULL` — tenant key. (Platform-cluster tables omit this.)
- `created_at`, `updated_at` `TIMESTAMP(3)`.
- `created_by`, `updated_by` `CHAR(36)` — user id.
- `deleted_at` `TIMESTAMP(3) NULL` — soft delete marker.
- `version` `INT NOT NULL DEFAULT 1` — optimistic locking on contested entities (mark, attendance, fee_structures, timetable). Other tables may omit.

### 2.3 Indexes
- Every domain table has a `(school_id, ...)` composite index for tenant-scoped queries.
- Foreign keys are indexed.
- Soft-delete-aware indexes use `(school_id, deleted_at, ...)` order so the `deleted_at IS NULL` filter is fast.
- Unique constraints that should ignore soft-deleted rows are partial — implemented as `(school_id, business_key)` with `deleted_at` included as a discriminator (e.g., `(school_id, admission_no, deleted_at)`).

### 2.4 Foreign keys
- Composite FKs are mandatory wherever both ends carry `school_id`. A `student_id` reference is **always** `(school_id, student_id) → students(school_id, id)`. This enforces tenant integrity at the database level — a student in school A cannot accidentally be referenced from a class in school B.
- `ON DELETE` defaults to `RESTRICT`. Cascade only where the child has no independent meaning (e.g., `fee_invoice_lines` → `fee_invoices`).

### 2.5 Encoding & collation
- `utf8mb4` / `utf8mb4_0900_ai_ci`. Indian-language names, emojis, school mottos all work.

### 2.6 Time
- Stored as UTC. Display tz defaults to `Asia/Kolkata` per tenant; configurable in `school_settings.timezone`.

---

## 3. Multi-tenant strategy at the table level

Every table is classified into exactly one of four **scope classes**. The class determines the column shape, indexing rule, and access rules.

| Scope class                | Has `school_id`? | Who reads / writes                 | Examples |
| -------------------------- | ---------------- | ---------------------------------- | -------- |
| **Tenant-owned**           | ✅ NOT NULL       | Tenant users (within their school) | `students`, `fee_invoices`, `attendance` |
| **Tenant-shared platform** | ✅ NULL allowed   | Tenant reads (via plan/feature)    | `notification_templates` (system templates), `feature_flags` registry — system rows have `school_id IS NULL`; tenant overrides have `school_id` set |
| **Platform-only**          | ❌ no column      | Super Admin / platform staff       | `plans`, `platform_invoices`, `subscriptions`, `dlt_template_registrations` |
| **Cross-tenant operational** | ✅ NULL allowed | System / Super Admin               | `audit_log` (NULL = platform action), `jobs` (NULL = platform-level job) |

The scope class is a **table attribute** in the model registry (a metadata document, not in DB) so:
- Prisma middleware knows whether to inject `school_id`.
- The migrations linter rejects schema changes that misuse a scope class.
- Cross-tenant reports know which tables they may read freely.

### 3.1 Tenant ID propagation
- Set at request time from JWT, stored in async-local-storage (ALS).
- Read by Prisma middleware, which injects `school_id` into every `WHERE` (read), `data` (write), and validates it on update/delete.
- Bypass is explicit: `runWithoutTenantScope(reason, fn)` — used only by Super Admin handlers and platform jobs. Every bypass is audit-logged.

### 3.2 Platform actor in tenant tables
- A Super Admin acting on a tenant (e.g., refund, suspend) writes to tenant-owned tables. The `created_by` / `updated_by` is the platform user; the `audit_log` row carries `actor_scope = "global"` and an `impersonator_user_id` if the action was via impersonation.

---

## 4. School isolation strategy

Defense in depth. Each layer alone is insufficient; together they make cross-tenant leaks vanishingly unlikely.

| Layer | Mechanism | Failure mode if this layer alone |
| ----- | --------- | -------------------------------- |
| **L1 — DB foreign keys** | Composite FKs `(school_id, foreign_id) → (school_id, id)` | A direct DB write referencing the wrong school is rejected. If only this layer existed, application bugs that omit `school_id` from `WHERE` would still leak reads. |
| **L2 — Prisma middleware** | Auto-inject `school_id` on every operation | A Prisma client misconfiguration could disable it. |
| **L3 — Service-layer guards** | Every service method takes `tenantId` as first arg; validates resource belongs to it | A developer can still bypass via raw SQL. |
| **L4 — Repository contracts** | Repositories never accept "find by id" without `tenantId` | Defaults to safe; explicit overrides for platform code. |
| **L5 — Lint & code review** | Static rules forbid bare `prisma.<model>.findMany` outside repositories | Net catches what L4 misses. |
| **L6 — Cross-tenant integration tests** | Every PR runs the two-tenant suite | Catches behavior even when code "looks fine." |
| **L7 — Production canary** | A canary tenant probes others continuously; alerts on any cross-read | Last line of defense; alerts on regressions. |

### 4.1 Composite FK pattern, concretely
Every relationship within a tenant is expressed twice:
- The "natural" FK column (`student_id`).
- A duplicated `school_id` on the child row that participates in the composite FK.

For example, a `fee_invoice` references a `student` via:
- `fee_invoice.school_id`
- `fee_invoice.student_id`
- `FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id)`

This means the database itself rejects an `INSERT` into `fee_invoice` that names a `student_id` belonging to a different `school_id`. The application doesn't need to be perfect.

### 4.2 Platform → tenant references
Tables in the platform cluster (e.g., `subscriptions.school_id`) reference `schools(id)` directly without composites — there is no second layer to enforce, but they're inherently scoped because the table is platform-only.

### 4.3 Indexes that enforce tenant locality
- All composite indexes start with `school_id`. Query plans for tenant-scoped reads use it as the leading column, ensuring rows from other tenants are not even visited.
- Partitions (where used: `audit_log`, `notification_dispatches`) are by date, not tenant — combined with `school_id` indexes this gives partition pruning + tenant locality.

---

## 5. Master table list

A flat list of every table the v1 product needs, grouped by cluster. Each is detailed in §6 onwards.

**Identity & Access (tenant + platform)**
- `users`, `user_credentials`, `user_credential_history`, `user_sessions`, `refresh_tokens`, `user_devices`, `mfa_factors`, `mfa_recovery_codes`, `otps`, `password_reset_tokens`, `magic_links`, `impersonation_sessions`, `account_lockouts`

**Tenancy**
- `schools`, `school_aliases`, `school_settings`, `school_configurations`, `branches`, `academic_years`, `academic_terms`

**Roles & Permissions**
- `roles`, `permissions`, `role_permissions`, `user_roles`, `permission_overrides`, `approvals`

**Audit**
- `audit_log`, `audit_anchors`, `audit_log_attachments`

**Plans, Subscriptions & Platform Billing**
- `plans`, `plan_pricing_tiers`, `plan_features` (mapping to `feature_flags`), `subscriptions`, `subscription_events`, `subscription_student_snapshots`, `platform_invoices`, `platform_invoice_lines`, `platform_payments`, `platform_credit_notes`, `platform_refunds`, `platform_dunning_attempts`, `payment_methods`, `payment_provider_webhooks`, `gst_registrations`, `tax_codes`

**Feature Flags**
- `feature_flags`, `feature_flag_plan_defaults`, `feature_flag_tenant_overrides`, `feature_flag_role_overrides`, `feature_flag_change_log`

**Notifications & Usage**
- `notification_templates`, `notification_template_versions`, `dlt_template_registrations`, `waba_template_registrations`, `notification_provider_configs`, `notification_dispatches`, `delivery_receipts`, `recipient_preferences`, `suppression_entries`, `credit_pools`, `credit_transactions`, `credit_packs`, `credit_pack_purchases`

**Academic Foundation (tenant)**
- `classes`, `sections`, `subjects`, `class_subjects`, `class_section_subject_teachers`, `timetable_periods`, `timetable_slots`, `holidays`, `events`

**Students & Parents (tenant)**
- `students`, `student_admissions`, `student_status_history`, `student_documents`, `student_medical_info`, `guardians`, `student_guardians`, `student_consents`

**Staff (tenant)**
- `staff`, `staff_employments`, `staff_documents`, `teacher_qualifications`, `staff_payroll_settings` (if payroll module)

**Attendance (tenant)**
- `student_attendance`, `student_attendance_periods`, `staff_attendance`, `attendance_lock_windows`

**School-side Fees (tenant)**
- `fee_categories`, `fee_structures`, `fee_components`, `fee_concession_policies`, `fee_assignments`, `fee_invoices` (school → student), `fee_invoice_lines`, `fee_receipts`, `fee_receipt_lines`, `fee_payments`, `fee_refunds`, `fee_credit_notes`, `fee_due_reminders`

**Examinations (tenant)**
- `exam_schedules`, `exams`, `exam_subjects`, `marks`, `mark_edit_audit`, `grade_systems`, `grade_bands`, `report_card_templates`, `report_cards`

**Adjacent modules (tenant — one or more tables each)**
- Library: `library_items`, `library_loans`, `library_holds`
- Transport: `transport_routes`, `transport_stops`, `transport_vehicles`, `transport_assignments`, `transport_attendance`
- Hostel: `hostels`, `hostel_rooms`, `hostel_allocations`, `hostel_attendance`
- Inventory: `inventory_items`, `inventory_movements`
- Visitor: `visitor_passes`
- Medical: `medical_records`, `medical_visits`
- Discipline: `discipline_incidents`, `discipline_actions`
- Complaints: `complaints`, `complaint_responses`
- Certificates: `certificate_templates`, `certificate_issues`
- Notices: `notices`, `notice_recipients_log`

**Reporting & Analytics**
- `saved_reports`, `report_subscriptions`, `report_runs`, `analytics_events` (CDC sink, off-DB later), `materialized_view_refresh_log`

**Operational / cross-cutting**
- `tenant_sequences`, `file_assets`, `file_asset_acl_grants`, `jobs`, `job_runs`, `outbox_events`, `webhook_endpoints`, `webhook_deliveries`, `api_keys`, `support_tickets`, `support_ticket_messages`

That's the v1 footprint — roughly **140 tables**. Adjacent modules can be added/removed per tenant via feature flags; their tables exist regardless (presence of empty tables is fine).

---

## 6. Cluster: Identity & Access

### 6.1 `users`
The single user table. A user is either:
- Tenant user (`school_id` set, `scope = "tenant"`), or
- Platform user (`school_id` NULL, `scope = "global"`).

Key columns: `id`, `school_id` (NULL for global), `scope` (`tenant` | `global`), `email` (nullable), `phone_e164` (nullable), `first_name`, `last_name`, `status` (`active`, `invited`, `disabled`, `locked`), `last_login_at`, `password_set_at`, `created_at`, `updated_at`, `deleted_at`.

Unique constraints:
- `(school_id, email)` where email is not null and not deleted.
- `(school_id, phone_e164)` where phone is not null and not deleted.
- For platform users: `(NULL, email)` enforced via partial unique on `(scope, email)` because `school_id IS NULL` repeats.

A user is **never** in two tenants at once. Multi-tenant identity (the rare principal who owns two schools) is handled by issuing two separate user rows that share an `identity_link_id` (deferred to v2).

### 6.2 Credentials
- `user_credentials` — one row per user, `password_hash` (Argon2id), `password_set_at`, `must_change_at_next_login`.
- `user_credential_history` — last N hashes, prevents reuse.
- Auth flows that don't use passwords (parents using OTP) leave `user_credentials` blank.

### 6.3 Sessions & tokens
- `user_sessions` — server-side session metadata: `id`, `user_id`, `school_id`, `created_at`, `last_seen_at`, `revoked_at`, `revoked_reason`, `ip`, `user_agent`, `client_name`, `client_version`.
- `refresh_tokens` — opaque tokens, hashed at rest. Exactly one active per session. Rotation on use.
- `user_devices` — push tokens, one per (user, device, app_version). Carries `fcm_token`, `apns_token`, `last_seen_at`.

### 6.4 MFA & verification
- `mfa_factors` — TOTP secret (encrypted), WebAuthn credentials, recovery state. Multiple factors per user.
- `mfa_recovery_codes` — single-use, hashed.
- `otps` — short-lived OTP store for phone/email verification, password reset, parent login. `purpose` enum, `expires_at`, `consumed_at`, `attempt_count`.
- `password_reset_tokens`, `magic_links` — same shape; separate to keep query patterns clear.

### 6.5 Impersonation
- `impersonation_sessions` — one row per impersonation event: `impersonator_user_id` (platform), `impersonated_user_id` (tenant), `school_id` (target tenant), `started_at`, `ended_at`, `reason`, `ticket_ref`. Powers the audit-of-audit and the impersonation banner.

### 6.6 Lockouts
- `account_lockouts` — sliding window of failed auth events; auto-cleared after the window. Rows are not authoritative for "is this account locked" — that's computed; this table is just a log.

### 6.7 Relationships in this cluster
- `users` → `schools` (one-to-many via `school_id`).
- `user_sessions` → `users` (many-to-one).
- `refresh_tokens` → `user_sessions` (one-to-one active, many over history).
- `mfa_factors` → `users` (many).
- `impersonation_sessions` → `users` (impersonator) and `users` (impersonated).

---

## 7. Cluster: Tenancy

### 7.1 `schools`
The hub. Every other tenant-owned table FKs here.

Columns: `id`, `slug` (unique, used for sub-domain), `legal_name`, `display_name`, `logo_file_id`, `country` (`IN` v1), `gstin` (nullable), `pan` (nullable), `address_line1/2`, `city`, `state_code`, `pincode`, `timezone` (default `Asia/Kolkata`), `locale_default` (`en-IN`, `hi-IN`, etc.), `lifecycle_status` (`DRAFT`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`, `DELETED` — see DECISIONS D-027; trial/expiring semantics live on the parallel Subscription FSM per D-028), `onboarded_at`, `archived_at`, `created_at`, `updated_at`, `deleted_at`.

`slug` is the public-facing tenant identifier; it never changes after creation (rename = new tenant).

### 7.2 `school_aliases`
Historical slugs. Old slug → new slug redirect. Used during rebrands or to avoid breaking links during legal-name changes.

### 7.3 `school_settings`
One-row-per-school config that is read on every request and changes infrequently: working days, attendance window, exam edit window, invoice number format, default communication language, quiet hours, privacy policy version accepted, etc. Cached aggressively (see MULTI_TENANT §6).

### 7.4 `school_configurations`
Open-ended KV store for tenant-level configuration that doesn't deserve a dedicated column. `(school_id, key, value_json, version, updated_by, updated_at)`. Used sparingly; structured columns are preferred.

### 7.5 `branches`
Sub-organizations of a school: campuses, departments. Some roles scope to a branch; many tables carry an optional `branch_id`.

Columns: `id`, `school_id`, `parent_branch_id` (nullable, for hierarchical branches), `name`, `code`, `is_primary`, `address_*`, `created_at`, ...

Composite FK pattern: `(school_id, parent_branch_id) → branches(school_id, id)`.

### 7.6 `academic_years` & `academic_terms`
- `academic_years` — `(school_id, name, start_date, end_date, is_current)`. Exactly one `is_current = true` per school (enforced via partial unique).
- `academic_terms` — sub-periods (Term 1 / Term 2 / Term 3 / Quarter, etc.). Drives report cards, fee due dates.

---

## 8. Cluster: Roles & Permissions

### 8.1 `roles`
Catalog of roles: system-defined (`super_admin`, `school_admin`, `teacher`, `parent`, etc.) + tenant-defined (custom roles).
Columns: `id`, `school_id` (NULL for system roles), `code`, `name`, `description`, `is_system` (immutable), `created_at`, ...
Unique: `(school_id, code)`.

### 8.2 `permissions`
Catalog of fine-grained permission codes (e.g., `students.read`, `fees.invoice.write`, `audit.read.cross_tenant`). All system-defined; populated from a central registry at deploy time.

### 8.3 `role_permissions`
Many-to-many: `(role_id, permission_id)`. For tenant-defined roles, the tenant's school admin manages this set; for system roles, the registry overwrites it on deploy (any tenant edits to a system role are rejected).

### 8.4 `user_roles`
Assignment of role to user, optionally scoped to a branch.
Columns: `id`, `school_id` (or NULL for global), `user_id`, `role_id`, `branch_id` (nullable), `granted_by`, `granted_at`, `revoked_at` (nullable), `valid_from`, `valid_until` (nullable).

A user can hold multiple roles; effective permissions = union of roles' permissions.

### 8.5 `permission_overrides`
Rare per-user grant or deny that's not expressed via roles (e.g., temporarily granting `examinations.publish` to one teacher). `(school_id, user_id, permission_id, effect)` where `effect ∈ {allow, deny}`. Deny wins.

### 8.6 `approvals` (4-eyes / dual control)
For high-risk actions that require a second approver. See SUPER_ADMIN §5.1.
Columns: `id`, `school_id` (NULL for platform-level), `action_type`, `payload_json` (the proposed change), `requested_by`, `requested_at`, `approver_user_id` (nullable until approved), `approved_at`, `decision` (`pending` | `approved` | `rejected`), `decision_reason`, `executed_at`, `result_json`.

Pending approvals expire after a configured TTL (default 7 days).

---

## 9. Cluster: Audit

### 9.1 `audit_log`
Single table; partitioned by `created_at` monthly.

Columns: `id`, `school_id` (NULL for platform actions), `actor_user_id`, `actor_scope` (`tenant` | `global`), `impersonator_user_id` (nullable), `action`, `category` (`general` | `finance` | `security` | `tenancy`), `resource_type`, `resource_id`, `before_json`, `after_json`, `ip`, `user_agent`, `request_id`, `prev_hash`, `row_hash`, `created_at`.

- Append-only; no UPDATE permission for the application user.
- Hash chain (`prev_hash`, `row_hash`) populated only when `category = "finance"` (and other security-critical categories) — see §9.2.
- Indexes: `(school_id, created_at DESC)`, `(school_id, resource_type, resource_id, created_at DESC)`, `(actor_user_id, created_at DESC)`.

### 9.2 `audit_anchors`
Periodic external anchors that prove the chain existed at a point in time. One row per `(school_id, anchor_period)`; `anchor_period` is e.g., a date for daily anchoring of finance entries.
Columns: `id`, `school_id`, `category`, `period_start`, `period_end`, `last_row_hash`, `external_storage_uri` (e.g., S3 WORM object), `external_object_etag`, `created_at`.

Verification job recomputes the chain and compares against the anchor; mismatch alerts on-call. See DATABASE_STRATEGY §6.1.

### 9.3 `audit_log_attachments`
For audit rows that need supporting documents (e.g., a refund's reason letter). FKs to `file_assets`.

### 9.4 Retention
- General: 3 years from `created_at`.
- Finance: 7 years.
- Tenancy / security: 7 years.
- Drop-old job per partition; no row-level deletes.

---

## 10. Cluster: Plans, Subscriptions & Platform Billing

This is the **platform cluster** — no `school_id` on plans, subscriptions, etc. (subscriptions reference a school but are not "owned" by tenant users).

### 10.1 `plans`
Columns: `id`, `code` (e.g., `starter`, `standard`, `premium`), `name`, `description`, `is_active`, `is_public` (visible on pricing page), `default_currency`, `created_at`, `deprecated_at`.

### 10.2 `plan_pricing_tiers`
Pricing per plan, per region, per billing cycle.
Columns: `id`, `plan_id`, `country_code`, `currency` (`INR`), `cycle` (`monthly`, `quarterly`, `annual`), `base_price_inr_paise`, `per_student_price_inr_paise`, `included_students`, `valid_from`, `valid_until`.

Price changes never edit existing tiers — a new tier supersedes; running subscriptions stay on the tier they were issued under.

### 10.3 `plan_features`
Maps a plan to feature flags it enables/disables/quota-limits.
Columns: `id`, `plan_id`, `flag_id`, `enabled`, `quota_int` (nullable, for things like SMS-credits-per-month), `quota_window` (`day`, `month`, `cycle`).

### 10.4 `subscriptions`
The contract between us and one school.
Columns: `id`, `school_id` (FK → `schools`), `plan_id`, `pricing_tier_id`, `status` (`PENDING`, `TRIAL`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `CANCELLED` — canonical Sprint 15 enum, see DECISIONS D-028), `started_at`, `current_period_start`, `current_period_end`, `cancel_at`, `cancelled_at`, `next_invoice_at`, `last_renewal_at`, `auto_renew`, `payment_method_id` (nullable), `notes`, `created_at`, `updated_at`.

### 10.5 `subscription_events`
Log of every transition: trial-started, plan-changed, suspended, resumed, terminated, etc. Drives the timeline view in the operator console.

### 10.6 `subscription_student_snapshots`
The metering snapshot used for billing. See BILLING §5.1.
Columns: `id`, `subscription_id`, `school_id`, `snapshot_date`, `student_count`, `recorded_at`, `recorded_by` (system or user).

### 10.7 `platform_invoices`
Invoices we (the SaaS) issue to schools.
Columns: `id`, `subscription_id`, `school_id`, `invoice_no` (gap-free per FY), `fiscal_year`, `issue_date`, `due_date`, `period_start`, `period_end`, `currency`, `subtotal_inr_paise`, `tax_inr_paise`, `total_inr_paise`, `place_of_supply_state`, `is_inter_state`, `gst_treatment` (`b2b_registered`, `b2c`, `inter_state`), `status` (`draft`, `issued`, `paid`, `overdue`, `void`), `irn` (nullable), `irn_signed_qr` (nullable), `pdf_file_id`, `created_at`, `updated_at`.

### 10.8 `platform_invoice_lines`
One row per line item with HSN/SAC, quantity, unit price, tax breakdown.
Columns: `id`, `invoice_id`, `description`, `hsn_sac_code`, `quantity`, `unit_price_inr_paise`, `taxable_value_inr_paise`, `cgst_pct`, `cgst_inr_paise`, `sgst_pct`, `sgst_inr_paise`, `igst_pct`, `igst_inr_paise`, `total_inr_paise`.

### 10.9 `platform_payments`
A receipt of money from a school.
Columns: `id`, `invoice_id`, `school_id`, `payment_provider` (`razorpay`, `manual`, etc.), `provider_payment_id`, `amount_inr_paise`, `tds_inr_paise`, `received_at`, `status` (`pending`, `captured`, `failed`, `refunded`), `method` (`upi`, `netbanking`, `card`, `nach`, `manual_transfer`, `cheque`), `notes`, `created_at`.

### 10.10 `platform_credit_notes` & `platform_refunds`
- Credit notes offset invoices for billing corrections (GST-compliant).
- Refunds record money returned to the school. Both reference the original invoice.

### 10.11 `platform_dunning_attempts`
For overdue invoices: `(invoice_id, attempt_no, channel, sent_at, outcome)`. Drives the dunning ladder.

### 10.12 `payment_methods`
School's saved payment instruments (Razorpay tokens, NACH/UPI Autopay mandates).
Columns: `id`, `school_id`, `provider`, `provider_token`, `instrument_type`, `last4`, `expires_at`, `mandate_status`, `is_default`, `created_at`, `revoked_at`.

### 10.13 `payment_provider_webhooks`
Idempotency log for provider webhooks.
Columns: `id`, `provider`, `provider_event_id` (unique), `event_type`, `payload_json`, `received_at`, `processed_at`, `status`, `error`.

### 10.14 `gst_registrations`
Per-school GSTIN(s) — most schools have one, some chains have multiple. `(school_id, gstin, state_code, legal_name, is_primary, valid_from, valid_until)`.

### 10.15 `tax_codes`
Lookup: HSN/SAC → tax rate + description, valid date ranges. Versioned so historical invoices keep their original rate.

---

## 11. Cluster: Feature Flags

See MODULES F6 for behavior. Tables:

### 11.1 `feature_flags`
Registry of every flag.
Columns: `id`, `code` (e.g., `module.fees`, `release.new_marks_entry`), `name`, `description`, `kind` (`module` | `release` | `experiment`), `owner`, `default_value` (boolean or quota), `cleanup_due_at` (release flags), `lifecycle_stage` (`introduced`, `rolling_out`, `adopted`, `cleanup_pending`, `removed`), `created_at`.

### 11.2 `feature_flag_plan_defaults`
Default value of a flag when a tenant is on a given plan.
`(plan_id, flag_id, value, quota_int, quota_window)`.

### 11.3 `feature_flag_tenant_overrides`
Per-tenant override that wins over plan default.
`(school_id, flag_id, value, quota_int, reason, set_by, set_at, expires_at)`.

### 11.4 `feature_flag_role_overrides` (rare)
For role-targeted experiments.
`(school_id, role_id, flag_id, value, set_by, set_at, expires_at)`.

### 11.5 `feature_flag_change_log`
Every toggle, who/when/why.
`(id, school_id (nullable for plan/system changes), flag_id, before_value, after_value, scope (`plan`/`tenant`/`role`), actor_user_id, reason, created_at)`.

Resolution order is enforced in code (role > tenant > plan > flag default). Multiple `tenant_overrides` per `(school_id, flag_id)` are not allowed (partial unique on `expires_at IS NULL`).

---

## 12. Cluster: Notifications & Usage

The credit-pool ledger and dispatch tables are high-write — partitioned by month.

### 12.1 `notification_templates`
Catalog. System templates (`school_id IS NULL`) and tenant overrides (`school_id` set).
Columns: `id`, `school_id` (nullable), `code` (e.g., `attendance.absent`), `channel` (`sms` | `whatsapp` | `email` | `push`), `category` (`transactional` | `promotional`), `default_locale`, `is_active`, `created_at`, `updated_at`.

### 12.2 `notification_template_versions`
Versioned content per template + locale.
Columns: `id`, `template_id`, `locale`, `version`, `body`, `variables_json`, `dlt_template_id` (FK if SMS), `waba_template_id` (FK if WhatsApp), `approved_at`, `is_active`, `created_at`.

### 12.3 `dlt_template_registrations`
For every SMS template, the DLT registration metadata (TRAI requirement).
Columns: `id`, `school_id` (nullable; platform-owned for system templates), `dlt_template_id`, `entity_id`, `sender_id`, `category` (`transactional`/`service`/`promotional`), `status` (`pending`/`approved`/`rejected`/`paused`), `approved_at`, `created_at`.

### 12.4 `waba_template_registrations`
WhatsApp Business Account template approvals.
Columns: `id`, `school_id` (nullable), `waba_template_id`, `category` (`utility`/`marketing`/`authentication`), `status`, `language`, `approved_at`, `created_at`.

### 12.5 `notification_provider_configs`
Per tenant per channel: which provider, in what fallback order, with what credentials (encrypted KMS key references).
Columns: `id`, `school_id`, `channel`, `provider_code`, `priority`, `credential_ref`, `is_active`, `created_at`.

### 12.6 `notification_dispatches`
One row per attempted send (per recipient per template). High-write.
Columns: `id`, `school_id`, `template_id`, `template_version_id`, `recipient_user_id` (nullable; for unregistered recipients), `recipient_address` (phone/email), `channel`, `provider_code`, `status` (`queued`, `sent`, `delivered`, `failed`, `expired`, `bounced`, `suppressed`), `provider_message_id`, `cost_credits`, `cost_inr_paise`, `triggered_by_event_id` (nullable), `created_at`, `updated_at`.

Partitioned monthly. Indexed by `(school_id, created_at DESC)`, `(school_id, status, created_at DESC)`, `(provider_code, created_at DESC)` for fleet analytics.

### 12.7 `delivery_receipts`
Provider DLR events. One row per status transition.
Columns: `id`, `dispatch_id`, `event_status`, `provider_status_code`, `provider_payload_json`, `received_at`.

### 12.8 `recipient_preferences`
Per-recipient consent and preferences.
Columns: `id`, `school_id`, `user_id` (nullable), `phone_e164` (nullable), `email` (nullable), `sms_promotional_opt_in`, `whatsapp_opt_in`, `email_promotional_opt_in`, `quiet_hours_start`, `quiet_hours_end`, `language_preference`, `updated_at`.

### 12.9 `suppression_entries`
Hard suppressions (bounced email, blocked phone, STOP'd SMS).
Columns: `id`, `school_id` (or NULL for platform-wide block), `channel`, `address`, `reason`, `created_at`, `expires_at` (nullable).

### 12.10 `credit_pools`
The per-tenant per-channel balance.
Columns: `id`, `school_id`, `channel`, `balance_credits`, `low_balance_threshold`, `last_topup_at`, `updated_at`.
Unique: `(school_id, channel)`.

### 12.11 `credit_transactions`
Append-only ledger.
Columns: `id`, `school_id`, `channel`, `pool_id`, `delta_credits` (+ for credit, − for debit), `kind` (`debit_dispatch`, `credit_topup`, `credit_refund_expired`, `credit_adjustment`), `reference_type`, `reference_id` (e.g., `dispatch_id`), `running_balance`, `created_at`.

Atomicity: a debit row is inserted in the **same transaction** as the dispatch row (see MODULES §22.4).

### 12.12 `credit_packs`
Catalog of buyable packs: 1k SMS, 5k WhatsApp, etc.
`(id, channel, name, credits_included, price_inr_paise, valid_until, is_active)`.

### 12.13 `credit_pack_purchases`
Linked to a `platform_invoice` line; on payment capture, the matching credit-pool is incremented and a `credit_transactions` row is written.

---

## 13. Cluster: Academic foundation, Students, Staff

(This is large; per-table column lists are abbreviated. The conventions §2 still apply.)

### 13.1 Academic foundation
- `classes` — `(school_id, academic_year_id, name, sequence)`. E.g., "Class 5".
- `sections` — `(school_id, class_id, name)`. "Class 5 - A".
- `subjects` — `(school_id, name, code, is_core, is_optional)`.
- `class_subjects` — many-to-many: which subjects a class teaches.
- `class_section_subject_teachers` — assignment of teachers to teach a subject in a section.
- `timetable_periods` — `(school_id, name, start_time, end_time, day_of_week)`.
- `timetable_slots` — assignment of subject + teacher + room to a period for a section.
- `holidays` — `(school_id, academic_year_id, date, name, is_optional)`.
- `events` — calendar events (parent-teacher meeting, sports day).

### 13.2 Students
- `students` — `(id, school_id, branch_id, admission_no, first_name, last_name, dob, gender, blood_group, current_class_id, current_section_id, status, admitted_on, ...)`. Soft-delete via `deleted_at`. Unique `(school_id, admission_no)` partial on `deleted_at IS NULL`.
- `student_admissions` — admission record (may differ from current state if re-admitted).
- `student_status_history` — audit of status transitions (admitted, promoted, transferred-out, struck-off).
- `student_documents` — FKs to `file_assets`.
- `student_medical_info` — allergies, conditions, parent-disclosed info; encrypted at rest.

### 13.3 Guardians (parents)
- `guardians` — `(id, school_id, first_name, last_name, phone_e164, email, occupation, ...)`. Unique on `(school_id, phone_e164)` partial.
- `student_guardians` — many-to-many with `relationship` (`father`, `mother`, `legal_guardian`, etc.), `is_primary_contact`, `has_consented_at`.
- `student_consents` — DPDP-relevant: WhatsApp opt-in, photo permission, data-export consent, etc.

A guardian user (`users` row) is linked to a `guardians` row via `guardian.user_id` (nullable: not every guardian logs in).

### 13.4 Staff
- `staff` — `(id, school_id, branch_id, employee_no, first_name, last_name, dob, gender, joining_date, status, ...)`.
- `staff_employments` — employment history (promotions, role changes).
- `staff_documents`.
- `teacher_qualifications` — for teachers: degree, subject specialization, certifications.

A staff record is linked to a user via `staff.user_id`.

---

## 14. Cluster: Operations

### 14.1 Attendance
- `student_attendance` — one row per (student, date, period?). For daily attendance: `(student_id, school_id, date, status, marked_by, marked_at)`. For period-wise: include `period_id`. Partitioned by `date` quarterly.
- `staff_attendance` — same shape for staff.
- `attendance_lock_windows` — `(school_id, date_range, locked_at)` to prevent edits beyond a configured window.

### 14.2 Examinations
- `exam_schedules` — header for an exam window (Term 1 Mid, Term 1 Final).
- `exams` — per-class-per-subject under a schedule: `(schedule_id, class_id, subject_id, date, start_time, max_marks, pass_marks)`.
- `exam_subjects` — when an exam covers multiple subjects in one paper.
- `marks` — `(school_id, student_id, exam_id, marks_obtained, is_absent, is_exempt, version, created_at, updated_at)`. Optimistic locking.
- `mark_edit_audit` — edits beyond the edit window are still allowed for `examination_admin` but every change writes a row here in addition to `audit_log`.
- `grade_systems` — `(school_id, name, type)`. e.g., percentage, CGPA, letter.
- `grade_bands` — `(grade_system_id, label, lower_bound, upper_bound, gpa)`.
- `report_card_templates` — per-school templates referencing `file_assets` for PDF stencils.
- `report_cards` — generated report cards: `(school_id, student_id, exam_schedule_id, status, file_id, generated_at, published_at)`.

### 14.3 School-side fees
- `fee_categories` — tuition, transport, hostel, library, etc.
- `fee_structures` — per academic year per class, the canonical fee plan.
- `fee_components` — line items in a structure: `(structure_id, category_id, name, amount_inr_paise, due_offset_days, frequency)`.
- `fee_concession_policies` — scholarship rules.
- `fee_assignments` — student → structure mapping (allows ad-hoc overrides).
- `fee_invoices` — school invoices issued to a student. Gap-free numbering via `tenant_sequences`.
- `fee_invoice_lines` — line items, including GST split if school is GST-registered (some K-12 schools collect non-tuition GST-able services).
- `fee_receipts` — receipt issued on payment.
- `fee_receipt_lines` — receipt-to-invoice-line allocation.
- `fee_payments` — actual money events; can be partial allocations across invoices.
- `fee_refunds`, `fee_credit_notes` — corrections.
- `fee_due_reminders` — log of reminders sent (links to `notification_dispatches`).

### 14.4 Adjacent modules
Each adjacent module owns 1–5 tables; all follow the conventions. Library / transport / hostel / inventory / visitor / medical / discipline / complaints / notices / certificates listed in §5.

---

## 15. Cluster: Reporting & Analytics

The OLTP database is **not** a warehouse. Reporting is supported via:

### 15.1 `saved_reports`
Tenant-saved report definitions: `(school_id, name, type, query_params_json, schedule_cron, last_run_at, owner_user_id)`.

### 15.2 `report_subscriptions`
Email/WhatsApp delivery of a scheduled report: `(saved_report_id, channel, recipient_addresses_json, last_sent_at)`.

### 15.3 `report_runs`
History of report executions: `(saved_report_id, started_at, finished_at, status, output_file_id, row_count, error)`.

### 15.4 `analytics_events` (optional, off-DB long-term)
A thin events table the application writes to for product analytics (page views, feature usage). Stays in OLTP only as a write-buffer; CDC pipeline ships to ClickHouse / BigQuery / Snowflake (Phase 9).

### 15.5 Materialized aggregates
For heavy dashboards (fees collected by month, attendance % by class):
- Compute via scheduled jobs writing to `mv_*` tables (e.g., `mv_fees_collected_monthly`).
- Refresh log in `materialized_view_refresh_log`.
- Treat these as caches: rebuilt at any time.

### 15.6 Cross-tenant analytics
- Available only to Super Admin via the Admin module.
- Reads use `runWithoutTenantScope` and are themselves audit-logged.
- For fleet KPIs (MRR, active tenant count), pre-aggregate in `mv_platform_*` tables refreshed nightly.

---

## 16. Cluster: Operational / cross-cutting

### 16.1 `tenant_sequences`
Powers gap-free numbering (DECISIONS D-012).
Columns: `(school_id, sequence_name, fiscal_year, last_value, updated_at)`.
Unique: `(school_id, sequence_name, fiscal_year)`.

Used for: `platform_invoice` (school_id = our company), `fee_invoice`, `fee_receipt`, `transfer_certificate`, `id_card_number`, `admission_no` (auto-assign mode), etc.

### 16.2 `file_assets`
S3-backed file metadata.
Columns: `id`, `school_id` (nullable for system assets), `bucket`, `key`, `mime_type`, `size_bytes`, `checksum_sha256`, `is_public`, `expires_at`, `created_by`, `created_at`, `deleted_at`.

### 16.3 `file_asset_acl_grants`
Per-asset access grants for non-public files: `(file_id, principal_type, principal_id, granted_at, revoked_at)`.

### 16.4 `jobs` and `job_runs`
BullMQ persistence + our auditable mirror.
- `jobs` — definitions (cron-like or one-shot) tracked at app level for visibility.
- `job_runs` — execution history: `(job_id, started_at, finished_at, status, error_message, output_summary_json)`.

### 16.5 `outbox_events`
Transactional outbox for reliable cross-service events (e.g., emit "invoice issued" so the notification module can react).
Columns: `id`, `school_id`, `event_type`, `payload_json`, `created_at`, `published_at`, `published_to`. Polled and published by a background worker.

### 16.6 `webhook_endpoints` & `webhook_deliveries`
For tenants integrating their own systems (ERP, accounting):
- `webhook_endpoints` — `(school_id, url, secret_ref, event_filter, is_active)`.
- `webhook_deliveries` — `(endpoint_id, event_id, attempt_no, sent_at, status, response_status, response_body_excerpt)`.

### 16.7 `api_keys`
Per-tenant API tokens for B2B integrations.
Columns: `id`, `school_id`, `key_prefix` (visible), `key_hash`, `scopes_json`, `created_by`, `created_at`, `last_used_at`, `revoked_at`, `expires_at`.

### 16.8 `support_tickets` & `support_ticket_messages`
A simple support inbox for in-app support; also reachable by Super Admin in the operator console.

---

## 17. Cross-cluster relationships (the important ones)

A non-exhaustive list of FKs that span clusters:

- `users.school_id` → `schools.id`
- `subscriptions.school_id` → `schools.id`
- `subscriptions.plan_id` → `plans.id`
- `platform_invoices.subscription_id` → `subscriptions.id`
- `platform_payments.invoice_id` → `platform_invoices.id`
- `feature_flag_tenant_overrides.school_id` → `schools.id`
- `notification_dispatches.school_id` → `schools.id`
- `credit_transactions.pool_id` → `credit_pools.id`
- `audit_log.school_id` → `schools.id` (nullable; platform actions = NULL)
- `audit_log.actor_user_id` → `users.id`
- `student_guardians.student_id` (composite) → `students.(school_id, id)`
- `student_guardians.guardian_id` (composite) → `guardians.(school_id, id)`
- `fee_invoices.student_id` (composite) → `students.(school_id, id)`
- `marks.student_id` (composite) → `students.(school_id, id)`
- `marks.exam_id` (composite) → `exams.(school_id, id)`
- `report_cards.student_id` (composite) → `students.(school_id, id)`

Composite FKs (`(school_id, x_id)`) are mandatory for any reference within a tenant — the reason is L1 isolation in §4.

---

## 18. Indexing & partitioning summary

| Table | Partition strategy | Critical indexes |
| ----- | ------------------ | ---------------- |
| `audit_log` | Monthly by `created_at` | `(school_id, created_at DESC)`, `(school_id, resource_type, resource_id, created_at DESC)`, `(actor_user_id, created_at DESC)` |
| `notification_dispatches` | Monthly by `created_at` | `(school_id, created_at DESC)`, `(school_id, status, created_at DESC)`, `(provider_code, created_at DESC)` |
| `student_attendance` | Quarterly by `date` | `(school_id, student_id, date)`, `(school_id, section_id, date)` |
| `marks` | None (small) | `(school_id, exam_id)`, `(school_id, student_id, exam_id)` |
| `credit_transactions` | Monthly by `created_at` | `(school_id, channel, created_at DESC)`, `(pool_id, created_at DESC)` |
| `fee_invoices` | None (modest) | `(school_id, student_id, status)`, `(school_id, fiscal_year, invoice_no)` |
| `platform_invoices` | None (modest) | `(school_id, status)`, `(fiscal_year, invoice_no)` |
| `delivery_receipts` | Monthly by `received_at` | `(dispatch_id, received_at)` |
| `report_runs` | None | `(saved_report_id, started_at DESC)` |

Partitions live ~24 months online; older partitions archived to S3 (Parquet) and dropped from MySQL — see DATABASE_STRATEGY §11.

---

## 19. Migration & evolution guidelines

- Every change to this document is paired with a migration. The migration runs once (multi-tenant), so it must be **online-safe** (no long table locks):
  - Add nullable column → backfill in a job → make it NOT NULL.
  - Index creation uses `ALGORITHM=INPLACE, LOCK=NONE` where supported.
  - Avoid `ALTER TABLE ... CHANGE COLUMN` on hot tables; introduce new column and dual-write instead.
- Composite-FK additions on existing tables require a backfill of the new `school_id` column from the parent before adding the constraint.
- New tables must be classified into a scope class (see §3) at creation time; the migrations linter enforces.
- A migration that touches a tenant-owned table with > 10M rows requires a written rollout note in `docs/runbooks/migration-<YYYYMMDD>.md` (rollout strategy, rollback plan, verification queries).

---

## 20. What is intentionally **not** in this document

- **Exact column types** beyond a few notable ones — Prisma schema is authoritative once code begins.
- **DDL** — none, by design.
- **Per-module deep field-level definitions** — those go in `docs/modules/<name>.md` written *with* the module.
- **Sharding plan** — D-026 says we don't shard before 1000 active tenants; the architecture is shard-ready (composite FKs + tenant routing layer) but no shard topology is committed.
- **Warehouse schema** — out of scope until Phase 9; will be a separate doc when designed.

This document gets revised when:
- A new cluster is added (e.g., AI/ML feature store).
- A scope class changes (e.g., a table moves from tenant-owned to platform-only).
- An isolation primitive changes (e.g., we adopt RLS on a Postgres migration).

---

## 21. Open architecture questions (linked to DECISIONS)

- **R-001** — KMS strategy for encrypted columns (`student_medical_info`, `payment_methods.provider_token`, `mfa_factors.totp_secret`): per-tenant data-key vs. shared. **Working:** shared CMK with per-tenant data keys; rotation cadence yearly. Final decision before Phase 4.
- **D-021** — Tamper-evidence chain on `audit_log`. **Working:** finance subset by Phase 4.
- **D-024** — Tenant restore primitive — Option A manual until Phase 7 (logical exports → Option B).
- **D-023** — Search engine: MySQL FULLTEXT until Phase 6; switch to OpenSearch / Typesense if needed.
- **R-002** — Cross-region replication topology: warm DR vs cold-restore-from-S3.

These are tracked in `DECISIONS.md` and resolved as the product matures.
