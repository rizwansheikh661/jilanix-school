# Implementation Status

> Authoritative inventory of the SchoolOS SaaS backend after Sprint 20 (2026-06-26).
> Scope: backend (`backend/src/core/*`) only. No frontend, no mobile.
> Source: file-level inspection of the codebase; this document is descriptive, not prescriptive.

---

## Module Inventory

### Authentication & Identity

- **Sprint(s):** 1–3 (foundation); ongoing refinements through Sprint 17–18
- **Status:** Foundation + Enhancement Complete
- **Purpose:** Issue and validate user credentials; expose login, logout, token refresh and the `User` identity surface that every other module keys off.
- **Major Capabilities:** Password authentication, JWT issuance/validation, `mustChangePassword` enforcement on first login, password reset (request + confirm) with TTL-bounded hashed tokens, password-history checks. Identity records (`User`, `UserPassword`) are the canonical actor used throughout the codebase.
- **Integrations:** RBAC, RequestContext, Audit, Outbox, Provisioning, Parent (junction), Student (junction).
- **Deferred:** Social/OAuth login, MFA, OTP login, device sessions, session revocation lists.

### RBAC

- **Sprint(s):** 1–3; expanded incrementally with every domain module
- **Status:** Complete
- **Purpose:** Permission registry, role definitions, role-to-permission mapping, and the `@RequirePermissions` guard that gates every HTTP route.
- **Major Capabilities:** Built-in roles seeder (school_admin, principal, teacher, accountant, clerk, parent, student, platform-admin), per-module permission seeders, wildcard expansion, request-time permission checks, role assignment management.
- **Integrations:** Authentication, RequestContext, every domain module (permission seeders).
- **Deferred:** UI for custom role authoring; ABAC-style row-level conditions; delegated administration.

### Multi-Tenant Foundation

- **Sprint(s):** 1–3
- **Status:** Complete
- **Purpose:** Enforce tenant isolation at the request level and supply `schoolId` to every query.
- **Major Capabilities:** `RequestContextRegistry` (AsyncLocalStorage-backed), `runWithSystemContext` for background jobs and outbox handlers, `withTestContext` helper for specs, tenant scoping baked into every Prisma `where` clause via composite PKs `(school_id, id)`.
- **Integrations:** Used by every service and repository.
- **Deferred:** Cross-tenant operator views (handled instead by `platform-admin` role + explicit super-admin endpoints).

### Academic

- **Sprint(s):** 1–3 (core), Sprint 4 (terms + class-subjects + section-subjects + promotions)
- **Status:** Complete
- **Purpose:** Academic structure of a school — years, terms, classes, sections, subjects, and the M:N mappings between them.
- **Major Capabilities:** Academic year + term management, class and section CRUD, subject catalog, class-subject and section-subject overrides, year-end promotion data model.
- **Integrations:** RBAC, RequestContext, Audit, Outbox, Student (placement), Staff (assignments), Attendance, Timetable, Examination, Fees.
- **Deferred:** Bulk-promotion runner (data shape exists; execution path is a future fast-follow); curriculum versioning.

### Student

- **Sprint(s):** 1–3 (foundation), Sprint 4 (Indian-school fields)
- **Status:** Foundation + Enhancement Complete (academic record)
- **Purpose:** Person-level record for each enrolled child, including demographics, RTE/category/minority/Aadhaar fields, academic placement (year/class/section), and academic status.
- **Major Capabilities:** Full student CRUD, soft-delete with audit, Aadhaar encryption with last-4 surface, RTE / CWSN / minority / BPL flags, emergency contacts, previous-school carry-over (TC), `StudentStatus` (ACTIVE | INACTIVE | GRADUATED | TC_ISSUED | EXPELLED).
- **Integrations:** Academic, RBAC, Audit, Outbox, Admission, Parent (relationships), Student Enhancement (junction user).
- **Deferred:** Student Portal UI; mobile APIs; ECA / health-record extensions.

### Parent

- **Sprint(s):** 1–3 (foundation)
- **Status:** Foundation + Enhancement Complete
- **Purpose:** Person-level parent/guardian record and the link table between a parent and one or more children.
- **Major Capabilities:** Parent CRUD, `ParentStudentLink` relationships (family-slotted), guardian-type metadata, soft-delete + audit.
- **Integrations:** Student, RBAC, Audit, Outbox, Parent Enhancement (junction user).
- **Deferred:** Parent Portal UI; mobile APIs.

### Admission

- **Sprint(s):** 1–3
- **Status:** Complete
- **Purpose:** Enrolment workflow from application to allotted student record.
- **Major Capabilities:** Admission application CRUD, document attachments, admission-number issuance via `SequenceService`, conversion to `Student`, audit trail.
- **Integrations:** Student, Academic, File Storage, Sequences, RBAC, Audit, Outbox.
- **Deferred:** Online application portal; entrance-test orchestration; merit-list ranking.

### Staff

- **Sprint(s):** Sprint 4
- **Status:** Complete
- **Purpose:** Teacher / non-teaching staff master plus role-on-class assignments.
- **Major Capabilities:** Staff CRUD, employment history, qualifications, subject qualifications, section assignments, class-teacher mapping, leave records, document attachments.
- **Integrations:** Academic, RBAC, Audit, Outbox, Attendance (staff-attendance), Timetable (teacher-load).
- **Deferred:** Payroll; PF/ESI; biometric integration; leave-approval workflow.

### School Management

- **Sprint(s):** 1–3
- **Status:** Complete
- **Purpose:** Tenant-level record for a single school — profile, branding, contact, documents, settings.
- **Major Capabilities:** School profile, branding assets, contact details, document storage, per-school settings.
- **Integrations:** Organization, Branch, RBAC, File Storage, Audit, Provisioning (lifecycle).
- **Deferred:** Multi-language localisation per school; per-school theme rendering.

### Organization

- **Sprint(s):** 1–3
- **Status:** Complete
- **Purpose:** Group-of-schools (chain / trust) parent entity above `School`.
- **Major Capabilities:** Organization CRUD, ownership of one or more schools, permission seeder.
- **Integrations:** School, RBAC, Audit.
- **Deferred:** Group-level dashboards and reporting consolidation.

### Branch

- **Sprint(s):** Hotfix wave during Sprint 4–6
- **Status:** Complete
- **Purpose:** Sub-campus within a school (city campus / North Wing / etc.).
- **Major Capabilities:** Branch CRUD, per-branch settings, branch scoping helpers for downstream modules.
- **Integrations:** School, RBAC, Audit, Staff (assignments scoped by branch), Student (admissions per branch).
- **Deferred:** Cross-branch transfers as first-class operations.

### Attendance

- **Sprint(s):** Sprint 6
- **Status:** Complete
- **Purpose:** Daily and period-level attendance for students and staff.
- **Major Capabilities:** Per-period attendance config, student and staff attendance capture, status-history ledger, correction workflow, lock-window enforcement, report endpoints, holiday lookup, feature-flag gated.
- **Integrations:** Academic, Staff, Student, Calendar, RBAC, Audit, Outbox, Notifications.
- **Deferred:** Biometric / RFID integration; geofenced check-in.

### Timetable

- **Sprint(s):** Sprint 10
- **Status:** Complete
- **Purpose:** Period-level schedule for classes/sections plus teacher availability and conflict detection.
- **Major Capabilities:** Period templates, timetable versions, entry CRUD with conflict detection, teacher-load reporting, teacher availability windows, view-by-class / view-by-teacher endpoints, feature-flag gated.
- **Integrations:** Academic, Staff, Calendar, RBAC, Audit.
- **Deferred:** Auto-generation / optimisation solver; substitution scheduling at scale.

### Examination

- **Sprint(s):** Sprint 9
- **Status:** Complete
- **Purpose:** End-to-end exam lifecycle from scheme to graded result.
- **Major Capabilities:** Exam scheme + definition, exam schedule, marks entry with history (`exam-marks-history`), result computation, feature-flag gated.
- **Integrations:** Academic, Student, Staff, Subjects, RBAC, Audit, Outbox.
- **Deferred:** Online assessment delivery; rubric-based grading; analytics dashboards on results.

### Fees & Payments

- **Sprint(s):** Sprint 7 (base), Sprint 8 (collection enrichments)
- **Status:** Complete
- **Purpose:** Tuition and ancillary-fee billing, collection, refunds, and ledgering.
- **Major Capabilities:** Fee heads, fee structures, fee invoices, fee payments, fee receipts (sequenced), refunds, discounts (head-level and per-student), fine policies, fee ledger, payment-source breakdown, gateway adapters via `gateways/` port-registry pattern, fine + late-payment policy enforcement.
- **Integrations:** Student, Academic (term), Sequences (receipt_no), RBAC, Audit (finance-chain hashed audit), Outbox, Notifications, Subscription Enforcement (entitlement-bound capture limits).
- **Deferred:** GST / e-invoice / IRN flows; e-mandates; multi-currency.

### Hybrid Fee Collection

- **Sprint(s):** Sprint 8 (delivered as part of Fees & Payments, not a separate module)
- **Status:** Complete
- **Purpose:** Allow a single invoice to be settled across multiple sources (cash, cheque, online, wallet credit, discount adjustment).
- **Major Capabilities:** `FeePaymentSource` rows attached to each payment, per-source reconciliation, mixed-tender receipts, refund traceability per source.
- **Integrations:** Fees & Payments core, Audit (finance-chain).
- **Deferred:** Real-time bank reconciliation; UPI auto-match.

### Notification Foundation

- **Sprint(s):** Sprint 10
- **Status:** Complete
- **Purpose:** Core notification send pipeline — channels, templates, events, campaigns, per-message ledger, per-user preferences.
- **Major Capabilities:** Channel registry (EMAIL, SMS, WHATSAPP, IN_APP, PUSH), template + renderer pipeline, event catalog + event-registry bootstrap, notification campaigns with FSM (DRAFT → QUEUED → SENDING → COMPLETED/CANCELLED/FAILED), message ledger with append-only `NotificationMessageEvent` lifecycle (created/sent/delivered/read/failed), per-user preferences (channel toggles + quiet hours + `emergencyOverride`), inbox surface, dispatcher.
- **Integrations:** RBAC, RequestContext, Outbox, Audit, Jobs (send-job retries), Feature Flag, Subscription (communication-entitlement gating), Communication Center.
- **Deferred:** Live provider adapters beyond the existing stubs; A/B testing; conversation threading; per-channel cost accounting.

### Communication Foundation

- **Sprint(s):** Sprint 10 (synonym for Notification Foundation in this codebase)
- **Status:** Complete
- **Purpose:** The "send-side" plumbing that every module uses to dispatch a message; see Notification Foundation above for the actual implementation.
- **Major Capabilities:** As Notification Foundation.
- **Integrations:** As Notification Foundation.
- **Deferred:** Inbound channels (replies, inbound SMS/WhatsApp); conversation continuity.

### Events & Activities

- **Sprint(s):** Sprint 11
- **Status:** Complete
- **Purpose:** School events (annual day, sports day, parent-teacher meetings, paid trips) with participants, attendance, fees, documents, and results.
- **Major Capabilities:** Event CRUD, event-participant management, event-attendance capture, event-fee-assignment for paid events, event-document attachments, event-result entry, feature-flag gated, notification-event bootstrap.
- **Integrations:** Student, Staff, Fees, File Storage, Notifications, RBAC, Audit, Outbox.
- **Deferred:** Public event registration page; ticketing; RSVP reminders pipeline.

### Homework

- **Sprint(s):** Sprint 12 (delivered under `academic-content`)
- **Status:** Complete
- **Purpose:** Teacher-assigned homework with attachments and per-student visibility.
- **Major Capabilities:** Homework CRUD, attachment management, per-class/section targeting, lifecycle state machine, feature-flag gated.
- **Integrations:** Academic, Staff, Student, File Storage, Notifications, RBAC, Audit.
- **Deferred:** Auto-grading; plagiarism check; submission ratings.

### Assignments

- **Sprint(s):** Sprint 12 (delivered under `academic-content`)
- **Status:** Complete
- **Purpose:** Longer-form graded assignments with submission tracking.
- **Major Capabilities:** Assignment CRUD, assignment-attachment management, assignment-submission capture, lifecycle state machine, feature-flag gated.
- **Integrations:** Academic, Staff, Student, File Storage, Notifications, RBAC, Audit.
- **Deferred:** Rubric-based scoring UI; peer-review workflows.

### Syllabus

- **Sprint(s):** Sprint 12 (delivered under `academic-content`)
- **Status:** Complete
- **Purpose:** Subject-by-subject syllabus and progress tracking per class/section.
- **Major Capabilities:** Syllabus CRUD with state machine, per-class subject coverage.
- **Integrations:** Academic, Subjects, Staff, RBAC, Audit.
- **Deferred:** Cross-board mapping (CBSE ↔ ICSE ↔ State); learning-outcome tagging.

### Academic Content

- **Sprint(s):** Sprint 12
- **Status:** Complete
- **Purpose:** Umbrella module hosting Homework, Assignments, and Syllabus as cohesive teacher-authored content.
- **Major Capabilities:** Shared state machine, permission seeder, feature-flag bootstrap, notification-event bootstrap for all three sub-domains.
- **Integrations:** Academic, Staff, Student, File Storage, Notifications, RBAC, Audit.
- **Deferred:** Content library; reusable lesson plans; resource recommendations.

### Reporting Foundation

- **Sprint(s):** Sprint 14 (canonical reports), Sprint 15 hotfix (DI fix)
- **Status:** Foundation Complete
- **Purpose:** Canonical report execution, scheduling, and dashboard read surface; also hosts import/export/bulk-operation infrastructure.
- **Major Capabilities:** Report definitions + execution via `report-engine`, report templates, report schedules, dashboard read endpoints, state machine for report runs, feature-flag bootstrap, notification bootstrap, permission seeder.
- **Integrations:** RBAC, RequestContext, Audit, Outbox, Jobs, Notifications.
- **Deferred:** Custom-report builder; materialised views; pixel-perfect PDF designer.

### Import Foundation

- **Sprint(s):** Sprint 14 (delivered inside `reporting/import`)
- **Status:** Foundation Complete
- **Purpose:** CSV/Excel import pipeline with parsers, validators, preview, commit, and error-export.
- **Major Capabilities:** Per-kind parsers, committers, preview generator, error-export writer, import templates, validation layer, import-kind catalog.
- **Integrations:** Reporting Foundation, Jobs, File Storage, Audit, Outbox.
- **Deferred:** Streamed multi-million-row imports; column auto-mapping UI.

### Export Foundation

- **Sprint(s):** Sprint 14 (delivered inside `reporting/export`)
- **Status:** Foundation Complete
- **Purpose:** Formatter service for canonical report output in CSV / XLSX-style envelopes.
- **Major Capabilities:** Format-and-stream the output of a report run; no separate HTTP controller — invoked through Reporting Foundation.
- **Integrations:** Reporting Foundation, File Storage.
- **Deferred:** Scheduled exports to S3 / SFTP; per-export retention.

### Bulk Operations

- **Sprint(s):** Sprint 14 (delivered inside `reporting/bulk-operation`)
- **Status:** Foundation Complete
- **Purpose:** Generic background-executor framework for "do X to many rows at once" use-cases (bulk promote, bulk suspend, bulk reassign, etc.).
- **Major Capabilities:** Bulk-operation controller, kind catalog, per-kind executors, job-handler integration for asynchronous execution.
- **Integrations:** Reporting Foundation, Jobs, Outbox, Audit.
- **Deferred:** Per-kind bulk operations beyond the initial executor set.

### Super Admin

- **Sprint(s):** Sprint 14 (delivered as `platform-admin` role + provisioning surface; no dedicated module)
- **Status:** Foundation Complete
- **Purpose:** Cross-tenant operator capabilities — provision schools, run lifecycle transitions, manage subscriptions and trials.
- **Major Capabilities:** `platform-admin` built-in role in RBAC, provisioning + lifecycle endpoints under `provisioning/`, subscription management endpoints, feature-flag tenant-override controls, outbox-event read access.
- **Integrations:** RBAC, Provisioning, Subscription, Feature Flag, Outbox, Audit.
- **Deferred:** Operator Console UI; impersonation; cross-tenant search.

### School Provisioning

- **Sprint(s):** Sprint 14
- **Status:** Complete
- **Purpose:** Stand up a new tenant — create the `School` row, seed branding/contact defaults, mint a school-admin user, bootstrap `SchoolCommunicationEntitlement`.
- **Major Capabilities:** Provisioning orchestrator (`provisioning/orchestrator`), username + temp-password generators, password-reset bootstrap for the new admin, role + permission seeding for the new tenant.
- **Integrations:** School, Authentication, RBAC, Notifications (welcome message), Subscription, Audit, Outbox.
- **Deferred:** Self-serve signup wizard; payment-collection-on-signup.

### School Lifecycle

- **Sprint(s):** Sprint 14
- **Status:** Complete
- **Purpose:** State machine that governs the tenant's lifecycle status (DRAFT → PROVISIONING → ACTIVE → SUSPENDED → ARCHIVED → DELETED).
- **Major Capabilities:** Lifecycle controller + service, lifecycle-transitions FSM, daily trial-expiry scheduler job, plan handling, trial workflow.
- **Integrations:** School, Subscription, Authentication, Audit, Outbox, Jobs.
- **Deferred:** Hard-delete worker; per-region data-residency moves.

### SaaS Subscription Foundation

- **Sprint(s):** Sprint 15
- **Status:** Complete
- **Purpose:** Plans, plan features, subscriptions, and per-tenant usage counters that gate quota-bound features.
- **Major Capabilities:** `Plan` + `PlanFeature` (with BIGINT limits), `Subscription` per tenant, `SchoolUsage` counters, bootstrap of platform-default plans, scheduled jobs for renewal / expiry, audit trail on entitlement changes.
- **Integrations:** Provisioning, School, Authentication, Audit, Outbox, Jobs.
- **Deferred:** Billing Foundation (invoices, payments, dunning); proration; coupons; partner-billing splits.

### Subscription Enforcement

- **Sprint(s):** Sprint 16
- **Status:** Complete
- **Purpose:** Runtime guard that blocks writes when a tenant's subscription is past-due / suspended, with allow-list exceptions for must-still-work paths.
- **Major Capabilities:** `SubscriptionGuardService`, `SubscriptionWriteGuardInterceptor`, `@AllowWhenInactive` decorator on routes that must remain reachable (e.g. login, password reset, billing renewal), usage-counter checks against plan limits, audit + structured 4xx envelopes.
- **Integrations:** Subscription Foundation, RequestContext, Audit, every domain controller (via global interceptor).
- **Deferred:** Soft-warn-then-block grace mechanics; tenant-facing "your plan is paused" notifications.

### Parent Enhancement

- **Sprint(s):** Sprint 17
- **Status:** Foundation + Enhancement Complete
- **Purpose:** Wire `Parent` person rows to login-able `User` rows via a `ParentUser` junction with its own lifecycle FSM.
- **Major Capabilities:** `ParentUser` junction + status FSM (PENDING_INVITE → ACTIVE → SUSPENDED → ARCHIVED), invitation orchestration (User + UserPassword + ParentUser + NotificationUserPreference + outbox emit in one tx), 7-day TTL reset-token reuse, activation outbox handler, `/me/*` parent self-surface, parent-preferences endpoint with PUSH + `emergencyOverride`, feature-flag gate (`parent_portal`).
- **Integrations:** Parent, Authentication (PasswordResetService), Notification Foundation (preferences), Outbox, Audit, RBAC, Feature Flag.
- **Deferred:** Parent Portal UI; mobile APIs; fee-pay UX; child-summary dashboards.

### Student Enhancement

- **Sprint(s):** Sprint 18
- **Status:** Foundation + Enhancement Complete
- **Purpose:** Mirror of Parent Enhancement for the student persona — `StudentUser` junction, account lifecycle, activation, `/me/*` profile + academic-placement surface, preferences.
- **Major Capabilities:** `StudentUser` junction with status FSM, invitation orchestration with 7-day reset-token TTL, activation outbox handler, `/me/profile`, `/me/academic-year`, `/me/class`, `/me/section`, `/me/preferences` self endpoints, feature-flag gate (`student_portal`), four `STUDENT_*` notification events.
- **Integrations:** Student, Authentication (PasswordResetService), Notification Foundation (preferences), Outbox, Audit, RBAC, Feature Flag.
- **Deferred:** Student Portal UI; mobile APIs; `/me/homework`, `/me/attendance`, `/me/timetable`, `/me/exams`, `/me/fees`.

### Communication Center

- **Sprint(s):** Sprint 19
- **Status:** Foundation Complete
- **Purpose:** Operator-facing orchestration layer over Notification Foundation — monitor, schedule, audit, and manage ERP-generated communications. Not a Gmail-style messaging app.
- **Major Capabilities:** Dashboard rollups (`/api/v1/comms-center/dashboard`), broadcast lifecycle (create immediate or scheduled, cancel with If-Match, retry), per-message timeline over the existing `NotificationMessageEvent` ledger, delivery monitoring summaries, analytics (delivery/read/failure rates + retry count + channel mix), schedule center for pending scheduled broadcasts, operational search by linked aggregate (Student/Parent/Staff/Class/Homework/FeeInvoice/Event/…), seven `comms.center.*` outbox topics, dedicated permission keys, single `module.communication_center` feature flag, scheduled-broadcast job handler.
- **Integrations:** Notification Foundation (campaigns, messages, message-events), Jobs (delayed broadcast trigger), Outbox, Audit, Feature Flag, RBAC, RequestContext.
- **Deferred:** Inbound replies / threaded conversations; composer UX; A/B testing; cost accounting; provider-level deliverability reporting.

### Billing Foundation (SaaS)

- **Sprint(s):** Sprint 20
- **Status:** Foundation Complete
- **Purpose:** SaaS billing — the platform charging the school for the subscription. Strictly separate from School Fees (which charges parents). Provides invoice, payment, refund, credit-note, and adjustment lifecycle for tenant subscriptions, with Razorpay automated payments and manual entry (UPI / Bank Transfer / Cash / Cheque / Card) following the same FSM (only verification differs).
- **Major Capabilities:** `BillingAccount` (one per school) plus 1:1 `BillingProfile` + `BillingAddress` + `TaxDetails` + `BillingSettings`. Invoice header + `InvoiceLine` items + `InvoiceHistory` append-only ledger, with FSM (`DRAFT → PENDING → (PARTIALLY_PAID →)* PAID`, `PENDING → OVERDUE`, `DRAFT/PENDING → VOID`, `PAID → REFUNDED`, `PENDING/PARTIALLY_PAID → WRITTEN_OFF`). Per-school FY-scoped invoice numbering via `SequenceService` (`BILLING_INVOICE`). Per-line GST CGST/SGST/IGST split (intra-state vs inter-state by `TaxDetails.placeOfSupply` vs platform state code). `Payment` + `PaymentAttempt` history; Razorpay payments land in `APPROVED` on signature verify, manual payments start in `PENDING` and follow approve/reject/hold flow. `Refund`, `CreditNote`, `Adjustment` as independent entities with their own FSM. `BillingAudit` append-only finance-chain audit alongside the global `AuditService`. `PaymentSourceConfiguration` (Razorpay key/secret/webhook-secret encrypted via `CryptoService`; UPI/bank handles). Razorpay gateway via Node native `https` + `crypto` HMAC-SHA256 — no SDK. `BillingSubscriptionIntegrationService` is the only seam to Subscription (never touches Subscription tables directly). All routes gated behind 3 billing feature flags (`module.billing`, `module.billing_razorpay`, `module.billing_admin`). 9 `BILLING_*` notification keys; 9 billing permission keys.
- **Integrations:** SaaS Subscription (via `SubscriptionService` only — never via repository), Sequences (`BILLING_INVOICE`, `BILLING_ACCOUNT`), Crypto (envelope-encrypt Razorpay secrets), Authentication, RBAC, Audit (finance-chain), Outbox, Notifications, Feature Flag, RequestContext.
- **Deferred:** Dunning state machine and overdue-reminder pipeline; auto-charge on saved mandates / e-NACH; Stripe and alternative gateways; GST e-invoice / IRN issuance and GSTR-1 export; multi-currency; partner-billing splits; operator Billing Console UI; tenant `/me/billing` portal pages.

---

## Cross Module Dependencies

- **Authentication + RBAC + RequestContext + Audit + Outbox + Feature Flag** are foundational and depended on by every domain module.
- **Jobs + Notifications + File Storage + Sequences** are shared infrastructure consumed by most domain modules.
- **Academic** is depended on by Student, Staff, Attendance, Timetable, Examination, Fees, Events, Academic Content.
- **Student** is depended on by Admission, Parent (relationships), Fees, Attendance, Examination, Events, Academic Content, Student Enhancement.
- **Parent** depends on Student (relationships) and is extended by Parent Enhancement.
- **Staff** is depended on by Attendance, Timetable, Examination, Academic Content, Events.
- **Fees & Payments** depends on Student, Academic, Sequences, Subscription Enforcement (capture limits), Audit finance-chain.
- **Notification Foundation** depends on Jobs, Outbox, Feature Flag, Subscription (entitlement), and is wrapped by Communication Center.
- **Communication Center** depends entirely on Notification Foundation, Jobs, Outbox, Audit, Feature Flag — adds no new storage.
- **Billing Foundation (SaaS)** depends on SaaS Subscription Foundation (via `SubscriptionService` only), Sequences, Crypto, Authentication, RBAC, Audit (finance-chain), Outbox, Notifications, Feature Flag. It does **not** depend on Fees & Payments and is forbidden from sharing tables, sequences, or audit chains with it.
- **Provisioning + School Lifecycle** depend on School, Authentication, RBAC, Subscription, Notifications.
- **Subscription Enforcement** depends on Subscription Foundation; every domain controller depends on it through the global interceptor.
- **Parent Enhancement / Student Enhancement** depend on Parent / Student, Authentication (PasswordResetService), Notifications (preferences), Outbox, Audit, Feature Flag.
- **Reporting Foundation** is consumed by Import / Export / Bulk Operations sub-modules, which in turn are consumed by domain modules that need bulk surfaces.

---

## Backend Completion Summary

| Module | Sprint | Status |
|---|---|---|
| Authentication & Identity | 1–3 / 17–18 | Foundation + Enhancement Complete |
| RBAC | 1–3 (ongoing) | Complete |
| Multi-Tenant Foundation | 1–3 | Complete |
| Academic | 1–3 / 4 | Complete |
| Student | 1–3 / 4 | Foundation + Enhancement Complete |
| Parent | 1–3 | Foundation + Enhancement Complete |
| Admission | 1–3 | Complete |
| Staff | 4 | Complete |
| School Management | 1–3 | Complete |
| Organization | 1–3 | Complete |
| Branch | 4–6 hotfix | Complete |
| Attendance | 6 | Complete |
| Timetable | 10 | Complete |
| Examination | 9 | Complete |
| Fees & Payments | 7 / 8 | Complete |
| Hybrid Fee Collection | 8 | Complete |
| Notification Foundation | 10 | Complete |
| Communication Foundation | 10 | Complete |
| Events & Activities | 11 | Complete |
| Homework | 12 | Complete |
| Assignments | 12 | Complete |
| Syllabus | 12 | Complete |
| Academic Content | 12 | Complete |
| Reporting Foundation | 14 | Foundation Complete |
| Import Foundation | 14 | Foundation Complete |
| Export Foundation | 14 | Foundation Complete |
| Bulk Operations | 14 | Foundation Complete |
| Super Admin | 14 | Foundation Complete |
| School Provisioning | 14 | Complete |
| School Lifecycle | 14 | Complete |
| SaaS Subscription Foundation | 15 | Complete |
| Subscription Enforcement | 16 | Complete |
| Parent Enhancement | 17 | Foundation + Enhancement Complete |
| Student Enhancement | 18 | Foundation + Enhancement Complete |
| Communication Center | 19 | Foundation Complete |
| Billing Foundation (SaaS) | 20 | Foundation Complete |

---

## Deferred Modules

The following are not implemented in the current backend and are intentionally future work:

- Billing — dunning state machine (overdue reminder pipeline, escalation, suspension trigger)
- Billing — auto-charge on saved mandates / e-NACH
- Billing — Stripe and alternative gateways
- Billing — GST e-invoice / IRN issuance, GSTR-1 exports, TDS certificate workflow
- Billing — multi-currency, partner-billing splits
- Parent Portal UI
- Student Portal UI
- Operator Console UI
- Frontend ERP Application
- Mobile Application
- Library
- Transport
- Hostel
- Inventory
- Medical / Infirmary
- Visitor Management
- Discipline
- Complaint Management
- Self-Serve School Signup Wizard
- Analytics / BI Dashboards (beyond canonical reports)
- Custom Report Builder
- Inbound Communication (replies, two-way SMS / WhatsApp)
- Cross-Tenant Operator Search & Impersonation

---

## Architecture Health

### Reused Foundations
Sprint after sprint has compounded a small number of cross-cutting building blocks rather than reinventing them per module:
- `RequestContextRegistry` for tenant scope is universal — every service either runs inside a request, or wraps work in `runWithSystemContext`.
- `OutboxPublisherService.publish` is the single side-effect emission point; every cross-module event goes through it inside a Prisma transaction.
- `AuditService.record` is the single audit emission point with a canonical `{ action, category, resourceType, resourceId, before/after }` signature and a hash-chained finance variant for money flows.
- `FeatureFlagService.isEnabled` gates every new module behind a `module.*` flag; the flag is registered at bootstrap and overridable per tenant.
- `parseIfMatch` + `version` columns enforce optimistic concurrency uniformly on every PATCH / POST-state-change.

### Shared Infrastructure
- Jobs (BullMQ + Redis), Outbox dispatcher, File Storage, Sequences, Idempotency middleware, and Logger redaction are owned once and consumed everywhere.
- The Notification Foundation send-side pipeline (campaigns → messages → message-events) is the only path through which anything leaves the platform; Communication Center sits *on top* and adds zero new storage.

### Reusable Services
- `PasswordResetService.request({ ttlMs })` was extended in Sprint 17 and reused unchanged by Sprint 18.
- `NotificationCampaignService.{create, start, cancel}` is the engine for both ad-hoc Notifications and Communication Center broadcasts.
- `JobEnqueueService` with `runAt` powers both trial expiry (Sprint 14.1) and scheduled broadcasts (Sprint 19).
- `SequenceService` issues admission numbers, employee codes, receipt numbers, and TC numbers from one place.

### Module Boundaries
The codebase enforces several deliberate splits:
- **School Fees vs SaaS Billing.** `fees/*` charges parents at a school; SaaS Billing (`billing/*`, delivered in Sprint 20) charges the school for the platform. The two are permanently separate — no shared tables, sequences, audit chains, or services. Billing reaches Subscription only through `SubscriptionService`; it never imports `SubscriptionRepository`.
- **Communication Foundation vs Communication Center.** Foundation is the send pipeline; Center is the operator dashboard. Center adds no storage and orchestrates only.
- **Subscription Foundation vs Billing.** Subscription tracks plans / entitlements / usage; SaaS Billing (Sprint 20) issues invoices, captures payments (Razorpay + manual), and processes refunds / credit notes / adjustments against subscriptions. Billing integrates upstream through `BillingSubscriptionIntegrationService`, which talks to `SubscriptionService` only.
- **Parent Foundation vs Parent Portal.** Foundation owns the `Parent` record, the `ParentUser` junction, and the `/me/*` API; the Portal UI is a separate future project.
- **Student Foundation vs Student Portal.** Same split applied in Sprint 18: backend `/me/*` surface exists; UI is deferred.
- **Reporting vs Analytics.** Reporting Foundation runs canonical, schema-driven reports; analytics / BI / materialised views are explicitly future.

---

## Ready For Next Sprint

The backend foundations for a multi-tenant K-12 school ERP are in place. Identity, RBAC, tenancy, audit, outbox, jobs, feature flags, notifications, file storage, and sequence allocation are all production-shaped shared infrastructure. The full school-academic domain (academic structure, students, parents, staff, admission, attendance, timetable, examination, fees with hybrid collection, events, homework, assignments, syllabus) has working backends with controllers, repositories, audit, and feature-flag gates. Tenant provisioning and lifecycle, subscription plans and enforcement, and the parent and student persona junctions with self-service `/me/*` surfaces are complete. Communication Center sits on top of Notification Foundation as the operator-facing orchestration layer. SaaS Billing Foundation (Sprint 20) closes the platform-monetisation loop with invoices, Razorpay + manual payments, refunds, credit notes, adjustments, and GST CGST/SGST/IGST handling — integrated to Subscription only via `SubscriptionService` and permanently separated from School Fees.

Major areas that remain unimplemented are: billing dunning / auto-charge / e-invoice (IRN) / GSTR-1, every frontend (Operator Console, Parent Portal, Student Portal, ERP Web, Mobile), inbound / two-way communication, analytics dashboards beyond canonical reports, and the operational verticals that have not yet been scoped (Library, Transport, Hostel, Inventory, Medical, Visitor, Discipline, Complaint Management). Self-serve school signup is also still operator-driven.
