# RECOMMENDED_SPRINT_PLAN

Sequenced roadmap to v1 launch. Each sprint lists scope, the dependencies it unblocks, the modules it touches, and explicit out-of-scope items.

> Companion to `GAP_ANALYSIS.md` (end-of-Sprint-3 snapshot). Aligned with `MODULES.md`, `SCHOOL_ONBOARDING_FLOW.md`, `PRODUCT_REQUIREMENTS.md §7` (v1 acceptance criteria), and the dependency graph in `MODEL_INVENTORY.md`.

---

## 0. Where we actually are — 2026-06-25

This document was originally written at end-of-Sprint-3. The implementation has run ahead and **does not strictly follow the Sprint 4–18 plan below**. Use this section as the authoritative status; treat the per-sprint sections below as the design intent for the work still ahead.

### Shipped through Sprint 15 + Hotfixes (2026-06-25)

| Sprint | What landed | Status |
|---|---|---|
| 1–3 | Auth, RBAC base, Academic, Student, Parent, Admission foundations | ✅ Live |
| 4–13 | Staff, Files, Jobs, Outbox, Flags, Notifications Foundation, Attendance, Fees, Exams, Timetable, Notice Board, etc. (delivered in a different order than originally drafted below) | ✅ Foundations live |
| 14 | Super-Admin School Provisioning (school row, lifecycle FSM, school-admin creation, `SchoolCommunicationEntitlement` bootstrap) — see `PROVISIONING_AND_LIFECYCLE.md` | ✅ Live |
| 14.1 | PLATFORM_ADMIN role, `mustChangePassword`, daily 02:00 trial-expiry scheduler | ✅ Live |
| 15 | Subscription Foundation (Plan + PlanFeature + Subscription + SchoolUsage + Guard) — see `SUBSCRIPTION_FOUNDATION.md` | ✅ Live |
| 15.0.1 | Reporting stub DI fix (parsers/committers/executors) | ✅ Live |
| 15.0.2 | PlanFeature.limit widened INT → BIGINT with safe-narrowing at repo boundary | ✅ Live |

### What is intentionally **NOT** shipped yet

- **Billing Foundation** — invoices, payments, Razorpay/Stripe integration, GST/IRN, dunning state machine, mandates, GSTR-1 exports, e-invoicing, multi-currency. Sprint 15 explicitly carved this out. See `BILLING_AND_SUBSCRIPTIONS.md`.
- **Parent Portal / Student Portal** — Foundations exist; portal sprints not started. See `MODULE_BOUNDARIES.md`.
- **Communication Center** — only the Communication Foundation (send pipeline + templates + entitlements) is live; composer UX, conversation threads, A/B testing are future.
- **Analytics / BI** — only canonical Reports (Sprint 14) are live; dashboards, custom-report builder, materialised views, scheduled exports are future.
- **Frontend** — not started. See `FRONTEND_THEME_INTEGRATION.md` for the rules of engagement when it does.
- **Self-serve school signup wizard** — Sprint 14 ships super-admin-provisioned schools only; self-serve signup is a future sprint.

### Next-up themes (no fixed sprint numbers yet)

In likely-but-not-fixed order:

1. **Billing Foundation** (the natural follow-on to Sprint 15).
2. **Parent Portal Foundation** (parent-as-user, OTP login, child summary, fee-pay).
3. **Student Portal Foundation** (timetable read, marks read, notices, library).
4. **Communication Center** (campaigns, conversation threads, inbox).
5. **Analytics / BI** (materialised views, dashboards, scheduled exports).
6. **Operator Console UI** (super-admin web app on top of the existing super-admin APIs).
7. **Self-serve onboarding wizard** (LEAD → ACTIVATED funnel).
8. **v1 launch hardening** (search, rate-limiting, DPDP, pen-test, performance budgets — corresponds to old Sprint 18 below).

### How to read the rest of this document

Sections 1–18 below were drafted before the Sprint 14 / 15 implementation order was finalised and **should be treated as design notes, not the live plan**. Anything they describe that is now shipped is summarised in the table above. Anything they describe that is still future is captured in the "Next-up themes" list. A full rewrite of the per-sprint sections is queued for after the Billing Foundation lands.

---

## Ordering principles

1. **Critical path first.** A module is "critical path" if more than two downstream functional modules cannot ship without it. These come first regardless of perceived business value.
2. **External-dependency lead-time second.** Anything requiring third-party approval (DLT for SMS, WABA for WhatsApp, Razorpay onboarding, GST e-invoice IRN) starts as early as its prerequisites allow, because we cannot control its turnaround time.
3. **One vertical slice per sprint.** Each sprint ships a flag-gated module end-to-end (schema → service → API → permissions → tests → audit → docs), not a partial cut across many modules.
4. **Tenant lifecycle before any external customer.** No real school can be onboarded until the operator console and tenant status machine exist; therefore that work is brought forward of "fun" features even though it has no parent-visible payoff.
5. **Schema-first deferred work has a cost.** When a module's schema is shipped but its API is deferred (e.g. branches today), the absence is documented as a known gap and a fast-follow.

---

## Pre-Sprint 4 — Spec patches required first

These are **doc updates, not code**. Block Sprint 4 until merged.

- **PRODUCT_REQUIREMENTS / MODEL_INVENTORY / DATABASE_DESIGN**: add the missing Indian-school fields to the Student data model (see §Sprint 4 below for the list). Today these are referenced nowhere.
- **`School` model**: add `slug`, `lifecycle_status` (`DRAFT|PROVISIONING|ACTIVE|SUSPENDED|ARCHIVED|DELETED` per DECISIONS D-027; trial/expiring semantics belong to the parallel Subscription FSM per D-028), `plan_code`, `trial_ends_at`, `region_id` columns to the spec. Tenant lifecycle work in Sprint 5/10 depends on them being present.
- **Sequences**: spec out `tenant_sequences (school_id, sequence_key, next_value, last_issued_at)` so Sprint 4 (Staff) and Sprint 7 (Fees) can both use it.
- **Soft-delete reuse policy**: write one paragraph in `BUSINESS_RULES.md` covering admission_no, Aadhaar, APAAR, receipt_no, TC_no — "no reuse after soft-delete; new sequence on re-admission." Sprint 3 followed this for admission_no; codify it.
- **PRODUCT_REQUIREMENTS §1 / SCHOOL_ONBOARDING_FLOW**: add an explicit "School Admin creation" subsection covering (a) operator-created and (b) self-serve provisioning, mirroring the table in `GAP_ANALYSIS.md §8`.

Estimated effort: ~2 days of docs work, no code.

---

## Sprint 4 — Staff/Teacher domain + Indian-school field backfill + Academic terms & class-subjects

**Why this first:** Attendance, Examination, Timetable, and Class-Teacher assignment all depend on `staff`. Indian-school fields are missing from the student spec entirely and adding them after data exists is materially more expensive (encryption-at-rest backfills, RTE/quota retro-tagging). Academic terms and `class_subjects` complete the academic foundation so fee structures and exam schemes have a term to anchor to.

**Scope:**
- **Staff domain** (entity 7 in MODEL_INVENTORY): `staff`, `staff_employment_history`, `staff_qualifications`, `staff_subject_qualifications`, `staff_section_assignments`, `class_teachers`, `staff_leaves`, `staff_documents`. CRUD + assignment APIs.
- **Student Indian-fields migration** (additive columns on `students`):
  - `religion` (enum: HINDU, MUSLIM, CHRISTIAN, SIKH, BUDDHIST, JAIN, PARSI, JEWISH, OTHER, NOT_DECLARED)
  - `category` (enum: GENERAL, OBC, SC, ST, EWS, NOT_DECLARED)
  - `nationality VARCHAR(80) DEFAULT 'Indian'`
  - `mother_tongue VARCHAR(80)` (nullable)
  - `aadhaar_encrypted` (TEXT, KMS-encrypted) + `aadhaar_last4 CHAR(4)` (indexed, masked elsewhere)
  - `apaar_id VARCHAR(20)` (nullable; unique within tenant if set)
  - `is_cwsn BOOLEAN`, `disability_type VARCHAR(80)` (nullable)
  - `is_rte BOOLEAN`, `rte_admission_year_id` (nullable)
  - `is_minority BOOLEAN`, `minority_community VARCHAR(40)` (nullable)
  - `bpl BOOLEAN`, `ration_card_no VARCHAR(40)` (nullable)
  - `previous_school_name`, `previous_school_tc_no`, `previous_school_tc_date`
  - `admission_type` (enum: FRESH, TRANSFER, RTE, MANAGEMENT)
  - `place_of_birth`, `birth_cert_no` (nullable)
  - Update `CreateAdmissionDto` and `CreateStudentArgs` to accept these fields.
- **Academic completeness**: `academic_terms`, `class_subjects` (M:N), `section_subjects` (overrides), `academic_year_promotions` (data + service stubs; bulk-promotion job is Sprint 9-ish).
- **Tenant sequences**: introduce `tenant_sequences` table + `SequenceService` (atomic `nextValue(schoolId, key)`) — to be used by Staff (employee_code), Sprint 7 (receipt_no), Sprint 8 (admission_no for re-admissions), Sprint 11 (TC_no).
- **RBAC**: seed roles `principal`, `vice_principal`, `class_teacher`, `teacher`, `accountant`, `clerk` with documented permission sets. Seed permissions: `staff.*`, `class_teacher.assign`, `academic.term.*`, `class_subject.*`.

**Adds tables:** 8 (staff cluster) + 4 (academic completeness) + 1 (tenant_sequences) = 13. **Adds permissions:** ~40. **Adds roles:** 6.

**Out of scope:** staff portal, biometric integration, staff payroll, AAR/EPF, leave-approval workflow (use simple approve/reject), staff attendance (Sprint 6).

**Definition of done:** a teacher can be hired, assigned as class teacher of a section, and qualified for subjects; admission accepts Aadhaar (encrypted) and Category/Religion/RTE flags; Aadhaar is never returned in responses except last-4; audit category is `pii` for Aadhaar/RTE writes.

---

## Sprint 5 — Platform Operations (Files, Background Jobs, Outbox dispatcher, Feature Flags)

**Why second:** Notifications, Fees, Exams, Certificates, Imports, Reports all block on these. Doing them once now avoids retrofitting each module later.

**Scope:**
- **File storage** (`file_assets`, `file_asset_acl_grants`): S3 client (ap-south-1), presigned PUT/GET, per-tenant prefix, ACL enforcement, AV-scan hook (stub provider — full ClamAV integration optional), 50 MB cap by default (per-plan override later). Replace Admission "opaque URL" with proper file ids.
- **Background jobs**: BullMQ + Redis, queues (`notification`, `report`, `import`, `pdf`, `cron`), worker process, retry/backoff/DLQ, `jobs` + `job_runs` history rows, per-tenant rate limits.
- **Outbox dispatcher**: drain `Outbox` rows transactionally, route to BullMQ; `outbox_dead_letter` on max retries. All future modules write side-effects through the outbox.
- **Feature flags** (entity F6): `feature_flag_definitions`, `feature_flag_plan_map`, `feature_flag_tenant_overrides`, `feature_flag_rollouts`, `feature_flag_audit`. NestJS `FeatureFlagService.isEnabled(schoolId, flag)` with per-tenant TTL cache invalidated via outbox event. Register every `module.*` flag in code with default-on.
- **Idempotency middleware**: consume the existing `idempotency_keys` table on any `POST` that has external side effects.

**Adds tables:** 2 (files) + 1 (job_runs) + 1 (outbox_dead_letter) + 5 (flags) = 9. **Adds permissions:** `files.*`, `feature_flags.*`, `jobs.read`.

**Out of scope:** virus-scan provider beyond stub; long-running streaming uploads; per-flag percentage rollout UI; cron-scheduled jobs registry (use static cron config for now).

**Definition of done:** an admission document is uploaded via presigned URL, scanned, and retrievable via signed URL; a BullMQ worker drains the outbox; a `module.fees` flag with `tenant_override` returns false in `isEnabled` for one tenant and true for another, both backed by the cache.

---

## Sprint 6 — Notifications platform (SMS + Email + WhatsApp + Push) with DLT/WABA compliance

**Why third:** External lead-time. DLT (TRAI) template registration takes 1–4 weeks per template; WABA approval (Meta) 1–7 days. Starting now means templates approved when Sprint 8 (Attendance auto-SMS), Sprint 9 (Fees reminders), Sprint 11 (Exam published), Sprint 12 (parent OTP login) need them.

**Scope:**
- **Notification entities (14 tables)**: `notification_templates`, `notification_template_versions`, `notification_campaigns`, `notification_batches`, `notification_messages` (monthly-partitioned), `notification_message_events` (monthly-partitioned), `notification_recipients_resolved`, `notification_opt_outs`, `notification_quiet_hours`, `notification_credit_pool`, `notification_credit_ledger`, `notification_credit_topups`, `push_devices`, `dlt_registrations`.
- **Provider adapters**: `NotificationProvider` interface; implementations: MSG91 (SMS), Gupshup or Meta direct (WhatsApp), AWS SES (Email), FCM/APNs (Push). Per-tenant fallback chain.
- **Compliance enforcement**: dispatch using an unregistered DLT template **fails at queue time**; WABA category enforced (utility/marketing/auth); WhatsApp 24h session-window honoured; suppression list; STOP-keyword handling.
- **Credit ledger**: atomic debit + dispatch in same DB tx; refund on hard fail / expired (24h SMS, 48h WhatsApp, 72h email); per-(tenant, channel) credit pool.
- **Default templates seeded per tenant**: `attendance_absent`, `fee_due`, `exam_schedule_published`, `holiday_announce`, `notice_general`, `welcome_school_admin`, `welcome_parent`, `otp_login`, `password_reset`, `tc_issued`. Each delivered as un-approved drafts requiring tenant action before send (so tenants own their DLT registrations).

**Adds tables:** 14. **Adds permissions:** `notification_templates.*`, `notifications.send.class|section|all`, `notifications.dispatch.cancel`, `credit_pool.read`, `credit_pool.topup`.

**Out of scope:** in-app inbox UI (Sprint 12); A/B-template experimentation; per-conversation WhatsApp cost analytics (Sprint 13 reports).

**Definition of done:** an admin can register one SMS template against a DLT id, send it to one parent, and observe DLR moving QUEUED → SENT → DELIVERED with credit debit + (on missing DLR after TTL) automatic refund.

---

## Sprint 7 — Tenant lifecycle + Operator Console (read-only) + School-admin creation flow

**Why fourth:** Until this ships there is no path to onboard a real school. Every subsequent sprint risks adding modules that ignore lifecycle states.

**Scope:**
- **Platform tables**: `tenant_settings`, `tenant_status_history`, `tenant_owners`, `tenant_owner_transfers`, `regions` (full), `platform_users`, `platform_user_sessions`, `platform_user_devices`, `impersonation_sessions`, `four_eyes_approvals`, `provider_credentials`, `platform_settings`.
- **School schema extension**: `slug` (unique), `lifecycle_status` (`DRAFT|PROVISIONING|ACTIVE|SUSPENDED|ARCHIVED|DELETED` per D-027), `plan_code`, `trial_ends_at`, `region_id`.
- **Operator console API (`/platform/*`)**: tenant CRUD, status transitions (suspend / freeze / reactivate / archive), tenant search/list with health badges, impersonation start/end (4-eyes for paid plans, audit-only for trials), feature-flag tenant-overrides, provider-credential management.
- **School-admin creation**:
  - `POST /platform/tenants` provisions: school row, default `SchoolSettings`, S3 prefix (calls Sprint 5 file service), seeds default roles + notification templates (calls Sprint 6).
  - `POST /platform/tenants/:id/admins` creates invite token + emails magic link.
  - `POST /onboarding/invites/:token/accept` lets the school admin set password + (optional) MFA.
- **Tenant lifecycle enforcement**: middleware short-circuits writes for `SUSPENDED` (read-only) and `FROZEN` (no API access except export); `tenant.flags.changed` event publishes to outbox.
- **DPDP data-export job**: per-tenant export to S3 (triggered on archive and on parent request).
- **Built-in platform roles seeded**: `super_admin` (rename `platform_admin` → `super_admin` to match the canonical doc), `platform_billing`, `platform_support`, `platform_engineer`, `platform_sales`, `platform_readonly`.

**Adds tables:** 12. **Adds permissions:** `tenants.*`, `tenants.suspend|freeze|archive|reactivate`, `users.impersonate`, `four_eyes_approvals.*`, `provider_credentials.*`, `platform_settings.*`.

**Out of scope:** the full self-serve `/signup` UI (Sprint 10); GST/billing invoices (Sprint 12); CSM dashboard charts (Sprint 13); WebAuthn for platform users (use TOTP first).

**Definition of done:** Super Admin can create a tenant via API, invite a school admin (real email + SMS delivered via Sprint 6), the admin accepts the invite, sets a password, and logs in; the same Super Admin can suspend the tenant and confirm writes are blocked while reads still work.

---

## Sprint 8 — Attendance (student daily + period + staff)

**Why fifth:** Smallest functional module that satisfies v1 acceptance criterion #3 ("mark daily attendance for all classes") and yields the first ACTIVATED-stage signal. Depends on Staff (Sprint 4) and Notifications (Sprint 6).

**Scope:**
- `attendance_daily` (monthly partitioned), `attendance_period` (monthly partitioned), `attendance_date_locks`, `leave_applications`, `staff_attendance` (monthly partitioned), `biometric_punches` (monthly partitioned, raw — reconciliation job is stub).
- Daily-mode service (one-tap roster), period-mode service (reads timetable when available; works without by accepting `subjectId`), bulk-update, date-lock once finalized.
- Auto-SMS to parents on absent (uses Sprint 6 template `attendance_absent`; respects opt-outs, quiet hours, plan flag).
- Leave application workflow: PENDING → APPROVED|REJECTED.
- Staff attendance: clock-in/out, late/half-day rules per `working_days_config` (introduce minimal version of this in School module).
- Reports: section daily summary, monthly per-student percentage.

**Adds tables:** 6. **Adds permissions:** `attendance.read|create|update`, `attendance.update_outside_window` (principal-only), `leave_applications.*`, `staff_attendance.*`.

**Out of scope:** biometric device webhook implementation (table only); offline-queued mobile mark (architecture allows, no client); attendance-based fee fines (Sprint 9 or later).

---

## Sprint 9 — Fees (structures, invoices, payments, receipts) + Razorpay

**Why sixth:** Satisfies v1 acceptance criteria #4 (collect fees online + offline + receipts). Requires Notifications (reminders), Files (PDF receipts), Outbox (payment webhook), Sequences (receipt numbering), Staff (accountant role exists).

**Scope:**
- `fee_heads`, `fee_structures`, `fee_structure_lines`, `fee_discounts`, `student_fee_discounts`, `fee_late_fine_policies`, `fee_invoices`, `fee_invoice_lines`, `fee_payments`, `fee_payment_allocations`, `fee_receipts`, `fee_refunds`, `fee_reminder_runs`, `fee_ledger_entries`.
- **Gap-free receipt numbering** via `tenant_sequences` from Sprint 4.
- **Razorpay** integration: order creation, webhook ingestion (idempotency-key honored from Sprint 5), refund initiation. Per-tenant Razorpay account (or platform-route on trial plans).
- **Finance audit chain**: every monetary mutation writes to `audit_finance_chain` (Sprint 1 infra) under serialized `FOR UPDATE`; daily anchor job stubs.
- **Reminder runs**: cron-scheduled `T-3`, `T+0`, `T+3`, `T+7` reminders via Notification credit pool.
- **Approval workflows**: refund > ₹0 needs `principal` approval (4-eyes via Sprint 7 table); waiver > tenant-configured threshold ditto.

**Adds tables:** 14. **Adds permissions:** `fees.*`, `fees.invoice.void|generate`, `discounts.create|create_above_threshold`, `refunds.create`, `scholarships.approve`, `receipts.create.online|offline`.

**Out of scope:** GST e-invoicing IRN (Sprint 12 platform billing); bank reconciliation; sibling discounts (deferred; flag students in Sprint 4); offline NACH mandates.

---

## Sprint 10 — Onboarding wizard + CSV imports + Self-serve signup

**Why seventh:** With Sprint 7 (operator console) + Sprint 4 (staff) + Sprint 8 (attendance) + Sprint 9 (fees) all live, the wizard finally has every destination it needs to drop the admin into. This sprint stitches the journey LEAD → ACTIVATED.

**Scope:**
- `POST /signup` (self-serve): name, phone (OTP-verified via Sprint 6), board, student count band, city → provisions tenant + sub-domain slug + school_admin invite.
- **Wizard data model**: `onboarding_progress` (school_id, step, payload_json, completed_at, version) — supports pause / resume.
- **9-step wizard API** matching `SCHOOL_ONBOARDING_FLOW §3`: profile, branches, year, classes & sections, staff, students+parents, fee structure, notifications, go-live. Each step is its own endpoint that calls into the existing domain services.
- **CSV imports**:
  - Generic `ImportService` with per-resource adapters (`StudentImporter`, `ParentImporter`, `StaffImporter`, `FeeStructureImporter`).
  - Dry-run preview (returns row-level diff), commit (background job via Sprint 5), 24h rollback (writes inverse mutations from a stored snapshot).
  - Templates downloadable from `/onboarding/templates/csv`.
- **Class & subject templates** seeded: CBSE 1–10, CBSE 1–12, ICSE 1–10, State board variants.
- **Activation telemetry**: emit funnel events on each stage transition to a `tenant_funnel_events` table; reports in Sprint 13.
- **Branches** (deferred from Sprint 7): create the `branches` table and minimal API (most tenants skip this step in the wizard).

**Adds tables:** 4 (`onboarding_progress`, `imports`, `import_rows`, `branches`) + adapters. **Adds permissions:** `onboarding.read|update`, `imports.*`, `branches.*`.

**Out of scope:** XLS/XLSX (CSV only); merge/upsert imports (insert-only with validation); chained-school multi-tenant onboarding.

---

## Sprint 11 — Examination + Marks + Report Cards

**Why eighth:** Satisfies v1 acceptance criterion #5 (conduct exam, enter marks, generate report cards PDF). Requires Staff (Sprint 4), Files (Sprint 5), Notifications (Sprint 6), Sequences (Sprint 4 for report-card number).

**Scope:**
- `exam_schemes`, `exams`, `exam_schedules`, `exam_hall_tickets`, `exam_seating_plans`, `exam_marks`, `exam_coscholastic_grades`, `exam_results`, `report_cards`, `exam_revaluations`.
- Marks-entry with optimistic locking (version column); update-outside-window requires principal approval (4-eyes).
- Result computation job (per-exam, per-section) → publishes `report_cards` PDF to file storage; notification sent.
- Hall ticket and seating-plan generators.

**Adds tables:** 10. **Adds permissions:** `exams.*`, `marks.*`, `marks.update.in_window`, `marks.update_outside_window`, `report_cards.*`, `report_cards.finalize` (class_teacher / principal).

**Out of scope:** CBSE-specific co-scholastic grade rubrics beyond a generic 1–5 scale; SMS to parents per-mark-published (uses bulk template).

---

## Sprint 12 — Timetable + Substitutions

**Why ninth:** Last "core academics" module. Depends on Staff (Sprint 4), Academic class_subjects (Sprint 4), Notifications (Sprint 6) for substitution alerts.

**Scope:**
- `period_templates`, `timetable_versions`, `timetable_entries`, `timetable_substitutions`, `timetable_conflicts`, `timetable_generation_runs`, `period_settings`, `rooms` (introduce now if Sprint 7 deferred).
- Manual builder API with conflict validators (teacher double-book, section double-book, room double-book; warns on > N periods/day per teacher).
- One-off substitutions; substitute notified via Notifications.
- Auto-generator job stub (real constraint solver is post-v1).

**Adds tables:** 7 (+1 `rooms` if not done earlier). **Adds permissions:** `timetable.*`, `timetable.publish`, `substitutions.*`.

**Out of scope:** auto-generation algorithm (manual builder only); room-availability calendar; multi-shift schools.

---

## Sprint 13 — Communication: Notice Board + Parent Messages + Parent Portal (OTP login) + Student Portal

**Why tenth:** Satisfies v1 acceptance criterion #6 (send SMS/WhatsApp/Email to parents) — the dispatch existed since Sprint 6, but parents now get a portal to read it in. Closes the parent loop on attendance/fees/exams already shipped.

**Scope:**
- `notices`, `notice_audiences`, `notice_attachments`, `notice_acknowledgements`.
- `parent_messages` (1:1 threads parent ↔ class teacher), `parent_communication_prefs`, `parent_leave_applications` (parent-initiated; reuses Sprint 8 `leave_applications`).
- **Parent-as-User**: extend Parent model with `user_id` FK; parent OTP-login flow via `/parent/auth/otp` (request + verify). Parent's permissions auto-scoped to their `parent_student_links`.
- **Parent Portal API** (`/parent/*`): dashboard, child summary, attendance read, marks read, fee invoices + pay, notices + ack, messages, leave.
- **Student Portal API** (`/student/*`): timetable read, marks read, notices read, library catalogue (when library ships).
- **Razorpay parent-pay handoff** for fee invoices (already shipped in Sprint 9; this exposes the parent-facing endpoint).
- Roles seeded: `parent`, `student`.

**Adds tables:** 7. **Adds permissions:** `notices.*`, `notices.acknowledge`, `parent.messages.*`, `parent.leave.apply`, `student.timetable.read`, `student.marks.read`.

**Out of scope:** native mobile apps (web-only); message attachments (text only); group chats; AI-summarised reports.

---

## Sprint 14 — Certificates + Reports & Analytics

**Why eleventh:** Satisfies v1 acceptance criteria #7 (Bonafide + TC) and #8 (run reports). Builds on every prior data domain.

**Scope:**
- `certificate_templates` (template designer fields: logo, signature, dynamic placeholders), `issued_certificates` (TC, Bonafide, Character, Participation, custom).
- TC issuance workflow: triggers `Student.status = TC_ISSUED`, writes `student_transfer_certificates` row (re-introduce table; was out of scope in Sprint 3), gap-free TC number via `tenant_sequences`. Principal approval required (4-eyes).
- **Reports**: attendance, fee collection, defaulters, marks, staff attendance, transport occupancy (when ready), library circulation (when ready). Materialised views (`rpt_*`) refreshed by Sprint 5 cron jobs.
- Export formats: CSV, PDF (uses Sprint 5 file storage), scheduled email (uses Sprint 6 notifications).
- **Operator-console reports**: MRR, ARR, trial conversion, churn risk, support load, infra cost per tenant (basic — full cost attribution post-v1).
- **CSM dashboard**: tenant health, funnel stage, last-login, activation status, churn-risk score (derived from inactivity).

**Adds tables:** ~6 (`certificate_templates`, `issued_certificates`, `student_transfer_certificates`, plus `rpt_*` materialisations). **Adds permissions:** `certificates.*`, `tc.issue`, `tc.approve`, `reports.read`, `reports.export`.

**Out of scope:** custom-SQL report builder (paid-plan feature, post-v1); benchmark-vs-peer analytics.

---

## Sprint 15 — Billing & Subscriptions + GST e-invoicing

**Why twelfth:** Converts trials to paid. Satisfies operator-console v1 acceptance criteria #5 (issue/retry/void invoice).

**Scope:**
- Subscription cluster (8 tables): `plans`, `plan_features`, `subscriptions`, `subscription_history`, `subscription_addons`, `credit_packs`, `credit_pack_purchases`, `promo_codes`.
- Billing cluster (12 tables): `platform_invoices`, `platform_invoice_lines`, `platform_invoice_taxes`, `platform_credit_notes`, `platform_payments`, `platform_payment_methods`, `platform_payment_attempts`, `platform_dunning_events`, `gst_buyer_details`, `gst_irn_records`, `gst_gstr1_runs`, `tds_certificates`.
- Trial → paid conversion endpoint (Razorpay mandate: UPI Autopay, NACH, card).
- Dunning state machine (HEALTHY → RETRYING → GRACE → SUSPENDED) — calls Sprint 7 lifecycle.
- GST e-invoice IRN integration; monthly GSTR-1 export job.
- Tenant `/billing/*` API (read-only view of own invoices, payment history, mandates).

**Adds tables:** 20. **Adds permissions:** `subscriptions.*`, `subscriptions.change_plan`, `invoices.refund`, `invoices.void`, `credit_packs.purchase`, `billing.read` (tenant-side).

**Out of scope:** multi-currency; partial credits across cycles beyond basic; e-way bills (not applicable to services).

---

## Sprint 16 — Adjacent modules wave 1: Library + Transport + Visitor

**Why thirteenth:** First batch of paid-plan modules; each is small (1–7 tables) and independent of the other.

**Scope:**
- Library (5 tables): `library_books`, `book_copies`, `book_issues`, `book_returns`, `library_fines`. Per-role issue caps.
- Transport (7 tables): `transport_routes`, `transport_stops`, `transport_vehicles`, `route_assignments`, `drivers` (use `staff`), `transport_fees` (links to Sprint 9 Fees), `vehicle_attendance`.
- Visitor (3 tables): `visitors`, `visitor_passes`, `visitor_approvals`.
- Roles seeded: `librarian`, `transport_incharge`, `driver`, `security`.

**Adds tables:** ~15. **Adds permissions:** `library.*`, `transport.*`, `vehicle_attendance.*`, `visitor.*`.

**Out of scope:** GPS device webhook; parent live-location feed; library barcode scanner integration.

---

## Sprint 17 — Adjacent modules wave 2: Hostel + Inventory + Medical + Discipline + Complaints + Events + Holiday/Calendar

**Why fourteenth:** Last functional modules before launch hardening. Each is small.

**Scope:**
- Hostel (6 tables), Inventory (4 tables), Medical (4 tables), Discipline (3 tables), Complaints (4 tables), Events (5 tables), Holiday/Calendar (1 table — likely fold into `calendar_events`).
- Permission seeders, audit, flag-gated APIs.
- Roles seeded: `hostel_warden`.

**Adds tables:** ~27.

**Out of scope:** depreciation tracking (inventory); event waitlists; complaint escalation matrix beyond two levels.

---

## Sprint 18 — v1 launch hardening: Search, Rate-limiting, Pen-test, DPDP, Mobile-readiness

**Why last:** Polish + non-functional requirements before public launch.

**Scope:**
- **Search** (Sprint 5 deferred): Postgres FTS (or OpenSearch decision) over students, parents, staff, fees, notices.
- **Rate limiting**: per-tenant + per-IP + per-route quotas (the `RateLimitModule` flagged "future" in CoreModule).
- **DPDP**: parental consent capture at admission (covers fields added in Sprint 4); data-portability export endpoint; right-to-erasure workflow (4-eyes).
- **Mobile-readiness**: `X-Client-Name` / `X-Client-Version` headers enforced; minimum version block; ETag / If-None-Match on read endpoints; payload-size budget checks.
- **Operator reports gaps**: trial conversion charts, MRR/ARR dashboards, support-load heatmap.
- **Pen-test fixes** + DPDP-aligned privacy review.
- **Performance budgets**: p95 < 250 ms (reads) / < 500 ms (writes) verified under load test; bulk import 1000 students < 30 s.

**Adds tables:** 1–3 (search index metadata, consent records). **Adds permissions:** `data_export.request`, `data_erasure.request`.

**Out of scope:** native iOS/Android apps (post-v1); offline-first attendance client (post-v1, but APIs are already mobile-friendly); AI features.

---

## Cumulative scoreboard at the end of each sprint

| End of | Modules implemented (cumulative) | New tables | Cumulative tables | v1 acceptance criteria satisfied |
|---|---|---:|---:|---|
| Sprint 3 (today) | Auth, RBAC base, Academic, Student, Parent, Admission | — | ~24 | 0 / 8 |
| Sprint 4 | + Staff/Teacher, Indian fields, Academic terms | 13 | ~37 | 0 / 8 (foundation strengthened) |
| Sprint 5 | + Files, Jobs, Outbox, Flags | 9 | ~46 | 0 / 8 |
| Sprint 6 | + Notifications | 14 | ~60 | 0 / 8 (DLT pipeline started) |
| Sprint 7 | + Tenant lifecycle, Operator console (RO), School-admin creation | 12 | ~72 | criterion #1 (sign up) partial |
| Sprint 8 | + Attendance | 6 | ~78 | criterion #3 ✅ |
| Sprint 9 | + Fees + Razorpay | 14 | ~92 | criterion #4 ✅ |
| Sprint 10 | + Onboarding wizard + CSV imports | 4 | ~96 | criterion #1 ✅, #2 ✅ |
| Sprint 11 | + Examination + Report cards | 10 | ~106 | criterion #5 ✅ |
| Sprint 12 | + Timetable | 7 | ~113 | criterion #2 ✅ (full) |
| Sprint 13 | + Notices + Parent/Student portal + OTP login | 7 | ~120 | criterion #6 ✅ |
| Sprint 14 | + Certificates + Reports | 6 | ~126 | criteria #7 ✅, #8 ✅ |
| Sprint 15 | + Billing + Subscriptions + GST | 20 | ~146 | super-admin criteria #4 ✅, #5 ✅, #6 ✅ |
| Sprint 16 | + Library + Transport + Visitor | 15 | ~161 | — |
| Sprint 17 | + Hostel + Inventory + Medical + Discipline + Complaints + Events + Calendar | 27 | ~188 | — |
| Sprint 18 | + Search, Rate limit, DPDP, Mobile readiness | 3 | ~191 | **v1 launch ready** |

(Table count exceeds the 156 baseline because Sprints 7, 9, 11, 13, 15 introduce supporting tables — wizard progress, dunning events, etc. — that the baseline either folded into a parent table or listed as "out of cluster.")

---

## Alternative orderings considered & rejected

- **"Build the operator console first (Sprint 4)"** — rejected because Staff is a dependency of every functional module after it. The operator console is moved to Sprint 7 once Files, Jobs, and Notifications exist to provision into.
- **"Build Notifications later, after Attendance"** — rejected because DLT lead-time is 2–4 weeks; starting in Sprint 6 means templates are approved by the time attendance auto-SMS goes live in Sprint 8.
- **"Build Billing right after the operator console (Sprint 8)"** — rejected because no school will be converting to paid until they have functional Fees and Attendance to justify it. Billing waits to Sprint 15 to ride alongside trial-end pressure.
- **"Ship the wizard early as a thin shell"** — rejected because each wizard step touches a real domain; a shell that drops users into half-built modules generates more support load than no wizard at all.

---

## Risks tracked across the plan

| Risk | Mitigation point |
|---|---|
| DLT / WABA template approval delays | Sprint 6 starts template registration immediately; Sprint 8/9/11 fall back to email-only if a template is still pending. |
| Razorpay account onboarding per tenant | Sprint 9 supports both per-tenant and platform-routed accounts; trial schools use platform-routed by default. |
| Indian-field schema changes after data exists | Sprint 4 introduces all fields **before** any real school onboards (which can only happen after Sprint 7). |
| Aadhaar leakage | Sprint 4 encrypts at rest, exposes only last-4; audit category `pii`; Sprint 18 pen-test verifies. |
| Tenant lifecycle ignored by later modules | Sprint 7 introduces a global write-guard middleware that every controller passes through; modules added afterward inherit it for free. |
| Operator console missing during early onboardings | Sprint 7 ships a minimal-but-complete read+lifecycle console; richer dashboards in Sprint 14. |
| Background-job pile-up | Sprint 5 includes DLQ and per-tenant rate limits; Sprint 18 load test verifies. |

---

## Definition of "v1 launch" satisfied

At the end of Sprint 18, every clause in `PRODUCT_REQUIREMENTS.md §7` is testable end-to-end:

1. School can sign up (Sprint 10), complete onboarding (Sprint 10), import 200 students (Sprint 10). ✅
2. Configure classes, sections, subjects, timetable (Sprint 4 + Sprint 12). ✅
3. Mark daily attendance for all classes (Sprint 8). ✅
4. Generate fee invoices, collect online (Razorpay) + offline, issue receipts (Sprint 9). ✅
5. Conduct exam, enter marks, generate report cards PDF (Sprint 11). ✅
6. Send SMS + WhatsApp + Email + Push to parents (Sprint 6 + Sprint 13). ✅
7. Issue Bonafide and Transfer Certificates (Sprint 14). ✅
8. Run reports on attendance, fees, marks (Sprint 14). ✅

Super Admin:
1. See all tenants in console with health, MRR, trial status (Sprint 7 + Sprint 14). ✅
2. Create or suspend a tenant (Sprint 7). ✅
3. Toggle feature flag for any tenant (Sprint 5 + Sprint 7). ✅
4. View per-tenant audit log (Sprint 1 + Sprint 7). ✅
5. Issue, retry, void invoice (Sprint 15). ✅
6. Impersonate school admin (audited) (Sprint 7). ✅

All without cross-tenant exposure (verified by Sprint 18 pen-test).
