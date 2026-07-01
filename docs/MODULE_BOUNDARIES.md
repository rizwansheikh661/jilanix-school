# MODULE_BOUNDARIES

_Upstream: MODULES.md. Downstream: SUBSCRIPTION_FOUNDATION.md, PROVISIONING_AND_LIFECYCLE.md, BILLING_AND_SUBSCRIPTIONS.md._

This document is the canonical map of which modules are **Foundation** (shipped or in-flight, covering the data + service + admin surface) and which are **Future** (deferred for a later sprint — the portal, the operational layer, the analytics layer). Use this to settle "where should this go?" arguments before they reach review.

> Status: as of end of Sprint 15 + Hotfixes (2026-06-25).

---

## 1. Why this matters

The codebase has six pairs of modules where the **Foundation** ships the core data model, services, and platform-side admin APIs, while the **Future** sibling ships the customer-facing experience or the optimisation layer. Mixing the two pollutes responsibilities and makes plan changes — "add this to Foundation" vs "wait for Future" — ambiguous.

The rule across all six pairs is the same:

- **Foundation** owns: schema, services, repositories, super-admin / school-admin APIs, audit, permissions, outbox events, basic read endpoints.
- **Future** owns: per-actor portals (parent, student, teacher), tenant-facing dashboards, gamified or workflow UX, analytics aggregations, billing flows, payment gateways.

---

## 2. The six pairs

### 2.1 Communication Foundation vs Communication Center

| | Foundation (now) | Center (future) |
|---|---|---|
| **Owns** | Notification template registry, channel adapters (email/SMS/WhatsApp/push), per-school entitlement (channel enable + monthly limit), credit ledger, send orchestration, opt-out, quiet hours, DLT/WABA compliance. | Tenant inbox UI, marketing-campaign composer, A/B testing, per-conversation analytics, parent two-way chat threads, broadcast templates UI. |
| **APIs** | `POST /api/v1/notifications/send`, template CRUD, entitlement read. | Tenant-facing send composer, scheduling UI endpoints, conversation history, parent message read/reply. |
| **Cross-cuts to** | Subscription Foundation (channel limits sourced from `PlanFeature.{email,sms,whatsapp}_monthly`). | Parent Portal, Student Portal. |

Rule: **Foundation never owns UI orchestration.** If the feature requires building a screen the parent/student sees, it belongs to a portal sprint.

### 2.2 Parent Foundation vs Parent Portal

| | Foundation (now) | Portal (future) |
|---|---|---|
| **Owns** | `Parent` model, `parent_student_links`, `parent_communication_prefs`, contact details, relationship validation. | Parent login (OTP), dashboard, child summary, fee-pay-now flow, attendance read, marks read, notices + ack, message thread, leave-application. |
| **APIs** | Internal services + super-admin reads. | `/api/v1/parent/*` namespace; OTP auth; per-link scoped reads. |

Rule: Parent-as-User (linking `parents.user_id` and OTP auth) is **Portal scope**. Foundation only models the parent and the link.

### 2.3 Student Foundation vs Student Portal

| | Foundation (now) | Portal (future) |
|---|---|---|
| **Owns** | `Student` admission flow, Indian-school fields (Aadhaar, APAAR, RTE, category, religion), section assignment, status (ACTIVE/TRANSFERRED_OUT/...), `student_transfer_certificates`. | Student login, timetable read, marks read, notice board, library catalogue, gamification, badges, attendance view. |
| **APIs** | `POST /api/v1/admissions`, CRUD on `Student`, transfer/promotion flows. | `/api/v1/student/*` namespace. |

Rule: anything a student reads from their own device belongs to Portal scope. Foundation produces the data; Portal exposes it through a student-scoped lens.

### 2.4 Reporting Foundation vs Analytics / BI

| | Foundation (now) | Analytics / BI (future) |
|---|---|---|
| **Owns** | `BulkOperation` framework, `Import` framework (CSV import for Students/Staff/ExamMarks/Attendance/FeePayment), parsers/validators/committers, report generation primitives (PDF, CSV export). | Materialised report views (`rpt_*`), per-tenant dashboards, custom SQL report builder, BI exports (Metabase/Superset), drill-down charts, KPI scorecards. |
| **APIs** | `POST /api/v1/imports`, `POST /api/v1/bulk-operations`, `GET /api/v1/reports/*` (canonical reports only). | `/api/v1/dashboards/*`, custom-report endpoints, schedule-export endpoints. |

Rule: if it requires a refresh cadence or scheduled export, it's BI. If it's a one-shot render of a canonical report, it's Foundation.

### 2.5 Subscription Foundation vs Billing Foundation

| | Subscription Foundation (now — Sprint 15) | Billing Foundation (future) |
|---|---|---|
| **Owns** | `Plan`, `PlanFeature`, `Subscription`, `SubscriptionHistory`, `SchoolUsage`, `UsageEvent`, `UsageThresholdState`, `SubscriptionGuardService`, lifecycle state machine, threshold notifications, expiry scheduler. | Invoices, payments, payment-gateway integration (Razorpay/Stripe), GST/IRN, dunning state machine, mandates, credit notes, refunds, TDS, e-invoicing, GSTR-1 exports, multi-currency. |
| **APIs** | `/api/v1/super-admin/schools/:id/subscription/*`, `/api/v1/super-admin/plans/:id/features/*`, `/api/v1/super-admin/schools/:id/usage/*`, `/api/v1/school/subscription`, `/api/v1/school/usage`. | `/api/v1/billing/*`, webhooks `/api/v1/integrations/razorpay/*`, IRN integration. |

Rule: if the API touches money (invoice, payment, refund, GST), it's Billing scope. If it touches plan state, feature gating, or usage, it's Subscription scope.

### 2.6 School Provisioning vs Subscription Management

| | Provisioning (Sprint 14) | Subscription Management (Sprint 15) |
|---|---|---|
| **Owns** | `School`, `SchoolSettings`, lifecycle state (`DRAFT/PROVISIONING/ACTIVE/SUSPENDED/ARCHIVED/DELETED` — DECISIONS D-027; trial/expiring semantics belong to the parallel Subscription FSM per D-028), school-admin creation, trial-expiry scheduler (school lifecycle), `SchoolCommunicationEntitlement` bootstrap. | `Subscription`, plan-state (`PENDING/TRIAL/ACTIVE/EXPIRING/EXPIRED/SUSPENDED/CANCELLED`), plan assignment/upgrade/downgrade/renew/cancel, subscription history, usage tracking, plan features. |
| **State field** | `schools.lifecycle_status` | `subscriptions.status` (active row) |

Rule: **lifecycle = "is the school onboarded?"; subscription status = "what plan are they on and is it usable?"**. Both states exist simultaneously and serve different gates. Feature modules check Subscription via `SubscriptionGuardService`; auth and global write-guard check Lifecycle. See DECISIONS D-027 (School Lifecycle FSM) and D-028 (Subscription Lifecycle FSM) for the canonical state-machine definitions.

---

## 3. Decision matrix — "where does this go?"

| If the new feature... | It belongs to... |
|---|---|
| ...models a new entity that the school operates | Foundation (the relevant domain module) |
| ...is a UI for a parent / student / teacher actor | Portal (future) |
| ...adds a per-feature numeric or boolean cap on plans | Subscription Foundation (add a `featureKey` and a `LIMIT_FEATURE_KEY_TO_USAGE_COLUMN` entry if metered) |
| ...generates an invoice or processes a payment | Billing Foundation (future) |
| ...changes how an existing canonical report is rendered | Reporting Foundation |
| ...builds a dashboard with a refresh cadence or scheduled export | Analytics / BI (future) |
| ...sends a templated message to anyone | Communication Foundation (uses the existing send pipeline) |
| ...is a new chat interface or campaign composer | Communication Center (future) |
| ...transitions a school's lifecycle state | Provisioning (Sprint 14 module) |
| ...transitions a school's plan state | Subscription (Sprint 15 module) |

When a feature crosses pairs, prefer the **Foundation side** for data + service, and defer UI to the appropriate Future sprint.

---

## 4. Anti-patterns to avoid

- **Adding parent-facing endpoints to Notification controllers.** Even though parents will eventually consume notifications via a portal, the portal owns its own auth scope and rate limit. Don't expose `/api/v1/notifications/inbox` from the foundation.
- **Wiring Razorpay webhooks into Subscription.** Subscription has no concept of "payment received". Webhooks belong to Billing, which then calls `SubscriptionService.activate` / `.renew` over an internal interface.
- **Adding `student_count_billed` to `SchoolUsage`.** Counters in `SchoolUsage` are for guard/feature enforcement, not for billing-time snapshotting. Billing will own its own `subscription_student_snapshots` table when it ships.
- **Importing `parent.repository` from a Notification service.** Cross-module reads should go through a thin facade or an outbox event handler, not direct repository injection.
- **Conflating school lifecycle and subscription status in a single guard.** They have separate state machines and separate transition rules. Two separate guards, called in order: Lifecycle (write-guard middleware) → Subscription (`SubscriptionGuardService`).

---

## 5. Module ownership table

Snapshot at end-of-Sprint-15. "Status" reflects what is currently in `backend/src/core/*`.

| Module | Status | Owns | Future sibling |
|---|---|---|---|
| Auth + RBAC | Complete | Sessions, permissions, role catalog | — |
| Academic | Foundation | Year, term, class, section, subjects | (Portal reads) |
| Student | Foundation | Admission, demographics, status | Student Portal |
| Parent | Foundation | Parent, links, contact prefs | Parent Portal |
| Staff | Foundation | Staff, employment history, qualifications, assignments | Staff Portal |
| Attendance | Foundation | Daily/period attendance, leave applications | Parent Portal (read) |
| Fees | Foundation | Heads, structures, invoices, payments | Razorpay-Billing |
| Examination | Foundation | Schemes, exams, marks, report cards | Parent/Student Portal (read) |
| Timetable | Foundation | Period templates, entries, substitutions | Auto-generator service |
| Communication | Foundation | Template registry, channels, credits, opt-out | Communication Center |
| Notice Board | Foundation | Notices, audiences, acknowledgements | Parent/Student Portal |
| Files | Foundation | `file_assets`, presigned URLs, ACLs | AV-scan provider, streaming uploads |
| Jobs + Outbox | Foundation | BullMQ workers, outbox dispatcher, DLQ | — |
| Feature Flags | Foundation | Definitions, tenant overrides | Per-flag rollout UI |
| Reporting | Foundation | Bulk ops, imports, canonical reports | Analytics / BI |
| Provisioning | Foundation (Sprint 14) | School row, lifecycle, school admin creation | Self-serve signup wizard |
| Subscription | Foundation (Sprint 15) | Plan features, subscription state, usage, guard | Billing Foundation |
| Operator Console | Partial | Provisioning + Subscription super-admin APIs | CSM dashboard, MRR reports |

---

## 6. Hand-off contract — Foundation → Future

When a Future sprint kicks off, it should:

1. Read this document's pair to confirm scope split.
2. Read the relevant `*_FOUNDATION.md` for the data model and service entry points.
3. Wire to existing services via constructor DI — do NOT duplicate domain logic.
4. Add its own permissions and roles; do not extend Foundation permissions.
5. Add its own controllers under a new URL namespace (`/api/v1/parent/*`, `/api/v1/student/*`, `/api/v1/billing/*`).
6. Subscribe to outbox events for cross-module reactions; do not import Foundation repositories.

This contract is what keeps Foundation modules from becoming dumping grounds for unrelated UX concerns.
