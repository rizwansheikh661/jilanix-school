# FRONTEND_ARCHITECTURE

**Stack frozen 2026-06-25. Future changes require a new ADR.**

How the SchoolOS frontend is structured. The implementation contract for the web apps.

Stack: **Next.js (latest stable available when frontend development begins) (App Router) + React + TypeScript + Bootstrap 5.3.8 + React-Bootstrap + Axios + React Hook Form + TanStack Query + Lucide Icons**.

> **Scope.** This doc is the *implementation contract* for the frontend. UX rules (information density, error states, empty states, voice) live in `UI_UX_GUIDELINES.md`. Route-to-permission mapping lives in `ROLES_AND_PERMISSIONS.md`. API contract lives in `API_STANDARDS.md`. This doc is the *how*.
>
> **No code.** Concrete TSX lives in the repo once Phase 1 starts.

---

## 1. Architectural posture

- **Two Next.js apps**, one stack:
  - `apps/frontend/` — tenant-facing (school admin, teachers, parents, students). Sub-domain per tenant.
  - `apps/frontend-admin/` — operator console (Super Admin / platform staff). Internal sub-domain.
  - They share `packages/ui/`, `packages/shared-types/`, `packages/shared-utils/`. They do **not** share routes, auth, or layouts.
- **App Router (RSC)** by default; client components only where interaction or browser APIs require it.
- **Role-aware route groups** inside `frontend` — parent / teacher / student / admin are distinct *information architectures* under one app, gated by role.
- **Tenant-safe by default** — every API call carries the resolved tenant; the app refuses to render tenant data without a confirmed tenant context.
- **Mobile-first, 360px baseline** — every screen designed for phone width first, desktop is a layout enhancement.
- **Accessibility is not a polish step** — React-Bootstrap primitives with WAI-ARIA support + linted a11y rules + every PR run through axe in CI.

---

## Theme & Visual Design

Authoritative source: `FRONTEND_THEME_INTEGRATION.md`.

- **HTML pages converted into reusable React components** — the purchased Bootstrap HTML theme is a visual reference only. Pages are reauthored as one component per logical region; not a 1:1 file port.
- **Bootstrap 5.3.8 is retained** as the CSS framework and grid system. Selected over Tailwind/shadcn because the purchased theme is Bootstrap-based.
- **jQuery is completely removed** during the port — its behaviors are reimplemented in React.
- **CDN JavaScript dependencies are removed** — every dependency must come through the package manager and be auditable.
- **Only required Bootstrap plugins remain** (dropdown, modal, offcanvas, collapse, tooltip, popover) — wired via React-Bootstrap; unused plugins are dropped.
- **ERP-specific pages replace the theme's generic admin pages** — admissions, attendance, fees, examinations, timetable, reports, subscription self-view, and super-admin consoles are designed against the theme's visual language and the backend module contracts.
- **Backend APIs remain the single source of truth** — the theme drives layout and interaction patterns only. All data, validation, permissions, plan-feature gating, and lifecycle rules live behind `/api/v1/...`. The frontend never reproduces business state, validation, or lifecycle rules locally.
- **Detailed port plan, component inventory, removal candidates, and screen-by-screen redesign notes live in `FRONTEND_THEME_INTEGRATION.md`** — keep that file as the single source for theme work to avoid drift. The runtime theming concerns (light/dark mode, per-tenant branding, density, RTL) covered in §9 of this doc compose on top of the ported theme tokens.

---

## 2. Tech inventory

| Concern              | Choice                                        | Reason                                                       |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Framework            | Next.js (latest stable available when frontend development begins) (App Router) | RSC, streaming, file-based routes, mature                    |
| UI library           | React                                         | Component model the App Router is built on                   |
| Language             | TypeScript (strict)                           | Type safety is non-negotiable                                |
| CSS framework        | Bootstrap 5.3.8                               | Pinned. Selected over Tailwind because the purchased theme is Bootstrap-based. |
| Component primitives | React-Bootstrap                               | Idiomatic React bindings for Bootstrap 5.3.8 components; selected over shadcn/ui because the purchased theme is Bootstrap-based. |
| HTTP client          | Axios                                         | Interceptor model fits our auth-refresh + tenant headers. Selected over fetch because the purchased theme is Bootstrap-based and we want a single client across both apps. |
| Forms                | React Hook Form                               | Performant, schema-validated                                 |
| Server state         | TanStack Query                                | Caching, retries, invalidation, suspense integration         |
| Icons                | Lucide Icons                                  | Consistent visual language; tree-shaken                      |
| Auth (cookies/JWT)   | Custom hook + `httpOnly` refresh cookie       | Refresh token never in JS; access token in memory. Hits backend `/api/v1/auth/...` endpoints directly. |
| Data tables          | TanStack Table                                | Headless, virtualization-friendly                            |
| Charts               | Recharts                                      | Sufficient for v1 dashboards                                 |
| Date / time          | `date-fns` + `date-fns-tz`                    | Tree-shakeable, zone-aware                                   |
| Money                | Internal `Money` util on integer paise        | Matches backend; no float drift                              |
| i18n                 | `next-intl`                                   | App Router native; per-tenant locale                         |
| Animation            | Framer Motion (sparingly)                     | Only where motion conveys meaning                            |
| Testing              | Vitest + Testing Library + Playwright         | Unit, component, e2e                                         |
| Lint / format        | ESLint + Prettier + custom rule pack          | a11y, import boundaries, tenant-safety rules                 |
| Bundle analyzer      | `@next/bundle-analyzer`                       | Tracked in CI to prevent regression                          |
| Observability        | Sentry (errors) + web-vitals → backend `/v1/rum` | Real user monitoring                                       |
| Build                | Next.js + Turbopack (dev), webpack (prod v1)  | Stable prod build                                            |

---

## 3. Two apps — split rationale

| Aspect           | `apps/frontend/` (tenant)                    | `apps/frontend-admin/` (operator)                   |
| ---------------- | -------------------------------------------- | --------------------------------------------------- |
| Domain           | `<slug>.schoolos.in`, `app.schoolos.in/<slug>` | `admin.schoolos.in`                                 |
| Audience         | School users (admin / teacher / parent / student) | Internal staff (super admin / support / billing) |
| Auth scope       | `tenant`                                     | `global`                                            |
| Theming          | Per-tenant branding (logo, colors)           | Fixed corporate theme                               |
| Bundle target    | Mobile-first; aggressive size budget         | Desktop-first; less aggressive budget               |
| Routes           | Role-aware tenant routes                     | Cross-tenant operator routes                        |
| Public surfaces  | Login, parent OTP, status page               | Login only                                          |

Splitting the apps means a bug or perf issue in one cannot affect the other; it also lets us ship the operator console at a different cadence and security posture (IP allowlist, hardware key gate).

---

## 4. Repo layout

```
apps/
├── frontend/
│   ├── src/
│   │   ├── app/                       # App Router routes
│   │   ├── components/                # app-specific components
│   │   ├── features/                  # feature-scoped UI (mirrors backend modules)
│   │   ├── hooks/                     # cross-cutting React hooks
│   │   ├── lib/                       # api client, auth, tenancy, flags
│   │   ├── styles/                    # bootstrap overrides + theme tokens
│   │   ├── i18n/                      # locale files
│   │   └── middleware.ts              # tenant resolution at the edge
│   ├── public/
│   ├── next.config.mjs
│   └── bootstrap.scss                 # bootstrap 5.3.8 entry + token overrides
│
├── frontend-admin/
│   └── src/                           # same shape, smaller surface
│
packages/
├── ui/                                # shared primitives (React-Bootstrap-derived)
│   ├── src/
│   │   ├── primitives/                # Button, Input, Dialog, Sheet, Toast, etc.
│   │   ├── patterns/                  # DataTable, FormField, EmptyState, etc.
│   │   ├── icons/                     # Lucide icon registry
│   │   └── tokens/                    # design tokens (TS + Bootstrap SCSS source)
│   └── package.json
├── shared-types/                      # DTOs shared with backend
└── shared-utils/                      # money, date, url helpers
```

`features/` mirrors backend feature modules (`students`, `attendance`, `fees`, etc.). Each holds the routes, components, hooks, and stores for that feature — no cross-feature reach-in.

---

## 5. Route structure

### 5.1 Route resolution at the edge

Tenant resolution happens in `middleware.ts` before any page renders:

1. Read `host` header. If `<slug>.schoolos.in`, set `tenantSlug = slug`.
2. Else if path starts with `/<slug>/...` and `<slug>` matches a known pattern, set `tenantSlug` and rewrite the URL to a route group.
3. Else (no tenant), only `/login`, `/signup`, `/forgot`, and marketing-redirect routes are allowed.
4. The resolved `tenantSlug` is passed to the app via a request header (`x-tenant-slug`) and a server-only cookie.

Tenant resolution is **never** trusted from the client — the server reads the JWT and reconciles. Mismatch → 403.

### 5.2 App Router layout (tenant app)

```
src/app/
├── (marketing)/                       # public, unauth
│   ├── login/
│   │   └── page.tsx
│   ├── login-otp/                     # parent phone-OTP flow
│   ├── forgot-password/
│   ├── accept-invite/[token]/
│   └── layout.tsx                     # marketing chrome
│
├── (auth)/                            # authenticated, role-aware
│   ├── layout.tsx                     # app shell (sidebar, topbar, tenant brand)
│   │
│   ├── admin/                         # school_admin, principal, vice_principal
│   │   ├── layout.tsx                 # admin nav
│   │   ├── dashboard/
│   │   ├── students/
│   │   │   ├── page.tsx               # list
│   │   │   ├── new/page.tsx
│   │   │   ├── import/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # profile
│   │   │       ├── edit/page.tsx
│   │   │       ├── fees/page.tsx
│   │   │       ├── attendance/page.tsx
│   │   │       └── documents/page.tsx
│   │   ├── staff/
│   │   ├── academic/                  # years, classes, sections, subjects
│   │   ├── attendance/
│   │   ├── timetable/
│   │   ├── examinations/
│   │   ├── fees/
│   │   │   ├── structures/
│   │   │   ├── invoices/
│   │   │   ├── receipts/
│   │   │   └── reports/
│   │   ├── communications/
│   │   ├── reports/
│   │   ├── library/   transport/   hostel/   inventory/
│   │   ├── visitors/  medical/    discipline/
│   │   ├── certificates/
│   │   ├── notices/
│   │   ├── audit/
│   │   ├── settings/
│   │   │   ├── school/              # profile, branches, year, holidays
│   │   │   ├── billing/             # plan, invoices, credits, payment methods
│   │   │   ├── users/               # users + roles
│   │   │   ├── feature-flags/
│   │   │   └── integrations/
│   │   └── support/
│   │
│   ├── teacher/                     # teacher portal
│   │   ├── layout.tsx               # teacher-focused nav
│   │   ├── today/                   # primary surface
│   │   ├── classes/[classId]/
│   │   │   ├── attendance/
│   │   │   ├── students/
│   │   │   └── timetable/
│   │   ├── examinations/marks/
│   │   ├── homework/
│   │   ├── messages/
│   │   └── profile/
│   │
│   ├── parent/                      # parent portal — mobile-first
│   │   ├── layout.tsx               # parent nav (bottom tab on mobile)
│   │   ├── home/                    # children + today's highlights
│   │   ├── child/[childId]/
│   │   │   ├── page.tsx             # profile
│   │   │   ├── attendance/
│   │   │   ├── fees/
│   │   │   ├── examinations/
│   │   │   ├── timetable/
│   │   │   ├── homework/
│   │   │   └── documents/
│   │   ├── notices/
│   │   ├── messages/
│   │   ├── pay/                     # payment hub (Razorpay handoff)
│   │   └── profile/
│   │
│   ├── student/                     # student portal — read-mostly
│   │   ├── layout.tsx
│   │   ├── home/
│   │   ├── timetable/
│   │   ├── attendance/
│   │   ├── examinations/
│   │   ├── homework/
│   │   ├── notices/
│   │   └── library/
│   │
│   └── shared/                      # cross-role pages (e.g., notice viewer)
│
├── api/                             # only thin BFF helpers; see §11
│   └── auth/refresh/route.ts        # cookie ↔ access token bridge
│
├── (errors)/
│   ├── 403/page.tsx
│   ├── 404/page.tsx
│   └── 500/page.tsx
│
├── layout.tsx                       # html/body, theme provider, toast root
├── error.tsx                        # global error boundary
├── not-found.tsx
├── loading.tsx                      # default suspense fallback
└── globals.css
```

### 5.3 App Router layout (operator-admin app)

```
src/app/
├── (marketing)/login/
├── (admin)/
│   ├── layout.tsx                   # operator console shell
│   ├── dashboard/                   # fleet KPIs
│   ├── tenants/
│   │   ├── page.tsx                 # list / search across all schools
│   │   └── [id]/
│   │       ├── page.tsx             # tenant overview
│   │       ├── subscription/
│   │       ├── billing/
│   │       ├── feature-flags/
│   │       ├── users/
│   │       ├── audit/
│   │       └── support/
│   ├── plans/
│   ├── billing/                     # platform-side billing across tenants
│   ├── credit-packs/
│   ├── notifications/               # delivery health, provider status, DLT/WABA registry
│   ├── feature-flags/               # global flag registry, lifecycle, drift
│   ├── audit/                       # cross-tenant audit reads (4-eyes for some)
│   ├── approvals/                   # 4-eyes inbox
│   ├── support/
│   └── settings/                    # operator users, MFA, IP allowlist
└── ...
```

### 5.4 Route group rules

- The active **portal** (admin/teacher/parent/student) is determined server-side from the user's roles. If the user is not authorized for the portal in the URL, redirect to their default portal.
- Users with multiple roles see a **portal switcher** in the user menu (e.g., a teacher who is also a parent of a student in the same school).
- Deep links into a portal that the user can't access return 403 with a "switch portal" affordance, never silently redirect.

### 5.5 Server vs client components

- Default to **Server Components**. Pages, lists, profile views, dashboards.
- Client components only when needed: forms with live validation, drag-and-drop, charts, real-time widgets, file uploads, anything with browser APIs.
- A client island is named `*.client.tsx` for grep-ability; the lint rule prevents accidental "use client" leak in shared components.

### 5.6 Data fetching boundary

- Server components fetch from the backend via a typed server-side client (`lib/api.server.ts`, Axios instance) that forwards the auth cookie.
- Client components fetch via TanStack Query against a typed client (`lib/api.client.ts`, Axios instance) that uses access tokens from memory.
- No raw `fetch` or ad-hoc HTTP calls scattered in components — every call goes through the typed Axios clients.

---

## 6. Dashboard structure

Each portal has a **home dashboard** as the first screen after login. The shape is consistent so users learn the pattern once.

### 6.1 Common anatomy

```
┌──────────────────────────────────────────────────────────┐
│  TOPBAR  (logo · breadcrumbs · search · alerts · profile) │
├────────┬─────────────────────────────────────────────────┤
│        │  PAGE HEADER (title · actions)                   │
│ SIDE   ├─────────────────────────────────────────────────┤
│ NAV    │  KPI ROW   (3–6 cards, single number + delta)    │
│ (col)  ├─────────────────────────────────────────────────┤
│        │  PRIMARY WIDGET (the most-used action of role)   │
│        ├─────────────────────────────────────────────────┤
│        │  SECONDARY WIDGETS (2-column on desktop)         │
│        ├─────────────────────────────────────────────────┤
│        │  TIMELINE / ACTIVITY                             │
└────────┴─────────────────────────────────────────────────┘
```

On mobile (< 768px):
- Sidebar collapses to a bottom tab bar (≤5 tabs) or a slide-in drawer.
- KPI row becomes a horizontally scrollable strip.
- Two-column widgets stack.
- Topbar shrinks to logo + alerts + profile.

### 6.2 Widget types

| Type            | Purpose                                  | Constraints                          |
| --------------- | ---------------------------------------- | ------------------------------------ |
| KPI card        | One number + delta + sparkline           | No interaction beyond click-through  |
| List preview    | "Top 5 X" with link to full list         | Empty state always defined           |
| Action card     | Big button + 2-line context              | One-tap to the action                |
| Calendar strip  | Today's items                            | Always tappable to full calendar     |
| Timeline        | Recent activity (audit-derived)          | Server-paginated; "see more"         |
| Chart           | Trend over time                          | A11y: data table fallback            |
| Alert / banner  | Time-boxed warnings (low credits, etc.)  | Dismissible, but reappears on event  |

Widgets are **opt-in** per role; the dashboard layout is data-driven via a `dashboard.config.ts` per portal so widgets can be reordered / hidden via feature flags without code change.

### 6.3 Dashboard composition rules
- Every widget defines its own loading skeleton, error state, and empty state.
- Widgets fetch independently (no waterfalls).
- A widget that fails does **not** break the dashboard — it shows its error card with a retry.
- Widgets observe the same query cache so a refresh on one updates relevant others.

---

## 7. Per-portal UI specs

### 7.1 Super Admin UI (`frontend-admin`)

**Audience:** super_admin, platform_support, platform_billing, platform_engineer, platform_readonly.
**Posture:** information-dense, desktop-first, every action audit-logged, dangerous actions gated by 4-eyes.

Primary surfaces:
- **Fleet dashboard** — total tenants by status, MRR, ARPA, churn, credit-pool drains, provider success rates, error-rate per region. Single screen, single glance.
- **Tenants list** — searchable, filterable (plan, status, region, signup date, last activity). Bulk actions disabled in v1; everything per-tenant.
- **Tenant detail** — overview, subscription, billing, users, feature flags, audit, support. Tab-based; URL is shareable.
- **Plan registry** — CRUD with versioning; price changes never edit running tiers.
- **Feature-flag registry** — lifecycle stages visible (introduced / rolling-out / adopted / cleanup / removed); drift report.
- **Approvals inbox** — pending 4-eyes requests; one-click approve/reject with reason.
- **Notifications health** — fleet-wide DLR, per-provider success, DLT/WABA template approvals.
- **Audit explorer** — cross-tenant audit reads (permission-gated, audit-of-audit).
- **Support inbox** — tenant-raised tickets; impersonation entry point with banner + reason capture.

UI rules:
- **Impersonation banner** is a sticky red bar on top during any tenant-context view.
- **Dangerous actions** (suspend tenant, void invoice) are a two-step modal: typed confirmation + reason; action submits to approvals queue.
- **Read-only mode** for `platform_readonly` and `platform_engineer` — write controls disabled with tooltip.
- **Search-first** ergonomics — a global command palette (⌘K) finds tenants, users, invoices, audit events.
- **Tables-first** for lists — virtualized rows, sticky headers, column filters, server-side sort.

### 7.2 School Admin UI (tenant)

**Audience:** school_admin, principal, vice_principal (branch-scoped), accountant, examination_admin, librarian, etc.
**Posture:** the daily operations cockpit; tablet-first secondary, mobile-tolerant for emergency use.

Primary surfaces:
- **Dashboard** — today's attendance, fees collected MTD, defaulters count, upcoming events, low credit-pool, recent admissions.
- **Students** — list + bulk actions (promote, transfer, archive); CSV import wizard.
- **Staff** — similar shape.
- **Academic setup** — academic year, classes/sections/subjects, holidays, timetable.
- **Attendance** — class-section grid; today's pending sections highlighted.
- **Fees** — structures, invoices, receipts, defaulters, reports. Defaulter list is the most-used screen — make it fast.
- **Examinations** — schedules, marks entry status, report-card publish queue.
- **Communications** — broadcast composer, template library, scheduled sends, credit-pool status.
- **Reports** — saved reports, scheduled deliveries.
- **Settings** — school profile, branches, users, roles, billing, feature-flags-visible-to-tenant, integrations.

UI rules:
- **Branch context switcher** in the topbar for multi-branch tenants — it is part of the request scope (sent as `X-Branch-Id`).
- **Bulk actions** require typed confirmation when affecting > 100 rows.
- **Year-end "promotion" wizard** is a guided multi-step flow with an explicit dry-run preview.
- **Sticky help** — every screen has a "?" that opens contextual help (links to `docs/help/<route>.md`).

### 7.3 Teacher UI (tenant)

**Audience:** teacher, class_teacher.
**Posture:** finish-the-task fast; mobile-friendly because teachers move between rooms.

Primary surfaces:
- **Today** — today's classes, sections to mark attendance for (with progress), pending tasks (homework to grade, marks to enter). This is the home and the most-used screen.
- **Classes** — list of taught classes; tap into a class for attendance, students, timetable.
- **Attendance entry** — large touch targets; one tap per student; section-wide "all present" with override; offline-tolerant queue (Phase 8).
- **Marks entry** — locked by exam window; optimistic locking surfaced if another teacher edits the same paper.
- **Homework** — assign, view submissions, give feedback.
- **Messages** — broadcast to a section, message a parent (DPDP-aware: uses school identity, not personal phone).
- **Profile** — tasks, attendance % of self, payslip (if payroll module).

UI rules:
- **Bottom tab bar** on mobile: Today · Classes · Messages · Profile.
- **One-thumb operation** — primary actions reachable without two hands.
- **"Done" is loud** — successful save shows a check + haptic-style microanimation; failures are clear, not blame-y.

### 7.4 Parent UI (tenant)

**Audience:** parent (often phone-only, low digital literacy assumed).
**Posture:** lowest-friction surface in the system. Phone-first. Big text. One job per screen.

Primary surfaces:
- **Home** — list of children (avatar, name, class), today's highlights per child (attendance status, latest notice, fees pending), pay button if any due.
- **Child detail** — tabs: profile, attendance, fees, exams, timetable, homework, documents. Each tab a single scrollable column.
- **Attendance view** — calendar-style grid; absent days red, half-day amber, present green; tap a day for the period-wise breakdown.
- **Fees** — current dues with amounts; one big "Pay now" button → Razorpay checkout sheet; receipt downloadable + WhatsApp-share button.
- **Exams** — published report cards as cards; tap to view PDF.
- **Notices** — chronological feed; unread badges; multilingual content visible.
- **Messages** — threaded, school as identity; never the teacher's personal contact.
- **Pay** — top-level entry to "pay all dues across children".
- **Profile** — own contact info, language, notification preferences.

UI rules:
- **Phone-OTP login**, no password. One field, one button.
- **Bottom tab bar** on mobile: Home · Notices · Pay · Profile.
- **Language picker** prominent on first run; remembered per device.
- **Offline-tolerant reads** — last-fetched data shown with a "last updated X" indicator.
- **PDF viewer inline** — no force-download for receipts and report cards.
- **Biometric unlock** on subsequent app loads (web app uses WebAuthn where supported; native app native APIs).

### 7.5 Student UI (tenant)

**Audience:** student (typically class 6+; tenants choose).
**Posture:** read-mostly, age-appropriate, no fee/billing surfaces.

Primary surfaces:
- **Home** — today's timetable, pending homework, latest notices.
- **Timetable** — week view + today highlight.
- **Attendance** — own attendance overview, class-rank not shown.
- **Examinations** — upcoming, results, report cards (when published to students; school-configurable).
- **Homework** — assigned, due, submit (file + text).
- **Notices** — chronological.
- **Library** — own loans, holds, return dates (if module enabled).

UI rules:
- **No financial surfaces.** Fees/payments are not in the student app at all.
- **No outbound messaging to teachers/parents** beyond homework submission. Reduces abuse surface.
- **Age-appropriate copy** — friendly but not babyish; iconography supports literacy.
- **Parental control awareness** — content categories obey school's age-tier setting.

---

## 8. Design system

### 8.1 Layers

```
TOKENS         (semantic CSS variables, JSON source-of-truth)
   ↓
PRIMITIVES     (Button, Input, Select, Dialog, Sheet, Toast, ...)
   ↓
PATTERNS       (DataTable, FormField, EmptyState, FileDrop, Stepper, ...)
   ↓
FEATURE UI     (StudentList, FeeInvoiceForm, AttendanceGrid, ...)
   ↓
PAGES          (route-level compositions)
```

Each layer can only consume from the layer above.

### 8.2 Tokens

Tokens are defined in `packages/ui/tokens/` as TypeScript and emitted as CSS variables plus Bootstrap SCSS variable overrides. The Bootstrap 5.3.8 build consumes the SCSS overrides, and component-level utility classes resolve against the CSS variables, so styles resolve against tokens, not raw values.

Token families:
- **Color** — semantic (`--color-bg`, `--color-fg`, `--color-muted`, `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, `--color-border`, `--color-overlay`). No raw color references in features.
- **Typography** — `--font-sans`, `--font-display`, `--text-xs/sm/base/lg/xl/2xl/3xl/4xl`, line-heights, letter-spacing.
- **Spacing** — 4px base; scale `0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24`.
- **Radius** — `--radius-sm/md/lg/xl/full`.
- **Shadow** — `--shadow-sm/md/lg/xl`.
- **Z-index** — explicit named scale (`base, dropdown, sticky, overlay, modal, toast, tooltip`).
- **Motion** — `--duration-fast/base/slow`, `--ease-out/in-out/spring`.
- **Breakpoints** — see §10.

Tokens are **never** edited per feature. New tokens require a design-system PR.

### 8.3 Primitives

Adopted from React-Bootstrap (which wraps the Bootstrap 5.3.8 components and behaviors with React-idiomatic APIs and WAI-ARIA support). The set:
- Button (variants: primary, secondary, ghost, destructive, link)
- IconButton
- Input, Textarea, NumberInput, MoneyInput, PhoneInput (E.164), DatePicker, TimePicker, DateRangePicker
- Select, MultiSelect, Combobox, RadioGroup, Checkbox, Switch
- Dialog, AlertDialog, Sheet (slide-in, used for mobile menus)
- Tabs, Accordion, Disclosure
- Tooltip, Popover, HoverCard, ContextMenu
- Toast (single toast region per app)
- Avatar, Badge, Tag, Pill
- Card, Separator
- Skeleton (per component shape)
- Progress, Spinner

Every primitive ships with: variants, sizes, full a11y (keyboard, focus ring, ARIA), dark-mode tokens, RTL safety.

### 8.4 Patterns

Higher-order compositions:
- **DataTable** — columns DSL, pagination cursor, sticky header, row selection, server sort/filter.
- **FormField** — label + control + helper + error wired via React Hook Form (the canonical form-state library; no Formik / no ad-hoc state).
- **EmptyState** — illustration + title + body + primary action.
- **ErrorState** — title + body + retry + "report this" link with `request_id`.
- **PermissionGate** — conditional render based on the permission resolver.
- **FlagGate** — feature-flag conditional render.
- **AuditTrail** — read-only timeline pulling from `audit_log`.
- **FileDrop** — uploader with progress, retry, virus-scan placeholder.
- **Stepper** — wizard pattern for onboarding, year-end promotion, bulk import.
- **Search** — command palette (⌘K) primitive with adapters per route.
- **PageHeader** — title + breadcrumb + actions; used everywhere.

### 8.5 Iconography

Lucide Icons only. No custom SVGs without a design-system PR. Icons referenced by stable name; tree-shaken automatically.

### 8.6 Voice & copy

UX voice rules in `UI_UX_GUIDELINES.md` are enforced via:
- Centralized strings for primary actions ("Save" / "Cancel" / "Delete" — not "Confirm" / "Discard").
- Empty-state and error-state copy reviewed in design-system PRs.
- Currency always rendered via `Money.format(paise, locale)` — never "Rs. 100.00" by hand.

---

## 9. Theme system

### 9.1 Modes

- **Light** (default), **Dark**.
- Mode is per-device, persisted in `localStorage`, with system preference as initial fallback.
- Theme switch is in the user menu and instantaneous (no flash).

### 9.2 Per-tenant branding

Each tenant configures (in operator console or settings):
- Logo (light + dark variants).
- Primary color (single hex; the system derives the scale).
- Accent color (optional).
- Display name in nav.
- Optional custom domain (deferred per DECISIONS R-006).

The server returns the brand bundle on tenant resolution; the app injects derived CSS variables at the root:

```
[data-tenant-theme]
  --brand-primary: <derived from hex>
  --brand-primary-fg: <auto-contrast>
  --brand-accent: ...
  ... (10-step scale derived via OKLCH)
```

The React-Bootstrap primitives reference `--brand-primary` only via semantic tokens (`--color-primary: var(--brand-primary)`), wired through the Bootstrap 5.3.8 SCSS variable system, so a tenant theme change recolors the entire UI without component edits.

Constraints:
- Contrast is auto-validated (WCAG AA against `--color-bg`); a tenant cannot set a brand color that fails.
- The operator console **never** uses tenant branding — its colors are fixed.

### 9.3 Density modes

Two density modes available at the user level:
- **Comfortable** (default) — generous spacing, larger touch targets.
- **Compact** — denser, useful for school-admin power users on desktop.

Density toggles `--space-*` scaling at the root; primitives respect it.

### 9.4 Right-to-left

All primitives use logical CSS properties (`margin-inline-start`, etc.). RTL languages (Urdu) flip naturally. Verified in CI snapshots.

---

## 10. Responsive strategy

### 10.1 Breakpoints

| Token  | Min width | Typical surface              |
| ------ | --------- | ---------------------------- |
| `xs`   | 0         | small phones (360px target)  |
| `sm`   | 640px     | larger phones                |
| `md`   | 768px     | tablets                      |
| `lg`   | 1024px    | small desktops, large tablets|
| `xl`   | 1280px    | desktops                     |
| `2xl`  | 1536px    | large desktops               |

`xs` is the **design starting point** for tenant-facing screens. Operator console starts at `lg`.

### 10.2 Layout primitives

- **Stack** (vertical) and **Inline** (horizontal) — primary layout primitives; gap-driven, no margin stacking.
- **Grid** — explicit row/col config; breakpoint-aware.
- **Container** — max-width content well; `prose` for text-heavy pages.
- **Sidebar layout** — collapses to drawer on `< md`; bottom tab bar on parent/teacher portals.

### 10.3 Surface-specific rules

| Portal       | Mobile                        | Tablet                  | Desktop                                |
| ------------ | ----------------------------- | ----------------------- | -------------------------------------- |
| Super Admin  | Functional but read-mostly    | Same                    | Primary surface; dense tables          |
| School Admin | Tasks-only; tables paginate   | Full feature parity     | Primary; multi-pane workflows OK       |
| Teacher      | Primary surface; bottom tabs  | Same with side nav      | Same; wider tables                     |
| Parent       | Primary surface; bottom tabs  | Same                    | Same, centered content well            |
| Student      | Primary surface; bottom tabs  | Same                    | Same                                   |

### 10.4 Tables on mobile

Wide tables don't shrink — they transform:
- **Stacked card** view: each row becomes a card; key fields up top; secondary fields collapsed.
- A toggle (table ↔ cards) where both are useful.
- Some tables remain horizontally scrollable (e.g., timetable grid) with a sticky first column.

### 10.5 Forms on mobile

- One field per row.
- Labels above inputs (not floating, not placeholder).
- Native input types (`tel`, `email`, `numeric`) for keyboard.
- Sticky bottom CTA (Save/Continue) on long forms.
- Validation appears inline on blur; submission shows top-of-form summary if multiple errors.

### 10.6 Performance budgets per surface

| Surface        | LCP target | INP target | TBT target | Bundle (initial JS) |
| -------------- | ---------- | ---------- | ---------- | ------------------- |
| Parent home    | < 2.0s     | < 200ms    | < 200ms    | < 150 KB gzip       |
| Teacher today  | < 2.0s     | < 200ms    | < 200ms    | < 200 KB            |
| School admin   | < 2.5s     | < 200ms    | < 250ms    | < 250 KB            |
| Operator console| < 3.0s    | < 200ms    | < 300ms    | < 350 KB            |

CI fails if any budget is exceeded for the corresponding entry route.

---

## 11. State management

### 11.1 Three kinds of state

| Kind            | Where it lives             | Examples                                                |
| --------------- | -------------------------- | ------------------------------------------------------- |
| **Server state**| TanStack Query (over Axios)| Lists, profiles, dashboards — anything fetched          |
| **URL state**   | Route segments + searchParams | Filters, pagination, current entity id, modal-open    |
| **Client state**| React state + Context (scoped per feature) | Multi-step form draft, UI prefs, transient selections   |

Avoid a global Redux-style store. Each feature owns its own React state / Context module; cross-feature sharing goes through TanStack Query cache or the URL.

### 11.2 Server-state rules

- One query key per resource: `['students', { tenantId, filters }]`.
- Mutations invalidate touched queries surgically; no global "refetch all".
- Optimistic updates only where the server confirms a stable shape (e.g., toggling attendance status).
- Suspense + ErrorBoundary at the route level for top-of-page fetches; component-level for side widgets.
- `staleTime` defaults: 30s for lists, 5m for reference data (academic years, plans).
- Background refetch on window focus only for "freshness-critical" data (today's attendance, fees pending).

### 11.3 URL state rules

- Lists: `?cursor&filter[*]&sort` round-trip via the URL — sharable, back-button-safe.
- Modals where deep-linking matters (e.g., `?edit=<id>`) live in URL; ephemeral modals do not.

### 11.4 Forms

- React Hook Form with a schema-validation resolver (Zod or Yup) decided per form.
- Schemas shared with backend via `packages/shared-types/` whenever the DTO is identical.
- Drafts (e.g., long admission form) are stored in `localStorage` keyed by `(userId, formId)`; cleared on submit.
- Submission errors map server `error_code` → field-level errors via React Hook Form's `setError` (see `API_STANDARDS.md`).

---

## 12. Auth on the frontend

### 12.1 Token handling

- **Access token** — held in memory inside a custom React auth hook + Context. Never in `localStorage`.
- **Refresh token** — `httpOnly`, `Secure`, `SameSite=Lax` cookie set by `/api/v1/auth/login`.
- A thin Next.js route (`app/api/auth/refresh`) bridges browser cookie ↔ access token: client calls it, server forwards the cookie to backend `/api/v1/auth/refresh`, response sets a new cookie + returns the access token.
- On 401 from any Axios call, an interceptor triggers a single refresh and retries; concurrent 401s share one refresh promise.

No third-party session library (NextAuth / Auth.js is **not** used) — the backend owns auth at `/api/v1/auth/...` and the frontend integrates via the custom hook + httpOnly cookie pattern above.

### 12.2 Login flows (UI)

- **Password** — email/phone + password + optional MFA challenge.
- **OTP (parent)** — phone → "Send OTP" → 6-digit input + resend timer.
- **Magic link / invite** — first-load token-bearing URL → set credentials.
- **WebAuthn (super_admin)** — passkey prompt.

Failures show inline errors with stable copy. Lockout shows time-remaining.

### 12.3 Logout

- Clears in-memory access token, calls `/v1/auth/logout` (revokes refresh token + session), clears local form drafts.

### 12.4 Session expiry UX

- 5 minutes before access-token expiry, a silent refresh runs.
- If refresh fails, a non-blocking dialog appears: "Your session is about to end — continue?"
- On hard expiry, user is redirected to login with a "return to" param.

---

## 13. Permissions & feature flags on the client

### 13.1 Permission gating

- The auth-bootstrap response includes the user's resolved `permissions: string[]` for the current session.
- `<PermissionGate require="students.write">…</PermissionGate>` hides UI affordances.
- Server still authoritatively enforces — UI gating is for ergonomics only, never security.

### 13.2 Feature-flag gating

- Resolved flags arrive at bootstrap; updates pushed via SSE on the `tenant.flags.changed` event (Phase 5+) or via TanStack Query refetch.
- `<FlagGate flag="module.fees">…</FlagGate>` hides modules the tenant doesn't have.
- Routes for disabled modules return a `module_not_enabled` page with a soft upsell where allowed.

### 13.3 Branch scope

- Multi-branch tenants pick a branch via the topbar selector.
- Branch context is sent as `X-Branch-Id` and stored in URL (so deep links carry it).

---

## 14. Internationalization

### 14.1 Languages (v1)

- `en-IN` (default), `hi-IN`. v2 adds `ta-IN`, `te-IN`, `kn-IN`, `mr-IN`, `bn-IN`, `gu-IN`, `pa-IN`, `ur-IN`.
- Locale is **tenant-default + user-override + content-language**. Notification templates have their own locale set.

### 14.2 Mechanics

- `next-intl` with namespace files per feature.
- Server components inject the active locale; client components use the `useTranslations` hook.
- Numbers, currency, dates always via `Intl.NumberFormat`/`Intl.DateTimeFormat` with the active locale.
- Strings are extracted, translated, reviewed; missing translations fall back to `en-IN` and emit a warning in dev.

### 14.3 Multilingual content

- Notice content can be authored multilingually; UI shows the user's preferred locale with a "View in <other>" toggle.
- Avoid concatenated strings; ICU MessageFormat for plurals/genders.

---

## 15. Accessibility

- WCAG 2.1 AA target.
- All interactive elements keyboard-reachable, visible focus ring, ESC closes overlays.
- Forms: every input has a label; errors associated via `aria-describedby`.
- Color is never the sole carrier of meaning (icons + text accompany).
- Live regions announce async results (toast region `aria-live="polite"`, errors `assertive`).
- Tables: `<th scope>` set; complex tables paired with `<caption>` and summaries.
- Modals: focus trapped, restored on close, body scroll locked.
- Reduced motion respected (`prefers-reduced-motion`).
- A11y CI: axe-core smoke run on key routes per PR; failures block.

---

## 16. Performance practices

- **RSC + streaming** — fetch and render server-side wherever possible; stream to TTFB.
- **Code-split per route** by Next.js default.
- **Dynamic imports** for heavy client-only components (charts, rich editors, PDF viewer).
- **Image optimization** via `next/image`; AVIF + WebP fallbacks; explicit sizes.
- **Font loading** via `next/font` with preload; no FOIT.
- **Prefetch** anchors that appear in the viewport; opt-out for low-bandwidth heuristics.
- **Memoization** with `useMemo`/`useCallback` only where measured to help.
- **Virtualized lists** (TanStack Virtual) for > 200 rows.
- **Debounced search inputs**; server-side filter.
- **Bundle budgets enforced in CI** (§10.6).

---

## 17. Error handling

- **Route-level `error.tsx`** for each segment renders a friendly error with `request_id`, retry, and "report" link.
- **Component-level error boundaries** on widgets so dashboard tiles fail in isolation.
- **404** handled per segment (e.g., `students/[id]/not-found.tsx` with a "back to list" affordance).
- **Network offline** detected — read views show cached data with "you're offline" indicator; write actions queue (Phase 8) or block with explicit messaging.
- **Form errors** → field mapping; cross-field errors in a banner.
- **Server errors with `error_code`** → user-readable copy from a centralized map; technical details available via "details" affordance for support.

---

## 18. Observability on the client

- **Sentry** for uncaught errors and unhandled promise rejections; `release` and `request_id` attached.
- **Web vitals** (LCP, INP, CLS, TTFB) sent to backend `/v1/rum` with route + tenant + role labels (no PII).
- **Custom events** for product analytics (per `analytics_events`): page_view, feature_used, form_submitted, payment_initiated. PII-free.

---

## 19. Testing strategy

| Layer        | Tools                          | What                                                      |
| ------------ | ------------------------------ | --------------------------------------------------------- |
| Unit         | Vitest                         | Pure utils, hooks, reducers                               |
| Component    | Vitest + Testing Library       | Primitives + patterns; a11y queries by role               |
| Visual       | Storybook + Chromatic (or local snapshots) | Catches visual regressions                       |
| Integration  | Testing Library + MSW          | A page renders + behaves with mocked API                  |
| End-to-end   | Playwright                     | Critical user journeys per portal                         |
| A11y         | axe-core in Playwright + Vitest| WCAG checks on key routes                                 |
| Performance  | Lighthouse CI on key routes    | Fail on budget breach                                     |

Per-portal e2e baseline:
- Parent: login (OTP) → see child → pay fees (Razorpay test) → receipt.
- Teacher: login → today → mark attendance → save.
- School admin: login → defaulters list → send reminder.
- Operator: login → tenant list → tenant detail → toggle flag.

---

## 20. Build, deploy, environments

- **Three environments**: `dev`, `staging`, `production`.
- **PR previews** for tenant app on a staging subdomain.
- **Tenant theme bundles** are computed at request time (server) — no per-tenant build artifacts.
- **CDN** for static assets; SSR responses served from the edge close to ap-south-1.
- **Source maps** uploaded to Sentry on deploy; not served publicly.
- **Feature flag for new UI** lets us roll back without a redeploy.

---

## 21. Boundaries the lint enforces

- `features/*` cannot import another `features/*` directly — only via its public hook/service module.
- `components/*` cannot import from `features/*`.
- `packages/ui/*` cannot import from anything else (it's the leaf).
- `packages/ui/*` cannot use `next/*` APIs (kept framework-agnostic).
- No raw color hex outside `tokens/`.
- No raw currency or date formatting outside `lib/format/`.
- No raw `axios`/`fetch()` calls outside `lib/api*` (the typed Axios clients).
- No `localStorage`/`sessionStorage` outside `lib/storage/`.

---

## 22. What is intentionally **not** in this doc

- Concrete TSX components.
- Bootstrap 5.3.8 SCSS override values.
- Storybook stories.
- Per-screen wireframes (live in Figma; embedded in module deep-dive docs as needed).
- Native React Native architecture (Phase 8 — separate doc).

---

## 23. Open questions (linked to DECISIONS)

- **R-006** — Bring-your-own custom domain (`portal.greenwood.edu.in`) — frontend supports it via the same theme bundle resolution; SSL automation TBD.
- **D-008** — React Native parent app in Phase 8 — design system tokens portable; primitives need RN counterparts.
- **D-022** — WebAuthn / passkeys evaluation — frontend ready; rolled out for super_admin first.
- **R-003** — Public SLA — once defined, surfaces in the user menu and the operator console as a tile.

These are tracked in `DECISIONS.md`; this doc updates as each resolves.
