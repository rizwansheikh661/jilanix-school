# SCRATCHPAD — SchoolOS SaaS

> Distilled truth of the current state of the project. Not a transcript.
> Read this first before doing anything. If empty, ask the user where to begin.

---

## What we are building

A **multi-tenant School ERP SaaS platform** for the Indian K-12 market (CBSE / ICSE / State boards), branded internally as **SchoolOS**. One Super Admin (us, the platform operator) onboards and manages many schools. Each school is a tenant with completely isolated data. The product must scale from a handful of free-trial schools to **1000+ schools and 100,000+ students** without re-architecture.

This is **not** a single-school admin panel. Every architectural decision must defend tenant isolation, per-tenant feature flags, and per-tenant billing.

---

## Why we are building it

- Indian Tier-2/Tier-3 schools are underserved — most ERPs are either bloated enterprise products or fragile clones.
- We can win by combining a **modern SaaS UX** (Stripe/Linear/Vercel feel) with **India-specific operational reality** (SMS-first parents, UPI/Razorpay billing, vernacular notifications, low-bandwidth mobile).
- SaaS economics: free trial → paid subscription → per-module upsell → expansion across branches/years.

---

## Current phase

**Phase 0 — Documentation foundation.** No code yet. We are producing the canonical reference documents that every future Claude session, engineer, and stakeholder reads before touching the codebase. Code generation begins only after these docs are reviewed and stable.

The directory layout (backend/, frontend/, database/, infrastructure/, integrations/, scripts/) is scaffolded but empty.

**Review pass 1 complete (2026-06-16):** founder/CTO/PM/DB-architect/security-architect lens applied. Gaps closed:
- GST detail (HSN/SAC, place-of-supply, IRN, GSTR-1, TDS) → BILLING §7
- Mid-cycle student snapshot rule + revenue recognition → BILLING §5.1, §5.2
- SMS DLT, WhatsApp WABA, Email SPF/DKIM/DMARC, atomic credit metering, DLR reconciliation, opt-out → MODULES §22.1–22.8
- Audit-log tamper-evidence (hash chain + WORM anchor) for financial subset → DATABASE §6.1
- Per-tenant restore primitive + cross-region DR + RPO/RTO matrix → DATABASE §11.1–11.3
- Feature-flag lifecycle + flag taxonomy (entitlement vs kill-switch) → MODULES F6.1–F6.3
- Cache invalidation on tenant state/plan/flag changes → MULTI_TENANT §6.1
- Cross-tenant probe detection + alerting → MULTI_TENANT §11.1
- Super Admin 4-eyes action list + break-glass procedure → SUPER_ADMIN §5.1–5.3
- Mobile-app readiness (token storage, push, deep links, IAP, offline) → PRD §4.15
- API client version negotiation + deprecation telemetry → API_STANDARDS §3.1–3.2
- Distinct portals (parent/teacher/student) enumerated → PRD §2
- Account-ownership transfer flow → SCHOOL_ONBOARDING §11.1, ROLES §6
- DECISIONS.md captures all 26 ADRs + 7 open risks (R-001 to R-007)

**Database architecture v1 (2026-06-16):** `DATABASE_ARCHITECTURE.md` written. Five-cluster ER (platform / identity / academic core / operations / money & messaging) + cross-cutting tables. Master list of ~140 tables. Multi-tenant scope classes (tenant-owned, tenant-shared platform, platform-only, cross-tenant operational). Seven-layer school-isolation defense (composite FKs → middleware → guards → repos → lint → tests → canary). Detailed table specs for audit, plans/subscriptions/platform billing, feature flags, notifications & credit-pool ledger, plus reporting and operational tables.

**Backend architecture v1 (2026-06-16):** `BACKEND_ARCHITECTURE.md` written. NestJS modular monolith with strict module boundaries (core / platform / features / integrations / jobs). Folder structure, anatomy of a feature module, the 18-step request lifecycle, auth strategy (5 surfaces × token model + Passport strategies), RBAC (registry + decorators + ABAC policies), multi-tenant middleware (resolver order, ALS RequestContext, Prisma scope hook, tenancy linter), logging (Pino + redaction + correlation + sampling), audit (decorator-driven, transactional, finance hash chain), plus errors / validation / transactions / outbox / caching / jobs / config / observability / rate-limiting / testing / deployment.

**Frontend architecture v1 (2026-06-16):** `FRONTEND_ARCHITECTURE.md` written. Next.js 14 App Router + TS + Tailwind + shadcn. Two apps (tenant `frontend/` + operator `frontend-admin/`). Edge-middleware tenant resolution (subdomain → path → header). Role-aware route groups (admin / teacher / parent / student) within one tenant app. Common dashboard anatomy + per-portal UI specs. Design system in 4 layers (tokens → primitives → patterns → features). Theme system with per-tenant brand-color derivation + light/dark + density modes + RTL. Mobile-first responsive strategy with per-portal performance budgets enforced in CI. State (TanStack Query + URL state + Zustand), auth (in-memory access token + httpOnly refresh cookie), permission/flag gating, i18n, a11y (WCAG AA), error boundaries, observability (Sentry + RUM), testing pyramid, lint-enforced boundaries.

**Database design v1 (2026-06-17):** `DATABASE_DESIGN.md` written. Production-grade column-level design for 145 tables. Complete specs per table: purpose, scope class, columns (name/type/null/default), PK, unique constraints, indexes (composite school_id-leading), foreign keys (simple platform→tenant, composite within-tenant). Module-wise table mapping. Covers all 15 required areas: Identity & Access (14 tables), Tenancy (7), Roles & Permissions (6), Audit (3 + hash chain), Plans & Subscriptions (6), Platform Billing (10 with GST), Feature Flags (5), Notifications & Usage (13 with DLT/WABA/credit ledger), Academic (8), Students & Parents (8), Staff (4), Attendance (3 + partitioned), Fees (12), Examinations (8), Adjacent modules (library/transport/hostel/etc), File Storage (2), Background Jobs (2), Outbox & Webhooks (3), Support (2), Reporting (3), Operational (tenant_sequences, idempotency_keys). Partitioning on high-write tables. Cardinality matrix. MySQL 8 + Prisma-ready.

---

## Source-of-truth map

| Question                                         | Read this first                  |
| ------------------------------------------------ | -------------------------------- |
| Why does this product exist? Who is it for?      | PROJECT_VISION.md                |
| What must the product do, end-to-end?            | PRODUCT_REQUIREMENTS.md          |
| Domain rules (academic year, fees, attendance…)  | BUSINESS_RULES.md                |
| What does the platform operator (us) do?         | SUPER_ADMIN_ARCHITECTURE.md      |
| How is one school's data isolated from another?  | MULTI_TENANT_ARCHITECTURE.md     |
| Who can do what?                                 | ROLES_AND_PERMISSIONS.md         |
| Plans, pricing, trials, dunning, GST, invoicing  | BILLING_AND_SUBSCRIPTIONS.md     |
| How a new school goes from sign-up → live        | SCHOOL_ONBOARDING_FLOW.md        |
| Every module, scope, dependencies, flags         | MODULES.md                       |
| Schema strategy, tenancy enforcement, indexing   | DATABASE_STRATEGY.md             |
| REST conventions, errors, pagination, versioning | API_STANDARDS.md                 |
| Design system, IA, component patterns            | UI_UX_GUIDELINES.md              |
| Phased delivery plan                             | DEVELOPMENT_ROADMAP.md           |
| Architecture decisions and their reasoning       | DECISIONS.md                     |

`docs/ERP_REQUIREMENTS.md.txt` is the **original raw brief** from the founder. Treat it as input, not as canonical — the docs above are the canonical interpretation. `docs/CLAUDE_RULES.md` is the working-style contract for any AI agent.

---

## Open questions (resolve before coding)

1. **Tenancy model.** Shared-DB-shared-schema with `school_id` on every row is the working assumption. We have not validated row-level enforcement strategy (Prisma middleware vs. NestJS interceptor vs. MySQL views). Decision deferred to DATABASE_STRATEGY.md but must be re-confirmed before the first module is coded.
2. **Payment provider.** Razorpay is the working assumption for Indian rupee billing + UPI + auto-debit. Stripe is fallback for any future non-INR. Not yet contracted.
3. **SMS / WhatsApp providers.** MSG91 (SMS, OTP) and Gupshup or Meta Cloud API (WhatsApp Business) are the working assumptions. Vendor lock-in is mitigated via a `NotificationProvider` abstraction — see MODULES.md §22.
4. **Hosting.** Single-region (ap-south-1, Mumbai) on AWS or DigitalOcean for v1. Multi-region not in scope for 12 months.
5. **Mobile app.** Architecture must support a future React Native (or Flutter) parent/student app; the v1 deliverable is responsive web only. The decision to ship a native app waits until ≥50 paying schools.
6. **AI features.** Out of scope for v1, but the data model must not preclude them (clean events, exportable per-tenant datasets).

---

## Working principles for this project

- **Tenant safety > feature velocity.** Any code path that can read or write across tenants is a P0 bug.
- **Feature flags on day one.** Every module ships behind a per-tenant flag. Plans toggle flags; code never hardcodes "is this school allowed to use X".
- **India-first defaults.** INR, IST, DD-MM-YYYY display, English + Hindi base, Aadhaar-aware (never store raw Aadhaar numbers without explicit need + masking).
- **Build for 1000 schools from week one.** Index every `school_id` column. Paginate every list. Background-queue every notification. No N+1 queries on student rosters.
- **Audit everything that touches money, marks, or PII.** Append-only audit log per tenant.

---

## What "done" looks like for Phase 0

- All 15 docs in `docs/` exist, are internally consistent, and cross-reference each other.
- DECISIONS.md captures the "why" behind every non-obvious choice.
- A new Claude session can read SCRATCHPAD.md → MODULES.md → DEVELOPMENT_ROADMAP.md and start coding the first module without asking the user to re-explain the product.

---

## What's next after Phase 0

Phase 1 begins with the **Platform Foundation**: auth, tenancy enforcement, Super Admin console, school onboarding, billing skeleton. See DEVELOPMENT_ROADMAP.md for sequencing. Do **not** start with student/fees modules — they depend on the foundation.
