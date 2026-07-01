# FRONTEND_THEME_INTEGRATION

**Stack frozen 2026-06-25. Future changes require a new ADR.**

How a purchased HTML ERP theme will be converted into the Next.js frontend, what gets reused vs redesigned, and the rules of engagement between the theme and the backend.

> Status: planning document. Frontend implementation has not started — the backend foundations are still being completed. This document exists so that when frontend work begins, the rules are clear.

---

## 1. Why this document exists

We purchased an HTML/CSS/JS ERP admin theme as the visual starting point for the SchoolOS frontend. That theme is **scaffolding, not architecture**. Without explicit rules:

- Designers reach for theme pages that don't match our domain (CRM lead pipelines, generic invoices, e-commerce orders).
- Engineers re-wire theme JavaScript instead of going through our backend APIs.
- "Just use the theme's chart component" turns into a quiet dependency on an outdated jQuery plugin.
- The theme's information architecture (sidebar groupings, page titles) silently shapes our REST contract.

This doc sets the boundary: **the theme provides visual language; the backend provides the architecture.** Where they conflict, the backend wins.

---

## 2. What we bought

- An HTML/CSS/SCSS admin theme with a wide page library: dashboards, table screens, form screens, charts, calendar, profile, settings, login, error pages, plus several domain-specific samples (HR, CRM, inventory, e-commerce, school).
- Bundled vendor JS: charting library, datatable plugin, date picker, form validation, file upload, rich-text editor.
- Style tokens: spacing scale, type ramp, brand palette, dark/light mode, icon set.

We own a perpetual license for adaptation, including conversion to a React/Next.js codebase.

---

## 3. Conversion strategy

### 3.1 Target stack

- **Next.js (latest stable available when frontend development begins)** (app router) with React Server Components where they fit.
- **React** as the UI library.
- **TypeScript** strict — no JavaScript-only modules.
- **Bootstrap 5.3.8** as the CSS framework and grid system (pinned). The theme's SCSS tokens are migrated into Bootstrap 5.3.8 SCSS variable overrides (spacing, colours, type ramp, breakpoints).
- **React-Bootstrap** as the primitive component library; theme styles applied on top.
- **Axios** as the HTTP client across server and client code, wired through interceptors for auth refresh and tenant headers.
- **React Hook Form** for form state.
- **TanStack Query** for server-state, with the backend's `/api/v1/*` REST API as the source of truth.
- **Lucide Icons** as the icon library.
- Auth is handled by a custom React hook that calls the backend's `/api/v1/auth/...` endpoints and stores the refresh token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. **NextAuth / Auth.js is not used.**
- **next-intl** for i18n once the backend ships locale-aware payloads.

### 3.2 Conversion principles

The seven canonical rules for porting the purchased theme:

1. **HTML pages are converted into reusable React components** — one component per logical region; not a 1:1 file port.
2. **Bootstrap 5.3.8 is retained** as the CSS framework and grid system (pinned exact version).
3. **jQuery is completely removed** — every jQuery-driven behavior is reimplemented in React.
4. **CDN JavaScript dependencies are removed** — every dependency comes through the package manager and is auditable.
5. **Only required Bootstrap plugins remain** — dropdown, modal, offcanvas, collapse, tooltip, popover. Carousel, scrollspy, toasts-as-plugins and any other plugin used only by demo pages are dropped; if a feature later needs one, it's added back through React-Bootstrap explicitly.
6. **ERP-specific pages will replace the theme's generic admin pages** — admissions, attendance, fees, examinations, timetable, reports, subscription self-view, and super-admin consoles.
7. **Backend APIs remain the single source of truth** — the frontend never reproduces business state, validation, or lifecycle rules locally.

### 3.3 What is rewritten vs reused

| Theme asset | Treatment |
|---|---|
| HTML page layouts | **Rewritten** as React components, decomposed into reusable region components. Used as visual reference; markup is re-authored idiomatically. |
| SCSS tokens (palette, spacing, type) | **Migrated** into Bootstrap 5.3.8 SCSS variable overrides. |
| jQuery plugins / behaviors | **Removed.** Reimplemented in React on top of React-Bootstrap. |
| CDN `<script>` tags | **Removed.** All JS comes through the package manager. |
| Bootstrap plugins (dropdown, modal, offcanvas, collapse, tooltip, popover) | **Kept** via React-Bootstrap. Other Bootstrap JS plugins not needed by ERP screens are dropped. |
| Sidebar / navbar / breadcrumb structure | **Re-authored** with our IA — theme grouping is ignored. |
| Charting library | **Replaced** with `recharts` — we do not adopt the theme's vendor chart lib. |
| Datatable plugin | **Replaced** with `@tanstack/react-table` for server-paginated tables backed by backend cursors. |
| Date picker | **Replaced** with a React-Bootstrap-compatible date primitive driven by React Hook Form. |
| Form validation | **Replaced** with `react-hook-form` + a schema-validation resolver (Zod/Yup). |
| HTTP / AJAX calls | **Replaced** with `axios` clients in `lib/api*`. |
| File upload | **Replaced** with our presigned-URL flow (Sprint 5 file service). |
| Rich-text editor | Evaluated when first needed (notices? messages?). No commitment now. |
| Icon set | **Replaced** with Lucide Icons as the single icon library. Theme icons are dropped. |

Rule of thumb: **keep the visual language, replace the runtime.**

### 3.4 Theme page review — what makes it into the product

A one-time exercise walks every page the theme ships with and assigns it to one of:

1. **Adopt as-is (after rewrite)** — login, dashboards, profile, settings, error pages.
2. **Adopt with significant redesign** — student list, attendance grid, fee invoice list, notice board, timetable view. These are domain pages where the theme's e-commerce/CRM sample is the wrong fit; we keep the layout chrome but redesign content.
3. **Discard** — CRM pipelines, e-commerce orders, helpdesk tickets (we have our own complaint module), kanban boards we have no use for, generic "tasks" pages.

The discard pile is large by design. A theme is a buffet, not a meal plan.

---

## 4. Pages we will redesign (ERP-specific)

Below are the domain pages where the theme is a starting point but not the destination. Each will be designed against the corresponding backend module's API:

- **Tenant Dashboard** (school admin landing) — KPIs from `SchoolUsage`, lifecycle banner, trial countdown, recent activity.
- **Student admission flow** — multi-step form mapping to `POST /v1/admissions` with Indian-school fields (Aadhaar, APAAR, RTE, category, religion).
- **Staff hiring + assignment** — staff list + class-teacher assignment matrix.
- **Attendance grid** — one-tap roster, locked-day visualisation, leave-day overlay.
- **Fee invoice + payment** — invoice viewer with offline/online toggle, GST split, receipt download.
- **Exam marks entry** — section/subject grid with optimistic-lock awareness.
- **Notice board** — composer + audience picker driven by class/section/role tree.
- **Subscription console (super-admin)** — plan list, plan-feature matrix editor, per-school subscription card with usage bars.
- **Plan feature matrix (super-admin)** — bulk replace UI on `POST /v1/super-admin/plans/:planId/features/bulk`.
- **Operator console** — tenant list with lifecycle + subscription health badges, suspend/freeze/archive actions, audit log viewer.

Each of these gets its own design pass; the theme's sample equivalent (if any) is a reference, not a spec.

---

## 5. Pages we drop from the theme

- CRM (leads, deals, pipelines).
- E-commerce (products, orders, customers).
- Helpdesk / tickets (we have a Complaints module with different semantics).
- Generic project management (tasks, kanban).
- Marketing campaign builders (Communication Center will own its own composer when it ships).
- Cryptocurrency / trading dashboards.
- Generic "blank" page templates that exist only to fill out the demo catalogue.

These pages are not removed from the theme's source archive; they are simply not ported into the Next.js app.

---

## 6. Information architecture (backend-driven)

The theme's sidebar groups (`Apps`, `UI Elements`, `Charts`, etc.) are demo-driven and have no bearing on our IA. The real sidebar is grouped by **business domain** as exposed by the backend:

- **Academics** — Year/Term, Classes & Sections, Subjects, Timetable.
- **People** — Students, Parents, Staff.
- **Operations** — Attendance, Notices, Communication, Files.
- **Finance** — Fees, Invoices, Receipts, (later) Billing.
- **Examinations** — Exams, Marks, Report Cards.
- **Reports** — Canonical reports + (later) custom report builder.
- **Settings** — School profile, branches, working days, locales, integrations.
- **Super Admin** (PLATFORM_ADMIN only) — Tenants, Plans + Features, Subscriptions, Usage, Operator console, Audit.

Within each group, items appear or disappear based on **plan features** (TOGGLE keys from `PlanFeature`) and **lifecycle/subscription status** — both delivered by backend feature-availability reads, not by frontend hard-coding.

---

## 7. Backend as source of truth — rules

1. **Every page that displays domain data calls a `/v1/*` endpoint.** Theme JS that fakes data with local arrays is removed during port.
2. **Permissions decide menu visibility.** The sidebar is rendered from a permissions payload returned at login, not from a hardcoded route list.
3. **Plan features decide module visibility.** TOGGLE features (e.g. `multi_branch`, `payroll`) gate whole sections; LIMIT features inform usage widgets on the dashboard.
4. **Concurrency is enforced via `If-Match`.** Every mutation form sends the row version in the `If-Match` header; the theme's "save" buttons are wired to handle 409 responses by re-fetching and warning the user.
5. **Pagination is cursor-based** (matches the backend). The theme's datatable is replaced with `@tanstack/react-table` so we control the request/response shape.
6. **No frontend writes to `localStorage` for anything we treat as authoritative.** Session + permissions + tenant context come from the backend on every navigation.

---

## 8. When can frontend start?

Not yet. The current rule is **finish the backend foundations first**:

1. Backend onboarding (provisioning + subscription) must be stable end-to-end.
2. Communication Foundation + Billing Foundation must at least have their APIs designed so frontend doesn't hard-code paths that move later.
3. The IA above must be ratified.

A premature start risks pages being built on draft APIs, then rewritten — exactly the cost we are deferring.

---

## 9. Anti-patterns to avoid

- **Letting the theme's grouping drive REST URL design.** If the theme bundles "School Settings" and "Branches" on the same screen, that's a UI choice — the backend's `/v1/branches/*` and `/v1/school/settings/*` remain distinct.
- **Adopting theme widgets that bypass the backend.** A "weather widget" with a baked-in API key is not a frontend feature; it's an undocumented integration. Defer.
- **Reproducing theme animations that cost performance budget.** Loading-skeletons yes; full-screen page transitions no.
- **Building admin pages off the customer-facing theme samples.** Operator console and tenant dashboards have different density, density rules, and audit affordances — design from scratch using the theme's tokens.
- **Treating the theme's dark-mode toggle as our preference system.** Theme + locale + density preferences are stored per-user on the backend (future Sprint).

---

## 10. Open questions (to resolve before frontend kickoff)

- Server-rendered vs SSG vs CSR per route — leaning RSC for dashboards, CSR for grids.
- Tenant subdomain (`<slug>.schoolos.app`) vs path-based (`/t/<slug>/...`).
- Mobile breakpoint contract (theme is desktop-first; teacher/parent flows likely mobile-first).
- Whether to ship a Storybook with our React-Bootstrap-adapted components or rely on documentation alone.
- Internationalisation timing — backend payloads currently English-only; per-school locale arrives with the Communication Center sprint.
