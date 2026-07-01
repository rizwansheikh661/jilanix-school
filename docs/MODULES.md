# MODULES

_Upstream: PROJECT_VISION.md, PRODUCT_REQUIREMENTS.md, BUSINESS_RULES.md. Downstream: MODEL_INVENTORY.md, DATABASE_DESIGN.md, REST_API_DESIGN.md._

Module-by-module breakdown. Each module declares: scope, dependencies, feature flag, plan tier, key entities, key flows, and out-of-scope edges.

> **Convention:** every module ships behind a feature flag of the form `module.<name>` (e.g., `module.fees`). Plans bundle flags. Operator can override per tenant. See BILLING_AND_SUBSCRIPTIONS.md for the plan→flag matrix.

> **Foundation vs Future legend.** A module marked **Foundation** ships the schema, services, and admin-side APIs (and may already be in production). A module marked **Future** is planned for a later sprint — its data model may exist, but the actor-facing portal, automation, or analytics layer is deferred. The canonical pair-by-pair map lives in `MODULE_BOUNDARIES.md`.

---

## Foundation modules (always-on, not flag-gated)

These are platform-level and cannot be turned off for any tenant.

### F1. Authentication & Identity
- Login (email+password, phone+OTP for parents), forgot/reset password, MFA (TOTP), session management, refresh-token rotation, device list.
- JWT issued per (user, tenant). Super Admin tokens carry a `global` scope.
- Audit: every login, logout, failed login, password change, MFA event.

### F2. Authorization (RBAC)
- Role registry, permission registry, role-permission mappings.
- Per-tenant role overrides (custom roles built on top of base roles).
- See ROLES_AND_PERMISSIONS.md.

### F3. Tenancy & School Profile
- Tenant CRUD (operator-only), school profile, branches, academic years, school settings, logo, letterhead, certificate templates.
- Per-tenant subdomain or slug.

### F4. Audit Log
- Append-only, partitioned per tenant, queryable.
- Captures actor, tenant, action, resource, before/after diff, IP, user-agent.

### F5. Notifications (platform service)
- See §22 below — shared service used by all functional modules.

### F6. Feature Flags & Configuration
- Plan defaults, tenant overrides, role overrides.
- Feature flag client SDK on backend (`featureFlags.isEnabled(tenantId, flag)`) and frontend (`useFlag('module.fees')`).
- Tenant-level configuration store (KV per tenant) for things like academic year start month, invoice number format, attendance edit window.

#### F6.1 Flag taxonomy
Two distinct kinds — never mixed:

- **Module / entitlement flags** (`module.fees`, `channel.whatsapp`). Long-lived. Plan-bundled. Drive UI gating and billing.
- **Release / kill-switch flags** (`release.new_marks_entry`, `killswitch.razorpay`). Short-lived. Used to roll out / disable risky code paths. Expected to be removed once the rollout stabilizes.

A third optional kind: **experiment flags** (A/B), introduced only when we have analytics infrastructure (post-Phase 7).

#### F6.2 Flag lifecycle
Every flag passes through registered stages:

1. **Introduced** — created in the flag registry with owner, type, description, intended cleanup date.
2. **Rolling out** — enabled for a subset (e.g., internal tenants, then 10% of tenants).
3. **Adopted** — enabled for all tenants by default; old code path still present.
4. **Cleanup-pending** — scheduled for removal; alerts owner if past cleanup date.
5. **Removed** — flag deleted from code and registry; references purged.

A monthly **flag drift report** lists stale flags (in stage 3+ for > 90 days). Owners must explain or remove.

#### F6.3 Operator-side guarantees
- Toggling a flag publishes a `tenant.flags.changed` event → cache invalidation (see MULTI_TENANT_ARCHITECTURE §6).
- Toggle requires a reason (free-text); audit-logged.
- Kill-switch flags can be toggled by `platform_engineer`; entitlement flags require `super_admin` or `platform_billing`.
- Bulk plan-wide toggles (e.g., shipping a new module to all `Standard` tenants) are a separate workflow with confirmation + dry-run preview.

### F7. File Storage
- S3-compatible. Per-tenant prefix. Signed URLs. AV scan hook.

### F8. Search
- Tenant-scoped index (Postgres FTS or OpenSearch — TBD). Indexed entities: students, parents, staff, fees, notices.

### F9. Background Jobs
- Queue (Redis-backed BullMQ or equivalent). Per-tenant rate limits.
- Job types: notification dispatch, bulk import, bulk promotion, invoice generation, report rendering, AV scan, AI inference (future).

---

## Functional modules

### 1. School Management
- **Flag:** always-on (foundation).
- **Entities:** School, Branch, AcademicYear, Term, SchoolSetting, CertificateTemplate.
- **Flows:** create school (operator), configure branches, create academic year, define terms, upload logo, design letterhead/certificates.
- **Out of scope:** changing tenant ID (immutable).

### 2. Student Management
- **Flag:** `module.students` (default on for all plans).
- **Depends on:** School Management, Academic Year.
- **Entities:** Student, StudentDocument, StudentMedical, Admission, Promotion, TC.
- **Flows:** admit, promote, retain, transfer out, generate ID card, generate TC, upload docs, manage medical info.
- **Bulk:** CSV import with validation report.

### 3. Parent Management
- **Flag:** `module.parents` (default on).
- **Entities:** Parent, ParentChildLink (M:N — siblings, guardians).
- **Flows:** parent self-onboard via OTP after admission, link multiple children, link multiple guardians per child (father, mother, guardian).
- **Edges:** divorced/separated parents → one child can have isolated parent accounts; communication preferences per parent.

### 4. Teacher Management
- **Flag:** `module.staff` (default on).
- **Entities:** Teacher (extends Employee), Qualification, Experience, TeacherDocument.
- **Flows:** onboard, assign as class teacher, assign subjects, leave management, attendance.

### 5. Employee Management
- **Flag:** `module.staff` (same flag as Teacher).
- **Entities:** Employee, EmployeeDocument, Department, Designation.
- **Roles tracked:** accountant, clerk, driver, security, support staff, librarian, hostel warden.

### 6. Academic Management
- **Flag:** always-on (foundation-adjacent).
- **Entities:** Class, Section, Subject, Syllabus, AcademicCalendar.
- **Flows:** define classes & sections per branch per year, map subjects to classes, upload syllabus, plan calendar.

### 7. Timetable Management
- **Flag:** `module.timetable`.
- **Entities:** Period, TimetableSlot, TeacherAllocation, RoomAllocation, SubstitutionLog.
- **Flows:** manual builder, auto-generation (constraint-solver, future), substitution on teacher leave.
- **Constraints:** no teacher double-booking, no class double-booking, lunch breaks, max periods/day per teacher.

### 8. Attendance Management
- **Flag:** `module.attendance` (default on).
- **Entities:** AttendanceRecord (student), StaffAttendance, AttendanceConfig (states, working days, sessions).
- **Flows:** daily mark (one-tap), bulk update, biometric integration hook (future), monthly/yearly reports.
- **Notifications:** absent → SMS to parent (configurable).

### 9. Fees Management
- **Flag:** `module.fees`.
- **Plan:** included in Standard and above.
- **Entities:** FeeStructure, FeeComponent, Invoice, Receipt, Discount, Scholarship, Fine, RefundRecord, CreditNote.
- **Flows:** define structure → generate invoices (bulk job) → online pay (Razorpay) / offline pay → receipt → reminder → defaulter report.
- **Integrations:** Razorpay for collection, GST e-invoice API (future), bank reconciliation (future).
- **Critical:** gap-free invoice/receipt numbering (BUSINESS_RULES §11).

### 10. Examination Management
- **Flag:** `module.exams`.
- **Entities:** Exam, ExamSubject, MarkEntry, GradeSystem, ReportCard, RankRule.
- **Flows:** create exam → enter marks → process results → publish report card → publish to parents.
- **Concurrency:** optimistic locking on marks.

### 11. Holiday Management
- **Flag:** `module.calendar` (always-on).
- **Entities:** Holiday (national, state, school-specific), HolidayCalendar.
- **Flows:** import national holiday list, add school-specific, push to calendar, notify parents.

### 12. Event Management
- **Flag:** `module.events`.
- **Entities:** Event, EventRegistration, EventBudget, EventFee, EventCertificate.
- **Flows:** create event, open registration, charge event fee (links to Fees), issue participation certificate.

### 13. Complaint Management
- **Flag:** `module.complaints`.
- **Entities:** Complaint, ComplaintEvidence, ComplaintAction, ComplaintResolution.
- **Flows:** raise (parent/teacher/student), assign, investigate, resolve, close. Anonymous mode for bullying/misconduct.

### 14. Discipline Management
- **Flag:** `module.discipline`.
- **Entities:** DisciplinaryRecord, Warning, Suspension.
- **Flows:** record incident → action → notify parent. Cross-link to Complaint Management.

### 15. Transport Management
- **Flag:** `module.transport`.
- **Entities:** Vehicle, Route, Stop, RouteAssignment, Driver, TransportFee, VehicleAttendance.
- **Flows:** define routes & stops, assign students, charge transport fees (links to Fees), record vehicle daily attendance.
- **Future:** GPS device webhook, parent live-location feed.

### 16. Hostel Management
- **Flag:** `module.hostel`.
- **Entities:** Hostel, Room, BedAllocation, HostelFee, HostelAttendance, VisitorEntry.
- **Flows:** allocate room, charge hostel fees, daily attendance, leave/late-return logs, visitor logs.

### 17. Library Management
- **Flag:** `module.library`.
- **Entities:** Book, BookCopy (per inventory item), Issue, Return, Fine.
- **Flows:** catalogue, issue (max books per role), return, fines, inventory audit.

### 18. Inventory Management
- **Flag:** `module.inventory`.
- **Entities:** Asset, AssetCategory, AssetMovement, StockItem.
- **Flows:** track furniture, computers, projectors, lab equipment; allocate to room/department; depreciation (future).

### 19. Visitor Management
- **Flag:** `module.visitor`.
- **Entities:** Visitor, VisitorPass, VisitorApproval.
- **Flows:** entry capture (photo, ID), approval routing, pass issuance, exit.

### 20. Medical Management
- **Flag:** `module.medical`.
- **Entities:** HealthRecord, MedicalIncident, MedicineLog, VaccinationRecord.
- **Flows:** annual health check upload, incident logging, parent notification on incidents.

### 21. Notice Board
- **Flag:** `module.notices` (default on).
- **Entities:** Notice, NoticeAudience, NoticeAttachment, NoticeAcknowledgement.
- **Flows:** principal/admin posts notice, target audience (school/class/section/parent), parents acknowledge.

### 22. Communication / Notifications (Foundation)
- **Scope boundary:** this is the **Communication Foundation** — template registry, channel adapters (SMS/WhatsApp/email/push), credit ledger, send orchestration, opt-out, DLT/WABA compliance. The actor-facing **Communication Center** (tenant inbox UI, campaign composer, A/B tests, parent two-way threads) is a **Future** sibling — see `MODULE_BOUNDARIES.md §2.1`.
- **Flag:** `module.notifications` (always-on; channel-level flags below).
- **Sub-flags:** `channel.sms`, `channel.whatsapp`, `channel.email`, `channel.push`.
- **Entities:** NotificationTemplate, NotificationDispatch, DeliveryReceipt, RecipientPreference, CreditPool, CreditTransaction, SuppressionEntry, DltTemplateRegistration, WabaTemplateRegistration.
- **Architecture:**
  - `NotificationProvider` interface with implementations: MSG91 (SMS), Gupshup/Meta (WhatsApp), SES/SendGrid (Email), FCM/APNs (Push).
  - Provider pluggable per tenant — fallback chain configurable.
  - All sends are async via queue, retried with exponential backoff, status tracked.
  - Per-tenant credit pool (school buys credit packs; auto-deducted; low-balance alerts).
  - Quiet hours, DND, language selection per template.
- **Operator console** shows fleet-wide delivery health, per-provider error rates.

#### 22.1 India-specific SMS compliance (DLT)
- Every SMS template **must be registered** on TRAI's DLT (Distributed Ledger Technology) portal under our (or the school's) Entity ID, with an approved Sender ID (6-character alphabetic).
- Two template types: **transactional** (fee due, attendance absent, OTP) and **promotional** (announcements). Quiet hours apply to promotional only.
- Template registration captured in `dlt_template_registrations(template_id, dlt_template_id, sender_id, entity_id, status, approved_at)`.
- A dispatch using an unregistered template **must fail at queue time**, not at the provider — fast feedback.
- Sender IDs are owned by us at platform level (e.g., `SCHOOS`) for trial schools, and by the school for paid schools that have their own Entity ID. Schools that bring their own sender ID also bring their own DLT registrations.

#### 22.2 India-specific WhatsApp compliance (WABA)
- Every template must be approved on Meta Business / Gupshup with category (`utility`, `marketing`, `authentication`).
- **Session window**: once a user messages us, we have a free-tier 24-hour window to reply with free-form content; otherwise we must use approved templates.
- **Opt-in capture**: parental WhatsApp consent recorded at admission; without opt-in, we do not send WhatsApp.
- **Conversation-based pricing** (Meta model): cost is per 24-hour conversation, not per message. Cost categorized by conversation type (utility, marketing, authentication, service). Credit pool deductions reflect this.

#### 22.3 Email compliance
- SPF, DKIM, DMARC records configured for `schoolos.in` and any per-school sending domain (custom-domain feature deferred).
- Bounces and complaints fed back via provider webhooks → addresses added to a per-tenant **suppression list**. Future sends to suppressed addresses are blocked at queue time.
- Unsubscribe links present on all promotional emails; transactional emails carry our compliance footer.

#### 22.4 Per-channel usage tracking and credit metering
A unified ledger model regardless of channel:

| Entity                  | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `credit_pool`           | Per (tenant, channel) balance + last-topped-up; cents-precision integer    |
| `credit_transaction`    | Append-only debit/credit log: dispatch deduction, top-up, refund, adjustment|
| `notification_dispatch` | One row per attempted send (per recipient per template per channel)        |
| `delivery_receipt`      | Provider DLR; states: queued, sent, delivered, failed, expired, bounced    |
| `suppression_entry`     | Channel-scoped opt-outs and hard-bounces                                   |

Atomicity rules:
- Credit deduction and dispatch enqueue happen in the **same database transaction**. No transaction = no debit.
- If the provider returns a hard fail at submission time (template not approved, sender ID blocked), the debit is **reversed** as a separate transaction (audit-logged).
- If a dispatch is silently dropped (no DLR within TTL — 24h for SMS, 48h for WhatsApp, 72h for email), it is marked `expired` and **credit is refunded automatically**. The dropped-message detector runs hourly.

Reporting:
- Per-tenant: messages sent, delivered, failed by channel, by template, by day. Cost in credits and INR equivalent.
- Per-platform: provider success rate, cost per delivered message (margin tracking), credit-pool drains predicting churn.

#### 22.5 Provider fallback chain
- A tenant configures an ordered list per channel: e.g., SMS = [MSG91, Karix].
- Adapter returns `RETRYABLE` (provider-side outage) → next provider in chain after backoff.
- `NON_RETRYABLE` (invalid recipient, blocked, template) → stop and mark dispatch failed.
- Fallback adds latency; the dispatcher records which provider ultimately delivered for per-provider success-rate analytics.

#### 22.6 Opt-out / STOP handling
- SMS `STOP` keyword (inbound webhook from provider) → recipient marked opted-out for promotional SMS; transactional/operational sends continue per consent.
- WhatsApp "Stop / unsubscribe" template-driven; updates `recipient_preference`.
- Email unsubscribe link → suppression for promotional, transactional continues unless full opt-out is selected.
- DPDP "withdraw consent" propagates across all channels for the recipient.

#### 22.7 Cost vs. price visibility
- Per channel: our **cost per unit** (negotiated vendor rate) and **price per unit** (what we charge schools as credits) are configured platform-side.
- Margin = price − cost; visible only to Super Admin.
- Schools see only "credits per send" and INR price for credit packs.

#### 22.8 Throughput and rate limiting
- Per-tenant rate limit per channel per minute (prevents one school spamming and triggering provider blocks that affect everyone).
- Per-provider quota tracked; back-pressure activates fallback or queues for the next window.
- Bulk broadcasts > 5000 recipients require Super Admin pre-approval during early product life.

### 23. Certificate Management
- **Flag:** `module.certificates` (default on).
- **Entities:** CertificateTemplate, IssuedCertificate.
- **Types:** Bonafide, Transfer, Character, Participation, custom.
- **Flows:** template designer (logo, fields, signatures) → bulk or single issuance → PDF → audit.

### 24. Reports & Analytics (Foundation)
- **Scope boundary:** the **Reporting Foundation** owns canonical reports (attendance, fee collection, marks, defaulters, etc.), CSV/PDF export, bulk-operation framework, and import framework. Refresh-cadence dashboards, custom SQL report builders, and BI exports belong to the **Future** Analytics / BI sibling — see `MODULE_BOUNDARIES.md §2.4`.
- **Flag:** `module.reports` (default on).
- **Reports:** attendance, fee collection, marks, defaulters, staff attendance, transport occupancy, library circulation, custom queries (paid plans).
- **Output:** in-app dashboard, CSV export, PDF print, scheduled email.

### 25. Parent Portal (Future)
- **Status:** the **Parent Foundation** (data model: `Parent`, `parent_student_links`, contact prefs) is shipped. The Parent Portal itself — login (OTP), dashboard, fee-pay-now flow, leave applications, message threads — is a Future sprint. See `MODULE_BOUNDARIES.md §2.2`.
- **Flag:** `module.parent_portal` (default on).
- **Surfaces:** dashboard, child's attendance, marks, fee invoices+pay, notices, messages, leave applications.
- **Mobile-first**, phone-OTP login.

### 26. Student Portal (Future)
- **Status:** the **Student Foundation** (admission, demographics, status, transfer certificates) is shipped. The Student Portal itself is a Future sprint. See `MODULE_BOUNDARIES.md §2.3`.
- **Flag:** `module.student_portal` (default on for higher classes; tenant decides).
- **Surfaces:** timetable, marks, notices, library, homework.

### 27. AI Features (Future)
- **Flag:** `module.ai.*` (per feature).
- **Features:** report-card comments, parent chatbot, attendance anomaly detection, AI timetable, fee defaulter prediction, performance insights.
- **Architecture note:** all AI features operate on per-tenant exported datasets; no cross-tenant model training.

---

## Module dependency graph (high-level)

```
Foundation: Auth → RBAC → Tenancy → AuditLog → Notifications → Storage → FeatureFlags
                     │
                     ▼
School Management ──► Academic Mgmt ──► Timetable
        │                  │                │
        ▼                  ▼                │
   Branches            Classes              │
        │                  │                │
        ▼                  ▼                │
   Students ◄──── Parents  Subjects         │
        │            │                      │
        ├────► Attendance ◄──────────────────
        ├────► Fees ──► Receipts ──► Reports
        ├────► Exams ──► ReportCards
        ├────► Transport
        ├────► Hostel
        ├────► Library
        ├────► Medical
        └────► Discipline / Complaints

Cross-cutting: Notice Board, Events, Certificates, Reports & Analytics, Parent Portal, Student Portal
```

A module cannot be enabled if its dependencies are disabled. Operator console enforces this on toggle.

---

## What every module must provide

For consistency, every module ships:

1. **Prisma schema fragment** with `school_id` on every table.
2. **NestJS module** with controller, service, DTO, guards, tests.
3. **API spec** following API_STANDARDS.md.
4. **Frontend pages** with mobile + dark mode parity.
5. **Feature flag** registered in the flag registry.
6. **Audit-log emissions** on every state-changing action.
7. **Permissions** registered in the permission registry.
8. **Notifications** registered (templates, default channels) where applicable.
9. **Reports** added to the Reports module.
10. **Documentation** — a `MODULE_<name>.md` under `docs/modules/` once development begins.

A module without all ten is incomplete and should not be marked done.
