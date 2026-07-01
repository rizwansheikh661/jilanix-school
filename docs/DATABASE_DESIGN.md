# DATABASE_DESIGN

_Upstream: DATABASE_ARCHITECTURE.md, DATABASE_STRATEGY.md, MODEL_INVENTORY.md. Downstream: PRISMA_STRATEGY.md, REST_API_DESIGN.md, BACKEND_ARCHITECTURE.md._

Production-grade column-level database design for SchoolOS. MySQL 8 + Prisma ORM. Multi-tenant SaaS with shared database + `school_id` isolation.

> **Companion to `DATABASE_ARCHITECTURE.md`.** That doc defined the strategy and clusters; this doc specifies every table's columns, types, indexes, and foreign keys. This is the authoritative schema contract before Prisma code.

---

## 1. Document scope

This document defines **every production table** at column-level detail. No Prisma code — that lives in `prisma/schema.prisma`. This is the contract Prisma implements.

---

## 2. Type vocabulary

| Type Pattern | MySQL Type | Notes |
|---|---|---|
| UUID | `CHAR(36)` | UUID v7 as hyphenated string; consider `BINARY(16)` in future for space |
| Money | `BIGINT` | Integer paise (INR × 100); never float |
| Timestamp | `TIMESTAMP(3)` | Millisecond precision, UTC stored |
| Date | `DATE` | For academic dates, holidays |
| Time | `TIME` | For timetable periods |
| Phone | `VARCHAR(20)` | E.164 format validated at app layer |
| Email | `VARCHAR(255)` | Case-insensitive unique via collation |
| JSON | `JSON` | Native MySQL JSON type |
| Text | `TEXT` / `MEDIUMTEXT` | For content, audit payloads |
| Enum | `VARCHAR(32)` | Validated in app; avoid MySQL ENUM for flexibility |
| Boolean | `TINYINT(1)` | Prisma maps to boolean |

---

## 3. Standard columns (every table)

Unless noted otherwise, every domain table carries:

```
id              CHAR(36)        PK
school_id       CHAR(36)        NULL for platform-only, NOT NULL for tenant-owned
created_at      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
updated_at      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
created_by      CHAR(36)        NULL (user id)
updated_by      CHAR(36)        NULL
deleted_at      TIMESTAMP(3)    NULL (soft delete marker)
version         INT             NOT NULL DEFAULT 1 (optimistic locking on contested entities)
```

Platform-only tables omit `school_id`. Some tables omit `version` where concurrency is not an issue.

---

## 4. Index strategy

Every tenant-owned table has a composite index starting with `school_id`:
- `(school_id, <natural_key>)` for lookups
- `(school_id, created_at DESC)` for time-series
- `(school_id, status, ...)` for filtered lists

Foreign keys are indexed. Soft-delete-aware indexes use `(school_id, deleted_at, ...)` order.

---

## 5. Composite foreign keys

Within a tenant, every FK is composite:
```
FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id)
```

Platform → tenant references use simple FK:
```
FOREIGN KEY (school_id) REFERENCES schools(id)
```

---

## 6. Module → table mapping (complete inventory)

**Identity & Access**
- users, user_credentials, user_credential_history, user_sessions, refresh_tokens, user_devices, mfa_factors, mfa_recovery_codes, otps, password_reset_tokens, magic_links, impersonation_sessions, account_lockouts, api_keys

**Tenancy**
- schools, school_aliases, school_settings, school_configurations, branches, academic_years, academic_terms

**Roles & Permissions**
- roles, permissions, role_permissions, user_roles, permission_overrides, approvals

**Audit**
- audit_log, audit_anchors, audit_log_attachments

**Plans & Subscriptions** (1 model in `platform.prisma`, 6 in `subscriptions.prisma` as of Sprint 15/16)
- plans (in `platform.prisma`)
- plan_features, subscriptions, subscription_history, school_usage, usage_events, usage_threshold_state (in `subscriptions.prisma`)
- `plan_features.limit` is **signed BIGINT** (Sprint 15.0.2 hotfix `20260629000000_subscription_plan_feature_limit_bigint`) to support `storage_bytes` (PB-scale) without overflowing INT. Non-storage LIMIT keys (`student_count`, `staff_count`, `branch_count`, monthly SMS/WhatsApp/Email) all fit comfortably in BIGINT.
- *Not yet implemented in schema:* `plan_pricing_tiers`, `subscription_events`, `subscription_student_snapshots`, `subscription_addons`, `credit_packs`, `credit_pack_purchases`, `promo_codes`.

**Platform Billing**
- platform_invoices, platform_invoice_lines, platform_payments, platform_credit_notes, platform_refunds, platform_dunning_attempts, payment_methods, payment_provider_webhooks, gst_registrations, tax_codes

**Feature Flags**
- feature_flags, feature_flag_plan_defaults, feature_flag_tenant_overrides, feature_flag_role_overrides, feature_flag_change_log

**Notifications & Usage**
- notification_templates, notification_template_versions, dlt_template_registrations, waba_template_registrations, notification_provider_configs, notification_dispatches, delivery_receipts, recipient_preferences, suppression_entries, credit_pools, credit_transactions, credit_packs, credit_pack_purchases

**Academic Foundation**
- classes, sections, subjects, class_subjects, class_section_subject_teachers, timetable_periods, timetable_slots, holidays, events

**Students & Parents**
- students, student_admissions, student_status_history, student_documents, student_medical_info, guardians, student_guardians, student_consents

**Staff**
- staff, staff_employments, staff_documents, teacher_qualifications

**Attendance**
- student_attendance, staff_attendance, attendance_lock_windows

**School-side Fees**
- fee_categories, fee_structures, fee_components, fee_concession_policies, fee_assignments, fee_invoices, fee_invoice_lines, fee_receipts, fee_receipt_lines, fee_payments, fee_refunds, fee_credit_notes, fee_due_reminders

**Examinations**
- exam_schedules, exams, exam_subjects, marks, mark_edit_audit, grade_systems, grade_bands, report_card_templates, report_cards

**Adjacent Modules** (1-3 tables each)
- Library: library_items, library_loans, library_holds
- Transport: transport_routes, transport_stops, transport_vehicles, transport_assignments, transport_attendance
- Hostel: hostels, hostel_rooms, hostel_allocations, hostel_attendance
- Inventory: inventory_items, inventory_movements
- Visitor: visitor_passes
- Medical: medical_records, medical_visits
- Discipline: discipline_incidents, discipline_actions
- Complaints: complaints, complaint_responses
- Certificates: certificate_templates, certificate_issues
- Notices: notices, notice_recipients_log

**File Storage**
- file_assets, file_asset_acl_grants

**Background Jobs**
- jobs, job_runs

**Outbox & Webhooks**
- outbox_events, webhook_endpoints, webhook_deliveries

**Support**
- support_tickets, support_ticket_messages

**Reporting** (8 tables — `reporting.prisma`, Sprint 13)
- report_runs, import_jobs, import_job_issues, bulk_operations, dashboards, dashboard_widgets, report_schedules, report_templates
- *Legacy/pre-implementation names `saved_reports`, `report_subscriptions` are NOT present in the schema; the real tables are listed above.*

**Operational**
- tenant_sequences, idempotency_keys

**Total: 140 tables across 25 schema files (as of Sprint 16).** Earlier drafts of this doc estimated ~145; the actual implemented count is 140, and several modules listed above (adjacent modules, platform billing/GST, support, etc.) are still planned rather than present in `backend/prisma/schema/`. The authoritative per-file breakdown lives in `MODEL_INVENTORY.md` and `PRISMA_STRATEGY.md` §1.1.

---

## 7. Table specifications

### 7.1 Identity & Access

#### 7.1.1 `users`
**Purpose:** All users (tenant + platform). Central identity table.  
**Scope:** Tenant-owned (school_id NOT NULL) OR platform (school_id NULL)

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK, UUID v7 |
| school_id | CHAR(36) | YES | NULL | NULL = platform user |
| scope | VARCHAR(10) | NO | | 'tenant' or 'global' |
| email | VARCHAR(255) | YES | NULL | Case-insensitive |
| phone_e164 | VARCHAR(20) | YES | NULL | E.164 format |
| first_name | VARCHAR(100) | NO | | |
| last_name | VARCHAR(100) | NO | | |
| status | VARCHAR(20) | NO | 'invited' | 'invited', 'active', 'disabled', 'locked' |
| last_login_at | TIMESTAMP(3) | YES | NULL | |
| password_set_at | TIMESTAMP(3) | YES | NULL | |
| locale | VARCHAR(10) | NO | 'en-IN' | |
| timezone | VARCHAR(50) | NO | 'Asia/Kolkata' | |
| avatar_file_id | CHAR(36) | YES | NULL | FK to file_assets |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |
| deleted_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:**
- (school_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL
- (school_id, phone_e164) WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL

**Indexes:**
- (school_id, status, deleted_at)
- (email) WHERE scope = 'global'
- (phone_e164)

**FKs:**
- school_id → schools(id)
- avatar_file_id → file_assets(id)

---

#### 7.1.2 `user_credentials`
**Purpose:** Password hashes  
**Scope:** One row per user

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | FK to users |
| password_hash | VARCHAR(255) | NO | | Argon2id |
| password_set_at | TIMESTAMP(3) | NO | | |
| must_change_password | TINYINT(1) | NO | 0 | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** user_id  
**FKs:** user_id → users(id)

---

#### 7.1.3 `user_credential_history`
**Purpose:** Previous N password hashes to prevent reuse  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| password_hash | VARCHAR(255) | NO | | |
| set_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (user_id, set_at DESC)  
**FKs:** user_id → users(id)

---

#### 7.1.4 `user_sessions`
**Purpose:** Server-side session metadata  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| school_id | CHAR(36) | YES | NULL | NULL for platform sessions |
| created_at | TIMESTAMP(3) | NO | | |
| last_seen_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | NO | | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |
| revoked_reason | VARCHAR(100) | YES | NULL | |
| ip_address | VARCHAR(45) | YES | NULL | IPv6 max |
| user_agent | TEXT | YES | NULL | |
| client_name | VARCHAR(50) | YES | NULL | 'web', 'android-parent' |
| client_version | VARCHAR(20) | YES | NULL | |

**PK:** id  
**Indexes:**
- (user_id, revoked_at, expires_at)
- (school_id, user_id)

**FKs:**
- user_id → users(id)
- school_id → schools(id)

---

#### 7.1.5 `refresh_tokens`
**Purpose:** Opaque refresh tokens, hashed  
**Scope:** One active per session

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| session_id | CHAR(36) | NO | | FK to user_sessions |
| token_hash | VARCHAR(255) | NO | | SHA256 |
| created_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | NO | | |
| consumed_at | TIMESTAMP(3) | YES | NULL | Single-use rotation |
| revoked_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** token_hash  
**Indexes:** (session_id, consumed_at, revoked_at)  
**FKs:** session_id → user_sessions(id)

---

#### 7.1.6 `user_devices`
**Purpose:** Push token storage (mobile)  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| school_id | CHAR(36) | YES | NULL | |
| device_type | VARCHAR(20) | NO | | 'web', 'ios', 'android' |
| fcm_token | VARCHAR(255) | YES | NULL | |
| apns_token | VARCHAR(255) | YES | NULL | |
| app_version | VARCHAR(20) | YES | NULL | |
| last_seen_at | TIMESTAMP(3) | NO | | |
| created_at | TIMESTAMP(3) | NO | | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (user_id, revoked_at)  
**FKs:** user_id → users(id), school_id → schools(id)

---

#### 7.1.7 `mfa_factors`
**Purpose:** TOTP / WebAuthn credentials  
**Scope:** Per user

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| factor_type | VARCHAR(20) | NO | | 'totp', 'webauthn' |
| secret_encrypted | TEXT | YES | NULL | KMS-encrypted TOTP secret |
| webauthn_credential_id | VARCHAR(255) | YES | NULL | |
| webauthn_public_key | TEXT | YES | NULL | |
| name | VARCHAR(100) | YES | NULL | User-given name |
| verified_at | TIMESTAMP(3) | YES | NULL | |
| last_used_at | TIMESTAMP(3) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (user_id, revoked_at)  
**FKs:** user_id → users(id)

---

#### 7.1.8 `mfa_recovery_codes`
**Purpose:** Single-use backup codes  
**Scope:** Per user

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| code_hash | VARCHAR(255) | NO | | SHA256 |
| created_at | TIMESTAMP(3) | NO | | |
| consumed_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** code_hash  
**Indexes:** (user_id, consumed_at)  
**FKs:** user_id → users(id)

---

#### 7.1.9 `otps`
**Purpose:** Phone/email OTP codes  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| recipient | VARCHAR(255) | NO | | Phone or email |
| purpose | VARCHAR(50) | NO | | 'login', 'password_reset', 'verify_phone' |
| code_hash | VARCHAR(255) | NO | | SHA256 |
| created_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | NO | | |
| consumed_at | TIMESTAMP(3) | YES | NULL | |
| attempt_count | INT | NO | 0 | |

**PK:** id  
**Indexes:** (recipient, purpose, expires_at)  
**FKs:** None

---

#### 7.1.10 `password_reset_tokens`
**Purpose:** Password reset tokens (email-based)  
**Scope:** Per user

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| token_hash | VARCHAR(255) | NO | | SHA256 |
| created_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | NO | | |
| consumed_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** token_hash  
**FKs:** user_id → users(id)

---

#### 7.1.11 `magic_links`
**Purpose:** Passwordless login links  
**Scope:** Per user

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| token_hash | VARCHAR(255) | NO | | SHA256 |
| created_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | NO | | |
| consumed_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** token_hash  
**FKs:** user_id → users(id)

---

#### 7.1.12 `impersonation_sessions`
**Purpose:** Audit of Super Admin → tenant user impersonation  
**Scope:** Platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| impersonator_user_id | CHAR(36) | NO | | Platform user |
| impersonated_user_id | CHAR(36) | NO | | Tenant user |
| school_id | CHAR(36) | NO | | Target tenant |
| started_at | TIMESTAMP(3) | NO | | |
| ended_at | TIMESTAMP(3) | YES | NULL | |
| reason | TEXT | NO | | |
| ticket_ref | VARCHAR(100) | YES | NULL | Support ticket |

**PK:** id  
**Indexes:** (school_id, started_at), (impersonated_user_id)  
**FKs:**
- impersonator_user_id → users(id)
- impersonated_user_id → users(id)
- school_id → schools(id)

---

#### 7.1.13 `account_lockouts`
**Purpose:** Failed login attempt log  
**Scope:** Per user

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| user_id | CHAR(36) | NO | | |
| failed_at | TIMESTAMP(3) | NO | | |
| ip_address | VARCHAR(45) | YES | NULL | |
| user_agent | TEXT | YES | NULL | |

**PK:** id  
**Indexes:** (user_id, failed_at DESC)  
**FKs:** user_id → users(id)

---

#### 7.1.14 `api_keys`
**Purpose:** API keys for tenant integrations  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| key_prefix | VARCHAR(20) | NO | | Visible prefix |
| key_hash | VARCHAR(255) | NO | | SHA256 |
| name | VARCHAR(100) | NO | | User-given |
| scopes_json | JSON | NO | | Permissions |
| created_by | CHAR(36) | NO | | |
| created_at | TIMESTAMP(3) | NO | | |
| last_used_at | TIMESTAMP(3) | YES | NULL | |
| expires_at | TIMESTAMP(3) | YES | NULL | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, key_prefix, revoked_at) WHERE revoked_at IS NULL  
**Indexes:** (school_id, revoked_at)  
**FKs:** school_id → schools(id), created_by → users(id) (composite)

---

### 7.2 Tenancy

#### 7.2.1 `schools`
**Purpose:** Tenant (school) records  
**Scope:** Platform-only (no school_id column)

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| slug | VARCHAR(100) | NO | | Unique, subdomain |
| legal_name | VARCHAR(255) | NO | | |
| display_name | VARCHAR(255) | NO | | |
| logo_file_id | CHAR(36) | YES | NULL | |
| country_code | CHAR(2) | NO | 'IN' | ISO 3166-1 alpha-2 |
| gstin | VARCHAR(20) | YES | NULL | GST number |
| pan | VARCHAR(10) | YES | NULL | |
| address_line1 | VARCHAR(255) | NO | | |
| address_line2 | VARCHAR(255) | YES | NULL | |
| city | VARCHAR(100) | NO | | |
| state_code | VARCHAR(10) | NO | | |
| pincode | VARCHAR(10) | NO | | |
| phone | VARCHAR(20) | YES | NULL | |
| email | VARCHAR(255) | YES | NULL | |
| website | VARCHAR(255) | YES | NULL | |
| timezone | VARCHAR(50) | NO | 'Asia/Kolkata' | |
| locale_default | VARCHAR(10) | NO | 'en-IN' | |
| lifecycle_status | VARCHAR(20) | NO | 'DRAFT' | `DRAFT`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`, `DELETED` (DECISIONS D-027; trial/expiring live on the parallel Subscription FSM per D-028) |
| onboarded_at | TIMESTAMP(3) | YES | NULL | |
| archived_at | TIMESTAMP(3) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |
| deleted_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** slug WHERE deleted_at IS NULL  
**Indexes:** (status, created_at), (gstin)  
**FKs:** logo_file_id → file_assets(id)

---

#### 7.2.2 `school_aliases`
**Purpose:** Historical slugs for redirect  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| alias_slug | VARCHAR(100) | NO | | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** alias_slug  
**FKs:** school_id → schools(id)

---

#### 7.2.3 `school_settings`
**Purpose:** Per-school structured config  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| working_days_json | JSON | NO | | Array [1..5] = Mon-Fri |
| attendance_window_hours | INT | NO | 24 | Edit window |
| exam_edit_window_hours | INT | NO | 48 | |
| invoice_number_format | VARCHAR(100) | NO | 'INV/{FY}/{SEQ}' | |
| default_communication_language | VARCHAR(10) | NO | 'en-IN' | |
| quiet_hours_start | TIME | YES | NULL | |
| quiet_hours_end | TIME | YES | NULL | |
| privacy_policy_version | VARCHAR(20) | YES | NULL | |
| privacy_policy_accepted_at | TIMESTAMP(3) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** school_id  
**FKs:** school_id → schools(id)

---

#### 7.2.4 `school_configurations`
**Purpose:** Open KV store for tenant config  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| config_key | VARCHAR(100) | NO | | |
| value_json | JSON | NO | | |
| updated_by | CHAR(36) | YES | NULL | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, config_key)  
**FKs:** school_id → schools(id)

---

#### 7.2.5 `branches`
**Purpose:** Sub-organizations (campuses)  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| parent_branch_id | CHAR(36) | YES | NULL | Hierarchical |
| name | VARCHAR(100) | NO | | |
| code | VARCHAR(20) | NO | | |
| is_primary | TINYINT(1) | NO | 0 | |
| address_line1 | VARCHAR(255) | YES | NULL | |
| address_line2 | VARCHAR(255) | YES | NULL | |
| city | VARCHAR(100) | YES | NULL | |
| state_code | VARCHAR(10) | YES | NULL | |
| pincode | VARCHAR(10) | YES | NULL | |
| phone | VARCHAR(20) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |
| deleted_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, code) WHERE deleted_at IS NULL  
**Indexes:** (school_id, is_primary)  
**FKs:**
- school_id → schools(id)
- (school_id, parent_branch_id) → branches(school_id, id)

---

#### 7.2.6 `academic_years`
**Purpose:** Academic year periods  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| name | VARCHAR(100) | NO | | '2026-27' |
| start_date | DATE | NO | | |
| end_date | DATE | NO | | |
| is_current | TINYINT(1) | NO | 0 | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, is_current) WHERE is_current = 1  
**Indexes:** (school_id, start_date)  
**FKs:** school_id → schools(id)

---

#### 7.2.7 `academic_terms`
**Purpose:** Terms / quarters within a year  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| academic_year_id | CHAR(36) | NO | | |
| name | VARCHAR(100) | NO | | 'Term 1' |
| start_date | DATE | NO | | |
| end_date | DATE | NO | | |
| sequence | INT | NO | | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, academic_year_id, sequence)  
**FKs:** (school_id, academic_year_id) → academic_years(school_id, id)

---

### 7.3 Roles & Permissions

#### 7.3.1 `roles`
**Purpose:** Role catalog  
**Scope:** Tenant-owned OR system (school_id NULL)

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = system role |
| code | VARCHAR(50) | NO | | |
| name | VARCHAR(100) | NO | | |
| description | TEXT | YES | NULL | |
| is_system | TINYINT(1) | NO | 0 | Immutable |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |
| deleted_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, code) WHERE deleted_at IS NULL  
**FKs:** school_id → schools(id)

---

#### 7.3.2 `permissions`
**Purpose:** Fine-grained permission catalog  
**Scope:** System (no school_id)

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| code | VARCHAR(100) | NO | | 'students.read' |
| description | TEXT | NO | | |
| category | VARCHAR(50) | NO | | 'students', 'fees', etc. |
| is_dangerous | TINYINT(1) | NO | 0 | Requires 4-eyes |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** code

---

#### 7.3.3 `role_permissions`
**Purpose:** Many-to-many role ↔ permission  
**Scope:** Tenant + system

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| role_id | CHAR(36) | NO | | |
| permission_id | CHAR(36) | NO | | |
| granted_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (role_id, permission_id)  
**FKs:**
- role_id → roles(id)
- permission_id → permissions(id)

---

#### 7.3.4 `user_roles`
**Purpose:** User → role assignments  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| user_id | CHAR(36) | NO | | |
| role_id | CHAR(36) | NO | | |
| branch_id | CHAR(36) | YES | NULL | Branch-scoped |
| granted_by | CHAR(36) | YES | NULL | |
| granted_at | TIMESTAMP(3) | NO | | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |
| valid_from | TIMESTAMP(3) | YES | NULL | |
| valid_until | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (school_id, user_id, revoked_at)  
**FKs:**
- (school_id, user_id) → users(school_id, id)
- role_id → roles(id)
- (school_id, branch_id) → branches(school_id, id)

---

#### 7.3.5 `permission_overrides`
**Purpose:** Per-user permission grant/deny  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| user_id | CHAR(36) | NO | | |
| permission_id | CHAR(36) | NO | | |
| effect | VARCHAR(10) | NO | | 'allow' or 'deny' |
| granted_by | CHAR(36) | YES | NULL | |
| granted_at | TIMESTAMP(3) | NO | | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, user_id, permission_id, revoked_at) WHERE revoked_at IS NULL  
**FKs:**
- (school_id, user_id) → users(school_id, id)
- permission_id → permissions(id)

---

#### 7.3.6 `approvals`
**Purpose:** 4-eyes approval queue  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = platform |
| action_type | VARCHAR(100) | NO | | |
| payload_json | JSON | NO | | |
| requested_by | CHAR(36) | NO | | |
| requested_at | TIMESTAMP(3) | NO | | |
| approver_user_id | CHAR(36) | YES | NULL | |
| approved_at | TIMESTAMP(3) | YES | NULL | |
| decision | VARCHAR(20) | NO | 'pending' | 'pending', 'approved', 'rejected' |
| decision_reason | TEXT | YES | NULL | |
| executed_at | TIMESTAMP(3) | YES | NULL | |
| result_json | JSON | YES | NULL | |
| expires_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (school_id, decision, requested_at)  
**FKs:** school_id → schools(id), requested_by → users(id)

---

### 7.4 Audit

#### 7.4.1 `audit_log`
**Purpose:** Append-only audit trail  
**Scope:** Tenant + platform  
**Partition:** Monthly by created_at

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = platform action |
| actor_user_id | CHAR(36) | NO | | |
| actor_scope | VARCHAR(10) | NO | | 'tenant' or 'global' |
| impersonator_user_id | CHAR(36) | YES | NULL | |
| action | VARCHAR(100) | NO | | 'student.update' |
| category | VARCHAR(20) | NO | 'general' | 'general', 'finance', 'security', 'tenancy' |
| resource_type | VARCHAR(50) | NO | | |
| resource_id | CHAR(36) | YES | NULL | |
| before_json | MEDIUMTEXT | YES | NULL | |
| after_json | MEDIUMTEXT | YES | NULL | |
| ip_address | VARCHAR(45) | YES | NULL | |
| user_agent | TEXT | YES | NULL | |
| request_id | CHAR(36) | NO | | |
| prev_hash | VARCHAR(64) | YES | NULL | Finance chain |
| row_hash | VARCHAR(64) | YES | NULL | SHA256 |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:**
- (school_id, created_at DESC)
- (school_id, resource_type, resource_id, created_at DESC)
- (actor_user_id, created_at DESC)
- (category, created_at DESC)

**FKs:**
- school_id → schools(id)
- actor_user_id → users(id)

---

#### 7.4.2 `audit_anchors`
**Purpose:** Hash chain anchors (WORM S3)  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| category | VARCHAR(20) | NO | | 'finance' |
| period_start | TIMESTAMP(3) | NO | | |
| period_end | TIMESTAMP(3) | NO | | |
| last_row_hash | VARCHAR(64) | NO | | |
| external_storage_uri | VARCHAR(500) | NO | | S3 URL |
| external_object_etag | VARCHAR(100) | NO | | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, category, period_start)  
**FKs:** school_id → schools(id)

---

#### 7.4.3 `audit_log_attachments`
**Purpose:** Supporting docs for audit rows  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| audit_log_id | CHAR(36) | NO | | |
| file_id | CHAR(36) | NO | | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (school_id, audit_log_id)  
**FKs:**
- (school_id, audit_log_id) → audit_log(school_id, id)
- file_id → file_assets(id)

---

### 7.5 Plans, Subscriptions & Platform Billing

#### 7.5.1 `plans`
**Purpose:** Plan catalog  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| code | VARCHAR(50) | NO | | 'starter', 'standard', 'premium' |
| name | VARCHAR(100) | NO | | |
| description | TEXT | YES | NULL | |
| is_active | TINYINT(1) | NO | 1 | |
| is_public | TINYINT(1) | NO | 1 | On pricing page |
| default_currency | CHAR(3) | NO | 'INR' | |
| created_at | TIMESTAMP(3) | NO | | |
| deprecated_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** code

---

#### 7.5.2 `plan_pricing_tiers`
**Purpose:** Pricing per plan × region × cycle  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| plan_id | CHAR(36) | NO | | |
| country_code | CHAR(2) | NO | 'IN' | |
| currency | CHAR(3) | NO | 'INR' | |
| cycle | VARCHAR(20) | NO | | 'monthly', 'quarterly', 'annual' |
| base_price_inr_paise | BIGINT | NO | | |
| per_student_price_inr_paise | BIGINT | NO | | |
| included_students | INT | NO | 0 | |
| valid_from | TIMESTAMP(3) | NO | | |
| valid_until | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (plan_id, country_code, cycle, valid_from)  
**FKs:** plan_id → plans(id)

---

#### 7.5.3 `plan_features`
**Purpose:** Per-plan feature configuration (LIMIT caps + TOGGLE bits)
**Scope:** Platform-only

> **Sprint 15.0.2 hotfix:** `limit` is **signed BIGINT** (migration `20260629000000_subscription_plan_feature_limit_bigint`), widened from INT so `storage_bytes` can hold PB-scale caps without overflowing INT (~2.1 GB max). Non-storage LIMIT keys (`student_count`, `staff_count`, `branch_count`, monthly SMS/WhatsApp/Email) all fit comfortably in BIGINT and round-trip through JS Number at the repo boundary (safe up to ~9 PB).

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| plan_id | CHAR(36) | NO | | |
| flag_id | CHAR(36) | NO | | |
| enabled | TINYINT(1) | NO | 1 | |
| quota_int | INT | YES | NULL | For quotas |
| quota_window | VARCHAR(20) | YES | NULL | 'day', 'month', 'cycle' |

**PK:** id  
**Unique:** (plan_id, flag_id)  
**FKs:**
- plan_id → plans(id)
- flag_id → feature_flags(id)

---

#### 7.5.4 `subscriptions`
**Purpose:** Contract between platform ↔ school  
**Scope:** Platform-only (but references school)

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | FK to schools |
| plan_id | CHAR(36) | NO | | |
| pricing_tier_id | CHAR(36) | NO | | |
| status | VARCHAR(20) | NO | 'PENDING' | `PENDING`, `TRIAL`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `CANCELLED` (canonical Sprint 15 enum; DECISIONS D-028) |
| started_at | TIMESTAMP(3) | NO | | |
| current_period_start | TIMESTAMP(3) | NO | | |
| current_period_end | TIMESTAMP(3) | NO | | |
| cancel_at | TIMESTAMP(3) | YES | NULL | |
| cancelled_at | TIMESTAMP(3) | YES | NULL | |
| next_invoice_at | TIMESTAMP(3) | YES | NULL | |
| last_renewal_at | TIMESTAMP(3) | YES | NULL | |
| auto_renew | TINYINT(1) | NO | 1 | |
| payment_method_id | CHAR(36) | YES | NULL | |
| notes | TEXT | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** school_id (one subscription per tenant in v1)  
**Indexes:** (status, next_invoice_at)  
**FKs:**
- school_id → schools(id)
- plan_id → plans(id)
- pricing_tier_id → plan_pricing_tiers(id)

---

#### 7.5.5 `subscription_events`
**Purpose:** Event log for subscription lifecycle  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| subscription_id | CHAR(36) | NO | | |
| event_type | VARCHAR(50) | NO | | 'trial_started', 'plan_changed', 'suspended' |
| metadata_json | JSON | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (subscription_id, created_at DESC)  
**FKs:** subscription_id → subscriptions(id)

---

#### 7.5.6 `subscription_student_snapshots`
**Purpose:** Metering snapshots  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| subscription_id | CHAR(36) | NO | | |
| school_id | CHAR(36) | NO | | |
| snapshot_date | DATE | NO | | |
| student_count | INT | NO | | |
| recorded_at | TIMESTAMP(3) | NO | | |
| recorded_by | CHAR(36) | YES | NULL | User or system |

**PK:** id  
**Unique:** (subscription_id, snapshot_date)  
**FKs:**
- subscription_id → subscriptions(id)
- school_id → schools(id)

---

#### 7.5.7 `billing_accounts`
**Purpose:** Root SaaS-billing row per school. One per school. Carries the running balance and aggregates.  
**Scope:** Platform-only (Sprint 20). Strictly separate from `fee_invoices` (School Fees, see §7.x). Multi-tenant filter by `school_id` column; the FK chain for invoices/payments/refunds points to this row, not to `schools` directly.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| school_id | CHAR(36) | NO | | Unique — one account per school |
| account_number | VARCHAR(40) | NO | | Unique. Issued via `SequenceService` (`BILLING_ACCOUNT`) |
| currency | CHAR(3) | NO | 'INR' | |
| balance_due | DECIMAL(14,2) | NO | 0 | Positive = school owes platform |
| credit_balance | DECIMAL(14,2) | NO | 0 | Unused credit on account |
| total_invoiced | DECIMAL(14,2) | NO | 0 | Lifetime sum |
| total_paid | DECIMAL(14,2) | NO | 0 | Lifetime sum |
| total_refunded | DECIMAL(14,2) | NO | 0 | Lifetime sum |
| is_active | TINYINT(1) | NO | 1 | |
| last_invoice_at | TIMESTAMP(3) | YES | NULL | |
| last_payment_at | TIMESTAMP(3) | YES | NULL | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | Optimistic concurrency |

**PK:** id  
**Unique:** (school_id), (account_number)  
**Indexes:** (school_id, is_active), (deleted_at)

---

#### 7.5.8 `billing_profiles`
**Purpose:** Legal billing identity for the account. 1:1 with `billing_accounts`.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | Unique — 1:1 with account |
| legal_name | VARCHAR(255) | NO | | |
| display_name | VARCHAR(255) | YES | NULL | |
| contact_name | VARCHAR(255) | YES | NULL | |
| contact_email | VARCHAR(255) | NO | | |
| contact_phone | VARCHAR(40) | YES | NULL | |
| cc_emails | VARCHAR(1000) | YES | NULL | Comma-separated |
| website | VARCHAR(255) | YES | NULL | |
| notes | VARCHAR(1000) | YES | NULL | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (account_id)  
**FKs:** account_id → billing_accounts(id) ON DELETE CASCADE

---

#### 7.5.9 `billing_addresses`
**Purpose:** Postal/legal address for the account. 1:1. Drives GST place-of-supply.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | Unique |
| address_line1 | VARCHAR(255) | NO | | |
| address_line2 | VARCHAR(255) | YES | NULL | |
| city | VARCHAR(100) | NO | | |
| state_code | VARCHAR(10) | NO | | ISO-3166-2:IN code |
| state_name | VARCHAR(100) | NO | | |
| pincode | VARCHAR(10) | NO | | |
| country_code | CHAR(2) | NO | 'IN' | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (account_id)  
**FKs:** account_id → billing_accounts(id) ON DELETE CASCADE

---

#### 7.5.10 `billing_tax_details`
**Purpose:** GSTIN/PAN per account. 1:1. Carries `place_of_supply` used to choose CGST+SGST vs IGST.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | Unique |
| gstin | VARCHAR(15) | YES | NULL | |
| pan | VARCHAR(10) | YES | NULL | |
| place_of_supply | VARCHAR(10) | YES | NULL | State code; compared against platform state code from `billing_settings` |
| tax_exempt | TINYINT(1) | NO | 0 | |
| exempt_reason | VARCHAR(500) | YES | NULL | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (account_id)  
**FKs:** account_id → billing_accounts(id) ON DELETE CASCADE

---

#### 7.5.11 `billing_settings`
**Purpose:** Per-school billing configuration. 1:1 with account. Carries grace period, lead days, auto-charge, default payment source, reminder offsets.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | Unique |
| school_id | CHAR(36) | NO | | Unique — denormalised filter |
| grace_period_days | INT | NO | 7 | Default 7d |
| billing_lead_days | INT | NO | 7 | Days before period start to issue invoice |
| auto_charge_enabled | TINYINT(1) | NO | 0 | |
| default_payment_source_id | CHAR(36) | YES | NULL | → billing_payment_sources(id) (no FK constraint) |
| invoice_prefix | VARCHAR(10) | YES | NULL | Overrides default INV- prefix |
| reminders_enabled | TINYINT(1) | NO | 1 | |
| reminder_offsets_json | JSON | YES | NULL | Days-relative offsets for reminders |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (account_id), (school_id)  
**FKs:** account_id → billing_accounts(id) ON DELETE CASCADE

---

#### 7.5.12 `billing_payment_sources`
**Purpose:** Platform-managed payment sources. RAZORPAY rows carry encrypted gateway credentials; UPI/BANK/MANUAL rows carry human-readable handles.  
**Scope:** Platform-only. **Not** per-school — these are platform-wide payment options.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| source_type | VARCHAR(20) | NO | | RAZORPAY / UPI / BANK / MANUAL |
| name | VARCHAR(120) | NO | | Display name |
| description | VARCHAR(500) | YES | NULL | |
| is_active | TINYINT(1) | NO | 1 | |
| is_default | TINYINT(1) | NO | 0 | |
| priority | INT | NO | 0 | Sort order |
| razorpay_key_id | VARCHAR(80) | YES | NULL | RAZORPAY only |
| razorpay_key_secret_enc | VARCHAR(500) | YES | NULL | Envelope-encrypted via `CryptoService.sealString` |
| razorpay_webhook_secret_enc | VARCHAR(500) | YES | NULL | Envelope-encrypted |
| upi_handle | VARCHAR(120) | YES | NULL | UPI only |
| bank_name | VARCHAR(120) | YES | NULL | BANK only |
| bank_account_number | VARCHAR(40) | YES | NULL | BANK only |
| bank_ifsc | VARCHAR(20) | YES | NULL | BANK only |
| bank_branch | VARCHAR(120) | YES | NULL | BANK only |
| bank_account_holder | VARCHAR(120) | YES | NULL | BANK only |
| instructions | VARCHAR(1000) | YES | NULL | Free-text payment instructions |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Indexes:** (source_type, is_active, priority), (is_active, is_default), (deleted_at)

---

#### 7.5.13 `billing_invoices`
**Purpose:** SaaS invoice header. FY-scoped invoice number from `SequenceService` (`BILLING_INVOICE`). Carries totals, snapshots, FSM status.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | → billing_accounts |
| school_id | CHAR(36) | NO | | Denormalised filter |
| invoice_number | VARCHAR(60) | NO | | Unique. e.g. `INV-2627-000001` |
| status | VARCHAR(20) | NO | 'DRAFT' | InvoiceStatus enum: DRAFT/PENDING/PARTIALLY_PAID/PAID/OVERDUE/VOID/REFUNDED/WRITTEN_OFF |
| fiscal_year | VARCHAR(7) | NO | | e.g. `2026-27` |
| subscription_id | CHAR(36) | YES | NULL | The subscription this invoice represents |
| billing_cycle | VARCHAR(20) | YES | NULL | MONTHLY / YEARLY / TRIAL / etc. (snapshot string) |
| period_start | TIMESTAMP(3) | YES | NULL | |
| period_end | TIMESTAMP(3) | YES | NULL | |
| issued_at | TIMESTAMP(3) | YES | NULL | |
| due_date | TIMESTAMP(3) | YES | NULL | |
| paid_at | TIMESTAMP(3) | YES | NULL | |
| voided_at | TIMESTAMP(3) | YES | NULL | |
| void_reason | VARCHAR(500) | YES | NULL | |
| currency | CHAR(3) | NO | 'INR' | |
| subtotal | DECIMAL(14,2) | NO | 0 | |
| discount_total | DECIMAL(14,2) | NO | 0 | |
| tax_total | DECIMAL(14,2) | NO | 0 | |
| total_amount | DECIMAL(14,2) | NO | 0 | |
| amount_paid | DECIMAL(14,2) | NO | 0 | |
| amount_refunded | DECIMAL(14,2) | NO | 0 | |
| amount_due | DECIMAL(14,2) | NO | 0 | |
| profile_snapshot | JSON | YES | NULL | Captured at issue time |
| address_snapshot | JSON | YES | NULL | |
| tax_snapshot | JSON | YES | NULL | |
| notes | VARCHAR(1000) | YES | NULL | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (invoice_number)  
**Indexes:** (school_id, status, due_date), (account_id, status), (status, due_date), (fiscal_year), (subscription_id), (deleted_at)  
**FKs:** account_id → billing_accounts(id) ON DELETE RESTRICT

---

#### 7.5.14 `billing_invoice_lines`
**Purpose:** Line items on a SaaS invoice. Discriminated by `line_type`.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| invoice_id | CHAR(36) | NO | | |
| line_type | VARCHAR(20) | NO | | SUBSCRIPTION / ADJUSTMENT / TAX / DISCOUNT |
| description | VARCHAR(500) | NO | | |
| quantity | DECIMAL(10,2) | NO | 1 | |
| unit_price | DECIMAL(14,2) | NO | 0 | |
| amount | DECIMAL(14,2) | NO | 0 | quantity × unit_price |
| tax_code | VARCHAR(20) | YES | NULL | HSN/SAC |
| tax_rate | DECIMAL(5,2) | YES | NULL | % |
| tax_amount | DECIMAL(14,2) | NO | 0 | Computed by `splitGstTax` |
| metadata | JSON | YES | NULL | |
| sort_order | INT | NO | 0 | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (invoice_id, sort_order)  
**FKs:** invoice_id → billing_invoices(id) ON DELETE CASCADE

---

#### 7.5.15 `billing_invoice_history`
**Purpose:** Append-only history per invoice. Every meaningful action recorded with optional from→to status transition.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| invoice_id | CHAR(36) | NO | | |
| school_id | CHAR(36) | NO | | Denormalised filter |
| action | VARCHAR(40) | NO | | InvoiceHistoryAction enum (CREATED / ISSUED / SENT / PAYMENT_RECEIVED / PARTIAL_PAYMENT / PAID / VOIDED / REFUNDED / PARTIALLY_REFUNDED / WRITTEN_OFF / MARKED_OVERDUE / ADJUSTMENT_APPLIED / CREDIT_NOTE_APPLIED) |
| from_status | VARCHAR(20) | YES | NULL | |
| to_status | VARCHAR(20) | YES | NULL | |
| amount | DECIMAL(14,2) | YES | NULL | Amount associated with the event |
| notes | VARCHAR(1000) | YES | NULL | |
| actor_user_id | CHAR(36) | YES | NULL | |
| metadata | JSON | YES | NULL | |
| occurred_at | TIMESTAMP(3) | NO | now() | |

**PK:** id  
**Indexes:** (invoice_id, occurred_at), (school_id, action, occurred_at)  
**FKs:** invoice_id → billing_invoices(id) ON DELETE CASCADE

---

#### 7.5.16 `billing_payments`
**Purpose:** One recorded SaaS payment. Razorpay payments land in APPROVED on signature verify; manual payments start PENDING and follow approve/reject/hold/fail flow.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | |
| invoice_id | CHAR(36) | YES | NULL | Payments can be account-level (advance) |
| school_id | CHAR(36) | NO | | Denormalised filter |
| receipt_number | VARCHAR(60) | NO | | Unique |
| method | VARCHAR(20) | NO | | RAZORPAY / UPI / BANK_TRANSFER / CASH / CHEQUE / CARD |
| status | VARCHAR(20) | NO | 'PENDING' | PaymentStatus enum (PENDING/APPROVED/REJECTED/ON_HOLD/FAILED/REFUNDED/PARTIALLY_REFUNDED) |
| currency | CHAR(3) | NO | 'INR' | |
| amount | DECIMAL(14,2) | NO | 0 | Gross |
| amount_refunded | DECIMAL(14,2) | NO | 0 | |
| fee_amount | DECIMAL(14,2) | NO | 0 | Gateway fee |
| net_amount | DECIMAL(14,2) | NO | 0 | amount − fee_amount |
| fiscal_year | VARCHAR(7) | NO | | |
| gateway_order_id | VARCHAR(60) | YES | NULL | Razorpay order id |
| gateway_payment_id | VARCHAR(60) | YES | NULL | Razorpay payment id |
| gateway_signature | VARCHAR(255) | YES | NULL | HMAC signature |
| external_reference | VARCHAR(255) | YES | NULL | Manual: UPI handle / bank ref / cheque no |
| proof_url | VARCHAR(500) | YES | NULL | File link for manual proof |
| payer_notes | VARCHAR(1000) | YES | NULL | |
| received_at | TIMESTAMP(3) | YES | NULL | |
| approved_at | TIMESTAMP(3) | YES | NULL | |
| approved_by | CHAR(36) | YES | NULL | |
| rejected_at | TIMESTAMP(3) | YES | NULL | |
| rejected_by | CHAR(36) | YES | NULL | |
| rejection_reason | VARCHAR(500) | YES | NULL | |
| hold_reason | VARCHAR(500) | YES | NULL | |
| payment_source_id | CHAR(36) | YES | NULL | → billing_payment_sources(id) (no FK constraint) |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (receipt_number)  
**Indexes:** (school_id, status, created_at), (account_id, status), (invoice_id, status), (gateway_order_id), (gateway_payment_id), (deleted_at)  
**FKs:** account_id → billing_accounts(id) ON DELETE RESTRICT; invoice_id → billing_invoices(id) ON DELETE SET NULL

---

#### 7.5.17 `billing_payment_attempts`
**Purpose:** Append-only attempt log per `billing_payments` row. Stores raw gateway response for forensic replay.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| payment_id | CHAR(36) | NO | | |
| status | VARCHAR(20) | NO | | INITIATED / SUCCESS / FAILED / EXPIRED |
| amount | DECIMAL(14,2) | NO | | |
| gateway_order_id | VARCHAR(60) | YES | NULL | |
| gateway_payment_id | VARCHAR(60) | YES | NULL | |
| error_code | VARCHAR(80) | YES | NULL | |
| error_message | VARCHAR(1000) | YES | NULL | |
| raw_response | JSON | YES | NULL | |
| attempted_at | TIMESTAMP(3) | NO | now() | |

**PK:** id  
**Indexes:** (payment_id, attempted_at)  
**FKs:** payment_id → billing_payments(id) ON DELETE CASCADE

---

#### 7.5.18 `billing_refunds`
**Purpose:** Refund against a `billing_payments` row, optionally targeted to a specific invoice.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | |
| invoice_id | CHAR(36) | YES | NULL | |
| payment_id | CHAR(36) | NO | | The payment being refunded |
| school_id | CHAR(36) | NO | | |
| refund_number | VARCHAR(60) | NO | | Unique |
| status | VARCHAR(20) | NO | 'PENDING' | PENDING / APPROVED / PROCESSED / REJECTED / FAILED |
| currency | CHAR(3) | NO | 'INR' | |
| amount | DECIMAL(14,2) | NO | | |
| reason | VARCHAR(500) | NO | | |
| approved_at | TIMESTAMP(3) | YES | NULL | |
| approved_by | CHAR(36) | YES | NULL | |
| rejected_at | TIMESTAMP(3) | YES | NULL | |
| rejected_by | CHAR(36) | YES | NULL | |
| rejection_reason | VARCHAR(500) | YES | NULL | |
| processed_at | TIMESTAMP(3) | YES | NULL | |
| processed_by | CHAR(36) | YES | NULL | |
| gateway_refund_id | VARCHAR(60) | YES | NULL | |
| external_reference | VARCHAR(255) | YES | NULL | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (refund_number)  
**Indexes:** (school_id, status, created_at), (payment_id), (invoice_id), (deleted_at)  
**FKs:** account_id → billing_accounts(id) ON DELETE RESTRICT; invoice_id → billing_invoices(id) ON DELETE SET NULL; payment_id → billing_payments(id) ON DELETE RESTRICT

---

#### 7.5.19 `billing_credit_notes`
**Purpose:** Credit note header. Issued against an invoice (or account-level), applied to a future invoice, optionally voided.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | |
| invoice_id | CHAR(36) | YES | NULL | Source invoice (if tied to one) |
| school_id | CHAR(36) | NO | | |
| credit_note_number | VARCHAR(60) | NO | | Unique. FY-scoped |
| status | VARCHAR(20) | NO | 'ISSUED' | ISSUED / APPLIED / VOID |
| currency | CHAR(3) | NO | 'INR' | |
| amount | DECIMAL(14,2) | NO | | |
| amount_applied | DECIMAL(14,2) | NO | 0 | |
| reason | VARCHAR(500) | NO | | |
| fiscal_year | VARCHAR(7) | NO | | |
| applied_at | TIMESTAMP(3) | YES | NULL | |
| applied_to_invoice_id | CHAR(36) | YES | NULL | Target invoice when applied |
| voided_at | TIMESTAMP(3) | YES | NULL | |
| void_reason | VARCHAR(500) | YES | NULL | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Unique:** (credit_note_number)  
**Indexes:** (school_id, status, created_at), (invoice_id), (deleted_at)  
**FKs:** account_id → billing_accounts(id) ON DELETE RESTRICT; invoice_id → billing_invoices(id) ON DELETE SET NULL

---

#### 7.5.20 `billing_adjustments`
**Purpose:** Manual credit/debit applied directly to the account (promotional credit, goodwill, interest, fees). Optionally tied to a specific invoice.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | NO | | |
| invoice_id | CHAR(36) | YES | NULL | |
| school_id | CHAR(36) | NO | | |
| kind | VARCHAR(10) | NO | | CREDIT / DEBIT |
| currency | CHAR(3) | NO | 'INR' | |
| amount | DECIMAL(14,2) | NO | | |
| reason | VARCHAR(500) | NO | | |
| created_at / updated_at / created_by / updated_by | std | | | |
| deleted_at / deleted_by | YES | NULL | Soft-delete |
| version | INT | NO | 1 | |

**PK:** id  
**Indexes:** (school_id, created_at), (account_id, kind), (invoice_id), (deleted_at)  
**FKs:** account_id → billing_accounts(id) ON DELETE RESTRICT

---

#### 7.5.21 `billing_audits`
**Purpose:** Append-only billing-specific audit trail. Lives alongside the global `audit_logs` (which still carries the finance-chain hash for money operations). This table is the chronological operator-facing trail.  
**Scope:** Platform-only.

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | uuid | PK |
| account_id | CHAR(36) | YES | NULL | |
| school_id | CHAR(36) | NO | | |
| action | VARCHAR(40) | NO | | BillingAuditAction enum (ACCOUNT_CREATED / PROFILE_UPDATED / ADDRESS_UPDATED / TAX_DETAILS_UPDATED / INVOICE_CREATED / INVOICE_ISSUED / INVOICE_VOIDED / INVOICE_WRITTEN_OFF / PAYMENT_RECORDED / PAYMENT_APPROVED / PAYMENT_REJECTED / PAYMENT_HELD / PAYMENT_FAILED / REFUND_CREATED / REFUND_APPROVED / REFUND_PROCESSED / REFUND_REJECTED / CREDIT_NOTE_ISSUED / CREDIT_NOTE_APPLIED / CREDIT_NOTE_VOIDED / ADJUSTMENT_APPLIED / SETTINGS_UPDATED / PAYMENT_SOURCE_CONFIGURED / PAYMENT_SOURCE_DISABLED) |
| resource_type | VARCHAR(40) | YES | NULL | |
| resource_id | CHAR(36) | YES | NULL | |
| actor_user_id | CHAR(36) | YES | NULL | |
| summary | VARCHAR(500) | YES | NULL | |
| metadata | JSON | YES | NULL | |
| occurred_at | TIMESTAMP(3) | NO | now() | |

**PK:** id  
**Indexes:** (school_id, action, occurred_at), (account_id, occurred_at), (resource_type, resource_id)  
**FKs:** account_id → billing_accounts(id) ON DELETE SET NULL

---

> **Sprint 20 deferrals.** Dunning state machine and reminder attempts log; auto-charge mandate store; GST IRN issuance records; GSTR-1 export run records; TDS certificate uploads; provider-webhook idempotency log. These are intentionally not part of v1 — see `DEVELOPMENT_ROADMAP.md` and `BILLING_FUTURE_ENHANCEMENTS.md`.

### 7.6 Feature Flags

#### 7.6.1 `feature_flags`
**Purpose:** Global flag registry  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| code | VARCHAR(100) | NO | | 'module.fees' |
| name | VARCHAR(100) | NO | | |
| description | TEXT | YES | NULL | |
| kind | VARCHAR(20) | NO | | 'module', 'release', 'experiment' |
| owner | VARCHAR(100) | YES | NULL | Team |
| default_value | TINYINT(1) | NO | 0 | |
| cleanup_due_at | TIMESTAMP(3) | YES | NULL | For release flags |
| lifecycle_stage | VARCHAR(20) | NO | 'introduced' | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** code

---

#### 7.6.2 `feature_flag_plan_defaults`
**Purpose:** Plan → flag defaults  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| plan_id | CHAR(36) | NO | | |
| flag_id | CHAR(36) | NO | | |
| value | TINYINT(1) | NO | | |
| quota_int | INT | YES | NULL | |
| quota_window | VARCHAR(20) | YES | NULL | |

**PK:** id  
**Unique:** (plan_id, flag_id)  
**FKs:**
- plan_id → plans(id)
- flag_id → feature_flags(id)

---

#### 7.6.3 `feature_flag_tenant_overrides`
**Purpose:** Per-tenant overrides  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| flag_id | CHAR(36) | NO | | |
| value | TINYINT(1) | NO | | |
| quota_int | INT | YES | NULL | |
| reason | TEXT | YES | NULL | |
| set_by | CHAR(36) | NO | | |
| set_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, flag_id, expires_at) WHERE expires_at IS NULL  
**FKs:**
- school_id → schools(id)
- flag_id → feature_flags(id)

---

#### 7.6.4 `feature_flag_role_overrides`
**Purpose:** Per-role overrides  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| role_id | CHAR(36) | NO | | |
| flag_id | CHAR(36) | NO | | |
| value | TINYINT(1) | NO | | |
| set_by | CHAR(36) | NO | | |
| set_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, role_id, flag_id, expires_at) WHERE expires_at IS NULL  
**FKs:**
- school_id → schools(id)
- role_id → roles(id)
- flag_id → feature_flags(id)

---

#### 7.6.5 `feature_flag_change_log`
**Purpose:** Audit of flag toggles  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = plan/system change |
| flag_id | CHAR(36) | NO | | |
| before_value | TINYINT(1) | YES | NULL | |
| after_value | TINYINT(1) | NO | | |
| scope | VARCHAR(20) | NO | | 'plan', 'tenant', 'role' |
| actor_user_id | CHAR(36) | NO | | |
| reason | TEXT | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (school_id, flag_id, created_at DESC)  
**FKs:**
- school_id → schools(id)
- flag_id → feature_flags(id)
- actor_user_id → users(id)

---

### 7.7 Notifications & Usage

#### 7.7.1 `notification_templates`
**Purpose:** Template catalog  
**Scope:** Platform (system templates) + tenant overrides

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = system template |
| code | VARCHAR(100) | NO | | 'attendance.absent' |
| channel | VARCHAR(20) | NO | | 'sms', 'whatsapp', 'email', 'push' |
| category | VARCHAR(20) | NO | | 'transactional', 'promotional' |
| default_locale | VARCHAR(10) | NO | 'en-IN' | |
| is_active | TINYINT(1) | NO | 1 | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, code, channel) WHERE school_id IS NOT NULL  
**Indexes:** (school_id, channel, is_active)  
**FKs:** school_id → schools(id)

---

#### 7.7.2 `notification_template_versions`
**Purpose:** Versioned content per locale  
**Scope:** Per template

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| template_id | CHAR(36) | NO | | |
| locale | VARCHAR(10) | NO | | |
| version | INT | NO | | |
| subject | VARCHAR(255) | YES | NULL | For email |
| body | TEXT | NO | | |
| variables_json | JSON | NO | | Placeholders |
| dlt_template_id | CHAR(36) | YES | NULL | FK if SMS |
| waba_template_id | CHAR(36) | YES | NULL | FK if WhatsApp |
| approved_at | TIMESTAMP(3) | YES | NULL | |
| is_active | TINYINT(1) | NO | 1 | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (template_id, locale, version)  
**FKs:**
- template_id → notification_templates(id)
- dlt_template_id → dlt_template_registrations(id)
- waba_template_id → waba_template_registrations(id)

---

#### 7.7.3 `dlt_template_registrations`
**Purpose:** TRAI DLT registration (India SMS)  
**Scope:** Platform + tenant

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = platform |
| dlt_template_id | VARCHAR(100) | NO | | External DLT ID |
| entity_id | VARCHAR(100) | NO | | |
| sender_id | VARCHAR(10) | NO | | 6-char alphabetic |
| category | VARCHAR(20) | NO | | 'transactional', 'promotional' |
| status | VARCHAR(20) | NO | 'pending' | 'pending', 'approved', 'rejected' |
| approved_at | TIMESTAMP(3) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** dlt_template_id  
**FKs:** school_id → schools(id)

---

#### 7.7.4 `waba_template_registrations`
**Purpose:** WhatsApp Business template approvals  
**Scope:** Platform + tenant

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | |
| waba_template_id | VARCHAR(100) | NO | | External WABA ID |
| category | VARCHAR(20) | NO | | 'utility', 'marketing', 'authentication' |
| status | VARCHAR(20) | NO | 'pending' | |
| language | VARCHAR(10) | NO | | |
| approved_at | TIMESTAMP(3) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** waba_template_id  
**FKs:** school_id → schools(id)

---

#### 7.7.5 `notification_provider_configs`
**Purpose:** Provider selection + credentials  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| channel | VARCHAR(20) | NO | | |
| provider_code | VARCHAR(50) | NO | | 'msg91', 'gupshup' |
| priority | INT | NO | | Fallback order |
| credential_ref | VARCHAR(255) | YES | NULL | KMS ref |
| is_active | TINYINT(1) | NO | 1 | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, channel, provider_code)  
**Indexes:** (school_id, channel, priority)  
**FKs:** school_id → schools(id)

---

#### 7.7.6 `notification_dispatches`
**Purpose:** One row per send attempt  
**Scope:** Tenant-owned  
**Partition:** Monthly by created_at

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| template_id | CHAR(36) | NO | | |
| template_version_id | CHAR(36) | NO | | |
| recipient_user_id | CHAR(36) | YES | NULL | |
| recipient_address | VARCHAR(255) | NO | | Phone or email |
| channel | VARCHAR(20) | NO | | |
| provider_code | VARCHAR(50) | NO | | |
| status | VARCHAR(20) | NO | 'queued' | 'queued', 'sent', 'delivered', 'failed', 'expired', 'bounced' |
| provider_message_id | VARCHAR(255) | YES | NULL | |
| cost_credits | INT | NO | | |
| cost_inr_paise | BIGINT | NO | | |
| triggered_by_event_id | CHAR(36) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:**
- (school_id, created_at DESC)
- (school_id, status, created_at DESC)
- (provider_code, created_at DESC)

**FKs:**
- school_id → schools(id)
- template_id → notification_templates(id)

---

#### 7.7.7 `delivery_receipts`
**Purpose:** Provider DLR events  
**Scope:** Per dispatch  
**Partition:** Monthly by received_at

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| dispatch_id | CHAR(36) | NO | | |
| event_status | VARCHAR(50) | NO | | |
| provider_status_code | VARCHAR(50) | YES | NULL | |
| provider_payload_json | JSON | YES | NULL | |
| received_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (dispatch_id, received_at)  
**FKs:** dispatch_id → notification_dispatches(id)

---

#### 7.7.8 `recipient_preferences`
**Purpose:** Consent + preferences  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| user_id | CHAR(36) | YES | NULL | |
| phone_e164 | VARCHAR(20) | YES | NULL | |
| email | VARCHAR(255) | YES | NULL | |
| sms_promotional_opt_in | TINYINT(1) | NO | 0 | |
| whatsapp_opt_in | TINYINT(1) | NO | 0 | |
| email_promotional_opt_in | TINYINT(1) | NO | 0 | |
| quiet_hours_start | TIME | YES | NULL | |
| quiet_hours_end | TIME | YES | NULL | |
| language_preference | VARCHAR(10) | YES | NULL | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, phone_e164) WHERE phone_e164 IS NOT NULL  
**Indexes:** (school_id, user_id)  
**FKs:** school_id → schools(id)

---

#### 7.7.9 `suppression_entries`
**Purpose:** Hard bounces / blocks  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = platform-wide |
| channel | VARCHAR(20) | NO | | |
| address | VARCHAR(255) | NO | | |
| reason | TEXT | NO | | |
| created_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (school_id, channel, address)  
**FKs:** school_id → schools(id)

---

#### 7.7.10 `credit_pools`
**Purpose:** Per-tenant per-channel balance  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| channel | VARCHAR(20) | NO | | |
| balance_credits | INT | NO | 0 | |
| low_balance_threshold | INT | NO | 100 | |
| last_topup_at | TIMESTAMP(3) | YES | NULL | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, channel)  
**FKs:** school_id → schools(id)

---

#### 7.7.11 `credit_transactions`
**Purpose:** Append-only ledger  
**Scope:** Tenant-owned  
**Partition:** Monthly by created_at

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| channel | VARCHAR(20) | NO | | |
| pool_id | CHAR(36) | NO | | |
| delta_credits | INT | NO | | + or − |
| kind | VARCHAR(50) | NO | | 'debit_dispatch', 'credit_topup', 'credit_refund' |
| reference_type | VARCHAR(50) | YES | NULL | |
| reference_id | CHAR(36) | YES | NULL | |
| running_balance | INT | NO | | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:**
- (school_id, channel, created_at DESC)
- (pool_id, created_at DESC)

**FKs:**
- school_id → schools(id)
- pool_id → credit_pools(id)

---

#### 7.7.12 `credit_packs`
**Purpose:** Catalog of buyable packs  
**Scope:** Platform-only

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| channel | VARCHAR(20) | NO | | |
| name | VARCHAR(100) | NO | | '1000 SMS' |
| credits_included | INT | NO | | |
| price_inr_paise | BIGINT | NO | | |
| valid_until | TIMESTAMP(3) | YES | NULL | |
| is_active | TINYINT(1) | NO | 1 | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (channel, is_active)

---

#### 7.7.13 `credit_pack_purchases`
**Purpose:** Purchased packs  
**Scope:** Per school

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| pack_id | CHAR(36) | NO | | |
| invoice_line_id | CHAR(36) | YES | NULL | Platform invoice |
| purchased_at | TIMESTAMP(3) | NO | | |
| credits_granted | INT | NO | | |
| credited_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (school_id, purchased_at DESC)  
**FKs:**
- school_id → schools(id)
- pack_id → credit_packs(id)

---

### 7.8 Academic Foundation (brief — well-understood shapes)

**Tables:** classes, sections, subjects, class_subjects, class_section_subject_teachers, timetable_periods, timetable_slots, holidays, events.

Columns common: id, school_id, created_at, updated_at, deleted_at.

Composite FKs as per conventions. All tenant-owned. Indexed by (school_id, ...).

---

### 7.9 Students & Parents (brief)

**Tables:** students, student_admissions, student_status_history, student_documents, student_medical_info, guardians, student_guardians, student_consents.

Composite FKs: (school_id, student_id), (school_id, guardian_id).

`student_medical_info.data_encrypted` — TEXT encrypted at rest (KMS).

---

### 7.10 Staff (brief)

**Tables:** staff, staff_employments, staff_documents, teacher_qualifications.

Composite FKs as per conventions.

---

### 7.11 Attendance (brief)

**Tables:** student_attendance, staff_attendance, attendance_lock_windows.

Partition: `student_attendance` quarterly by date.

Optimistic locking: version column on attendance.

---

### 7.12 School-side Fees (brief)

**Tables:** fee_categories, fee_structures, fee_components, fee_concession_policies, fee_assignments, fee_invoices, fee_invoice_lines, fee_receipts, fee_receipt_lines, fee_payments, fee_refunds, fee_credit_notes, fee_due_reminders.

Gap-free `invoice_no` via tenant_sequences.

`fee_invoices`: subtotal, tax, total in paise.

Composite FKs: (school_id, student_id), (school_id, invoice_id).

---

### 7.13 Examinations (brief)

**Tables:** exam_schedules, exams, exam_subjects, marks, mark_edit_audit, grade_systems, grade_bands, report_card_templates, report_cards.

`marks.version` — optimistic locking.

`mark_edit_audit` — edits beyond window audited separately.

---

### 7.14 Adjacent Modules (library, transport, hostel, inventory, visitor, medical, discipline, complaints, certificates, notices)

~1–3 tables each. All tenant-owned. Composite FKs. Shapes are conventional.

---

### 7.15 File Storage

#### 7.15.1 `file_assets`
**Purpose:** S3 file metadata  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | NULL = platform asset |
| bucket | VARCHAR(100) | NO | | |
| key | VARCHAR(500) | NO | | |
| mime_type | VARCHAR(100) | NO | | |
| size_bytes | BIGINT | NO | | |
| checksum_sha256 | VARCHAR(64) | NO | | |
| is_public | TINYINT(1) | NO | 0 | |
| expires_at | TIMESTAMP(3) | YES | NULL | |
| created_by | CHAR(36) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |
| deleted_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (school_id, created_at DESC), (bucket, key)  
**FKs:** school_id → schools(id)

---

#### 7.15.2 `file_asset_acl_grants`
**Purpose:** Non-public asset ACLs  
**Scope:** Per asset

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| file_id | CHAR(36) | NO | | |
| principal_type | VARCHAR(20) | NO | | 'user', 'role', 'public' |
| principal_id | CHAR(36) | YES | NULL | |
| granted_at | TIMESTAMP(3) | NO | | |
| revoked_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Unique:** (file_id, principal_type, principal_id, revoked_at) WHERE revoked_at IS NULL  
**FKs:** file_id → file_assets(id)

---

### 7.16 Background Jobs

#### 7.16.1 `jobs`
**Purpose:** Job definitions  
**Scope:** Platform + tenant

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | |
| name | VARCHAR(100) | NO | | |
| queue | VARCHAR(50) | NO | | BullMQ queue |
| schedule_cron | VARCHAR(100) | YES | NULL | Cron if scheduled |
| is_active | TINYINT(1) | NO | 1 | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (school_id, queue, is_active)  
**FKs:** school_id → schools(id)

---

#### 7.16.2 `job_runs`
**Purpose:** Execution history  
**Scope:** Per job

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| job_id | CHAR(36) | NO | | |
| started_at | TIMESTAMP(3) | NO | | |
| finished_at | TIMESTAMP(3) | YES | NULL | |
| status | VARCHAR(20) | NO | 'running' | 'running', 'success', 'failed' |
| error_message | TEXT | YES | NULL | |
| output_summary_json | JSON | YES | NULL | |

**PK:** id  
**Indexes:** (job_id, started_at DESC)  
**FKs:** job_id → jobs(id)

---

### 7.17 Outbox & Webhooks

#### 7.17.1 `outbox_events`
**Purpose:** Transactional outbox  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | |
| event_type | VARCHAR(100) | NO | | |
| payload_json | JSON | NO | | |
| created_at | TIMESTAMP(3) | NO | | |
| published_at | TIMESTAMP(3) | YES | NULL | |
| published_to | VARCHAR(100) | YES | NULL | |

**PK:** id  
**Indexes:** (school_id, event_type, created_at DESC), (published_at)  
**FKs:** school_id → schools(id)

---

#### 7.17.2 `webhook_endpoints`
**Purpose:** School → external integrations  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| url | VARCHAR(500) | NO | | |
| secret_ref | VARCHAR(255) | YES | NULL | KMS |
| event_filter | JSON | NO | | Event types |
| is_active | TINYINT(1) | NO | 1 | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (school_id, is_active)  
**FKs:** school_id → schools(id)

---

#### 7.17.3 `webhook_deliveries`
**Purpose:** Delivery attempts  
**Scope:** Per endpoint

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| endpoint_id | CHAR(36) | NO | | |
| event_id | CHAR(36) | NO | | |
| attempt_no | INT | NO | 1 | |
| sent_at | TIMESTAMP(3) | NO | | |
| status | VARCHAR(20) | NO | | 'success', 'failed', 'retrying' |
| response_status | INT | YES | NULL | HTTP status |
| response_body_excerpt | TEXT | YES | NULL | |

**PK:** id  
**Indexes:** (endpoint_id, event_id, attempt_no)  
**FKs:**
- endpoint_id → webhook_endpoints(id)
- event_id → outbox_events(id)

---

### 7.18 Support

#### 7.18.1 `support_tickets`
**Purpose:** In-app support  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| raised_by | CHAR(36) | NO | | User |
| subject | VARCHAR(255) | NO | | |
| status | VARCHAR(20) | NO | 'open' | 'open', 'assigned', 'closed' |
| priority | VARCHAR(20) | NO | 'normal' | |
| assigned_to | CHAR(36) | YES | NULL | Platform user |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |
| closed_at | TIMESTAMP(3) | YES | NULL | |

**PK:** id  
**Indexes:** (school_id, status, created_at DESC)  
**FKs:**
- school_id → schools(id)
- raised_by → users(id)

---

#### 7.18.2 `support_ticket_messages`
**Purpose:** Threaded messages  
**Scope:** Per ticket

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| ticket_id | CHAR(36) | NO | | |
| author_user_id | CHAR(36) | NO | | |
| body | TEXT | NO | | |
| is_internal | TINYINT(1) | NO | 0 | Staff note |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (ticket_id, created_at)  
**FKs:**
- ticket_id → support_tickets(id)
- author_user_id → users(id)

---

### 7.19 Reporting

#### 7.19.1 `saved_reports`
**Purpose:** User-saved reports  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| name | VARCHAR(100) | NO | | |
| type | VARCHAR(50) | NO | | Report type |
| query_params_json | JSON | NO | | |
| schedule_cron | VARCHAR(100) | YES | NULL | |
| last_run_at | TIMESTAMP(3) | YES | NULL | |
| owner_user_id | CHAR(36) | NO | | |
| created_at | TIMESTAMP(3) | NO | | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (school_id, owner_user_id)  
**FKs:**
- school_id → schools(id)
- owner_user_id → users(id)

---

#### 7.19.2 `report_subscriptions`
**Purpose:** Email/WhatsApp delivery  
**Scope:** Per report

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| saved_report_id | CHAR(36) | NO | | |
| channel | VARCHAR(20) | NO | | |
| recipient_addresses_json | JSON | NO | | |
| last_sent_at | TIMESTAMP(3) | YES | NULL | |
| created_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Indexes:** (saved_report_id)  
**FKs:** saved_report_id → saved_reports(id)

---

#### 7.19.3 `report_runs`
**Purpose:** Execution log  
**Scope:** Per report

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| saved_report_id | CHAR(36) | NO | | |
| started_at | TIMESTAMP(3) | NO | | |
| finished_at | TIMESTAMP(3) | YES | NULL | |
| status | VARCHAR(20) | NO | 'running' | |
| output_file_id | CHAR(36) | YES | NULL | |
| row_count | INT | YES | NULL | |
| error | TEXT | YES | NULL | |

**PK:** id  
**Indexes:** (saved_report_id, started_at DESC)  
**FKs:**
- saved_report_id → saved_reports(id)
- output_file_id → file_assets(id)

---

### 7.20 Operational

#### 7.20.1 `tenant_sequences`
**Purpose:** Gap-free numbering  
**Scope:** Tenant-owned

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | NO | | |
| sequence_name | VARCHAR(100) | NO | | 'invoice', 'receipt' |
| fiscal_year | VARCHAR(10) | NO | | |
| last_value | BIGINT | NO | 0 | |
| updated_at | TIMESTAMP(3) | NO | | |

**PK:** id  
**Unique:** (school_id, sequence_name, fiscal_year)  
**FKs:** school_id → schools(id)

---

#### 7.20.2 `idempotency_keys`
**Purpose:** Idempotency for write endpoints  
**Scope:** Tenant + platform

**Columns:**
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | CHAR(36) | NO | | PK |
| school_id | CHAR(36) | YES | NULL | |
| key | VARCHAR(255) | NO | | Client-provided |
| request_hash | VARCHAR(64) | NO | | SHA256 |
| response_json | MEDIUMTEXT | NO | | Cached |
| created_at | TIMESTAMP(3) | NO | | |
| expires_at | TIMESTAMP(3) | NO | | 24h TTL |

**PK:** id  
**Unique:** (school_id, key)  
**Indexes:** (expires_at) — cleanup job  
**FKs:** school_id → schools(id)

---

## 8. Cardinality matrix (key relationships)

| From | To | Cardinality | Notes |
|---|---|---|---|
| schools | subscriptions | 1:1 | One subscription per tenant (v1) |
| schools | users | 1:N | Tenant users |
| users | user_sessions | 1:N | Multiple sessions per user |
| user_sessions | refresh_tokens | 1:N | Token rotation history |
| users | user_roles | 1:N | One user many roles |
| roles | permissions | N:N | Via role_permissions |
| plans | subscriptions | 1:N | One plan many tenants |
| subscriptions | billing_invoices | 1:N | SaaS billing invoices per subscription (via `subscription_id` filter column; FK is to `billing_accounts`) |
| billing_invoices | billing_payments | 1:N | Payments captured against a SaaS invoice |
| schools | students | 1:N | Students belong to one school |
| students | guardians | N:N | Via student_guardians |
| students | fee_invoices | 1:N | Invoices per student |
| students | marks | 1:N | Marks per student |
| schools | credit_pools | 1:N | One pool per (school, channel) |
| credit_pools | credit_transactions | 1:N | Ledger per pool |
| notification_templates | notification_dispatches | 1:N | Dispatches use templates |
| schools | audit_log | 1:N | Audit rows per tenant |
| file_assets | many tables | 1:N | Files referenced from logos, docs, invoices |

---

## 9. Summary

- **140 tables** implemented across 25 Prisma schema files (as of Sprint 16). Earlier estimates of ~145 reflected unbuilt modules.
- **All columns specified** with types, nullability, defaults.
- **Indexes** defined per table with composite (school_id, ...) leading.
- **Unique constraints** per table, partial where soft-delete-aware.
- **Foreign keys** — simple for platform→tenant, composite within tenant.
- **Partitioning** noted on high-write tables (audit_log, notification_dispatches, delivery_receipts, student_attendance, credit_transactions).
- **Scope classes** called out (tenant-owned, platform-only, cross-tenant).

This is the authoritative schema contract. Prisma schema.prisma implements this.

---

**End of DATABASE_DESIGN.md.**
