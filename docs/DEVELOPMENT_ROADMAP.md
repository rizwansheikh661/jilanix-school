# DEVELOPMENT_ROADMAP

A phased plan that turns the SchoolOS docs into a shipped product. Phases are sequenced by dependency, not by team size — they describe order, not duration.

The product is multi-tenant from line one. We do **not** ship "single-tenant first, refactor later."

---

## Phase 0 — Documentation foundation (current)

**Goal:** every architectural decision is written down before code.

- [x] PROJECT_VISION, PRODUCT_REQUIREMENTS, BUSINESS_RULES
- [x] SUPER_ADMIN_ARCHITECTURE, MULTI_TENANT_ARCHITECTURE
- [x] ROLES_AND_PERMISSIONS, BILLING_AND_SUBSCRIPTIONS, SCHOOL_ONBOARDING_FLOW
- [x] MODULES, DATABASE_STRATEGY, API_STANDARDS, UI_UX_GUIDELINES
- [x] DEVELOPMENT_ROADMAP, DECISIONS, SCRATCHPAD
- [ ] Founder + CTO + PM review pass; address all gaps logged in DECISIONS.md "open risks"
- [ ] Per-module deep-dive docs (`docs/modules/<name>.md`) written **as each module is built**, not all upfront

Exit: docs are internally consistent; a new contributor can read them and orient.

---

## Phase 1 — Platform Foundation (weeks 1–6)

**Goal:** the spine. Auth, tenancy enforcement, Super Admin console, school onboarding skeleton.

Modules in order:

1. **Repo + tooling**
   - Monorepo (apps: `backend`, `frontend`, `frontend-admin`, packages: `shared`, `ui`).
   - Lint rules: migration linter, tenant-scope linter (forbid Prisma calls without ALS tenant context).
   - CI: typecheck, lint, unit, integration with two-tenant isolation tests.
   - Local dev: Docker Compose (MySQL, Redis, MinIO).

2. **Foundation modules**
   - F1 Authentication & Identity
   - F2 RBAC + permission registry
   - F3 Tenancy & School Profile
   - F4 Audit Log
   - F5 Notifications **skeleton** (interface, no providers yet)
   - F6 Feature Flags + tenant configuration
   - F7 File Storage (S3 client + signed URLs)
   - F9 Background Jobs (BullMQ)

3. **Super Admin console v1**
   - Tenant CRUD (create, suspend, archive)
   - Plan registry CRUD
   - Feature flag toggle per tenant
   - User search across tenants
   - Audit log viewer
   - Basic fleet dashboard (tenant count, status breakdown)

4. **School onboarding wizard skeleton**
   - Steps 1–4 (school profile, branches, academic year, classes/sections/subjects)
   - Magic-link invites for school admin

5. **Tenancy safety net**
   - Prisma middleware enforcing `school_id`
   - Cross-tenant integration test scaffolding
   - Production canary skeleton (run from staging first)

Exit criteria:
- Two seeded tenants exist; users in tenant A cannot read tenant B (test-proven).
- Super Admin can create a tenant; the school admin completes wizard Steps 1–4.
- Audit log captures every write across foundation modules.

---

## Phase 2 — Student & Parent Lifecycle (weeks 6–10)

**Goal:** the school can actually represent students and communicate with parents.

- Students module (admit, edit, soft-delete, ID card)
- Parents module + parent-child linking
- Bulk CSV import (students + parents)
- Parent portal v1 (phone-OTP login, child list, profile view)
- Notifications providers wired:
  - Email (SES/SendGrid) for transactional
  - SMS (MSG91) — **DLT/sender ID registration completed before this lands in prod**
  - Push (FCM) for web push v1; native push later
- Notification templates registry + per-tenant credit pool

Exit:
- A trial school can import 200 students, parents log in via OTP, parents receive an SMS receipt of their account creation.

---

## Phase 3 — Daily Operations (weeks 10–16)

**Goal:** the daily teacher and parent loop works.

- Staff & Teachers module
- Academic Management (classes, sections, subjects refined)
- Attendance module (student + staff)
- Notice Board + Communication broadcasts
- Holiday & Calendar
- Timetable manual builder (auto-generation deferred)
- Teacher portal pages (today's classes, mark attendance, send notes)

Exit:
- A teacher marks daily attendance for one class; parents of absentees receive SMS+WhatsApp; the principal dashboard shows today's attendance %.

---

## Phase 4 — Money (weeks 16–22)

**Goal:** the school can bill, collect, and reconcile fees end-to-end.

- Fee structures, components, configuration UI
- Invoice generation (background job, gap-free sequence, GST line items)
- Receipts (offline first, online via Razorpay second)
- Razorpay one-time payment links + webhooks (idempotent)
- Discounts, scholarships, fines, credit notes, refunds
- Fee reports + defaulter list
- Platform-side billing (subscriptions → invoices → payments to *us*)
- Manual subscription assignment by Super Admin

Exit:
- The school issues fee invoices for one class; a parent pays via Razorpay; the receipt PDF is shared via WhatsApp+email; the accountant sees the reconciliation.
- We can invoice the school for the SchoolOS subscription with a GST-compliant PDF.

---

## Phase 5 — Examinations & Reporting (weeks 22–28)

- Examination module
- Marks entry (with optimistic locking and edit window)
- Grade systems (percentage, CGPA, letter)
- Report card generator (PDF, template-driven)
- Rank computation
- Reports & Analytics dashboard (per-tenant)
- Scheduled email/WhatsApp reports

Exit:
- The school conducts an exam, enters marks, publishes a report card PDF, parents view it on the portal, the principal sees term-level performance trends.

---

## Phase 6 — Adjacent Modules (weeks 28–34)

Pick by tenant demand; ship behind flags so we can adopt incrementally.

- Library, Transport, Hostel, Inventory, Visitor, Medical, Discipline, Complaints, Events, Certificates (custom + standard)
- WhatsApp provider (Meta Cloud API or Gupshup) live with template approval
- Student portal v1
- Per-tenant credit top-up flow + low-balance alerts

Exit:
- v1 module-completeness from PRODUCT_REQUIREMENTS §7 met for at least 80% of modules. Any module not built is explicitly deferred in DECISIONS.md.

---

## Phase 7 — Self-serve & Operations (weeks 34–40)

- Self-serve signup on marketing site
- Self-serve plan upgrade/downgrade
- Razorpay subscription mandates (auto-debit, NACH/UPI Autopay)
- Automated dunning ladder
- GST e-invoicing API integration
- Support ticket inbox in operator console
- Per-tenant export-on-demand (DPDP "right to access")
- Cross-tenant canary in production

Exit:
- A school can sign up online without sales touching them and pay automatically every cycle.

---

## Phase 8 — Mobile & Hardening (weeks 40–52)

- React Native parent app (read + pay + notifications)
- Offline-tolerant attendance (PWA + queue + sync)
- Cross-region backup replication
- Per-tenant restore primitive
- Quarterly DR drill
- WCAG audit + accessibility hardening
- Pen test (external) + remediation
- Performance pass: bundle budgets, query budgets, real-user monitoring

Exit:
- Native parent app live on Play Store. DR drill executed within RTO. Pen test report addressed.

---

## Phase 9 — AI & Scale (post-month-12)

- BI warehouse pipeline (CDC → ClickHouse/BigQuery)
- AI features pilot (defaulter prediction first; report-card comment generator second)
- Shard-readiness exercises (per-tenant restore, tenant→shard migration tooling)
- Marketplace exploration
- Vernacular UI v2 (Tamil/Telugu/Kannada/Marathi)

---

## Cross-cutting workstreams (run continuously)

These are not "phases" — they happen alongside every phase.

- **Tenant safety:** new tests added every PR that touches data; canary expanded.
- **Observability:** new metric per significant feature; alerts wired.
- **Docs:** module deep-dives + DECISIONS.md updated as decisions are made (not after).
- **Security:** dependency scanning, secret scanning, periodic access review.
- **Customer success:** trial-to-paid funnel reviewed weekly; product changes driven by friction observed.

---

## Sequencing rules

1. **Foundation before features.** A module is built only after its foundation prerequisites are stable.
2. **No module ships without a feature flag.** Even the first module ships behind a flag — proves the system works.
3. **No data write without an audit log emission.**
4. **No release without a green cross-tenant integration test suite.**
5. **No module is "done" until its UI passes mobile + dark mode + empty-state + error-state review.**
6. **Per-module doc (`docs/modules/<name>.md`) lands with the module.**

These rules are non-negotiable and make the roadmap deliver a product worth selling, not just code shipped.
