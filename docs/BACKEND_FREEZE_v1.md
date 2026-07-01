# SchoolOS SaaS — Backend Freeze v1.0

> **Official Backend Freeze Certificate.**
> Issued: 2026-06-26.
> Authority: backend code in `backend/src/core/*` + Prisma schema in `backend/prisma/schema/*` as of end of Sprint 20.
> Companion documents: `IMPLEMENTATION_STATUS.md`, `MODEL_INVENTORY.md`, `DATABASE_DESIGN.md`, `BACKEND_INTEGRATION_VERIFICATION.md`, `BILLING_FOUNDATION_ARCHITECTURE.md`, `BILLING_PAYMENT_WORKFLOW.md`.

---

## 1. Identity

| Attribute | Value |
|---|---|
| Backend Version | **v1.0** |
| Freeze Point | End of Sprint 20 (2026-06-26) |
| Backend Status | **Production-ready foundation** |
| Architecture Status | **Frozen** |
| API Contract | **Frozen** at `/api/v1` (URI versioning at `apps/api/main.ts`) |
| Database Schema | **Frozen** — 26 Prisma schema files, 155 models, hand-crafted SQL migrations |
| Business Rules | **Frozen** — see `BUSINESS_RULES.md`, `DECISIONS.md`, `MODULE_BOUNDARIES.md` |
| Shared Infrastructure | **Frozen** — single owners for RequestContext, Audit, Outbox, Jobs, Notifications, Files, Sequences, FeatureFlag, Crypto, RBAC |

---

## 2. Scope of the Freeze

This freeze covers the **backend only**. Specifically:

- All HTTP route shapes, request/response envelopes, error envelopes, headers (`If-Match`, `If-None-Match`, `Idempotency-Key`, `X-Trace-Id`), and pagination conventions at `/api/v1/*`.
- The Prisma schema and all migrations in `backend/prisma/schema/migrations/`.
- The shared-infrastructure primitives (see §6) and their public service contracts.
- The 12 business-rule pillars enumerated in `BUSINESS_RULES.md`.
- The module boundaries enumerated in `MODULE_BOUNDARIES.md` (notably School Fees ⟂ SaaS Billing, Notification Foundation ⟂ Communication Center, Subscription ⟂ Billing).

Out of scope of this freeze:

- All frontends (Operator Console, Parent Portal, Student Portal, ERP Web, Mobile).
- Operational verticals not yet built (Payroll, Library, Transport, Hostel, Inventory, Medical, Visitor, Discipline, Complaint Management).
- Analytics / BI dashboards beyond the canonical reports surface.
- Inbound / two-way communication channels.

---

## 3. Modules Complete

The 22 backend modules below are foundationally complete and frozen at their v1 surface. Every module has: controllers under `/api/v1`, services, repositories, errors, DTOs with `class-validator`, audit emissions, outbox publications (where cross-cutting), feature-flag gates (where applicable), RBAC permission seeders, and tests.

| # | Module | Sprint(s) | Status |
|---|---|---|---|
| 1 | Authentication & Identity | 1–3 / 17–18 | Foundation + Enhancement Complete |
| 2 | RBAC | 1–3 (ongoing) | Complete |
| 3 | Multi-Tenant Foundation (RequestContext) | 1–3 | Complete |
| 4 | Organization & Branch | 1–3 / 4–6 hotfix | Complete |
| 5 | School Management | 1–3 | Complete |
| 6 | Academic (year/term/class/section/subject) | 1–3 / 4 | Complete |
| 7 | Student (academic record + enhancement) | 1–3 / 4 / 18 | Foundation + Enhancement Complete |
| 8 | Parent (relationships + enhancement) | 1–3 / 17 | Foundation + Enhancement Complete |
| 9 | Admission | 1–3 | Complete |
| 10 | Staff | 4 | Complete |
| 11 | Attendance | 6 | Complete |
| 12 | Fees & Payments + Hybrid Fee Collection | 7 / 8 | Complete |
| 13 | Examination | 9 | Complete |
| 14 | Timetable | 10 | Complete |
| 15 | Notification / Communication Foundation | 10 | Complete |
| 16 | Events & Activities | 11 | Complete |
| 17 | Academic Content (Homework / Assignments / Syllabus) | 12 | Complete |
| 18 | Reporting Foundation (+ Import / Export / Bulk Operations) | 14 | Foundation Complete |
| 19 | Super Admin + School Provisioning + Lifecycle | 14 | Complete |
| 20 | SaaS Subscription Foundation + Enforcement | 15 / 16 | Complete |
| 21 | Communication Center | 19 | Foundation Complete |
| 22 | SaaS Billing Foundation | 20 | Foundation Complete |

---

## 4. Modules Deferred (planned, designed, scoped — not yet built)

These have explicit designs or carve-outs in the codebase / docs but no implementation. Future sprints may build them without violating the v1 freeze.

- **Payroll** (Staff salaries, PF/ESI, biometric integration)
- **Library** (catalog, issue/return, fines)
- **Transport** (routes, vehicles, students-on-route, fees integration)
- **Hostel** (rooms, allocations, fees integration)
- **Inventory / Asset Management**
- **Medical / Infirmary**
- **Discipline**
- **Complaint Management**
- **Visitor Management**
- **Mobile Apps** (Parent app, Student app, Staff app)
- **Parent Portal UI**
- **Student Portal UI**
- **Operator Billing Console UI** (API surface exists; UI is a separate frontend project)
- **Analytics / BI Dashboards** (beyond canonical reports)
- **Custom Report Builder**
- **Billing dunning state machine + auto-charge / e-NACH**
- **Billing — Stripe and alternative gateways**
- **Billing — GST e-invoice / IRN, GSTR-1 export, TDS certificate workflow**
- **Billing — multi-currency, partner-billing splits**
- **Inbound / two-way Communication** (replies, inbound SMS / WhatsApp)
- **Self-Serve School Signup Wizard**
- **Cross-Tenant Operator Search & Impersonation**

---

## 5. Modules Not Started

Beyond the "deferred" list (which has design intent), the following are explicitly **not started** and have no immediate roadmap:

- Marketplace / third-party add-on revenue split
- International payments / FX / FEMA reporting
- AI-assisted features (auto-grading, lesson planning, recommendation engines)
- Multi-language localisation per school
- Per-school theme rendering
- Curriculum versioning (CBSE ↔ ICSE ↔ State mapping)
- Online assessment delivery / rubric-based grading UI
- Automatic timetable optimisation solver
- Real-time bank reconciliation / UPI auto-match
- Hard-delete worker / per-region data-residency moves

---

## 6. Shared Infrastructure (frozen, single source of truth)

| Primitive | Owner module | Consumed by |
|---|---|---|
| `RequestContextRegistry` (AsyncLocalStorage tenant scope) | `core/request-context` | every service and repository |
| `AuditService.record` (general / finance hash-chained / security / tenancy) | `core/audit` | every domain module |
| `OutboxPublisherService.publish` (tx-required) | `core/outbox` | every cross-module event emitter |
| `JobEnqueueService` + `JobHandlerRegistry` (BullMQ + Redis) | `core/jobs` | scheduled work everywhere |
| `NotificationCampaignService` + `NotificationEventRegistry` + per-user preferences | `core/notifications` | every notification emitter incl. Communication Center |
| `FileStorageService` | `core/files` | Admission, Staff, Events, Academic Content, Fees, Reporting |
| `SequenceService.nextValue(name, { fiscalYear, tx })` | `core/sequences` | Admission, Staff, Fees, Billing (`BILLING_INVOICE`, `BILLING_ACCOUNT`) |
| `FeatureFlagService.isEnabled` + `FeatureFlagRegistry` | `core/flags` | every `module.*`-gated module |
| `CryptoService.sealString` / `openString` (envelope encryption) | `core/crypto` | Student (Aadhaar last-4), Billing (Razorpay secrets) |
| `PasswordResetService.request({ ttlMs })` | `core/auth/provisioning` | Provisioning, Parent Enhancement, Student Enhancement |
| `parseIfMatch` + `version` columns (optimistic concurrency) | `core/http/if-match.ts` | every PATCH / POST-state-change route |
| `runWithSystemContext` (background jobs, outbox handlers, scheduled tasks) | `core/request-context` | Jobs, OutboxDispatcher, Subscription scheduler, Billing scheduler hooks |

These primitives are **frozen**. New modules consume them; no module re-implements any of them.

---

## 7. Architecture Principles (reconfirmed at freeze)

The following invariants hold as of v1.0 and must not be violated by future modules:

1. **School Fees and SaaS Billing remain permanently separate.**
   - `fees/*` charges parents at a school; `billing/*` charges schools for the platform.
   - No shared tables, sequences, audit chains, services, or notification keys.
   - `Audit` finance-chain is consumed by both, but each maintains its own chain head.
   - Verified at freeze: `fees/*` has **zero** imports from `billing/*` and vice versa.

2. **Billing always integrates with Subscription through `SubscriptionService` only.**
   - `BillingSubscriptionIntegrationService` is the single seam.
   - Billing **never** imports `SubscriptionRepository`.
   - Subscription transitions caused by Billing (e.g. mark ACTIVE after first payment) go through `SubscriptionService` methods, which write `SubscriptionHistory`.
   - Verified at freeze: zero `SubscriptionRepository` imports under `core/billing/*`.

3. **Shared infrastructure is reused everywhere.**
   - No module re-implements Audit, Outbox, Notifications, Jobs, Sequences, FeatureFlag, RequestContext, RBAC, File Storage, or Crypto. New work consumes the primitives in §6.

4. **Backend APIs are ready for frontend integration.**
   - All routes live under `/api/v1/*` (URI versioning).
   - Optimistic concurrency on every PATCH / state-change via `If-Match` + `version`.
   - Cursor pagination on every list endpoint; standardised error envelopes; class-validator on every DTO.
   - Swagger / OpenAPI surfaces every controller; `apps/api/main.ts` enables `rawBody: true` for HMAC webhook routes.

5. **Future modules must not violate existing module boundaries.**
   - The module-boundary doc (`MODULE_BOUNDARIES.md`) and the integration certification (`BACKEND_INTEGRATION_VERIFICATION.md`) are the canonical reference. Any new module must declare its upstream / downstream dependencies and may not reach into another module's repository layer.

---

## 8. Verified at Freeze (consistency checks)

The following were re-verified prior to issuing this freeze:

- **Sprint 20 separation:**
  - `core/billing/*` contains 0 imports of `SubscriptionRepository`.
  - `core/billing/*` contains 0 imports of `core/fees/*`.
  - `core/fees/*` contains 0 imports of `core/billing/*`.
- **Razorpay isolation:** Razorpay logic is confined to `core/billing/razorpay/*` (gateway, service, controllers). No other module imports it. Razorpay uses Node native `https` + `crypto`; no SDK dependency.
- **Encrypted secrets:** Razorpay key id, key secret, and webhook secret are persisted via `CryptoService.sealString` and never exposed by repositories (a `hasRazorpaySecret: boolean` is surfaced instead).
- **Tenant safety:** Every billing write carries `schoolId`; every cross-tenant read uses the documented `BYPASS_TENANT_SCOPE` pattern with explicit `schoolId` argument.
- **TypeScript build:** 0 errors at end of Sprint 20.
- **Test posture:** 8 Sprint-20 unit specs (23 tests) + 2 controller-level e2e specs (3 tests) pass alongside the pre-existing suite.
- **Documentation:** `IMPLEMENTATION_STATUS.md`, `MODEL_INVENTORY.md`, `DATABASE_DESIGN.md`, `BILLING_FOUNDATION_ARCHITECTURE.md`, `BILLING_PAYMENT_WORKFLOW.md`, and `BACKEND_INTEGRATION_VERIFICATION.md` all reference Sprint 20 consistently.

---

## 9. Final Certification

> **Is Backend Version 1 officially frozen?**
>
> **YES.**

### Technical justification

1. **All 22 v1 backend modules are complete** with controllers, services, repositories, DTOs, errors, audit emissions, outbox publications, feature-flag gates (where applicable), RBAC seeders, and tests. The dependency graph in `IMPLEMENTATION_STATUS.md` § Cross Module Dependencies has no missing nodes for the v1 surface.

2. **Sprint 20 closed the last v1 gap** — SaaS Billing Foundation — without violating any prior module boundary. Billing integrates with Subscription only through `SubscriptionService`, never touches Subscription tables directly, and is permanently separate from School Fees (verified by grep: zero cross-imports in either direction).

3. **All shared infrastructure has a single owner** (§6). No module re-implements Audit, Outbox, Notifications, Jobs, Sequences, FeatureFlag, RequestContext, RBAC, File Storage, or Crypto. Future modules will consume these unchanged.

4. **The API contract is stable** at `/api/v1/*` with URI versioning, optimistic concurrency on every state-change route, cursor pagination on every list endpoint, standardised error envelopes, and Swagger/OpenAPI on every controller. A frontend can be built against this contract without expecting backend churn.

5. **The database schema is stable** at 26 Prisma files / 155 models, with hand-crafted SQL migrations under `backend/prisma/schema/migrations/`. Every soft-delete model uses the `deletedAt + STORED deletedAtKey` pattern for partial-unique alive-row constraints; every tenant-owned model uses composite `(school_id, id)` PKs.

6. **The deferred surface is explicitly enumerated** (§4) and bounded: dunning, e-invoice/IRN, mandate-based auto-charge, operational verticals (Payroll/Library/Transport/Hostel/Inventory/Medical/Discipline/Visitor/Complaint), and every frontend. None of these require breaking changes to the frozen v1 surface; they extend it.

7. **Documentation is consistent** across `IMPLEMENTATION_STATUS.md`, `MODEL_INVENTORY.md`, `DATABASE_DESIGN.md`, `BILLING_FOUNDATION_ARCHITECTURE.md`, `BILLING_PAYMENT_WORKFLOW.md`, and `BACKEND_INTEGRATION_VERIFICATION.md`. All reference Sprint 20 as the freeze point.

8. **Integration certification (`BACKEND_INTEGRATION_VERIFICATION.md`) was issued PASS** across Backend Foundation, Student lifecycle, Parent lifecycle, Subscription, Billing, Security, Architecture, and Integration categories; the four PASS-WITH-OBSERVATIONS categories (Communication, Reporting, Documentation, API Layer) carry only enhancement notes, not blockers.

This freeze constitutes a stable contract for frontend development to begin against `/api/v1/*`. Any future change that breaks the contract requires a versioned `/api/v2/*` surface or an explicit additive migration; in-place rewrites of frozen endpoints are not permitted under v1.
