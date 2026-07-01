# Frontend Implementation Plan — Master Roadmap

> **Status:** Planning only. No code, no theme modification.
> **Scope:** SchoolOS SaaS frontend, built against the frozen backend (`BACKEND_FREEZE_v1.md` — end of Sprint 20).
> **Companion:** `THEME_ANALYSIS.md`, `COMPONENT_INVENTORY.md`, `PAGE_INVENTORY.md`, `UI_ARCHITECTURE.md`, `PORTAL_SCREEN_PLANNING.md`, `FRONTEND_SPRINT_PLAN.md`.

---

## 1. Goal

Deliver a production-ready SchoolOS web frontend for **5 portals** — Platform, SchoolAdmin, Teacher, Student, Parent — built on Next.js App Router + React Bootstrap + Bootstrap 5.3.8 + SCSS, sourced visually from the purchased Bootstrap admin theme, integrated against the frozen `/api/v1` backend contract.

The frontend must:
1. Match the backend's module boundaries (no UI section spans two boundaries inappropriately — e.g., School Fees and SaaS Billing remain separate; Subscription and Billing remain separate).
2. Be RBAC-aware (UI gates mirror backend permissions; backend remains source of truth).
3. Be feature-flag-aware (modules gated until enabled per tenant).
4. Respect optimistic-concurrency headers (`If-Match`), idempotency keys, and standardised error envelopes on every request.
5. Be accessible (WCAG 2.1 AA), responsive (mobile-first for Parent/Student), and observable (trace ids surfaced in error states).

---

## 2. Phases

Implementation is divided into **6 phases**, each composed of one or more sprints. Phase boundaries reflect dependency order — a phase cannot begin until its predecessors land.

| Phase | Name | Purpose | Sprint(s) |
|---|---|---|---|
| **Phase 0** | Planning (this document) | Theme analysis, architecture, scope, sprint breakdown | (current) |
| **Phase 1** | Foundation | Scaffolding, design tokens, shared components, layouts, auth | F1, F2, F3 |
| **Phase 2** | SchoolAdmin core | Organization / academics / people / attendance / timetable | F4, F5, F6, F7 |
| **Phase 3** | School operations | Fees, exams, homework, events, communication | F8, F9, F10 |
| **Phase 4** | Self-service portals | Teacher, Student, Parent | F11, F12, F13 |
| **Phase 5** | Platform & billing | Platform portal, subscription, SaaS billing UIs | F14, F15 |
| **Phase 6** | Hardening | A11y audit, performance, e2e, polish | F16 |

Sprint-by-sprint detail is in `FRONTEND_SPRINT_PLAN.md`.

---

## 3. Module coverage by phase

| Backend module (per `BACKEND_FREEZE_v1.md` §3) | Phase | Sprint |
|---|---|---|
| Authentication & Identity | 1 | F2 |
| RBAC | 1 | F2 (provider) + ongoing |
| Multi-Tenant Foundation | 1 | F1 (tenant resolution middleware) |
| Organization & Branch | 2 | F4 |
| School Management | 2 | F4 |
| Academic (year/term/class/section/subject) | 2 | F4 |
| Student | 2 | F5 |
| Parent | 2 | F5 |
| Admission | 2 | F6 |
| Staff (teachers + non-teaching) | 2 | F5 |
| Attendance | 2 | F7 |
| Fees & Payments | 3 | F8 |
| Examination | 3 | F9 |
| Timetable | 2 | F7 |
| Notification / Communication Foundation | 1 | F2 (settings) + 3 F10 (composer) |
| Events & Activities | 3 | F10 |
| Academic Content (homework / syllabus) | 3 | F9 |
| Reporting Foundation | 3 | F10 (export/import jobs) |
| Super Admin + Provisioning | 5 | F14 |
| SaaS Subscription | 5 | F14 |
| Communication Center | 3 | F10 |
| SaaS Billing | 5 | F15 |

Self-service `/me/*` surfaces for Teacher/Student/Parent land in Phase 4 (F11–F13).

---

## 4. Cross-cutting tracks

These tracks run in parallel with feature sprints:

| Track | Owner sprint(s) | Description |
|---|---|---|
| **Design system** | F1, F2 | Tokens, typography, Bootstrap overrides, dark mode, foundational components |
| **API client + interceptors** | F1, F2 | Axios setup, error envelope, retry, refresh, If-Match, Idempotency-Key, X-Trace-Id |
| **RBAC + feature flags** | F2 | Providers, `<PermissionGate>`, `<FeatureFlagBoundary>` |
| **Forms** | F1, ongoing | React Hook Form + Zod conventions, `<IfMatchForm>` |
| **Tables** | F4, ongoing | TanStack Table + cursor pagination + URL state |
| **Notifications UI** | F2 | Per-user preferences page, header bell |
| **Accessibility** | F16 | Audit + fixes across all surfaces |
| **Observability** | F1, F16 | Sentry wiring, trace id surfacing |
| **Testing** | every sprint | Vitest + MSW + Playwright; coverage gates |
| **Responsive** | every sprint | Mobile-first for Parent/Student; tablet for Teacher |

---

## 5. Dependency rules

These constraints must not be violated by sprint sequencing:

1. **Auth (F2) precedes everything operational.** No portal page is implemented before login + RBAC + feature-flag plumbing exists.
2. **Design system (F1) precedes feature components.** No business screen is built before tokens, layout shell, and foundational components exist.
3. **School / Academic setup (F4) precedes Student / Parent / Staff (F5).** People are placed against academic structure.
4. **Student + Parent (F5) precedes Admission (F6).** Admission converts to Student; Student must exist as a target.
5. **Attendance (F7) and Timetable (F7) depend on Class + Section + Teacher.**
6. **Fees (F8) depends on Student.**
7. **Exam (F9) depends on Student, Class, Subject, Term.**
8. **Self-service portals (F11–F13) depend on the corresponding admin surface.** Parent portal cannot ship before parent invitation UI exists in SchoolAdmin (F5).
9. **Platform portal (F14) is independent of school portals** — can be sequenced in parallel from F4 onward, but is grouped late because operators are typically internal users with lower urgency than tenants.
10. **Billing UI (F15) depends on Subscription UI (F14).**
11. **Hardening (F16) is last** — a11y/perf/visual audits happen against a complete surface.

---

## 6. Out of scope for frontend v1

These are explicitly **not** part of the frontend v1 deliverable. They mirror `BACKEND_FREEZE_v1.md` §4 deferred backend modules:

- Mobile apps (Parent / Student / Staff) — separate project; web is responsive.
- Operational verticals: Payroll, Library, Transport, Hostel, Inventory, Medical, Discipline, Visitor, Complaint Management UIs.
- Self-serve school signup wizard.
- Analytics / BI dashboards beyond the canonical reports surface.
- Custom report builder.
- Inbound / two-way communication.
- Per-school theme rendering (logo only; full themes deferred).
- Localization beyond English (India).
- Real-time bank reconciliation UI.
- Cross-tenant operator search & impersonation UI.
- Dunning state-machine UI, e-NACH mandate UI, GST e-invoice / IRN screens, TDS certificate workflow.

---

## 7. Acceptance criteria for v1 release

Frontend v1 is "shippable" when:

1. **All 5 portals** boot and render their dashboards against the frozen backend.
2. **Auth flows** (login, password reset, change password) work end-to-end.
3. **SchoolAdmin** can perform: create academic year + class + section, add student, invite parent, mark attendance for one session, edit timetable, create fee invoice, record fee payment, send a notification campaign.
4. **Teacher** can: log in, see their classes + timetable, mark attendance, assign homework.
5. **Student** can: log in via invitation email, view profile + class + section, manage notification preferences.
6. **Parent** can: log in, see linked children, view a child's fee invoices, pay an invoice (Razorpay manual or online).
7. **Platform operator** can: list schools, provision a new school, view a school's subscription, view a school's invoices, record a manual payment, view billing audit.
8. **All requests** carry the required headers; conflicts (412) and errors surface user-readable toasts.
9. **Lighthouse**: Performance ≥ 90 on dashboards, A11y ≥ 95 globally.
10. **E2E suite** passes on Chromium and WebKit per `FRONTEND_SPRINT_PLAN.md` F16.

---

## 8. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Source-theme licensing — vendor brand strings or illustrations carried inadvertently | Medium | Strip vendor branding from all assets and source comments; commission replacements for illustrations if license is restrictive (tracked in F1) |
| jQuery dependency creep | Medium | Lint rule + PR review to forbid `jquery` import; component inventory enforces React-only replacements |
| Backend change requiring v2 API | Low (backend frozen) | Frozen contract means in-place change is contractually forbidden; v2 surface would be additive |
| Cursor pagination misuse | Medium | Establish `<CursorPaginator>` early; code-review checklist |
| Dark-mode contrast regressions | Medium | Token-based color system + automated contrast tests in F16 |
| Multi-tenant subdomain routing in local dev | Low | `*.localhost` resolves to 127.0.0.1 on most systems; documented in `UI_ARCHITECTURE.md` |
| Mobile usability for Parent portal | Medium | Mobile-first audit in F12; Playwright runs against mobile viewport |
| Accessibility debt accumulating | High if deferred | Per-sprint a11y checklist; dedicated F16 audit |

---

## 9. Documentation deliverables alongside code

Each feature sprint must update:
- `docs/frontend/COMPONENT_INVENTORY.md` — when new shared components are added.
- `docs/frontend/PORTAL_SCREEN_PLANNING.md` — when routes change or new screens land.
- Per-feature README in the relevant `app/(portal)/<module>/` directory.
- Storybook (optional but recommended) for design-system entries.

The seven Phase 0 documents (this set) are the **planning artefacts** and are frozen at start of F1; subsequent changes happen as updates with PR trail, not rewrites.

---

## 10. Stop

This document is the master roadmap. Sprint detail follows in `FRONTEND_SPRINT_PLAN.md`. Frontend Sprint F1 begins only after the Phase 0 planning set is approved.
