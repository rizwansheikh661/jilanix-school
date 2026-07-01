# Frontend Sprint Plan

> **Status:** Sprint-level planning. No code.
> **Format per sprint:** Objectives · Modules covered · Expected deliverables · Dependencies · Testing scope · Completion criteria.
> **Companion:** `FRONTEND_IMPLEMENTATION_PLAN.md` (phases & dependency rules).

---

## Sprint F1 — Scaffolding & Design System

**Objectives**
- Stand up the Next.js + TypeScript app.
- Establish SCSS partial layout, design tokens, Bootstrap overrides, dark-mode plumbing.
- Build foundational layout shell: AppHeader, AppSidebar, Footer, route groups for all 5 portals.

**Modules covered**
- None functional (foundation only).

**Deliverables**
- `apps/web` Next.js project with App Router, strict TypeScript, ESLint + Prettier.
- SCSS scaffolding (`_tokens.scss`, `_bootstrap-overrides.scss`, `_layout.scss`).
- Lucide Icons wired; Nunito font self-hosted via `next/font`.
- `<ThemeProvider>` (light/dark via `data-theme`).
- `<AppShell>`, `<AppHeader>`, `<AppSidebar>` foundation components — RBAC-aware skeletons (data later).
- Route groups: `(auth)`, `(platform)`, `(school)`, `(teacher)`, `(student)`, `(parent)`.
- Empty dashboard placeholder per portal.
- Sentry / observability scaffolding.

**Dependencies**
- Phase 0 planning documents approved.

**Testing scope**
- Vitest setup; one passing smoke test.
- Playwright config; one passing navigation test.

**Completion criteria**
- `pnpm dev` boots; navigating to each portal's `/dashboard` renders the empty shell with dark/light toggle working.
- Lighthouse A11y ≥ 90 on the empty dashboard.

---

## Sprint F2 — Authentication, RBAC, Feature Flags, Notifications Preferences

**Objectives**
- End-to-end auth flow.
- RBAC provider + permission gating helpers.
- Feature-flag provider.
- Notification preferences settings page (mine).

**Modules covered**
- Authentication & Identity, RBAC, Notification Foundation (preferences only).

**Deliverables**
- Axios instance + interceptors (`Authorization`, `X-Trace-Id`, refresh-on-401, error envelope).
- `(auth)` screens: `/login`, `/forgot-password`, `/reset-password`, `/change-password`.
- `<RBACProvider>` consuming `/auth/me/permissions`.
- `<PermissionGate>`, `<FeatureFlagBoundary>`.
- `<NotificationDrawer>` (header bell).
- `/settings/notifications` page (channel switches, quiet hours, emergency override).
- AppHeader shows real user; AppSidebar items filter by permission.

**Dependencies**
- F1.

**Testing scope**
- Vitest: token storage, refresh interceptor, RBAC provider.
- MSW handlers for auth endpoints.
- Playwright: login flow per portal.

**Completion criteria**
- Login → dashboard works for a seeded school admin user.
- Password reset email link lands at `/reset-password?token=...` and completes activation.
- Sidebar menu items hide when permission is absent.

---

## Sprint F3 — Foundational Components & Tables

**Objectives**
- Build the shared component library (Cards, Tables, Forms, Modals, Toasts, Pagination).
- Establish `<IfMatchForm>`, `<CursorPaginator>`, `<ErrorEnvelopeToast>`, `<EmptyState>`, `<Skeleton>`.

**Modules covered**
- None functional.

**Deliverables**
- `components/foundation/` populated per `COMPONENT_INVENTORY.md` §2–§5.
- React Hook Form + Zod conventions documented in `docs/frontend/`.
- TanStack Query client configured; query-key conventions.
- Form patterns: validation messages, optimistic concurrency conflict UX.
- Toast container mounted in root layout.
- Storybook (optional) with one entry per foundational component.

**Dependencies**
- F1, F2.

**Testing scope**
- Vitest: each foundational component renders, handles loading / empty / error states.
- Visual checks (manual or Storybook).

**Completion criteria**
- A demo page composes a list + cursor pagination + form + modal end-to-end using only foundational components.

---

## Sprint F4 — School, Branches, Academic Setup (SchoolAdmin)

**Objectives**
- Wire the SchoolAdmin portal's academic structure: school profile, branches, academic years, terms, classes, sections, subjects, departments.

**Modules covered**
- Organization & Branch, School Management, Academic, Staff (departments only).

**Deliverables**
- `/settings/school`, `/branches`, `/academic/years`, `/academic/terms`, `/academic/classes`, `/academic/sections`, `/academic/subjects`, `/departments`.
- List + detail + create/edit forms per entity.
- All PATCH forms use `<IfMatchForm>`.

**Dependencies**
- F1–F3.

**Testing scope**
- Vitest per page (list rendering, form submission).
- MSW for the 7 entity APIs.
- Playwright: create year → create term → create class → create section → create subject (happy path).

**Completion criteria**
- A school admin can configure a new academic year and have classes / sections / subjects ready to receive students.

---

## Sprint F5 — Students, Parents, Staff (SchoolAdmin)

**Objectives**
- Manage people: students, parents, staff (incl. teachers).
- Invitations (Sprint 17 parent flow + Sprint 18 student flow) wired.

**Modules covered**
- Student, Parent, Staff.

**Deliverables**
- `/students` (list/grid toggle), `/students/[id]`, `/students/new`, `/students/promotion`.
- `/parents`, `/parents/[id]`, `/parents/new`.
- `/teachers`, `/teachers/[id]`, `/teachers/new`.
- `/staff`, `/staff/[id]`.
- Invite buttons for parent and student that trigger `POST /parents/:id/users` and `POST /students/:id/users`.
- Suspend / reactivate / archive actions per invite-managed user.

**Dependencies**
- F4.

**Testing scope**
- Vitest: list filters, grid/table toggle, invite action.
- MSW: students, parents, staff endpoints.
- Playwright: add student → invite parent → check `StudentUser` / `ParentUser` status changes via API stub.

**Completion criteria**
- A school admin can onboard a class of students, link parents, and dispatch invitation emails (outbox-visible in dev).

---

## Sprint F6 — Admissions (SchoolAdmin)

**Objectives**
- Admission application intake + conversion to enrolled student.

**Modules covered**
- Admission.

**Deliverables**
- `/admissions`, `/admissions/new`, `/admissions/[id]`, convert-to-student action.
- File uploads (documents) via `react-dropzone` against FileStorageService pre-signed URLs.

**Dependencies**
- F5.

**Testing scope**
- Vitest: application form, file upload, conversion action.
- Playwright: full admission → conversion flow.

**Completion criteria**
- A new application can be submitted, reviewed, and converted to a Student row.

---

## Sprint F7 — Attendance & Timetable (SchoolAdmin + Teacher)

**Objectives**
- Mark-attendance screen and timetable editor.

**Modules covered**
- Attendance, Timetable.

**Deliverables**
- SchoolAdmin: `/attendance/mark`, `/attendance`, `/timetable`, `/timetable/class/[id]`.
- Teacher portal slice: `/me/classes`, `/me/timetable`, mark attendance per class session.
- Calendar widget via `@fullcalendar/react` for timetable.

**Dependencies**
- F4, F5.

**Testing scope**
- Vitest: attendance grid, bulk mark.
- Playwright: teacher marks attendance, school admin views aggregate.

**Completion criteria**
- A teacher can mark a session; a school admin sees the resulting summary.

---

## Sprint F8 — Fees (School Fees, charged to parents)

**Objectives**
- Fee structure setup + collection + invoices.
- Razorpay-backed online payment + manual recording.

**Modules covered**
- Fees & Payments + Hybrid Fee Collection.

**Deliverables**
- `/fees/groups`, `/fees/types`, `/fees/master`, `/fees/collections`, `/fees/invoices`.
- Invoice detail page with pay button (Razorpay) and manual-record form (UPI/Bank/Cash/Cheque/Card).
- Parent-portal preview: list of children's invoices.

**Dependencies**
- F5.

**Testing scope**
- Vitest: fee form, invoice render.
- MSW: fees + payments endpoints.
- Playwright: create fee → invoice generated → record payment (manual stub).

**Completion criteria**
- A fee can be defined, an invoice raised, and a payment recorded — fully separate from SaaS Billing screens (visual + route-level separation enforced).

---

## Sprint F9 — Examination & Academic Content

**Objectives**
- Exam schedule + grade entry + report cards.
- Homework / assignments / syllabus.

**Modules covered**
- Examination, Academic Content.

**Deliverables**
- `/exams`, `/exams/[id]`, `/exams/report-cards`.
- `/homework`, `/homework/new`, `/assignments`, `/syllabus`.
- Teacher portal: `/me/homework`, `/me/homework/new`, `/me/exams/[id]/results`.

**Dependencies**
- F5, F7.

**Testing scope**
- Vitest: grade entry, homework form.
- Playwright: teacher creates homework → student/parent dashboard (placeholder) shows it.

**Completion criteria**
- An exam can be scheduled, grades entered, report cards generated; homework assigned by teachers.

---

## Sprint F10 — Communication, Events, Reporting Foundation

**Objectives**
- Communication Center composer + campaigns list.
- Events & calendar.
- Reports hub + import/export job UIs.

**Modules covered**
- Communication Center, Events & Activities, Reporting Foundation.

**Deliverables**
- `/communication/compose`, `/communication/campaigns`, `/communication/templates`.
- `/events`, `/events/[id]`, `/calendar`.
- `/reports`, `/reports/students`, `/reports/finance`, `/reports/attendance`, `/reports/classes`.
- `/reports/imports`, `/reports/exports`, `/reports/bulk`.
- Notification event catalog read-only viewer.

**Dependencies**
- F2 (notification preferences), F5.

**Testing scope**
- Vitest: composer, recipient selector, campaign list.
- Playwright: send a campaign → check outbox queue.

**Completion criteria**
- A school admin can compose and send a notification campaign; events appear on the calendar; reports can be exported as jobs.

---

## Sprint F11 — Teacher Portal Self-Service

**Objectives**
- Round out the Teacher portal (the slices from F7 + F9 + new bits).

**Modules covered**
- Self-service surfaces for staff/teacher.

**Deliverables**
- Teacher dashboard polished (today's timetable, pending tasks, recent attendance).
- `/me/profile`, `/me/preferences`, `/me/classes/[id]` (student roster + attendance + homework).

**Dependencies**
- F7, F9.

**Testing scope**
- Playwright: full teacher day-in-the-life.

**Completion criteria**
- A teacher can log in, see today's schedule, mark attendance for each class, assign homework, and update preferences.

---

## Sprint F12 — Parent Portal

**Objectives**
- Build the Parent portal end-to-end.

**Modules covered**
- Parent self-service.

**Deliverables**
- `/dashboard` (children list, fee balance summary, recent notifications).
- `/me/children`, `/me/children/[studentId]`, `/me/children/[studentId]/fees`.
- Pay-invoice flow (Razorpay) inline.
- `/me/profile`, `/me/preferences`.
- Mobile-first audit (375px breakpoint).

**Dependencies**
- F5 (parent invitation), F8 (fees).

**Testing scope**
- Vitest: child switcher, invoice list.
- Playwright: parent pays a fee invoice on mobile viewport.

**Completion criteria**
- A parent can log in via invite, see their child(ren), and pay a fee invoice on mobile.

---

## Sprint F13 — Student Portal

**Objectives**
- Build the Student portal — limited surface per Sprint 18 plan.

**Modules covered**
- Student self-service (profile + placement + preferences only).

**Deliverables**
- `/dashboard` (welcome + announcements).
- `/me/profile`, `/me/academic-year`, `/me/class`, `/me/section`, `/me/preferences`.
- Activation via existing `/reset-password?token=...` flow.

**Dependencies**
- F5 (student invitation).

**Testing scope**
- Vitest: profile page, preferences PATCH.
- Playwright: invite-activate-login flow.

**Completion criteria**
- A student can activate from email, log in, view their placement, and toggle a notification channel.

---

## Sprint F14 — Platform Portal & Subscription

**Objectives**
- Build the operator portal: tenant schools, provisioning wizard, subscription views.

**Modules covered**
- Super Admin + Provisioning, SaaS Subscription.

**Deliverables**
- `/platform/dashboard`, `/platform/schools`, `/platform/schools/[id]`, `/platform/schools/new` (provisioning wizard).
- `/platform/plans`, `/platform/schools/[id]/subscription`, subscription history tab.
- `/platform/flags`, `/platform/outbox`, `/platform/jobs`, `/platform/audit` (read-only).
- `<TenantSwitcher>` in platform header.

**Dependencies**
- F1–F3.

**Testing scope**
- Vitest: provisioning wizard steps.
- Playwright: provision a school → verify subscription appears.

**Completion criteria**
- An operator can provision a new school and the school admin can subsequently log in.

---

## Sprint F15 — SaaS Billing Portal

**Objectives**
- Build SaaS Billing screens (platform-side operator view + tenant-side self-view).

**Modules covered**
- SaaS Billing Foundation.

**Deliverables**
- Platform: `/platform/billing/accounts`, `/platform/billing/invoices`, `/platform/billing/invoices/[id]`, manual-payment modal, refund modal, credit notes, adjustments, Razorpay configuration, billing audit.
- SchoolAdmin self: `/settings/subscription`, `/settings/billing/invoices`, invoice pay flow.
- Strict separation from School Fees verified at route + component level.

**Dependencies**
- F14.

**Testing scope**
- Vitest: invoice render, manual payment form.
- MSW: billing endpoints.
- Playwright: operator records a manual payment; tenant pays an invoice via Razorpay stub.

**Completion criteria**
- Operator can manage tenant invoicing; tenant can view and pay their own invoices. No accidental cross-link to fees module.

---

## Sprint F16 — Hardening: A11y, Performance, E2E, Polish

**Objectives**
- Cross-cutting audits and fixes before declaring v1.

**Modules covered**
- All.

**Deliverables**
- Accessibility audit per portal; fix to WCAG 2.1 AA.
- Lighthouse audits per dashboard; tune bundle size, image loading, font loading.
- Visual regression baseline (Playwright screenshots on design-system page).
- Comprehensive Playwright e2e suite per portal.
- Documentation pass: README updates, OpenAPI cross-references, support runbook for trace-id lookup.
- Vendor branding strip-check: confirm no theme vendor name or domain leaks into bundles.

**Dependencies**
- F1–F15.

**Testing scope**
- Playwright suite green on Chromium and WebKit.
- Vitest coverage thresholds met.
- Lighthouse CI thresholds met.

**Completion criteria**
- All acceptance criteria from `FRONTEND_IMPLEMENTATION_PLAN.md` §7 are met.
- Frontend v1 is shippable.

---

## Sprint-count summary

| # | Sprint | Phase |
|---|---|---|
| F1 | Scaffolding & Design System | 1 |
| F2 | Auth + RBAC + Feature Flags + Notification Prefs | 1 |
| F3 | Foundational Components & Tables | 1 |
| F4 | School / Branches / Academic Setup | 2 |
| F5 | Students / Parents / Staff | 2 |
| F6 | Admissions | 2 |
| F7 | Attendance & Timetable | 2 |
| F8 | Fees | 3 |
| F9 | Examination & Academic Content | 3 |
| F10 | Communication / Events / Reporting | 3 |
| F11 | Teacher Portal | 4 |
| F12 | Parent Portal | 4 |
| F13 | Student Portal | 4 |
| F14 | Platform Portal & Subscription | 5 |
| F15 | SaaS Billing | 5 |
| F16 | Hardening | 6 |

**Total: 16 sprints across 6 phases.** Phase 0 (planning) is complete with this document set.

---

## Stop

This sprint plan is planning only. Implementation begins with Sprint F1 — and only after the Phase 0 planning set is approved.
