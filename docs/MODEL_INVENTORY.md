# MODEL INVENTORY — SchoolOS SaaS

_Upstream: MODULES.md, DATABASE_ARCHITECTURE.md. Downstream: DATABASE_DESIGN.md, PRISMA_STRATEGY.md, BACKEND_ARCHITECTURE.md, REST_API_DESIGN.md._

> Authoritative catalogue of every database model grouped by domain. For each domain: tables, key relationships, and cross-domain dependencies.
>
> Source-of-truth pair: `DATABASE_DESIGN.md` (column-level specs) and `PRISMA_STRATEGY.md` (schema-file grouping, scope classes, conventions).
>
> Use this file to answer "where does X live?", "what tables compose this feature?", and "if I touch X, what else breaks?" without re-reading the full design.
>
> Notation:
> - **Scope class:** `TENANT_OWNED` (carries `school_id`), `TENANT_SHARED_PLATFORM` (read-only for tenants), `PLATFORM_ONLY` (operator-only), `CROSS_TENANT_OPERATIONAL` (operational, filterable by tenant).
> - **Relationships** use `parent → child (cardinality, FK shape)`. `Composite FK` means `(school_id, id) → (school_id, id)`.
> - **Dependencies** list the domains a domain must read/write but does not own.

---

## Domain Index

The Prisma schema is split across **26 files** in `backend/prisma/schema/` (plus `_generator.prisma` and the `migrations/` folder). Total **155 models** as of Sprint 20. Each row below is a single schema file; the domain sections below group related files where useful.

| # | Schema file                  | Models | Scope (primary)              | Section |
| - | ---------------------------- | -----: | ---------------------------- | ------- |
| 1 | `platform.prisma`            |      5 | PLATFORM_ONLY                | §1      |
| 2 | `organization.prisma`        |      2 | PLATFORM_ONLY                | §1      |
| 3 | `schools.prisma`             |      4 | mixed                        | §3      |
| 4 | `branches.prisma`            |      2 | TENANT_OWNED                 | §3      |
| 5 | `identity.prisma`            |      9 | mixed                        | §2      |
| 6 | `flags.prisma`               |      5 | TENANT_SHARED_PLATFORM + ops | §14     |
| 7 | `subscriptions.prisma`       |      6 | mixed (PLATFORM_ONLY + tenant ledger) | §14 |
| 8 | `audit.prisma`               |      2 | TENANT_OWNED (parted.)       | §15     |
| 9 | `academic.prisma`            |      8 | TENANT_OWNED                 | §4      |
|10 | `academic-content.prisma`    |      8 | TENANT_OWNED                 | §21     |
|11 | `students.prisma`            |      6 | TENANT_OWNED                 | §5/§6   |
|12 | `staff.prisma`               |      8 | TENANT_OWNED                 | §7      |
|13 | `houses.prisma`              |      2 | TENANT_OWNED                 | §19     |
|14 | `rooms.prisma`               |      2 | TENANT_OWNED                 | §20     |
|15 | `attendance.prisma`          |      6 | TENANT_OWNED (parted.)       | §8      |
|16 | `fees.prisma`                |     13 | TENANT_OWNED                 | §9      |
|17 | `examination.prisma`         |     10 | TENANT_OWNED                 | §10     |
|18 | `timetable.prisma`           |      8 | TENANT_OWNED                 | §11     |
|19 | `events.prisma`              |      6 | TENANT_OWNED                 | §24     |
|20 | `calendar.prisma`            |      3 | TENANT_OWNED                 | §18     |
|21 | `notifications.prisma`       |      8 | TENANT_OWNED + cross         | §12     |
|22 | `files.prisma`               |      2 | TENANT_SHARED_PLATFORM       | §17     |
|23 | `ops.prisma`                 |      7 | mixed                        | §23     |
|24 | `reporting.prisma`           |      8 | TENANT_OWNED                 | §22     |
|25 | `billing.prisma`             |     15 | PLATFORM_ONLY                | §13     |
|26 | `*Provisioning (service-only)* | — | — | §16 |
|   | **Total**                    | **155** |                              |         |

> Notes:
> - SaaS Billing tables (Sprint 20) live in `billing.prisma` and are PLATFORM_ONLY (single `id` PK, `school_id` is a filter column). They are permanently separate from `fees.prisma` (School Fees, parent → school). RBAC tables live in `identity.prisma`; subscription ledger in `subscriptions.prisma`; the per-school Plan catalogue model lives in `platform.prisma`. Examinations live in `examination.prisma`.
> - Provisioning is composed at the service layer over `schools.prisma` + `platform.prisma`; it owns no new tables.
> - Cross-cutting tables (files, jobs, outbox, idempotency, sequences, audit) appear under their owning file even though they're consumed by everyone.

---

## 1. PLATFORM

The platform domain represents **us, the SaaS operator**. It owns tenants, regions, system config, feature-flag definitions, and operational primitives. No tenant user has access except through Super Admin.

### Tables (14)

| Table                          | Scope             | Purpose                                                  |
| ------------------------------ | ----------------- | -------------------------------------------------------- |
| `tenants`                      | PLATFORM_ONLY     | One row per school. Source of truth for `school_id`.     |
| `tenant_settings`              | PLATFORM_ONLY     | Per-tenant operational config (region, kms_key, timezone, locale, feature envelope). |
| `tenant_status_history`        | PLATFORM_ONLY     | Status transitions (DRAFT → PROVISIONING → ACTIVE → SUSPENDED → ARCHIVED → DELETED, per DECISIONS D-027; trial/expiring live on the parallel Subscription FSM per D-028) with reason. |
| `tenant_owners`                | PLATFORM_ONLY     | Designated owner user(s) per tenant; primary for billing & legal. |
| `tenant_owner_transfers`       | PLATFORM_ONLY     | Pending/approved/cancelled owner-transfer requests (4-eyes, cool-off). |
| `regions`                      | PLATFORM_ONLY     | Supported regions (ap-south-1 only at v1) + DR pairing.  |
| `platform_users`               | PLATFORM_ONLY     | Operator staff (super_admin, support, billing, engineer, readonly). |
| `platform_user_sessions`       | PLATFORM_ONLY     | Operator sessions (MFA-mandatory, IP allowlist).         |
| `platform_user_devices`        | PLATFORM_ONLY     | Registered WebAuthn devices for operators.               |
| `platform_settings`            | PLATFORM_ONLY     | Global key-value config (rate limits, feature defaults). |
| `impersonation_sessions`       | PLATFORM_ONLY     | Active and historical operator impersonation tokens (reason, TTL). |
| `four_eyes_approvals`          | PLATFORM_ONLY     | Pending approvals for designated mutations (suspend, void, refund, owner-transfer). |
| `provider_credentials`         | PLATFORM_ONLY     | Razorpay / MSG91 / Gupshup / SendGrid creds per region.  |
| `cross_tenant_probe_events`    | PLATFORM_ONLY     | Detected attempts at cross-tenant access (security signal). |

### Relationships

- `tenants 1 ── N tenant_settings` (1 active; history kept in `tenant_status_history`)
- `tenants 1 ── 1 regions` (FK: `tenants.region_id`)
- `tenants 1 ── N tenant_owners` (multiple owners allowed; one primary)
- `tenants 1 ── N tenant_owner_transfers`
- `tenants 1 ── N impersonation_sessions` (operator-initiated)
- `platform_users 1 ── N platform_user_sessions` (refresh tokens, JTIs)
- `platform_users 1 ── N platform_user_devices` (WebAuthn)
- `platform_users 1 ── N four_eyes_approvals` (initiator / approver columns)
- `regions 1 ── N provider_credentials`
- `tenants 1 ── N cross_tenant_probe_events` (logged when a tenant probes a foreign `school_id`)

### Dependencies

- **None upstream.** Platform is the root of the dependency graph.
- **Downstream:** every TENANT_OWNED domain depends on `tenants.id = school_id`.
- Identity domain reads `platform_users` for operator login; tenant users live in Identity but are FK'd to `tenants`.

---

## 2. IDENTITY

Identity covers authentication, sessions, MFA, devices, and user-role bindings for **both** tenant users and platform users. Roles & permissions live here too (RBAC).

### Tables (14)

| Table                         | Scope                       | Purpose                                                          |
| ----------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `users`                       | TENANT_OWNED                | All tenant users (admin/teacher/parent/student). PII + login.    |
| `user_emails`                 | TENANT_OWNED                | One primary + multiple secondary emails per user (verified flag). |
| `user_phones`                 | TENANT_OWNED                | Phone numbers (E.164) with verified flag and OTP scope.          |
| `user_passwords`              | TENANT_OWNED                | Password hash (argon2id), history (last N), forced-reset flag.   |
| `user_mfa_factors`            | TENANT_OWNED                | TOTP secrets, WebAuthn pubkeys, backup codes.                    |
| `user_devices`                | TENANT_OWNED                | Registered devices for push, biometric, deep-link.               |
| `user_sessions`               | TENANT_OWNED                | Refresh token rows (rotating, revocable).                        |
| `user_login_events`           | TENANT_OWNED                | Login attempts (success/failure, IP, UA, geo) — security signal. |
| `user_otp_codes`              | TENANT_OWNED                | OTPs for login/signup/reset/MFA (hashed, TTL, attempt count).    |
| `api_keys`                    | TENANT_OWNED                | Tenant-issued API keys with scopes, hashed secret, expiry.       |
| `roles`                       | TENANT_SHARED_PLATFORM      | Role definitions; system roles seeded + per-tenant custom roles. |
| `permissions`                 | TENANT_SHARED_PLATFORM      | Permission catalogue (`resource.action`).                        |
| `role_permissions`            | TENANT_SHARED_PLATFORM      | M:N role↔permission.                                             |
| `user_roles`                  | TENANT_OWNED                | M:N user↔role with optional `scope` (branch/section/class).      |

### Relationships

- `tenants 1 ── N users` (FK: `users.school_id`)
- `users 1 ── N user_emails | user_phones | user_passwords | user_mfa_factors | user_devices | user_sessions | user_login_events | user_otp_codes | api_keys` (all composite FK)
- `users N ── M roles` via `user_roles`
- `roles N ── M permissions` via `role_permissions`
- `user_roles.scope_*` columns link to academic entities (branches, classes, sections) via soft references — no FK to avoid cross-cluster cycles; validated at write time.

### Dependencies

- **Upstream:** Platform (`tenants`, `platform_users` for operator impersonation).
- **Downstream:** Every domain — `users.id` is the universal actor for `created_by` / `updated_by` / audit `actor_id`. Notification domain reads `user_phones`, `user_emails`, `user_devices`. Parent and Teacher domains extend `users`.

---

## 3. SCHOOL

School-level configuration: organisational structure that anchors the tenant. This domain is the "**chrome**" inside which Academic, Student, Staff, Fees, Exams, Timetable live.

### Tables (20)

| Table                       | Scope        | Purpose                                                  |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `school_profile`            | TENANT_OWNED | One row per tenant. Display name, logo, contacts, board, brand colour. |
| `school_settings`           | TENANT_OWNED | Per-school key-value (academic year start month, weekly off days, late-cutoff times, gradebook rules). |
| `branches`                  | TENANT_OWNED | Campuses; multi-campus tenants supported.                |
| `departments`               | TENANT_OWNED | Academic / admin departments (Maths Dept, Sports Dept).  |
| `designations`              | TENANT_OWNED | Staff designations (Principal, HOD, Teacher, Counsellor).|
| `houses`                    | TENANT_OWNED | Co-curricular houses (Red, Blue, Green, Yellow).         |
| `rooms`                     | TENANT_OWNED | Physical rooms (CLASSROOM, LAB, HALL, OFFICE) with capacity. |
| `calendar_events`           | TENANT_OWNED | Holidays, PTMs, events, exam windows.                    |
| `working_days_config`       | TENANT_OWNED | Day-of-week patterns per branch (different timing on Saturdays). |
| `library_books`             | TENANT_OWNED | (Adjacent module — opt-in via flag.)                     |
| `library_issues`            | TENANT_OWNED | Book issue/return ledger.                                |
| `transport_routes`          | TENANT_OWNED | (Adjacent module.) Route name, stops, fare.              |
| `transport_stops`           | TENANT_OWNED | Pickup points, ETA.                                      |
| `transport_vehicles`        | TENANT_OWNED | Bus registration, capacity, GPS device id.               |
| `hostels`                   | TENANT_OWNED | (Adjacent module.) Hostel block configuration.           |
| `hostel_rooms`              | TENANT_OWNED | Room number, capacity, type, occupancy.                  |
| `hostel_allocations`        | TENANT_OWNED | Student↔room assignments.                                |
| `inventory_items`           | TENANT_OWNED | (Adjacent module.) Stationery / asset inventory.         |
| `visitor_passes`            | TENANT_OWNED | (Adjacent module.) Reception pass log.                   |
| `school_documents`          | TENANT_OWNED | School-level documents (registration certificates, NOCs). |

### Relationships

- `school_profile 1 ── 1 tenants` (FK: `school_id` is also PK here)
- `school_profile 1 ── N school_settings`
- `branches 1 ── N rooms | departments`  
- `branches 1 ── N classes` (Academic domain)
- `houses 1 ── N students` (Student domain — assignment)
- `transport_routes 1 ── N transport_stops`
- `transport_routes 1 ── N transport_vehicles`
- `hostels 1 ── N hostel_rooms`
- `hostel_rooms 1 ── N hostel_allocations`
- `calendar_events` audience flags reference roles (Identity).

### Dependencies

- **Upstream:** Platform (`tenants`), Identity (users for `created_by`, audience targeting).
- **Downstream:** Academic (classes use branches), Student (students reference houses/transport/hostel), Teacher (staff reference departments/designations), Timetable (rooms), Attendance (working_days_config decides eligibility).

---

## 4. ACADEMIC

Academic structure: the temporal and curricular skeleton. Every Student, Attendance, Mark, Invoice, Timetable entry is anchored to an academic year + class + section + subject.

### Tables (8)

| Table                       | Scope        | Purpose                                                  |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `academic_years`            | TENANT_OWNED | Named year (2026-27), start/end date, status (DRAFT/ACTIVE/ARCHIVED). Only one ACTIVE. |
| `academic_terms`            | TENANT_OWNED | Quarters / semesters / trimesters within a year.         |
| `classes`                   | TENANT_OWNED | Grade level (Class 5, Class 10). Branch-scoped.          |
| `sections`                  | TENANT_OWNED | Class divisions (5-A, 5-B). Class-scoped, capacity.      |
| `subjects`                  | TENANT_OWNED | Subjects offered (Maths, English). Scoped to academic year. |
| `class_subjects`            | TENANT_OWNED | M:N — which subjects are taught in each class.           |
| `section_subjects`          | TENANT_OWNED | Section-level override (rare; e.g. optional French in 9-A). |
| `academic_year_promotions`  | TENANT_OWNED | Promotion job records (source year → target year, status, snapshot). |

### Relationships

- `academic_years 1 ── N academic_terms`
- `academic_years 1 ── N classes` (year-scoped — Class 5 in 2026-27 is a different row from Class 5 in 2027-28? Optional, see §Notes)
- `classes 1 ── N sections`
- `classes N ── M subjects` via `class_subjects`
- `sections N ── M subjects` via `section_subjects` (overrides)
- `branches 1 ── N classes` (School → Academic FK)
- `academic_year_promotions` references source + target academic_year and lists affected students (in detail rows or via job payload).

### Notes

- We keep `classes` keyed by tenant (one Class 5 per branch), and use `academic_year_promotions` to roll student membership year over year. Year-scoped class identity is left as an open design point; current default is non-year-scoped class + year-scoped section enrolments.

### Dependencies

- **Upstream:** Platform, Identity, School (branches).
- **Downstream:** Student (enrolment), Teacher (assignment), Attendance, Examination, Timetable, Fees (fee structures may target academic years / classes), Notification (audience filters).

---

## 5. STUDENT

Students are the central tenant entity. Most modules eventually anchor to a `student_id`. Soft delete, version, and admission-number gap-free sequencing are critical.

### Tables (10)

| Table                          | Scope        | Purpose                                                  |
| ------------------------------ | ------------ | -------------------------------------------------------- |
| `students`                     | TENANT_OWNED | Master student record (PII, admission, current class/section). |
| `student_enrollments`          | TENANT_OWNED | Per-academic-year enrolment with class+section+roll_no.  |
| `student_addresses`            | TENANT_OWNED | Permanent / correspondence addresses.                    |
| `student_documents`            | TENANT_OWNED | Birth cert, transfer cert, photos (FK to `files`).       |
| `student_status_history`       | TENANT_OWNED | Status transitions (ACTIVE → TC_ISSUED → INACTIVE → GRADUATED). |
| `student_transfers`            | TENANT_OWNED | Section/class transfer events with reason and effective date. |
| `student_transfer_certificates`| TENANT_OWNED | TC issuance records (number sequence, leaving date, conduct, generated PDF). |
| `student_houses`               | TENANT_OWNED | House assignment history.                                |
| `student_pickup_authorizations`| TENANT_OWNED | Authorized pickup persons (name, phone, photo, validity). |
| `student_health_records`       | TENANT_OWNED | Blood group, allergies, emergency contacts, medical notes. |

### Relationships

- `tenants 1 ── N students`
- `students 1 ── N student_enrollments` (one per academic year)
- `students 1 ── N student_addresses`
- `students 1 ── N student_documents` (composite FK to `files`)
- `students 1 ── N student_status_history`
- `students 1 ── N student_transfers`
- `students 1 ── N student_transfer_certificates`
- `students 1 ── N student_houses` (history)
- `students 1 ── N student_pickup_authorizations`
- `students 1 ── 1 student_health_records`
- `student_enrollments → classes`, `→ sections`, `→ academic_years` (Academic domain)
- `students → houses`, `→ transport_routes` (optional), `→ hostel_rooms` (optional) — School domain
- `students 1 ── N parent_student_links` (Parent domain)

### Dependencies

- **Upstream:** Platform, Identity (created_by/updated_by), School (houses, transport, hostel), Academic (year/class/section).
- **Downstream:** Parent (linking), Attendance, Fees, Examination, Timetable view, Notification recipient resolution.

---

## 6. PARENT

Parents are users (Identity) with a many-to-many link to students. A parent may have multiple children across tenants (the same phone number can belong to multiple `users` rows, one per tenant). The link table is the heart.

### Tables (5)

| Table                       | Scope        | Purpose                                                  |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `parents`                   | TENANT_OWNED | Parent profile extension over `users` (occupation, employer, income bracket, qualification). |
| `parent_student_links`      | TENANT_OWNED | M:N parent↔student with `relation` (FATHER/MOTHER/GUARDIAN), `is_primary_contact`, `can_pickup`. |
| `parent_communication_prefs`| TENANT_OWNED | Channel/category opt-in per parent (SMS/Email/WhatsApp/Push × Academic/Fees/General). |
| `parent_messages`           | TENANT_OWNED | 1:1 message threads (parent ↔ teacher/admin) if MESSAGING flag on. |
| `parent_leave_applications` | TENANT_OWNED | Leave requests submitted by parents on behalf of child (mirrors `leave_applications` from Attendance with parent-initiator). |

### Relationships

- `parents 1 ── 1 users` (`parents.user_id`; parent IS a user)
- `parents N ── M students` via `parent_student_links`
- `parent_student_links` enforces exactly one `is_primary_contact=true` per student via a partial unique generated column.
- `parents 1 ── N parent_communication_prefs`
- `parent_messages` ← references `users.id` (sender + recipient)

### Dependencies

- **Upstream:** Identity (users), Student.
- **Downstream:** Notification (`is_primary_contact` decides default fee/attendance recipient), Fees (parent is invoice billing contact), Attendance (parent submits leave), Examination (parent receives result), Billing (parent never sees — platform billing is school-level only).

---

## 7. TEACHER (STAFF)

Staff covers all employees: teachers, principal, accountant, librarian, support staff. Teacher-specific concerns (subject qualification, section assignments, substitutions) layer on top.

### Tables (8)

| Table                          | Scope        | Purpose                                                  |
| ------------------------------ | ------------ | -------------------------------------------------------- |
| `staff`                        | TENANT_OWNED | Employee master (employee_code, joining, designation, dept, qualifications, photo, status). |
| `staff_employment_history`     | TENANT_OWNED | Joining/leaving/role-change events.                      |
| `staff_qualifications`         | TENANT_OWNED | Degrees / certifications / experience.                   |
| `staff_subject_qualifications` | TENANT_OWNED | Subjects a teacher is qualified to teach.                |
| `staff_section_assignments`    | TENANT_OWNED | Teacher↔section↔subject assignments per academic year (used by timetable validators). |
| `class_teachers`               | TENANT_OWNED | One class teacher per section per academic year.         |
| `staff_leaves`                 | TENANT_OWNED | Leave applications by staff (separate flow from student attendance leaves). |
| `staff_documents`              | TENANT_OWNED | ID proof, contracts, certificates (FK to `files`).       |

### Relationships

- `staff 1 ── 1 users` (`staff.user_id`)
- `staff → designations`, `→ departments` (School domain)
- `staff 1 ── N staff_employment_history | staff_qualifications | staff_documents | staff_leaves`
- `staff N ── M subjects` via `staff_subject_qualifications`
- `staff N ── M sections` via `staff_section_assignments` (with `subject_id`, `academic_year_id`)
- `class_teachers` is a unique mapping `(school_id, section_id, academic_year_id) → staff_id`

### Dependencies

- **Upstream:** Identity (users), School (designations, departments), Academic (subjects, classes, sections, years).
- **Downstream:** Attendance (teacher enters), Examination (marks entry, exam invigilation), Timetable (assignments, substitutions), Notification (teacher → parent threads).

---

## 8. ATTENDANCE

Two attendance domains share this cluster: **student attendance** (daily / period / subject) and **staff attendance** (HR, biometric). High-write; partitioned by month.

### Tables (6)

| Table                          | Scope                   | Purpose                                                  |
| ------------------------------ | ----------------------- | -------------------------------------------------------- |
| `attendance_daily`             | TENANT_OWNED, PARTITIONED | One row per (student, date) — daily mode.              |
| `attendance_period`            | TENANT_OWNED, PARTITIONED | One row per (student, date, period, subject) — period mode. |
| `attendance_date_locks`        | TENANT_OWNED            | Per-section per-date lock once finalized; prevents edits. |
| `leave_applications`           | TENANT_OWNED            | Student leave applications (workflow: PENDING → APPROVED/REJECTED). |
| `staff_attendance`             | TENANT_OWNED, PARTITIONED | One row per (staff, date) with in/out times.           |
| `biometric_punches`            | TENANT_OWNED, PARTITIONED | Raw device punches (identifier, ts, IN/OUT) before reconciliation. |

### Relationships

- `attendance_daily.student_id → students` (composite FK)
- `attendance_daily.section_id → sections` (composite FK; redundant with student → section but indexed for class-roll queries)
- `attendance_period` adds `subject_id` and `period_index`
- `attendance_date_locks` keyed by `(school_id, section_id, date, mode, period?)`
- `leave_applications.student_id → students`; `applied_by_user_id → users`; `decided_by_user_id → users`
- `staff_attendance.staff_id → staff` (composite)
- `biometric_punches` are unresolved raw data; a reconciliation job promotes them into `staff_attendance` or `attendance_daily`.

### Dependencies

- **Upstream:** Platform, Identity, School (rooms, working_days_config), Academic (sections, subjects, years), Student, Teacher.
- **Downstream:** Notification (auto-SMS on absent), Examination (attendance threshold for hall ticket eligibility), Fees (rare — some schools fine on attendance), Reporting (defaulter lists).

---

## 9. FEES

Fees is the most heterogeneous tenant-owned domain: heads → structures → invoices → payments → receipts → reminders → refunds → ledger. Carries strict integrity (gap-free receipt numbers, idempotent online payments).

### Tables (14)

| Table                       | Scope        | Purpose                                                  |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `fee_heads`                 | TENANT_OWNED | Categorised line items (Tuition, Transport, Hostel, Misc) with HSN/SAC, refundable, taxable flags. |
| `fee_structures`            | TENANT_OWNED | Named template: who pays what, when. Versioned + publishable. |
| `fee_structure_lines`       | TENANT_OWNED | Lines within a structure (head + amount + frequency + due_day + fine policy). |
| `fee_discounts`             | TENANT_OWNED | Discount/concession definitions (percent/flat, applicability, validity). |
| `student_fee_discounts`     | TENANT_OWNED | Assignments of discounts to specific students (with approval). |
| `fee_late_fine_policies`    | TENANT_OWNED | Grace period + per-day/flat fine + cap.                  |
| `fee_invoices`              | TENANT_OWNED | Generated invoices (student, period, status, totals).    |
| `fee_invoice_lines`         | TENANT_OWNED | Line items per invoice (head, amount, discount, tax).    |
| `fee_payments`              | TENANT_OWNED | Payment events (online/offline) referencing invoice + method + provider data. |
| `fee_payment_allocations`   | TENANT_OWNED | Allocation of a payment across multiple invoice lines (partial-pay support). |
| `fee_receipts`              | TENANT_OWNED | Receipt records — gap-free numbering via `tenant_sequences`. |
| `fee_refunds`               | TENANT_OWNED | Refund records (4-eyes; references payment).             |
| `fee_reminder_runs`         | TENANT_OWNED | Reminder dispatch runs (which invoices, which channels). |
| `fee_ledger_entries`        | TENANT_OWNED | Per-student debit/credit ledger (derived; rebuilt by job for performance). |

### Relationships

- `fee_structures 1 ── N fee_structure_lines`
- `fee_structure_lines → fee_heads`, `→ fee_late_fine_policies`
- `fee_invoices → students`, `→ academic_terms` (optional), `→ fee_structures` (origin reference)
- `fee_invoices 1 ── N fee_invoice_lines`
- `fee_invoice_lines → fee_heads`
- `fee_invoices 1 ── N fee_payments`
- `fee_payments 1 ── N fee_payment_allocations` (allocations per invoice line)
- `fee_payments 1 ── 0..1 fee_receipts`
- `fee_payments 1 ── N fee_refunds`
- `fee_discounts N ── M students` via `student_fee_discounts` (approval workflow inline)
- `fee_reminder_runs N ── M fee_invoices` (junction implicit via batch payload)
- `fee_ledger_entries → students` (derived view, refreshed by job)

### Dependencies

- **Upstream:** Platform, Identity, School, Academic (years, terms, classes), Student.
- **Cross-cluster:** Notification (reminder dispatch via templates + credits), Files (invoice/receipt PDFs), Outbox (payment-captured webhook), Audit (every money mutation → finance hash chain).
- **Downstream:** Reporting (collection day-book, outstanding), Parent portal (view & pay), Billing **NO** — platform billing is separate.

---

## 10. EXAMINATION

Exams cover scheme definition, scheduling, hall tickets, seating, marks entry (optimistic-locked), result computation, report card generation, revaluation.

### Tables (10)

| Table                       | Scope        | Purpose                                                  |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `exam_schemes`              | TENANT_OWNED | Grading schemes (grade bands, GPA mapping, passing %, weightage). |
| `exams`                     | TENANT_OWNED | Exam definition (term, type, weightage, scheme, audience). |
| `exam_schedules`            | TENANT_OWNED | Datesheet entries (date, time, room, max marks, pass marks per subject × sections). |
| `exam_hall_tickets`         | TENANT_OWNED | Generated hall ticket records per student per exam.      |
| `exam_seating_plans`        | TENANT_OWNED | Room-wise seat allocation.                               |
| `exam_marks`                | TENANT_OWNED | Marks per (exam, student, subject) with `version` for optimistic lock. |
| `exam_coscholastic_grades`  | TENANT_OWNED | Skills/co-curricular grades (CBSE-style).                |
| `exam_results`              | TENANT_OWNED | Computed per-student result (totals, percentage, grade, rank, status). |
| `report_cards`              | TENANT_OWNED | Published report card records (PDF file id, published_at, version). |
| `exam_revaluations`         | TENANT_OWNED | Revaluation requests + decisions per mark row.           |

### Relationships

- `exam_schemes 1 ── N exams`
- `exams 1 ── N exam_schedules`
- `exam_schedules → subjects`, `→ sections`, `→ rooms`
- `exams 1 ── N exam_hall_tickets` (one per student per exam)
- `exam_schedules 1 ── N exam_seating_plans`
- `exams + students + subjects 1 ── 1 exam_marks` (`@@unique([school_id, exam_id, student_id, subject_id])`)
- `exam_marks 1 ── N exam_revaluations`
- `exams + students 1 ── 1 exam_results`
- `exam_results 1 ── 0..1 report_cards`
- `exams → academic_years`, `→ academic_terms`

### Dependencies

- **Upstream:** Platform, Identity, School (rooms), Academic (years, terms, classes, sections, subjects), Student, Teacher (mark entry actor, qualification check).
- **Cross-cluster:** Files (report card PDFs), Notification (result publication notice), Audit (publish/unpublish, mark changes), Outbox (report-card generation job).
- **Downstream:** Reporting (toppers, pass %), Parent portal (view results), Student portal.

---

## 11. TIMETABLE

Versioned timetable engine with section/teacher/room conflict prevention and substitution support.

### Tables (7)

| Table                         | Scope        | Purpose                                                  |
| ----------------------------- | ------------ | -------------------------------------------------------- |
| `period_templates`            | TENANT_OWNED | Branch-level day patterns: days, periods (index, label, start/end, type TEACHING/BREAK). |
| `timetable_versions`          | TENANT_OWNED | Version envelope per academic year (DRAFT/ACTIVE/ARCHIVED). Only one ACTIVE per scope. |
| `timetable_entries`           | TENANT_OWNED | One row per (version, section, day, period_index) with teacher, subject, room. |
| `timetable_substitutions`     | TENANT_OWNED | One-off substitution for a date+period+section (overrides entry). |
| `timetable_conflicts`         | TENANT_OWNED | Detected conflicts captured by validator (kept for ops dashboard). |
| `timetable_generation_runs`   | TENANT_OWNED | Auto-generator job records (constraints, score, generated entry count). |
| `period_settings`             | TENANT_OWNED | Default ringer/break/cycle settings (per branch).        |

### Relationships

- `branches 1 ── N period_templates`
- `academic_years 1 ── N timetable_versions`
- `timetable_versions 1 ── N timetable_entries`
- `timetable_entries → sections`, `→ subjects`, `→ users` (teacher = staff.user), `→ rooms` (composite FK)
- `timetable_substitutions → timetable_entries` (target), `→ users` (substitute teacher)
- `staff_subject_qualifications` and `staff_section_assignments` (Teacher domain) are read by timetable validators.
- Uniqueness constraints:
  - `@@unique([school_id, version_id, section_id, day, period_index])` — section slot uniqueness
  - Conflict detection (teacher/room) enforced at the service layer (no DB index can express it without windowing).

### Dependencies

- **Upstream:** Platform, Identity, School (rooms, branches), Academic (years, classes, sections, subjects), Teacher.
- **Cross-cluster:** Outbox (publish/activate broadcasts), Notification (substitution alert to teachers/students/parents), Audit.
- **Downstream:** Attendance (period mode reads timetable to know which subject), Parent/Teacher/Student portal views.

---

## 12. NOTIFICATION

Multi-channel notification with India-specific compliance (DLT for SMS, WABA for WhatsApp). Includes a **credit-pool ledger** that is `CROSS_TENANT_OPERATIONAL` (operator can roll up across tenants).

### Tables (14)

| Table                          | Scope                       | Purpose                                                  |
| ------------------------------ | --------------------------- | -------------------------------------------------------- |
| `notification_templates`       | TENANT_OWNED                | Templates per channel with variables, DLT/WABA IDs, sender id. |
| `notification_template_versions` | TENANT_OWNED              | Versioned content of templates with approval status.    |
| `notification_campaigns`       | TENANT_OWNED                | Bulk dispatch envelope: name, template, audience query, schedule. |
| `notification_batches`         | TENANT_OWNED                | Each dispatch run within a campaign or ad-hoc send.      |
| `notification_messages`        | TENANT_OWNED, PARTITIONED   | One row per recipient-message with status (QUEUED/SENT/DELIVERED/FAILED). |
| `notification_message_events`  | TENANT_OWNED, PARTITIONED   | Provider DLR / open / click / bounce events.             |
| `notification_recipients_resolved` | TENANT_OWNED            | Resolved phone/email/device per message (snapshot at dispatch time). |
| `notification_opt_outs`        | TENANT_OWNED                | Per-(identifier, channel, category) opt-out records.     |
| `notification_quiet_hours`     | TENANT_OWNED                | Tenant quiet-hour policy + per-channel overrides.        |
| `notification_credit_pool`     | TENANT_OWNED                | Current balance per channel (SMS, WhatsApp, Email).      |
| `notification_credit_ledger`   | CROSS_TENANT_OPERATIONAL    | Append-only debit/credit ledger feeding the pool.        |
| `notification_credit_topups`   | TENANT_OWNED                | Top-up purchase records (linked to platform invoice).    |
| `push_devices`                 | TENANT_OWNED                | FCM/APNs tokens registered against users + app version.  |
| `dlt_registrations`            | TENANT_OWNED                | DLT entity/header/template registrations with TRAI IDs.  |

### Relationships

- `notification_templates 1 ── N notification_template_versions`
- `notification_campaigns 1 ── N notification_batches 1 ── N notification_messages 1 ── N notification_message_events`
- `notification_messages → users` (recipient) — soft FK if recipient is anonymous external (e.g. dropped staff).
- `notification_recipients_resolved` snapshots `user_phones | user_emails | push_devices` at dispatch.
- `notification_opt_outs` keyed by identifier (phone/email/userId) + channel + category.
- `notification_credit_pool 1 ── N notification_credit_ledger` (current = sum of ledger).
- `notification_credit_topups` ← references `platform_invoices` (Billing domain).
- `push_devices 1 ── 1 user_devices` (Identity)
- `dlt_registrations → notification_templates` (DLT IDs back-referenced).

### Dependencies

- **Upstream:** Platform (provider_credentials), Identity (users, phones, emails, devices).
- **Cross-cluster:** Fees (reminder triggers), Attendance (absent triggers), Examination (result publish), Audit (template approval, send actions), Outbox (async dispatch), Billing (credit top-up purchases).
- **Downstream:** Parent / Teacher / Student portals (in-app inbox), Reporting (DLR rate per provider).

---

## 13. BILLING

SaaS Billing (Sprint 20) — the platform charging the school for the subscription. Strictly separate from School Fees (§9). All tables are `PLATFORM_ONLY` (single `id` PK, `school_id` as filter column only). Integration with Subscription is via `SubscriptionService` only — never via repository. Razorpay is the only automated gateway; manual entry (UPI / Bank Transfer / Cash / Cheque / Card) follows the same invoice/payment FSM (only verification differs).

### Tables (15)

| Table                          | Scope         | Purpose                                                  |
| ------------------------------ | ------------- | -------------------------------------------------------- |
| `billing_accounts`             | PLATFORM_ONLY | Root row — one per school. Running balance (balanceDue, creditBalance, totalInvoiced, totalPaid, totalRefunded). Soft-delete + version. |
| `billing_profiles`             | PLATFORM_ONLY | 1:1 with account. Legal/display/contact name, contact email, CC emails. |
| `billing_addresses`            | PLATFORM_ONLY | 1:1 with account. Postal / legal address with state code (drives GST place-of-supply). |
| `billing_tax_details`          | PLATFORM_ONLY | 1:1 with account. GSTIN, PAN, `placeOfSupply`, tax-exempt flag + reason. |
| `billing_settings`             | PLATFORM_ONLY | 1:1 with account. Grace period (default 7d), billing lead days, auto-charge toggle, default payment source, invoice prefix, reminder offsets JSON. |
| `billing_payment_sources`      | PLATFORM_ONLY | Platform-managed payment sources. RAZORPAY rows carry encrypted `keyId/keySecret/webhookSecret` (envelope-encrypted via `CryptoService.sealString`). UPI/BANK/MANUAL rows carry handle/account fields. |
| `billing_invoices`             | PLATFORM_ONLY | Invoice header. FY-scoped `invoice_number` from `SequenceService` (`BILLING_INVOICE`). FSM via `InvoiceStatus`. Snapshots `profile/address/tax` at issue time (JSON). Tracks `subtotal / discountTotal / taxTotal / totalAmount / amountPaid / amountRefunded / amountDue`. |
| `billing_invoice_lines`        | PLATFORM_ONLY | Line items. `lineType ∈ SUBSCRIPTION | ADJUSTMENT | TAX | DISCOUNT`. Quantity, unit price, amount, taxCode, taxRate, taxAmount, sort order. |
| `billing_invoice_history`      | PLATFORM_ONLY | APPEND_ONLY history per invoice. Every meaningful state change (CREATED, ISSUED, SENT, PAYMENT_RECEIVED, PARTIAL_PAYMENT, PAID, VOIDED, REFUNDED, PARTIALLY_REFUNDED, WRITTEN_OFF, MARKED_OVERDUE, ADJUSTMENT_APPLIED, CREDIT_NOTE_APPLIED). |
| `billing_payments`             | PLATFORM_ONLY | Recorded payment. Receipt number unique. Method ∈ RAZORPAY / UPI / BANK_TRANSFER / CASH / CHEQUE / CARD. Status FSM (PENDING → APPROVED/REJECTED/ON_HOLD/FAILED, APPROVED → REFUNDED/PARTIALLY_REFUNDED). Razorpay payments record `gatewayOrderId/PaymentId/Signature`; manual payments record `externalReference/proofUrl/payerNotes`. |
| `billing_payment_attempts`     | PLATFORM_ONLY | APPEND_ONLY attempt log per payment. One Razorpay payment may have many attempts (order created → payment failed → retry). Status ∈ INITIATED / SUCCESS / FAILED / EXPIRED. Stores raw gateway response. |
| `billing_refunds`              | PLATFORM_ONLY | Refund record against a Payment (and optionally a specific Invoice). Status FSM (PENDING → APPROVED → PROCESSED, or REJECTED / FAILED). Captures gateway refund id + external reference. |
| `billing_credit_notes`         | PLATFORM_ONLY | Credit note header. Status FSM (ISSUED → APPLIED → VOID). Tracks `amountApplied`, `appliedToInvoiceId`. FY-scoped credit-note number. |
| `billing_adjustments`          | PLATFORM_ONLY | CREDIT or DEBIT line directly on the account (promotional credit, goodwill, interest, fees). Optionally tied to an invoice. |
| `billing_audits`               | PLATFORM_ONLY | APPEND_ONLY billing-specific audit trail alongside the global `audit_logs`. Records every account / invoice / payment / refund / credit-note / adjustment / settings / payment-source operation with actor + summary + metadata. |

### Relationships

- `billing_accounts 1 ── 1 billing_profiles` (cascade on account delete)
- `billing_accounts 1 ── 1 billing_addresses` (cascade)
- `billing_accounts 1 ── 1 billing_tax_details` (cascade)
- `billing_accounts 1 ── 1 billing_settings` (cascade)
- `billing_accounts 1 ── N billing_invoices` (`Restrict`)
- `billing_invoices 1 ── N billing_invoice_lines` (cascade)
- `billing_invoices 1 ── N billing_invoice_history` (cascade)
- `billing_invoices 1 ── N billing_payments` (`SetNull` on invoice delete; payments can also exist account-level)
- `billing_payments 1 ── N billing_payment_attempts` (cascade)
- `billing_payments 1 ── N billing_refunds` (Restrict — refunds always tie back to their payment)
- `billing_invoices 1 ── N billing_credit_notes` (`SetNull`; credit notes can also be issued account-level)
- `billing_accounts 1 ── N billing_adjustments`
- `billing_accounts 1 ── N billing_audits` (`SetNull`; audits survive account deletion)
- `billing_payment_sources` has no FK to `billing_accounts` — it is platform-global; consumed by Razorpay gateway lookup.

### Dependencies

- **Upstream:** Subscription (`SubscriptionService`-only — Billing never imports `SubscriptionRepository`); Sequences (`BILLING_INVOICE`, `BILLING_ACCOUNT`); Crypto (encrypts Razorpay secrets); Identity (operator actor on every audit); Feature Flag (`module.billing`, `module.billing_razorpay`, `module.billing_admin` — gate all routes).
- **Cross-cluster:** Audit (finance-chain hashed audit on money operations), Outbox (`billing.invoice.*`, `billing.payment.*`, `billing.refund.*`, `billing.credit-note.*` topics), Notifications (9 `BILLING_*` keys).
- **Downstream:** Subscription state transitions (Billing flips Subscription to `ACTIVE` after first payment for new subscriptions; pause-on-non-payment hook reserved).
- **Forbidden:** Must not depend on `fees.prisma` or `FeesModule`; the two domains are permanently disjoint.

---

## 14. SUBSCRIPTION

Plan catalogue + per-school subscription state + per-school usage ledger. Drives entitlements (Feature Flags) and platform billing cadence. The catalogue model (`Plan`) lives in `platform.prisma`; the per-school subscription, history, and usage-ledger models live in `subscriptions.prisma` (6 models). Platform tenant billing (invoices, payments, refunds, credit notes, adjustments, GST handling) is delivered as Sprint 20 SaaS Billing and lives in `billing.prisma` — see §13.

### Tables (1 in `platform.prisma` + 6 in `subscriptions.prisma`)

| Table                       | Scope         | Purpose                                                  |
| --------------------------- | ------------- | -------------------------------------------------------- |
| `plans`                     | PLATFORM_ONLY | Plan catalogue (`platform.prisma`). Code, name, pricing, defaults. |
| `plan_features`             | PLATFORM_ONLY | Per-plan feature configuration. Discriminated by `featureType` (LIMIT/TOGGLE) + `mode`. **`limit` is signed BIGINT** (Sprint 15.0.2 hotfix) so `storage_bytes` can hold PB-scale caps without INT overflow. Non-storage LIMIT keys (`student_count`, `staff_count`, `branch_count`, monthly SMS/WhatsApp/Email) all fit safely in BIGINT and round-trip through JS Number at the repo boundary. |
| `subscriptions`             | TENANT_OWNED  | One row per (school, lifecycle). STORED `active_key` projection + UNIQUE enforces at most one ACTIVE subscription per school. Soft-delete + composite (school_id, id) PK. |
| `subscription_history`      | TENANT_OWNED  | APPEND_ONLY journal of every state change (assigned, activated, upgraded, renewed, expired, suspended, cancelled). |
| `school_usage`              | TENANT_OWNED  | Singleton per school. Aggregate counters: `studentCount`, `staffCount`, `branchCount`, monthly SMS/WhatsApp/Email used, `storageBytesUsed` (BIGINT). Backed by the `UsageEvent` ledger. |
| `usage_events`              | TENANT_OWNED  | APPEND_ONLY signed-delta ledger per consume/release. `featureKey` + `delta` + `sourceRef`. Feeds the `school_usage` recompute path. |
| `usage_threshold_state`     | TENANT_OWNED  | Singleton per (school, featureKey). Edge-trigger memory for 80/90/100% usage-notification bands (`USAGE_THRESHOLD_REACHED`). |

**Sprint 16 metered features wired through this stack:** `student_count`, `staff_count`, `branch_count`, `storage_bytes`.

#### Feature Flag Subdomain (closely coupled with Subscription)

Treated under Subscription for relationship purposes; physical schema file is `flags.prisma`.

| Table                       | Scope                     | Purpose                                                  |
| --------------------------- | ------------------------- | -------------------------------------------------------- |
| `feature_flag_definitions`  | TENANT_SHARED_PLATFORM    | Catalogue of all flags (key, type: ENTITLEMENT/KILL_SWITCH, default). |
| `feature_flag_plan_map`     | TENANT_SHARED_PLATFORM    | Which flags each plan grants (entitlement source).       |
| `feature_flag_tenant_overrides` | PLATFORM_ONLY         | Per-tenant explicit overrides (with reason, expiresAt).  |
| `feature_flag_rollouts`     | PLATFORM_ONLY             | Percentage / cohort rollouts for new features.           |
| `feature_flag_audit`        | PLATFORM_ONLY             | Append-only history of flag changes.                     |

### Relationships

- `plans 1 ── N plan_features`
- `plans 1 ── N subscriptions` (across schools)
- `subscriptions 1 ── N subscription_history` (composite FK; cascade on delete)
- `school_usage 1 ── 1 schools` (singleton; unique on schoolId)
- `usage_events` consumed by `school_usage.recompute()`
- `usage_threshold_state` keyed by `(school_id, featureKey)`; cross-references `plan_features` via `featureKey` for percent math
- Effective entitlement = `plan_features` ∪ `feature_flag_tenant_overrides` (with override winning).

### Dependencies

- **Upstream:** Platform (tenants/schools), Identity (operator actors).
- **Cross-cluster:** Notification (usage threshold crossings dispatch `USAGE_THRESHOLD_REACHED`), Audit (every subscription state change recorded).
- **Downstream:** Every TENANT_OWNED domain reads its effective flags + usage caps at request time. Sprint 16 enforces caps on student/staff/branch creation and storage growth.

---

## 15. AUDIT

Append-only audit per tenant; finance subset hash-chained and anchored daily. Time-partitioned. Read-heavy operational tail.

### Tables (6)

| Table                       | Scope                   | Purpose                                                  |
| --------------------------- | ----------------------- | -------------------------------------------------------- |
| `audit_entries`             | TENANT_OWNED, PARTITIONED (monthly) | Single row per event with actor, action, entity, before/after diff, category. |
| `audit_payloads`            | TENANT_OWNED            | Overflow payload table for diffs >64KB (referenced from audit_entries). |
| `audit_finance_chain`       | TENANT_OWNED            | Hash-chain rows for finance-category entries (prev_hash, hash, occurred_at). |
| `audit_anchors`             | TENANT_OWNED            | Daily WORM-anchored chain heads (S3 url, sha256, signed_at). |
| `security_events`           | TENANT_OWNED            | Subset of audit + standalone security signals (login failure spike, MFA disabled, impersonation start). |
| `audit_export_runs`         | TENANT_OWNED            | Export job records (range, format, file_id, requested_by).|

### Relationships

- `audit_entries 1 ── 0..1 audit_payloads` (overflow)
- `audit_entries 1 ── 0..1 audit_finance_chain` (only when `category=FINANCE`)
- `audit_finance_chain 1 ── 0..N audit_anchors` (chain head per day)
- `security_events` is partially derived from `audit_entries` (joined by `audit_entry_id` when applicable).
- `audit_export_runs → files` (output file).

### Dependencies

- **Upstream:** Every domain (audit is the universal sink). Identity (actor), Platform (impersonation context).
- **Downstream:** Reporting and operator dashboards (finance verify, security review).
- **Self-coupling:** The hash chain creates a strict ordering point per tenant; finance writes serialize through `FOR UPDATE` on the latest finance chain row.

---

## 16. PROVISIONING (service-only — no new tables)

Provisioning is the school-lifecycle orchestration layer (create tenant → seed defaults → activate → suspend → archive). It is a **service-layer composition** on top of `schools.prisma` (the per-tenant `School` row and related rows) and `platform.prisma` (operator + plan catalogue). No dedicated Prisma file or models.

### Dependencies
- **Upstream:** Platform (operator actor), Schools (tenant row), Subscriptions (initial Subscription assignment), Identity (first admin invite).
- **Downstream:** Every TENANT_OWNED domain (the seed sets create default academic year, classes, fee heads, etc. via the onboarding-defaults seed path described in `PRISMA_STRATEGY.md` §9.3).

---

## 17. FILE STORAGE

Tenant-shared (platform-managed) blob metadata. All files (logos, documents, report cards, exports, audit anchors) live in S3; Prisma stores only metadata.

### Tables (2 — `files.prisma`)

| Table                    | Scope                  | Purpose                                                  |
| ------------------------ | ---------------------- | -------------------------------------------------------- |
| `file_assets`            | TENANT_SHARED_PLATFORM | One row per uploaded blob. Carries bucket/key, mime, size, sha256, status, expiry. Single-column PK (referenced from many tenant-owned tables). |
| `file_asset_acl_grants`  | TENANT_SHARED_PLATFORM | Per-asset ACL grants (principal type + id), supports user/role/public access without a separate junction per consumer. |

### Dependencies
- **Upstream:** Platform, Identity (uploader).
- **Downstream:** Students/Staff documents, Fees PDFs, Examination report cards, Reporting exports, Import jobs (source spreadsheet), Audit attachments.

---

## 18. CALENDAR

Working-day configuration, calendar events, and holidays. Drives attendance eligibility and notification gating.

### Tables (3 — `calendar.prisma`)

| Table                          | Scope        | Purpose                                                  |
| ------------------------------ | ------------ | -------------------------------------------------------- |
| `working_days_configuration`   | TENANT_OWNED | Day-of-week patterns per branch (different timing on Saturdays). |
| `calendar_events`              | TENANT_OWNED | Holidays, PTMs, events, exam windows surfaced on the school calendar. |
| `holidays`                     | TENANT_OWNED | Declared holidays — used by attendance defaulter computation. |

### Dependencies
- **Upstream:** Branches.
- **Downstream:** Attendance (eligibility), Notification (quiet-day suppression), Examination (datesheet conflict checks).

---

## 19. HOUSE

Co-curricular house assignment with history.

### Tables (2 — `houses.prisma`)

| Table              | Scope        | Purpose                                                  |
| ------------------ | ------------ | -------------------------------------------------------- |
| `houses`           | TENANT_OWNED | Named houses (Red/Blue/Green/Yellow) per branch.         |
| `house_assignments`| TENANT_OWNED | Student↔house assignment with effective dates (history kept). |

### Dependencies
- **Upstream:** Students, Branches.
- **Downstream:** Events (house-based scoring), Reporting.

---

## 20. ROOM

Physical room inventory used by timetable, exam seating, and event venue selection.

### Tables (2 — `rooms.prisma`)

| Table         | Scope        | Purpose                                                  |
| ------------- | ------------ | -------------------------------------------------------- |
| `room_types`  | TENANT_OWNED | Lookup catalogue (CLASSROOM, LAB, HALL, OFFICE, ...).    |
| `rooms`       | TENANT_OWNED | Physical rooms with capacity, branch, type FK.           |

### Dependencies
- **Upstream:** Branches.
- **Downstream:** Timetable (entry venue), Examination (seating plan), Events (venue).

---

## 21. ACADEMIC CONTENT

Homework, assignments, syllabus tree, and their attachments. The teaching-side counterpart to Examination.

### Tables (8 — `academic-content.prisma`)

| Table                              | Scope        | Purpose                                                  |
| ---------------------------------- | ------------ | -------------------------------------------------------- |
| `homework`                         | TENANT_OWNED | Homework headers (section, subject, due date, attachments). |
| `homework_attachments`             | TENANT_OWNED | File-asset refs attached to a homework header.           |
| `assignments`                      | TENANT_OWNED | Graded assignments with rubric, due date, max marks.     |
| `assignment_attachments`           | TENANT_OWNED | File-asset refs attached to the assignment brief.        |
| `assignment_submissions`           | TENANT_OWNED | One row per student submission with score + feedback.    |
| `assignment_submission_attachments`| TENANT_OWNED | File-asset refs on a student's submission.               |
| `syllabus`                         | TENANT_OWNED | Per-subject syllabus root.                               |
| `syllabus_nodes`                   | TENANT_OWNED | Tree of syllabus units/chapters with progress markers.   |

### Dependencies
- **Upstream:** Academic (sections, subjects, terms), Staff (author), Students (submitter), FileStorage.
- **Downstream:** Reporting (HOMEWORK_COMPLIANCE, SYLLABUS_PROGRESS), Notification (submission/return events).

---

## 22. REPORTING

Report runs, bulk operations, imports, dashboards, schedules, and templates. All TENANT_OWNED with composite (school_id, id) PKs and auto-coded via `tenant_sequences`.

### Tables (8 — `reporting.prisma`)

| Table                  | Scope        | Purpose                                                  |
| ---------------------- | ------------ | -------------------------------------------------------- |
| `report_runs`          | TENANT_OWNED | One row per requested report. Lifecycle PENDING → RUNNING → SUCCEEDED/FAILED/CANCELLED. Result file lives on FileAsset (purpose=REPORT_EXPORT). |
| `import_jobs`          | TENANT_OWNED | One row per multipart upload. PENDING → VALIDATING → VALIDATED → COMMITTING → COMMITTED. Source spreadsheet retained on FileAsset post-completion. |
| `import_job_issues`    | TENANT_OWNED | Per-row validator issues (ERROR/WARNING/INFO) under the parent import job. |
| `bulk_operations`      | TENANT_OWNED | One row per (kind, mode) invocation. Three modes: PREVIEW, VALIDATE, EXECUTE. |
| `dashboards`           | TENANT_OWNED | User-owned, tenant-scoped CRUD container. Soft-delete cascades to widgets. |
| `dashboard_widgets`    | TENANT_OWNED | Typed widget config (METRIC/CHART_*/TABLE/LIST/TEXT). Display-only in v1; no data resolver. |
| `report_schedules`     | TENANT_OWNED | Saved {reportKind, cron, recipients} row. Stores `nextRunAt`; the cron runner is a future sprint. |
| `report_templates`     | TENANT_OWNED | Saved filter sets per report kind. Owner-write, shared-read via `isShared`. |

### Dependencies
- **Upstream:** Every TENANT_OWNED domain (read-side); FileStorage (output + input spreadsheets); Ops (queued jobs, tenant sequences).
- **Downstream:** Notification (`REPORT_READY/FAILED`, `IMPORT_COMPLETED/FAILED`, `BULK_OPERATION_COMPLETED` event keys).

---

## 23. OPS / SEQUENCES

Cross-cutting operational primitives consumed by every domain.

### Tables (7 — `ops.prisma`)

| Table              | Scope                     | Purpose                                                  |
| ------------------ | ------------------------- | -------------------------------------------------------- |
| `outbox`           | TENANT_OWNED              | Transactional outbox written by every state-changing mutation. |
| `idempotency_keys` | TENANT_OWNED              | Side-effect POST de-dup with TTL cleanup.                |
| `jobs`             | CROSS_TENANT_OPERATIONAL  | Queued background job tracking (status, attempts, payload, result file). |
| `job_definitions`  | PLATFORM_ONLY             | Registry of handler names + cron schedules.              |
| `job_runs`         | CROSS_TENANT_OPERATIONAL  | Per-attempt execution history with timing/error.         |
| `job_dead_letters` | CROSS_TENANT_OPERATIONAL  | Terminal-failed job payloads parked for ops review.      |
| `tenant_sequences` | TENANT_OWNED              | Per-(school, sequence_name [, fiscal_year]) gap-free numbering for receipts, TCs, admission numbers, RPT-/IMP-/BOP-/DSH-/SCHED-/TPL- codes, etc. |

### Dependencies
- **Upstream:** Platform (job definitions seeded at boot).
- **Downstream:** Everyone.

---

## 24. EVENTS

School-side events (functions, competitions, trips) with participants, attendance, documents, optional fee assignment, and results.

### Tables (6 — `events.prisma`)

| Table                  | Scope        | Purpose                                                  |
| ---------------------- | ------------ | -------------------------------------------------------- |
| `events`               | TENANT_OWNED | Event header (title, date window, audience, venue).      |
| `event_participants`   | TENANT_OWNED | Enrolled students/staff per event.                       |
| `event_attendance`     | TENANT_OWNED | Day-of attendance markers per participant.               |
| `event_documents`      | TENANT_OWNED | File-asset refs (consents, brochures, photos).           |
| `event_fee_assignments`| TENANT_OWNED | Optional fee head/amount linkage when an event carries a cost. |
| `event_results`        | TENANT_OWNED | Placements/scores for competitive events.                |

### Dependencies
- **Upstream:** Students, Staff, Rooms (venue), Houses (scoring), Fees (event fee linkage), FileStorage.
- **Downstream:** Notification (event invites/updates), Reporting.

---

## Cross-Cutting Tables (live in their owning domain but used by everyone)

| Table              | Owning domain  | Purpose                                                  |
| ------------------ | -------------- | -------------------------------------------------------- |
| `files`            | (own — Files)  | All blob metadata; referenced by Student/Staff/Fees/Exams/Audit. |
| `file_links`       | *(planned)*    | M:N file ↔ entity with `purpose`. Not in the schema today — consumers reference `file_assets.id` directly. |
| `outbox`           | (own — Ops)    | Transactional outbox; written by every write that has side effects. |
| `jobs` / `job_runs` / `job_dead_letters` / `job_definitions` | (own — Ops) | Background job tracking (status, attempts, payload, result file) + handler registry + DLQ. |
| `idempotency_keys` | (own — Ops)    | Side-effect POST de-dup.                                 |
| `tenant_sequences` | (own — Ops)    | Per-tenant gap-free sequences (receipts, TCs, admission, report codes). |
| Support tables     | *(not present)* | No `support.prisma` exists yet; tenant↔operator ticketing is not in the schema. |
| Reporting tables   | (own — Reporting) | See §22 — concrete tables (`report_runs`, `import_jobs`, `bulk_operations`, `dashboards`, `dashboard_widgets`, `report_schedules`, `report_templates`, `import_job_issues`). No `rpt_*` materialized aggregates exist yet. |

Total cross-cutting: ~11 tables. Grand total **140 models across 25 schema files** as of Sprint 16; see the Domain Index at the top of this file for the per-file breakdown.

---

## Dependency Graph (high-level)

```
                Platform
                   │
                Identity ── (RBAC) ─── Roles & Permissions
                   │
        ┌──────────┼──────────┐
        │          │          │
      School    Subscription Audit ◄─ everyone writes here
        │          │
     Academic   Billing
        │
   ┌────┼────┐
 Student Teacher (Staff)
   │       │
   │   Timetable ◄── Academic, Teacher, School
   │
 Parent ─ Notification ◄── Fees, Attendance, Exams, Subscription
   │
 ┌─┴──────┬──────────┐
 │        │          │
Attendance Fees    Examination
                   │
              Reporting (derived)
```

**Read direction is downward; audit and notifications are written upward/sideways via outbox.** No write-time circular dependency exists.

---

## Use This File To Answer:

- "Where does `attendance_period` live?" → §8, `attendance.prisma`, TENANT_OWNED, partitioned.
- "If I rename `classes`, what breaks?" → Academic owns it; downstream: Student (enrolment), Teacher (assignments), Fees (structure scope), Exams (schedule scope), Timetable (entries), Notification (audience filter).
- "Which domains write to `audit_entries`?" → all of them; written via `auditExt` extension on every TENANT_OWNED mutation + service-level `@Audit()`.
- "Can a parent see another tenant's student?" → No. `parent_student_links.school_id` ties parent to tenant scope; cross-tenant parents have separate `users` rows per tenant.

---

**End of MODEL_INVENTORY.md.** Cross-references: `DATABASE_DESIGN.md` (column-level specs), `PRISMA_STRATEGY.md` (schema files, scope classes, conventions), `BACKEND_ARCHITECTURE.md` (which module owns which domain), `REST_API_DESIGN.md` (which endpoints touch which tables).
