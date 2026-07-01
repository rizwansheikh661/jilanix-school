# GAP_ANALYSIS

Architecture review of SchoolOS as of end of Sprint 3 (Enrollment).

**Sources reviewed:** `PRODUCT_REQUIREMENTS.md`, `MODULES.md`, `MODEL_INVENTORY.md`, `DATABASE_DESIGN.md`, `SCHOOL_ONBOARDING_FLOW.md`, `ROLES_AND_PERMISSIONS.md`.
**Code reviewed:** `backend/prisma/schema/*.prisma`, `backend/src/core/*` (auth, rbac, academic, student, parent, admission, audit, request-context, http).

Scope: identify gaps only. No code is generated.

---

## 1. What is implemented (Sprints 1–3)

### Sprint 1 — Platform Foundation
- **Schemas:** `platform.prisma` (School, SchoolSettings, Region), `identity.prisma` (User, UserPassword, UserSession, UserLoginEvent, Role, Permission, RolePermission, UserRole), `audit.prisma` (AuditLog, AuditAnchor), `ops.prisma` (Outbox, IdempotencyKey, Job).
- **Modules:** ConfigModule, LoggerModule (Pino), RequestContextModule (ALS), PrismaModule (5-extension stack: tenant scope, audit, soft-delete, optimistic-lock, error-map), AuditModule (entries + finance hash chain), AuthModule (login, refresh-rotation, sessions, JWT), RbacModule (PermissionsGuard, role/permission registry), HealthModule.
- **Built-in roles seeded:** `platform_admin`, `school_admin`, `auditor` only (3 of ~19 documented roles).

### Sprint 2 — Academic Foundation
- **Schema:** `academic.prisma` (AcademicYear, Class, Section, Subject + SubjectType enum).
- **Modules:** AcademicModule with year/class/section/subject CRUD, permission seeder (~19 perm keys).

### Sprint 3 — Enrollment
- **Schema:** `students.prisma` (Student, Parent, ParentStudentLink, Admission, AdmissionDocument, AdmissionHistory + Gender, StudentStatus, AdmissionStatus, ParentRelation enums).
- **Modules:** StudentModule, ParentModule, AdmissionModule (state machine; APPROVE composes Parent+Student+Link+History in one tx); permission seeder (~24 perm keys).

**Permission catalog size:** ~52 keys across all sprints (Sprint 1 RBAC base + Sprint 2 academic + Sprint 3 enrollment).

---

## 2. Missing business modules (vs MODULES.md)

Status legend: ✅ done · 🟡 partial · ❌ missing.

### Foundation (always-on)
| # | Module | Status | Notes |
|---|---|---|---|
| F1 | Auth & Identity | 🟡 | Email/password + JWT done. **Missing:** phone-OTP login (parents), MFA/TOTP, WebAuthn, password reset, email/phone verification flows, session management UI/API, magic-link invites, API keys. |
| F2 | RBAC | 🟡 | Engine + 3 roles seeded. **Missing:** all 13 tenant default roles, all 5 platform secondary roles, custom-role creation API, per-tenant role overrides, scope predicates (`own_class`, `own_subjects`), 4-eyes approval workflow. |
| F3 | Tenancy / School Profile | 🟡 | `schools` row exists. **Missing:** SchoolProfile, Branch, Department, Designation, House, Room, CalendarEvents, WorkingDaysConfig, SchoolDocuments, certificate templates, brand assets, tenant_settings (per-tenant KV), tenant_status_history, tenant_owners, tenant_owner_transfers. |
| F4 | Audit Log | 🟡 | Engine + finance hash chain present. **Missing:** AuditPayloads overflow table, SecurityEvents, AuditExportRuns, audit query/console API, monthly partitions. |
| F5 | Notifications platform | ❌ | Entire module missing: templates, dispatch, batches, messages, credit pool/ledger, DLT registrations, WABA registrations, opt-outs, quiet hours, provider adapters (MSG91/Gupshup/SES/FCM/APNs), fallback chain, suppression. |
| F6 | Feature Flags & Config | ❌ | No flag_definitions, no plan_map, no tenant_overrides, no rollouts, no flag_audit, no SDK helpers (`featureFlags.isEnabled`). |
| F7 | File Storage | ❌ | No `file_assets`, `file_asset_acl_grants`, no S3 client, no signed URL flow, no AV scan hook. Admission documents currently store opaque URLs only. |
| F8 | Search | ❌ | No tenant-scoped FTS or typeahead. |
| F9 | Background Jobs | 🟡 | `jobs` table exists. **Missing:** BullMQ/Redis wiring, queue workers, per-tenant rate limits, scheduled runner, job_runs history, retry/DLQ. |

### Functional modules
| # | Module | Status | Notes |
|---|---|---|---|
| 1 | School Management | 🟡 | Only top-level School. Branches/departments/houses/rooms/calendar/working-days/certificate-templates all missing. |
| 2 | Student Management | 🟡 | Master row implemented. **Missing:** StudentDocuments, StudentMedical, StudentEnrollment (per-year history), StudentStatusHistory, StudentTransfers, TransferCertificates, StudentHouses, StudentPickupAuthorizations, StudentHealthRecords, bulk CSV import. |
| 3 | Parent Management | 🟡 | Family-row + M:N link done. **Missing:** parent-as-User (no OTP login), ParentCommunicationPrefs, ParentMessages, ParentLeaveApplications, parent self-onboarding flow. |
| 4 | Teacher Management | ❌ | No Staff, EmploymentHistory, Qualifications, SubjectQualifications, SectionAssignments, ClassTeachers, StaffLeaves, StaffDocuments. |
| 5 | Employee Management | ❌ | Shares staff schema with Teacher; same gap. |
| 6 | Academic Management | 🟡 | Year/Class/Section/Subject done. **Missing:** AcademicTerms, ClassSubjects (M:N), SectionSubjects overrides, Syllabus, AcademicCalendar, AcademicYearPromotions. |
| 7 | Timetable | ❌ | No PeriodTemplate, TimetableVersion, TimetableEntry, TimetableSubstitution, TimetableConflict, TimetableGenerationRun, PeriodSettings. |
| 8 | Attendance | ❌ | No AttendanceDaily, AttendancePeriod, AttendanceDateLocks, LeaveApplications, StaffAttendance, BiometricPunches. |
| 9 | Fees | ❌ | No FeeHead, FeeStructure, FeeStructureLine, Discount, StudentFeeDiscount, LateFinePolicy, Invoice, InvoiceLine, Payment, PaymentAllocation, Receipt, Refund, ReminderRun, LedgerEntry. **No Razorpay integration.** |
| 10 | Examination | ❌ | No ExamScheme, Exam, Schedule, HallTicket, SeatingPlan, Marks, CoscholasticGrades, Results, ReportCards, Revaluations. |
| 11 | Holiday/Calendar | ❌ | CalendarEvents missing (in School cluster). |
| 12 | Events | ❌ | No Event, EventRegistration, EventBudget, EventFee, EventCertificate. |
| 13 | Complaint | ❌ | No Complaint, Evidence, Action, Resolution. |
| 14 | Discipline | ❌ | No DisciplinaryRecord, Warning, Suspension. |
| 15 | Transport | ❌ | No Vehicle, Route, Stop, RouteAssignment, Driver, TransportFee, VehicleAttendance. |
| 16 | Hostel | ❌ | No Hostel, Room, BedAllocation, HostelFee, HostelAttendance, VisitorEntry. |
| 17 | Library | ❌ | No Book, BookCopy, Issue, Return, Fine. |
| 18 | Inventory | ❌ | No Asset, AssetCategory, AssetMovement, StockItem. |
| 19 | Visitor | ❌ | No Visitor, VisitorPass, VisitorApproval. |
| 20 | Medical | ❌ | No HealthRecord, MedicalIncident, MedicineLog, VaccinationRecord. |
| 21 | Notice Board | ❌ | No Notice, NoticeAudience, NoticeAttachment, NoticeAcknowledgement. |
| 22 | Communication/Notifications | ❌ | See F5. |
| 23 | Certificates | ❌ | No CertificateTemplate, IssuedCertificate (Bonafide, TC, Character, Participation). |
| 24 | Reports & Analytics | ❌ | No rpt_* materializations, no scheduled exports, no dashboards. |
| 25 | Parent Portal | ❌ | No portal API surface, no OTP login, no "view my child" endpoints, no fee-pay handoff. |
| 26 | Student Portal | ❌ | No student-scoped read APIs. |
| 27 | AI Features | n/a | Out of v1 scope. |

### Operator console (Super Admin) — not covered above
❌ Missing entirely: Platform User management, PlatformUserSessions, PlatformUserDevices, ImpersonationSessions, FourEyesApprovals, ProviderCredentials, CrossTenantProbeEvents, PlatformSettings, support tickets/messages, dunning, BillingModule, SubscriptionModule, PlanFeatures, CreditPacks, PromoCodes, GSTBuyerDetails, GSTIRNRecords, GSTR1Runs, TDSCertificates.

**Total modules implemented vs catalog:** 3 partial + 1 partial foundation = **~4 of 27 functional + 1 of 9 foundation** modules touched. Headline coverage is ~12 %.

---

## 3. Missing database entities

Inventory baseline: `MODEL_INVENTORY.md` currently lists **140 models across 25 schema files** for v1 (earlier drafts estimated ~156). Current Prisma schema (end-of-Sprint-3 snapshot) has **24 tables** (3 enums on platform + 8 identity/audit/ops + 4 academic + 6 enrollment + 3 RBAC join).

Gap by domain (counts use MODEL_INVENTORY targets):

| Domain | Target tables | Implemented | Missing |
|---|--:|--:|--:|
| Platform | 14 | 3 (School, SchoolSettings, Region) | 11 |
| Identity (+ RBAC) | 14 | 8 (User, UserPassword, UserSession, UserLoginEvent, Role, Permission, RolePermission, UserRole) | 6 (UserEmails, UserPhones, UserMfaFactors, UserDevices, UserOtpCodes, ApiKeys) |
| School | 20 | 0 | 20 |
| Academic | 8 | 4 | 4 (AcademicTerms, ClassSubjects, SectionSubjects, AcademicYearPromotions) |
| Student | 10 | 1 (Student) | 9 |
| Parent | 5 | 2 (Parent, ParentStudentLink) | 3 |
| Teacher / Staff | 8 | 0 | 8 |
| Attendance | 6 | 0 | 6 |
| Fees | 14 | 0 | 14 |
| Examination | 10 | 0 | 10 |
| Timetable | 7 | 0 | 7 |
| Notifications | 14 | 0 | 14 |
| Billing | 12 | 0 | 12 |
| Subscription (+ flags) | 13 | 0 | 13 |
| Audit | 6 | 2 (AuditLog, AuditAnchor) | 4 |
| Cross-cutting (Files, Outbox extras, Sequences, Support, Reporting) | ~11 | 3 (Outbox, IdempotencyKey, Job) | 8 |
| **Total** | **~172** | **23** | **~149** |

> The Admission / AdmissionDocument / AdmissionHistory tables were added under the Student cluster in code; they are not in the original MODEL_INVENTORY (which folded admissions into `student_admissions`). Net new vs catalog: +3.

Notable structural gaps highlighted by `DATABASE_DESIGN.md` but not implemented:
- **Partitioning:** `audit_entries`, `attendance_*`, `notification_messages`, `biometric_punches` are all designed monthly-partitioned. No partition strategy exists yet.
- **Hash-chained finance audit:** the `audit_finance_chain` and `audit_anchors` tables exist but no service writes to them (no finance domain yet).
- **Tenant sequences:** receipts, TCs, admission numbers — `tenant_sequences` is not present; admission_no is currently free-form user input.
- **File subsystem:** `file_assets`, `file_asset_acl_grants` absent — every file-bearing module is blocked.
- **Outbox dispatcher:** the table exists, but no worker drains it; outbound side-effects are inline-only.

---

## 4. Missing APIs

Compared to `REST_API_DESIGN.md` and the routes implied by `MODULES.md` / `PRODUCT_REQUIREMENTS.md §7`.

### Implemented today
- `/api/v1/auth/*` (login, refresh, logout)
- `/api/v1/academic-years/*`, `/classes/*`, `/sections/*`, `/subjects/*`
- `/api/v1/students/*`, `/parents/*`, `/admissions/*`, `/admissions/:id/documents/*`
- `/api/v1/health`

### Missing API surfaces

**Platform / operator (entire surface missing):**
- `/platform/tenants` (list, create, suspend, freeze, archive, reactivate)
- `/platform/tenants/:id/owners`, `.../owner-transfers` (4-eyes)
- `/platform/impersonations` (start, end, audit)
- `/platform/feature-flags/*` (definitions, plan-map, tenant overrides, rollouts)
- `/platform/users/*` (platform staff, sessions, devices, WebAuthn)
- `/platform/four-eyes-approvals/*`
- `/platform/provider-credentials/*`
- `/platform/cross-tenant-probes/*`
- `/platform/settings/*`
- `/platform/billing/*` (invoices, credit-notes, payments, attempts, dunning, GST IRN, GSTR-1, TDS)
- `/platform/subscriptions/*` (plans, plan-features, subscriptions, history, addons, credit-packs, promos)
- `/platform/support/tickets/*`
- `/platform/reports/*` (MRR, ARR, churn, NPS, support load)

**Tenant — onboarding & lifecycle:**
- `/signup` (self-serve)
- `/onboarding/*` (wizard steps 1–9, save/resume)
- `/onboarding/invites/*` (school-admin invite verify + password setup)
- `/imports/*` (students, parents, staff, fee structures — dry-run + commit + rollback)
- `/onboarding/templates/*` (CBSE 1–10, ICSE 1–10, subjects)

**Tenant — domains:**
- `/school-profile`, `/school-settings`, `/branches`, `/departments`, `/designations`, `/houses`, `/rooms`, `/calendar-events`, `/working-days`, `/school-documents`
- `/academic-terms`, `/class-subjects`, `/section-subjects`, `/promotions`
- `/staff/*` (master, employment-history, qualifications, leaves, documents, class-teachers, subject-qualifications, section-assignments)
- `/attendance/daily`, `/attendance/period`, `/attendance/locks`, `/leave-applications`, `/staff-attendance`, `/biometric-punches`
- `/fees/heads`, `/fees/structures`, `/fees/discounts`, `/fees/late-fine-policies`, `/fees/invoices`, `/fees/payments`, `/fees/receipts`, `/fees/refunds`, `/fees/reminders`, `/fees/ledger`
- `/exams/*` (schemes, exams, schedules, hall-tickets, seating-plans, marks, results, report-cards, revaluations)
- `/timetable/*` (templates, versions, entries, substitutions, conflicts, generation-runs)
- `/notifications/*` (templates, campaigns, batches, messages, events, opt-outs, quiet-hours, credit-pool, ledger, top-ups, push-devices, dlt-registrations)
- `/students/:id/documents`, `/students/:id/medical`, `/students/:id/transfers`, `/students/:id/tc`, `/students/:id/health`, `/students/:id/pickup-authorizations`, `/students/:id/houses`, `/students/:id/enrollments`
- `/certificates/templates`, `/certificates/issued`
- `/notices/*`, `/notice-acknowledgements/*`
- `/complaints/*`, `/discipline/*`, `/events/*`
- `/transport/*`, `/hostel/*`, `/library/*`, `/inventory/*`, `/visitor/*`, `/medical/*`
- `/reports/*` (attendance, fees, marks, defaulters, staff, transport, library)
- `/files/upload`, `/files/:id/download` (presigned), `/files/:id/acl`

**Parent portal / Student portal:**
- `/parent/me`, `/parent/children`, `/parent/child/:id/dashboard|attendance|marks|fees|notices|messages|leave`
- `/parent/auth/otp` (request + verify; phone-only)
- `/parent/payments/*` (Razorpay handoff + webhook)
- `/student/me`, `/student/timetable`, `/student/marks`, `/student/notices`, `/student/library`, `/student/homework`

**Cross-cutting platform helpers:**
- `/api-keys/*`, `/webhooks/*`, `/idempotency` semantics (header is honoured in only some routes), `/jobs/:id`

### Standard plumbing observed
- `If-Match` / version optimistic locking is used in implemented modules ✅
- `ResponseEnvelopeInterceptor`, `GlobalExceptionFilter`, `RequestContextMiddleware` are global ✅
- `@Audit()` decorator exists ✅; **no `@FeatureFlag()` decorator** because no flag service.
- **No rate limiting** module (`RateLimitModule` is noted as "future" in CoreModule).
- **No idempotency-key middleware** for POST side-effects (table exists, no consumer).

---

## 5. Missing RBAC permissions

### Roles implemented (3) vs documented (~19)
| Tier | Documented | Implemented | Missing |
|---|---|---|---|
| Platform | super_admin, platform_billing, platform_support, platform_engineer, platform_sales, platform_readonly | `platform_admin` only | `platform_billing`, `platform_support`, `platform_engineer`, `platform_sales`, `platform_readonly` |
| Tenant | school_admin, principal, vice_principal, class_teacher, teacher, accountant, clerk, librarian, transport_incharge, hostel_warden, parent, student, driver, security | `school_admin`, `auditor` | `principal`, `vice_principal`, `class_teacher`, `teacher`, `accountant`, `clerk`, `librarian`, `transport_incharge`, `hostel_warden`, `parent`, `student`, `driver`, `security` |

`auditor` is implemented but not in the canonical role list (it is a convenience tenant-wide read-only role).

### Permission keys implemented (~52) vs documented surface
Implemented now (Sprints 1–3):
- Sprint 1 base: `auth.*`, `audit.*`, `role.*`, `permission.*` (≈ 9 keys).
- Sprint 2 academic: `academic.year.*`, `class.*`, `section.*`, `subject.*` (≈ 19 keys).
- Sprint 3 enrollment: `student.*` (7), `parent.*` (6), `admission.*` (11) = 24.

### Permission domains not yet seeded (per ROLES_AND_PERMISSIONS.md §2 + per-module needs)
`staff.*`, `attendance.*` (+ `attendance.update_outside_window`), `marks.*` (+ `marks.update.in_window`, `marks.update_outside_window`, `marks.read.own_subjects`, `marks.read.all`), `exams.*`, `report_cards.*` (+ `report_cards.finalize`), `fees.*` (+ `fees.invoice.void`, `fees.invoice.generate`, `discounts.create_above_threshold`, `refunds.create`, `scholarships.approve`), `receipts.*`, `transport.*`, `hostel.*`, `library.*`, `inventory.*`, `visitor.*`, `medical.*`, `notices.*`, `complaints.*`, `discipline.*`, `events.*`, `certificates.*` (+ `certificates.issue`), `notifications.*` (+ `notifications.send.class`, `notifications.send.section`, `notifications.send.all`), `notification_templates.manage`, `feature_flags.toggle`, `users.impersonate`, `subscriptions.*`, `invoices.*` (platform side), `school_settings.*`, `branches.*`, `departments.*`, `designations.*`, `houses.*`, `rooms.*`, `bulk_import.*`, `tc.issue`, `tc.approve`.

### Missing RBAC infrastructure
- **Custom-role creation API** (school can clone/extend a base role) — endpoints + UI absent.
- **Per-tenant role overrides** — `roles` is `TENANT_SHARED_PLATFORM` today; the override model is undefined.
- **Scope predicates** (e.g. `attendance.create` only for `teacher`'s allocated classes; `marks.read.own_subjects` for teachers). PermissionsGuard does global key check; scope evaluation is not wired.
- **4-eyes / approval workflow** — no `four_eyes_approvals` table or service; required for: tenant suspend, fee refund, fee waiver above threshold, TC issuance, marks edit outside window, bulk delete > 50, owner transfer, custom-role creation, plan downgrade.
- **Audit on permission grant/revoke/denied** — partial (general audit exists, not permission-specific signals).

---

## 6. Missing onboarding requirements (SCHOOL_ONBOARDING_FLOW.md)

Implementation today: **none of the onboarding flow exists.** A tenant must be inserted manually (no API), and there is no school-admin invite path, wizard, importer, or status machine. The 8-stage funnel (LEAD → … → EXPANDED) has zero supporting data model.

### By stage / clause
| Doc reference | Requirement | Status |
|---|---|---|
| §1 Funnel | LEAD / SIGNUP / PROVISIONED / CONFIGURED / IMPORTED / ACTIVATED / CONVERTED / EXPANDED stage tracking | ❌ no stage model, no funnel telemetry |
| §2.1 Self-serve signup | `POST /signup`, phone OTP verification, sub-domain auto-gen, magic-link delivery | ❌ no endpoint, no OTP service, no sub-domain logic |
| §2.2 Sales-assisted | Operator console "create tenant" with extended trial, CSM assignment | ❌ no operator console |
| §3 Wizard | 9-step pausable/resumable wizard (Profile, Branches, Year, Classes, Staff, Students, Fees, Notifications, Go-Live) with progress save | ❌ no wizard data model, no progress API |
| §4 Tenant provisioning | Idempotent provisioning job: seed roles/permissions/notification templates/certificate templates, S3 prefix, admin user, invite token | 🟡 only role-seeder runs at boot; no per-tenant provisioning; no notification templates / certificate templates to seed |
| §5 CSV import | Templates, smart-matching, per-row validation, dry-run preview, background processing >100 rows, 24h rollback | ❌ no import module |
| §6 Communication | Welcome SMS/WhatsApp/Email, wizard-step toasts, 24h follow-ups, activation/inactivity/trial-ending drip, all multi-channel | ❌ no notification platform |
| §7 Health checks | Daily inactivity / progress / activation flags powering CSM dashboard | ❌ no daily job, no CSM dashboard |
| §8 Conversion to paid | Plan selection, Razorpay mandate (UPI Autopay/NACH/card), trial→active flip, plan-flag application, welcome-to-paid messages | ❌ no billing, no subscription state machine |
| §9 Failed onboarding | Day-30 drip, Day-45 CSM call, Day-60 trial end, Day-60–90 freeze, Day-90 archive + DPDP export | ❌ no tenant lifecycle, no DPDP export job |
| §10 Multi-branch | Branches model and per-branch user roles | ❌ no `branches` table |
| §11 Re-onboarding | Win-back playbook + slug uniqueness vs archived | ❌ no archived registry |
| §11.1 Account-ownership transfer | Request, ID verification, 48h cool-off, 4-eyes execution by Super Admin, post-transfer notifications | ❌ no `tenant_owners` / `tenant_owner_transfers` / `four_eyes_approvals` tables |
| §12 Success criteria | Time-to-first-attendance, CSV success rate, wizard abandonment, conversion rate | ❌ no telemetry collected |

### Onboarding-adjacent gaps
- **No "school self-signup" public endpoint** — current `/auth/login` requires a user that already exists.
- **No magic-link / OTP delivery channel** — no SMS/Email/WhatsApp providers connected.
- **No tenant cache invalidation event** (`tenant.flags.changed` per MULTI_TENANT_ARCHITECTURE §6) — there is no flag service to invalidate.
- **No tenant `status` column** on `School` — provisioning, trial, suspended, frozen, archived cannot be expressed.

---

## 7. Student domain — Indian-school fields verification

The Sprint-3 `Student` model contains:
`firstName, lastName, dateOfBirth, gender (MALE|FEMALE|OTHER), bloodGroup, photoUrl, admissionNo, rollNo, academicYearId, classId, sectionId, status, admittedOn, emergencyContacts (JSON), audit + version + soft-delete`.

| Required field | In Student model? | In any doc? | Verdict |
|---|---|---|---|
| **Religion** | ❌ | ❌ (not in PRODUCT_REQUIREMENTS, MODULES, MODEL_INVENTORY, DATABASE_DESIGN, SCHOOL_ONBOARDING_FLOW) | **Missing — blocks UDISE+, board ASER, government reporting** |
| **Category** (General / OBC / SC / ST / EWS) | ❌ | ❌ | **Missing — mandatory for UDISE+ / RTE / scholarship eligibility** |
| **Blood Group** | ✅ `bloodGroup VarChar(5)` | ✅ also in `student_health_records` (planned) | OK; duplication will need rationalisation when health module ships |
| **Nationality** | ❌ (parent `country` defaults `IN` but not on Student) | ❌ | **Missing** |
| **Aadhaar** (optional, last-4 visible, full encrypted at rest) | ❌ | ❌ in any model; mentioned only as ID-proof upload in §11.1 | **Missing — required for DBT scholarship disbursement and many state portals** |
| **Disability / CWSN** (with disability type per RPwD Act) | ❌ | ❌ | **Missing — UDISE+ mandatory, RTE quota tracking** |
| **RTE** (Right to Education quota student flag + admission year) | ❌ | ❌ | **Missing — fee-waiver logic, government reimbursement reporting** |

### Additional Indian-school fields not in any doc that should be considered for Sprint 4
- **APAAR ID** (Automated Permanent Academic Account Registry — NEP 2020; one row per student, lifelong)
- **SAMAGRA ID** (MP), **EMIS ID** (TN, KA), state-specific learner IDs
- **Mother tongue / first language**
- **Caste & sub-caste** (separate from Category; needed for state forms even when Category is recorded)
- **Minority status** (Muslim, Christian, Sikh, Buddhist, Jain, Parsi) — needed for minority-institution audits and scholarships
- **BPL** flag (Below Poverty Line) and ration card number
- **Previous school name / TC number / TC date** at the time of admission (Sprint 3 captures only "Transfer Certificate" output, not "previous school" input)
- **Admission type** (Fresh / Transfer / RTE / Management Quota)
- **Place of birth, birth certificate number / municipality, birth-cert URL**
- **Single-parent flag** (for fee concessions in many states)
- **Sibling discount linkage** (sibling_of student_id) — needed before Fees ships
- **Bank account** (for DBT and scholarship credits): name, IFSC, account_no, branch, holder_name, last-4 visible
- **House / co-curricular** allocation (in MODEL_INVENTORY as `student_houses` but not yet implemented)

### Schema implications (informational; not implemented)
- **Aadhaar** must be encrypted at rest (KMS) per `DATABASE_DESIGN.md §7.9` pattern (`student_medical_info.data_encrypted`). Index by last-4 only.
- **Category / Religion / Disability / Minority** should be enums (small, stable cardinality, government-defined).
- **Soft-delete reuse:** plan §students.prisma comment explicitly disallows reuse of `admissionNo` after soft-delete. This must extend to Aadhaar (admission to a re-admitted child cannot collide on Aadhaar).
- **Audit category** for changes to Aadhaar / Category / RTE flags should be `pii` or `compliance`, not `enrollment`.

---

## 8. School Admin creation flow verification

### What exists today
- `User` table with optional `schoolId`, `userPasswords` for argon2id hashes, `userSessions` for refresh-token rotation.
- `Role` `school_admin` is auto-seeded by `BuiltInRolesSeeder` on every boot.
- `UserRole` join table can bind a user to a role.
- `AuthService` issues JWT on `/auth/login`.

### What is missing for the documented flow
| SCHOOL_ONBOARDING_FLOW §4 step | Status |
|---|---|
| (a) Insert `schools` row with `slug`, `status=trial`, `plan=Trial` | ❌ no API endpoint; no `slug`, `status`, `plan` columns on School |
| (b) Seed roles / permissions / **notification templates** / **certificate templates** for tenant | 🟡 role seed runs **once on boot, not per tenant**; templates don't exist |
| (c) Create S3 prefix + bucket policy | ❌ no S3 wiring |
| (d) Create `users` row for school admin with `school_admin` role | ❌ no provisioning endpoint; only manual SQL insert path |
| (e) Issue invite token (email magic link + SMS OTP) | ❌ no invite token model, no email/SMS provider |
| (f) Push tenant to fleet metric / cache caches | ❌ no flag/cache layer |
| (g) Audit-log "tenant created" | 🟡 audit infrastructure exists; no caller |
| (h) ≤ 2s synchronous for self-serve | ❌ depends on (a)–(g) |

### Net effect
**Today, the only way to create a school admin is to manually insert a `User` row + a `UserRole` row binding it to the seeded `school_admin` role.** There is no:
- Operator-console endpoint (`POST /platform/tenants` + `POST /platform/tenants/:id/admins`)
- Self-serve endpoint (`POST /signup`)
- Invite/verify endpoint (`POST /onboarding/invites/:token/accept`)
- First-login password-set flow
- 2FA enrolment
- Welcome notification

This is the **single biggest blocker** to onboarding any real school, and must be addressed before Sprint 5 ships anything that depends on tenant-scoped operator workflows.

---

## 9. School onboarding workflow completeness

Mapping the funnel to current capability:

| Funnel stage | Required to advance | Implemented? |
|---|---|---|
| **LEAD** | CRM record (external) | ❌ no CRM integration; out of v1 backend scope but no hooks defined |
| **SIGNUP** | Tenant row + admin invite + slug | ❌ |
| **PROVISIONED** | Admin logged in + school profile complete | ❌ no SchoolProfile model, no profile API |
| **CONFIGURED** | Year, classes, sections, subjects, **fee structure** | 🟡 year/classes/sections/subjects done; fee structure ❌ |
| **IMPORTED** | ≥ 10 students imported with parents+staff | 🟡 single-create works; bulk CSV ❌; staff ❌ |
| **ACTIVATED** | ≥ 1 fee invoice OR ≥ 1 day of attendance | ❌ neither domain exists |
| **CONVERTED** | Trial → paid (Razorpay mandate) | ❌ no Billing / Subscription |
| **EXPANDED** | Multi-branch / add-ons | ❌ no Branches / add-ons |

**Result:** a school cannot advance past **CONFIGURED (partial)** with what is built. The flow is ~25 % implemented when counted by stage; 0 % when counted by required signals (no telemetry exists).

### Lifecycle state machine
Documented states: `TRIAL → ACTIVE → SUSPENDED → DELETED` plus `FROZEN` and `ARCHIVED` operational variants.
Implemented: **no `status` column on `School` at all.** All schools are implicitly "active." There is no:
- `tenant_status_history` table
- `tenant.suspend` / `tenant.freeze` / `tenant.archive` / `tenant.reactivate` API
- Read-only or quota-blocked mode (frozen schools should be read-only)
- DPDP-aligned archival job (60–90 day window) and data-export endpoint

### Cross-cutting onboarding plumbing
- **Idempotency:** the table exists; provisioning must use it to make repeated POSTs safe. No consumer today.
- **Outbox:** the table exists; the welcome-message dispatch should write to outbox so the HTTP response is sub-2s. No worker today.
- **Audit:** infrastructure exists; provisioning events not emitted.
- **DPDP:** parental consent, data-portability export, right-to-erasure are all unaddressed.

---

## 10. Risks & cross-cutting concerns surfaced by this review

1. **No tenant lifecycle.** Every later module assumes `tenant.status` semantics (frozen tenants suppress notifications, suspended tenants block writes). Until Sprint X adds this, every new module risks adding writes that ignore lifecycle.
2. **No file storage.** Admission documents, student photos, certificates, report cards, receipts — every PDF/image-bearing module is blocked. Storage must precede Sprint 4-ish.
3. **No notification platform.** Attendance auto-SMS, fee reminders, exam-published push, parent OTP login all need it. DLT/WABA compliance lead-time is **weeks** (template approval is external) — start early.
4. **No background queue / outbox worker.** Bulk import, invoice generation, report-card PDF, notification dispatch all need it.
5. **No feature flags.** Every module's `module.*` flag is hard-coded "on" today. Plan gating (Trial vs Standard vs Premium) cannot be enforced.
6. **No staff/teacher domain.** Attendance, Exams, Timetable, Reports all need teacher identity. This is a hidden prerequisite.
7. **No academic terms / promotions.** Year-end roll-over is a core annual operation and depends on `academic_terms` and `academic_year_promotions`. Today's Academic module has no term concept.
8. **No tenant sequences.** Admission_no, receipt_no, TC_no need gap-free per-tenant sequences (`tenant_sequences`). Without it Fees and Certificates cannot ship compliantly.
9. **No idempotency-key consumer.** Razorpay webhooks, Parent payment retry, Bulk-import retries all require it.
10. **No operator console = no support, no billing, no impersonation, no observability per tenant.** Even a paid customer cannot be helped.
11. **Indian-school PII fields missing.** Religion / Category / Aadhaar / RTE / Disability are not even modelled in any document. This is a **product-spec gap**, not just an implementation gap — must be added to the requirements before Sprint 4.
12. **Soft-delete + reuse rules.** Admission_no reuse is forbidden after soft-delete; the same rule must extend (when added) to Aadhaar, APAAR ID, receipt_no, TC_no. Worth documenting once before more sequences are introduced.

---

## 11. Summary scoreboard

| Dimension | Score (implemented / target) |
|---|---|
| Functional modules | 3 partial / 27 (~11 %) |
| Foundation modules | 1 of 9 fully + 3 of 9 partial (~30 %) |
| Database tables | ~24 / ~172 (~14 %) |
| Built-in roles | 3 / 19 (~16 %) |
| Permission keys | ~52 / ~250 (~21 %, rough estimate of full v1 surface) |
| Onboarding funnel stages reachable | 1 partial / 8 |
| Indian-school student fields | 1 / 7 (Blood Group only) |
| API surfaces (top-level groups) | ~6 / ~60 (~10 %) |
| Operator console | 0 % |
| Billing / subscriptions / GST | 0 % |
| Notifications / SMS / WhatsApp / Email | 0 % |
| File storage | 0 % |
| Reports & analytics | 0 % |

**Headline:** the foundation and academic + enrollment domains are healthy, but the platform has not yet delivered the four cross-cutting capabilities (file storage, notifications, background jobs, tenant lifecycle) that every subsequent functional module depends on, and is still missing the Staff/Teacher domain that several functional modules implicitly require.

See `RECOMMENDED_SPRINT_PLAN.md` for the proposed ordering of remaining work.
