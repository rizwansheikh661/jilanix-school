# PRODUCT_REQUIREMENTS

_Upstream: PROJECT_VISION.md. Downstream: BUSINESS_RULES.md, MODULES.md, MODULE_BOUNDARIES.md._

End-to-end product requirements for SchoolOS. This is the canonical "what the product does." Module internals live in MODULES.md; this doc says what the product as a whole must deliver.

> **Foundation vs Future note.** Several persona-facing surfaces below (Parent Portal, Student Portal, mobile apps, the Operator Console UX layer, self-serve signup) are documented here as the **target** product. Where the data and admin-side APIs are Foundation but the actor-facing portal is deferred, see `MODULE_BOUNDARIES.md` for the canonical pair split.

---

## 1. Personas

| Persona                | Primary surface             | Primary jobs to be done                                                  |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------ |
| **Super Admin**        | Operator console            | Onboard, bill, support, observe schools                                  |
| **School Admin**       | School web app              | Configure school, manage staff, run academic year                        |
| **Principal**          | School web app              | Read dashboards, approve actions, broadcast notices                      |
| **Vice Principal**     | School web app              | Same as Principal, scoped to a section/wing                              |
| **Teacher**            | School web app + mobile     | Mark attendance, enter marks, manage timetable, message parents           |
| **Class Teacher**      | School web app + mobile     | Teacher + own-class roster + report cards                                |
| **Accountant**         | School web app              | Fee structures, collections, receipts, reports                           |
| **Clerk / Office**     | School web app              | Admissions, certificates, visitor entry, document uploads                |
| **Librarian**          | School web app              | Book inventory, issue/return, fines                                      |
| **Transport in-charge**| School web app + mobile     | Vehicles, routes, drivers, fees                                          |
| **Parent**             | Parent portal + mobile      | View child's attendance, marks, fees, notices; pay fees; chat with school|
| **Student**            | Student portal              | Read-mostly: timetable, marks, notices, library                          |
| **Driver**             | Mobile (lightweight)        | View route, mark vehicle attendance                                      |

Every persona is bound to exactly one tenant (school), except Super Admin who is global.

---

## 2. Product surfaces

1. **Operator console** (`admin.schoolos.in` — internal). For Super Admin and platform support staff. Today this is a set of super-admin APIs (Provisioning + Subscription Foundation); the rich operator UX (CSM dashboard, MRR reports, fleet observability) is a **Future** layer. See SUPER_ADMIN_ARCHITECTURE.md and MODULE_BOUNDARIES.md.
2. **School web app** (`<school-slug>.schoolos.in` or `app.schoolos.in/<school-slug>`). The primary tenant surface. Used by all school-side roles on desktop and mobile browsers.
3. **Parent portal** — same domain as the school app, role-gated UI. Phone-first, OTP login, lowest-friction surface. The data layer (`Parent Foundation`) is shipped; the portal itself is a **Future** sprint (MODULE_BOUNDARIES.md §2.2). Single most-used view per child once shipped: today's attendance, latest notice, fees pending.
4. **Student portal** — same domain, role-gated, read-mostly. The data layer (`Student Foundation`) is shipped; the portal itself is a **Future** sprint (MODULE_BOUNDARIES.md §2.3). Tenant decides which classes have it enabled (typically classes 6+).
5. **Teacher portal** — same domain, role-gated. Differs from generic school app by surfacing today's classes / attendance / messages first. Listed as part of the school web app today; a dedicated Future iteration may split it out.
6. **Public marketing site** (`schoolos.in`) — pricing, signup, demo. Lightweight; not part of v1 backend scope.
7. **Mobile apps** (Phase 8 / Future) — React Native parent/student app, optional teacher app. v1 ships responsive web only.

Each "portal" is **not** a separate app in v1 — it is a role-aware route group inside the school web app, with its own navigation IA and information density. This keeps the codebase one app while serving distinct audiences. See UI_UX_GUIDELINES §4.

Sub-domain vs. path-based tenancy is decided in DECISIONS.md (D-002).

---

## 3. End-to-end product flows (must work in v1)

### 3.1 School lifecycle

1. Sales/admin creates the school in the operator console (or school self-signs-up via marketing site).
2. School admin receives credentials, completes onboarding wizard.
3. School configures academic year, classes, sections, subjects, fee structure.
4. School imports students, parents, teachers (CSV or guided form).
5. School goes live: attendance, fees, marks, communication.
6. Trial ends → school subscribes (or downgrades to a read-only "frozen" state for 30 days, then is archived).

See SCHOOL_ONBOARDING_FLOW.md.

### 3.2 Academic year flow

1. School admin creates an academic year (e.g., "2026–27") with start/end dates and term structure.
2. Classes and sections are linked to the year.
3. Students are admitted into a class+section in the year.
4. End of year: bulk promotion → next class+next year. Failed/repeated students stay.
5. Transfer Certificates issued for leavers. See BUSINESS_RULES.md §3.

### 3.3 Daily teacher flow

1. Open today's classes (timetable-aware).
2. Mark attendance (one-tap roster).
3. Enter homework, share with parents (auto SMS/WhatsApp/Push).
4. Enter marks for a recent test.
5. Respond to parent messages.

### 3.4 Daily parent flow

1. Open app/portal → see today's status of all linked children: attended? Any new notice? Any pending fee?
2. Pay any outstanding fee (Razorpay) → instant receipt.
3. Read teacher message → reply.
4. Apply for leave on behalf of child.

### 3.5 Monthly accountant flow

1. Generate fee invoices for the next cycle (auto, configurable).
2. Send fee reminder (SMS + WhatsApp + Email + Push) to defaulters.
3. Reconcile online + offline collections.
4. Export GST-ready reports.

### 3.6 Monthly principal flow

1. Open dashboard → headline KPIs: attendance %, fee collection %, pending complaints, staff attendance.
2. Drill into any anomaly.
3. Send a school-wide notice.
4. Approve fee waivers / scholarships above a threshold.

### 3.7 Daily Super Admin flow

1. Health overview: total tenants, MRR, trials ending, churn risk.
2. Inspect a school (impersonate-with-audit if needed).
3. Toggle a feature flag for a school.
4. Resolve a support ticket linked to a tenant.
5. View billing exceptions (failed Razorpay charges, GST mismatches).

---

## 4. Functional requirements (cross-cutting)

### 4.1 Authentication

- Email + password + OTP-based password reset.
- Phone-number login for parents (OTP, no password).
- JWT access tokens (short-lived, ~15 min) + refresh tokens (rotating, ~30 days).
- Optional 2FA (TOTP) for School Admin and Super Admin.
- Session management UI (active sessions, revoke).

### 4.2 Authorization

- RBAC scoped per tenant. See ROLES_AND_PERMISSIONS.md.
- Permissions checked in NestJS guards using `(role, tenantId, resource, action)`.
- Super Admin has a separate global role and **cannot impersonate without an audit record**.

### 4.3 Multi-tenancy

- Every domain row carries `school_id`.
- Every API request is bound to exactly one tenant context (resolved from JWT).
- See MULTI_TENANT_ARCHITECTURE.md.

### 4.4 Notifications (core platform feature)

- Channels: SMS, WhatsApp, Email, In-app push, Web push.
- Per-tenant credit pools and provider selection.
- Per-recipient channel preferences (parent says "WhatsApp only").
- Templates with variables, multi-language (English, Hindi v1; Tamil/Telugu/Kannada/Marathi v2).
- Async, queued, retried. Delivery status logged. See MODULES.md §22.

### 4.5 Feature flags

- Hierarchy: plan default → tenant override → user-role override (rare).
- Toggleable from operator console without deploys.
- Surface in UI: gated screens show an upgrade nudge, not a 404.

### 4.6 Audit logging

- Every write that touches money, marks, attendance, PII, role assignments, feature flags, billing.
- Append-only, per-tenant, queryable in operator console.
- Retention: 7 years for financial records, 3 years for the rest. India-specific compliance flagged in BUSINESS_RULES.md §9.

### 4.7 Reporting & analytics

- Per-school: attendance, fee collection, marks, defaulters, staff attendance, transport occupancy, library circulation.
- Per-platform (Super Admin): MRR, ARR, churn, trial conversion, NPS, support load, infra costs per tenant.
- Exportable (CSV, PDF) and printable (report cards, receipts) with the school's letterhead.
- Scheduled email reports (weekly, monthly).

### 4.8 Search

- Tenant-scoped full-text search across students, parents, staff, fees, notices.
- Typeahead with name + admission number + phone.

### 4.9 File storage

- S3-compatible. One logical bucket prefix per tenant.
- Signed URLs for downloads. Server-side virus scanning for any uploaded document.
- Per-tenant storage quota by plan.

### 4.10 Internationalization

- Locale: en-IN default, hi-IN v1.
- Currency: INR only (v1).
- Timezone: Asia/Kolkata. All timestamps stored UTC; rendered IST.
- Date display: DD-MM-YYYY.
- Number format: Indian (lakhs, crores) for fee amounts.

### 4.11 Accessibility

- WCAG 2.1 AA.
- Keyboard navigation for all data-entry-heavy screens (attendance, marks, fees).
- Sufficient contrast in both light and dark modes.

### 4.12 Performance budgets

- p95 page TTI < 2s on a mid-range 4G phone for the school dashboard.
- API p95 < 250ms for read endpoints, < 500ms for typical writes.
- Bulk-import endpoints process 1000 students in < 30s.
- Notification dispatch: queued in < 1s; provider delivery best-effort.

### 4.13 Reliability

- 99.9% monthly uptime target for v1.
- Daily logical backups + transaction-log point-in-time recovery for at least 7 days.
- Per-tenant export-on-demand (data portability — user right under DPDP).

### 4.14 Mobile considerations

- Every screen must work at 360px width.
- Touch targets ≥ 44px.
- Offline-tolerant attendance: queue locally, sync when connected (post-v1, design must allow).
- Lightweight images / AVIF + lazy load.

### 4.15 Mobile-app readiness (architecture requirements for the future native app)

Even before Phase 8 ships native apps, the platform must be ready:

- **Auth on mobile:**
  - Same JWT/refresh-token contract as web.
  - Refresh token in OS Keychain (iOS) / EncryptedSharedPreferences (Android). Access token in memory.
  - Biometric unlock (Face ID / fingerprint) gates the app on launch.
  - Phone-OTP login is the primary parent flow (no password).
- **Push notifications:**
  - FCM (Android) and APNs (iOS); device tokens stored per `(user, device, app_version)` row.
  - Token rotation handled; stale tokens reaped after 60 days of inactivity.
  - Payload carries deep-link path + tenant-scoped resource id.
- **Deep links:**
  - Universal Links (iOS) and App Links (Android) configured for `app.schoolos.in/*`.
  - Web fallback when the app is not installed.
- **API readiness:**
  - All endpoints are mobile-friendly: pagination by default, smallest possible payloads, ETag / If-None-Match for caching.
  - `Accept-Language` honored; locale-aware responses.
  - `X-Client-Name` and `X-Client-Version` headers required from mobile clients; server can deny client versions below a minimum.
- **Offline-first patterns (parent attendance views, teacher attendance entry):**
  - Local DB (SQLite/Realm) caches the last known state per tenant.
  - Mutations queued with idempotency keys; replay on reconnect.
  - Conflict resolution: server is source of truth; UI surfaces conflicts.
- **App Store / Play compliance:**
  - Privacy policy URL + DPDP-aligned disclosures.
  - Data-collection labels (Apple's nutrition label) declared.
  - Age rating: 4+ on iOS / Everyone on Play, but **content rating accounts for parental use of student data**.
  - In-app purchase: subscription billing **does not** route through App Store / Play (we are a B2B service to schools — direct Razorpay billing). Parents pay school fees via in-app browser handoff to Razorpay; no IAP fee.
- **Push-token storage and silence:**
  - Per-tenant suspended → all push tokens silenced.
  - User logout on a device → token deleted server-side.
- **Crash & analytics:**
  - Crashlytics or Sentry mobile SDK; tenant id and user id attached to crashes.
  - No PII in crash payloads.

---

## 5. Non-functional requirements

| Category         | Requirement                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| Security         | OWASP Top 10 covered; pen test before public launch                      |
| Privacy          | DPDP Act 2023 compliant; parental consent for data of minors             |
| Compliance       | GST e-invoicing for paid plans; receipts compliant with Indian standards  |
| Data residency   | India region only (ap-south-1 / Mumbai)                                  |
| Disaster recovery| RPO ≤ 24h, RTO ≤ 4h for v1                                                |
| Observability    | Structured logs, traces, per-tenant metrics, alerting on cross-tenant errors|
| Cost             | Infra cost per active student must trend below 5% of revenue per student  |

---

## 6. Out of scope for v1

- Native mobile apps (iOS/Android) — design must not block them.
- Multi-currency, multi-region.
- Vernacular languages beyond English + Hindi.
- AI features (predictions, chatbot, auto-comments).
- Marketplace / third-party app store.
- Government school procurement workflows (e-tenders).
- Biometric attendance hardware integration (architecture allows; not bundled).

---

## 7. Acceptance criteria for "v1 launch"

A school can:

1. Sign up, complete onboarding, import 200 students.
2. Configure classes, sections, subjects, timetable.
3. Mark daily attendance for all classes.
4. Generate fee invoices, collect fees online (Razorpay) and offline, issue receipts.
5. Conduct an exam, enter marks, generate report cards (PDF).
6. Send SMS + WhatsApp + Email notifications to parents.
7. Issue Bonafide and Transfer Certificates.
8. Run reports on attendance, fees, marks.

Super Admin can:

1. See all tenants in one console with health, MRR, trial status.
2. Create or suspend a tenant.
3. Toggle a feature flag for any tenant.
4. View per-tenant audit log.
5. Issue, retry, or void an invoice.
6. Impersonate a school admin (audited) for support.

If all of the above hold without cross-tenant data exposure, v1 ships.
