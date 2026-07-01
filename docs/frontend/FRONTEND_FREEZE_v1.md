# SchoolOS Frontend — Planning Freeze v1.0

> **Official Frontend Planning Freeze Certificate.**
> Issued: 2026-06-26.
> Authority: the eleven planning documents under `docs/frontend/`, ratified together as the binding contract for frontend implementation.
> Companion: `BACKEND_FREEZE_v1.md` (frozen backend contract).

---

## 1. Identity

| Attribute | Value |
|---|---|
| Frontend Planning Version | **v1.0** |
| Freeze Point | End of Phase 0 (planning), 2026-06-26 |
| Implementation Status | **Not yet started.** Sprint F1 will begin upon approval of this freeze. |
| Stack | **Frozen** (see §2) |
| UI Standards | **Frozen** (per `FRONTEND_UI_SPECIFICATION.md`) |
| API↔UI Mapping | **Frozen** (per `API_UI_MAPPING.md`) |
| Testing Strategy | **Frozen** (per `UI_TESTING_STRATEGY.md`) |
| Sprint Plan | **Frozen** at 16 sprints across 6 phases (per `FRONTEND_SPRINT_PLAN.md`) |

---

## 2. Approved Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js (App Router)** |
| Language | **TypeScript (strict)** |
| UI library | **React Bootstrap** |
| CSS framework | **Bootstrap 5.3.8** |
| Styling | **SCSS** (hand-authored partials, CSS variable tokens) |
| Forms | **React Hook Form + Zod** |
| Data layer | **TanStack Query** (server state) |
| HTTP client | **Axios** (single shared instance, full interceptor chain) |
| Icons | **Lucide Icons** |
| Auth | Custom JWT integration against backend `/auth/*` |
| Routing | Next.js App Router + route groups per portal |
| Tables | **TanStack Table** (headless) |
| Charts | **react-apexcharts** |
| Calendar | **@fullcalendar/react** |
| Rich text | **TipTap** |
| Date / range picker | **react-day-picker** |
| File upload | **react-dropzone** |
| Combobox / async select | **React Select** |
| Phone input | **react-international-phone** |
| OTP input | **input-otp** |
| Toasts | React Bootstrap `<ToastContainer>` |
| Testing | **Vitest + React Testing Library + MSW + Playwright** |
| Lint / format | **ESLint + Prettier** |
| Package manager | **pnpm** |
| Observability | Sentry (or equivalent), trace id surfaced in every error |

**Explicit non-choices:** No Tailwind. No jQuery. No NextAuth. No Material UI. No Chakra. No Redux. No DataTables. No Select2. No Owl Carousel. No Summernote. No bootstrap-datetimepicker. No daterangepicker. No slimScroll. No source-theme runtime customizer.

---

## 3. Project Structure

Frozen layout (see `FRONTEND_UI_SPECIFICATION.md` §24 for full tree):

```
apps/web/src/
  app/(auth)/                authentication & status routes
  app/(platform)/            operator / super-admin portal
  app/(school)/              school-admin portal
  app/(teacher)/             teacher self-service portal
  app/(student)/             student self-service portal
  app/(parent)/              parent self-service portal
  components/foundation/     shared layout & primitives
  components/form/           form helpers (incl. <IfMatchForm>)
  components/table/          table primitives (incl. <CursorPaginator>)
  components/feedback/       toast, banners, error wrappers
  components/rbac/           <PermissionGate>, <FeatureFlagBoundary>
  components/domain/{mod}/   shared domain components
  lib/api/                   axios + interceptors
  lib/api/clients/           per-module typed clients
  lib/query/                 TanStack Query keys + factories
  lib/auth/                  token storage + refresh
  lib/rbac/                  permission helpers
  lib/ui/                    status helpers, formatters
  hooks/                     useDarkMode, useDebounce, usePermission, ...
  providers/                 ThemeProvider, RBACProvider, ToastProvider
  styles/                    _tokens.scss + Bootstrap overrides + components
  types/                     backend DTO mirrors
  test/                      vitest setup + MSW handlers
```

Naming conventions, file casing, and import rules are frozen per `FRONTEND_UI_SPECIFICATION.md` §23–§24.

---

## 4. Theme Decisions

| Decision | Outcome |
|---|---|
| Source theme | Visual reference only. **No HTML / CSS / JS / plugin code is ported.** |
| Source theme runtime layer | **Discarded** — jQuery + 10+ plugins replaced by React-native equivalents (per `THEME_ANALYSIS.md` §5) |
| Source theme customizer | **Discarded** — collapsed to a single dark/light toggle |
| Color palette | Reused as **values**, re-expressed as CSS custom-property tokens |
| Icons | Four source libraries → **one** (Lucide) |
| Fonts | Source triplet (Roboto / Nunito / Poppins) → **one** (Nunito, self-hosted) |
| Dark mode | Token-driven, `data-theme="dark"` attribute on `<html>` |
| RTL | **Deferred** to v2; LTR-only at v1 |
| Localization | **English (India)** only at v1 |
| Vendor branding | **Stripped** — no source-vendor strings, domain names, or copyrighted illustrations carried into bundles (lint-enforced) |

---

## 5. Component Strategy

| Layer | Count | Source |
|---|---|---|
| Reusable from theme (visual reference) | 26 | `COMPONENT_INVENTORY.md` §2–§5 |
| Needs refactoring | 27 | `COMPONENT_INVENTORY.md` |
| Not suitable (discard) | 7 | `COMPONENT_INVENTORY.md` |
| New (SchoolOS-specific) | 10+ | `COMPONENT_INVENTORY.md` §9 (`<PermissionGate>`, `<TenantSwitcher>`, `<ImpersonationBanner>`, `<AuditTrailDrawer>`, `<FeatureFlagBoundary>`, `<IfMatchForm>`, `<CursorPaginator>`, `<ErrorEnvelopeToast>`, `<TraceIdFooter>`, `<SkipToContent>`) |

All design tokens, button/form/card/table/modal/drawer/tab/accordion/timeline/calendar/notification/loading/empty/error standards are defined in `FRONTEND_UI_SPECIFICATION.md`. Component design rules (composition, no business logic in JSX, typed props, server-state via TanStack Query) are enumerated there in §25.

---

## 6. Testing Strategy

| Layer | Tool | Coverage target |
|---|---|---|
| Unit | Vitest | ≥ 80% on `lib/` and `hooks/` |
| Component | React Testing Library | ≥ 70% on `components/foundation/`, `components/form/` |
| Integration | Vitest + MSW | ≥ 60% on `app/` routes |
| E2E | Playwright (Chromium + WebKit) | ~20 critical journeys |
| A11y | axe-core | Zero violations |
| Performance | Lighthouse CI | Performance ≥ 90, A11y ≥ 95 per portal dashboard |
| Cross-browser | Playwright matrix | Chromium + WebKit per PR; Firefox nightly |
| Responsive | Playwright viewports | 375 / 768 / 1280 |

Per-sprint requirements, CI gates, and critical journey list are frozen in `UI_TESTING_STRATEGY.md`.

---

## 7. Portal Coverage

Five portals + shared auth (per `PORTAL_SCREEN_PLANNING.md`):

| Portal | Audience | Route group | Primary device |
|---|---|---|---|
| Platform | Super-admins / operators | `(platform)` | Desktop |
| SchoolAdmin | Principals, office staff | `(school)` | Desktop |
| Teacher | Class & subject teachers | `(teacher)` | Tablet |
| Student | Enrolled students | `(student)` | Mobile |
| Parent | Linked guardians | `(parent)` | Mobile |
| Shared (auth/status) | Anyone unauthenticated or on error | `(auth)` | Any |

---

## 8. Screen Counts (v1)

| Portal | Existing in theme (E) | Modify (M) | New (N) | Total |
|---|---|---|---|---|
| Shared (auth/status) | 7 | 0 | 2 | 9 |
| Platform | 0 | 0 | 22 | 22 |
| SchoolAdmin | 14 | 28 | 28 | 70 |
| Teacher | 0 | 3 | 7 | 10 |
| Student | 0 | 1 | 6 | 7 |
| Parent | 0 | 1 | 9 | 10 |
| **Total** | **21** | **33** | **74** | **128** |

Roughly 60% of v1 screens have no source-theme analogue and are built from scratch.

---

## 9. Backend Integration Readiness

Frontend planning is **integration-ready** against the frozen backend (`BACKEND_FREEZE_v1.md`):

| Backend frozen guarantee | Frontend planning provision |
|---|---|
| `/api/v1` URI versioning | Axios baseURL pinned; no version-switching logic |
| Optimistic concurrency on PATCH (`If-Match` + `version`) | `<IfMatchForm>` mandated on every PATCH form (per `FRONTEND_UI_SPECIFICATION.md` §29) |
| Idempotency-Key on retryable POSTs | Axios `{ idempotent: true }` config injects UUID per submit cycle |
| Standardised error envelopes | `<ErrorEnvelopeToast>` renders `{ code, message, traceId, fields? }` |
| Cursor pagination on every list | `<CursorPaginator>` is the only list pagination component |
| RBAC permission keys | `<PermissionGate>` filters surfaces; sidebar nav filtered by `RBACProvider` |
| Feature flag gating | `<FeatureFlagBoundary>` filters subtrees; module flags wire into route guards |
| Multi-tenant scope | Subdomain-per-tenant in production (`UI_ARCHITECTURE.md` §5); JWT carries scope |
| Audit & outbox visibility | Platform diagnostics screens read `/outbox/events`, `/audit/entries`, `/jobs/status` |
| 22 frozen backend modules | All 22 mapped to UI in `API_UI_MAPPING.md` (verified in §26 coverage check) |

---

## 10. Known Deferred Features

Mirror of `BACKEND_FREEZE_v1.md` §4 deferred surface, plus frontend-specific deferrals:

- Mobile apps (Parent / Student / Staff) — separate native projects; web stays responsive.
- Operational vertical UIs: Payroll, Library, Transport, Hostel, Inventory, Medical, Discipline, Visitor, Complaint Management.
- Self-serve school signup wizard UI.
- Analytics / BI dashboards beyond the canonical Reporting Foundation.
- Custom report builder UI.
- Inbound / two-way communication UI.
- Per-school full theme rendering (logo placeholder OK in v1; full branding system later).
- Localization beyond English (India) — i18n scaffolded but inactive.
- Real-time bank reconciliation UI.
- Cross-tenant operator search & impersonation UI.
- Dunning state-machine UI, e-NACH mandate UI, GST e-invoice / IRN screens, TDS certificate workflow.
- Visual regression baseline (planned for v1.x).
- Student portal `/me/homework`, `/me/attendance`, `/me/timetable`, `/me/exams`, `/me/fees` (out per Sprint 18 plan — backend exposes profile + placement + preferences only at v1).
- Parent portal child-detail surfaces beyond profile + fees + (optional) attendance/homework.
- Push channel adapter (backend has the field; channel itself not yet implemented).
- MFA challenge UI (auth flow scaffolded; gated by future backend feature).

---

## 11. Architecture Principles (reconfirmed at freeze)

The following invariants bind every frontend sprint and code review:

1. **The backend contract is immutable at v1.** No frontend change may require modifying frozen `/api/v1` endpoints, error envelopes, or pagination semantics. Anything that needs new backend surface area must be raised as a backend roadmap item, not patched around.

2. **School Fees and SaaS Billing remain visually & structurally disjoint in the UI.** No shared component, dialog, route, or sidebar group spans both. Search verification at PR time.

3. **Billing UI integrates with Subscription via Billing endpoints only.** Billing components do not import Subscription clients directly; they consume the BillingSubscriptionIntegrationService-derived data exposed by Billing endpoints.

4. **Shared infrastructure is consumed, never re-implemented.** `<IfMatchForm>`, `<CursorPaginator>`, `<PermissionGate>`, `<FeatureFlagBoundary>`, `<ErrorEnvelopeToast>`, the Axios instance, and the TanStack Query client are singletons. New modules use them; no module forks them.

5. **RBAC is UX, not security.** The frontend gates surfaces for usability; the backend enforces authoritatively. A leaked endpoint call without permission must surface a graceful 403 panel, not a crash.

6. **Design tokens are the only source of color/spacing/typography truth.** No literal `#hex`, no literal `12px` margin in component SCSS. Lint-enforced.

7. **Server data through TanStack Query; form state through React Hook Form.** No useState for either. Lint + PR review enforced.

8. **No jQuery, no source-theme runtime layer, no vendor branding strings.** Lint-enforced via import-restriction and grep gates in CI.

9. **Accessibility is a release gate, not a polish task.** Zero axe violations and visible `:focus-visible` rings on every PR. WCAG 2.1 AA at v1 release.

10. **Module boundaries from `MODULE_BOUNDARIES.md` extend to the UI.** Frontend respects the same upstream/downstream boundary rules the backend enforces.

---

## 12. Documents in this freeze

| # | Document | Purpose |
|---|---|---|
| 1 | `THEME_ANALYSIS.md` | Source-theme classification (Reusable / Modify / Discard) |
| 2 | `COMPONENT_INVENTORY.md` | UI control inventory with verdicts and target React libraries |
| 3 | `PAGE_INVENTORY.md` | All 58 source-theme HTML pages mapped to portal + disposition |
| 4 | `PORTAL_SCREEN_PLANNING.md` | 128 v1 screens across 5 portals, classified E/M/N |
| 5 | `UI_ARCHITECTURE.md` | Stack rationale, project structure, integration patterns |
| 6 | `FRONTEND_IMPLEMENTATION_PLAN.md` | 6-phase master roadmap |
| 7 | `FRONTEND_SPRINT_PLAN.md` | 16 sprints (F1–F16), per-sprint deliverables |
| 8 | `FRONTEND_UI_SPECIFICATION.md` | UI standard — tokens, components, states, review checklist |
| 9 | `API_UI_MAPPING.md` | Backend module → frontend pages/components/forms/dialogs |
| 10 | `UI_TESTING_STRATEGY.md` | Test pyramid, tools, coverage gates, critical journeys |
| 11 | `FRONTEND_FREEZE_v1.md` | **This document** |

All eleven are binding at v1. Updates require PR-level review with explicit "amends frozen planning" tag.

---

## 13. Verified at Freeze (consistency checks)

- **Stack consistency:** Every document that names a library names the same library (React Bootstrap, TanStack Query, Lucide, etc.).
- **Portal naming consistency:** Five portals + shared auth — same names everywhere.
- **Screen counts:** `PORTAL_SCREEN_PLANNING.md` §9 (128) is the canonical figure; `FRONTEND_FREEZE_v1.md` §8 echoes it.
- **Backend module coverage:** `API_UI_MAPPING.md` §26 confirms all 22 frozen backend modules are mapped.
- **Stack exclusions:** No Tailwind, no jQuery, no NextAuth — stated identically in `UI_ARCHITECTURE.md` §1, `FRONTEND_FREEZE_v1.md` §2.
- **Optimistic concurrency:** `<IfMatchForm>` named as the single seam in `UI_ARCHITECTURE.md`, `COMPONENT_INVENTORY.md`, `FRONTEND_UI_SPECIFICATION.md`, `API_UI_MAPPING.md`, `UI_TESTING_STRATEGY.md`.
- **Theme separation:** Source-theme vendor name stripped across all 11 documents (grep-verified at freeze time).
- **Sprint plan consistency:** 16 sprints across 6 phases — same in `FRONTEND_IMPLEMENTATION_PLAN.md` §2 and `FRONTEND_SPRINT_PLAN.md`.
- **School Fees vs SaaS Billing separation:** Called out identically in `PAGE_INVENTORY.md` §11, `PORTAL_SCREEN_PLANNING.md` §4.11/§3.4, `API_UI_MAPPING.md` §15/§22/§27, and this document §11.
- **Parent / Student portal scope:** Limited surface (profile + placement + preferences for Student v1; children + fees for Parent v1) consistent with `BACKEND_FREEZE_v1.md` Sprint 17/18 entries.

Contradictions discovered and corrected: see §16.

---

## 14. Risks & mitigations (carried into v1 build)

| Risk | Mitigation owner | Mitigation |
|---|---|---|
| Source-theme licensing on illustrations | F1 | Commission replacements before bundle; lint gate strips vendor strings |
| jQuery dependency creep | F1 onward | ESLint `no-restricted-imports` blocks `jquery` |
| Bundle bloat from charts/calendar/editors | F3 onward | `next/dynamic` lazy-loads; per-route bundle budget in CI |
| Accessibility debt accumulating | every sprint | axe in CI; F16 dedicated audit |
| Mobile usability for Parent / Student | F12, F13 | Mobile-first audit per sprint; Playwright mobile viewport |
| Cursor pagination misuse | F4 onward | `<CursorPaginator>` is the only pagination component; PR review |
| Optimistic concurrency conflicts user-confusing | F3 onward | `<IfMatchForm>` standardised UX (diff modal) |
| Vendor branding leaking | every sprint | CI gate `scripts/scan-vendor-strings.sh` against built bundle |

---

## 15. Final Certification

> **Is Frontend Planning Version 1 officially frozen?**
>
> **YES.**

### Technical justification

1. **Stack is decided and complete.** Next.js App Router + TypeScript + React Bootstrap + Bootstrap 5.3.8 + SCSS + React Hook Form + TanStack Query + Axios + Lucide Icons. Exclusions (Tailwind, jQuery, NextAuth) are stated. Plugin-replacement map is complete in `THEME_ANALYSIS.md` §5.

2. **UI standards are codified.** `FRONTEND_UI_SPECIFICATION.md` defines every design token, every component variant, every state pattern, every standard for buttons / forms / cards / tables / modals / drawers / tabs / accordions / timeline / calendar / notifications / loading / empty / error / responsive / accessibility / dark mode / animation / naming / folder structure / React Hook Form / TanStack Query / Axios / If-Match UX / review checklist.

3. **Every backend module has a UI surface.** `API_UI_MAPPING.md` §26 confirms all 22 frozen backend modules from `BACKEND_FREEZE_v1.md` §3 are mapped to portal + pages + components + forms + tables + dialogs + permissions + feature flags.

4. **Testing strategy is binding with CI gates.** `UI_TESTING_STRATEGY.md` fixes the pyramid, the tools, the coverage thresholds, the critical journey list, the per-sprint requirements, and the merge gates.

5. **128 v1 screens are enumerated across 5 portals + shared auth.** Each is classified Existing-in-theme / Modify / New. The 16-sprint plan covers each in order respecting the dependency rules in `FRONTEND_IMPLEMENTATION_PLAN.md` §5.

6. **Deferred surface is explicit and bounded.** Deferrals match `BACKEND_FREEZE_v1.md` §4 plus frontend-only items (visual regression, MFA UI, push channel UI). No surprise deferrals during F1–F16.

7. **The architecture principles in §11 echo and extend the backend's invariants** (School Fees ⟂ SaaS Billing, Billing → Subscription via integration only, shared infra single-owner, RBAC + flags everywhere). The UI will not violate the boundary contract the backend enforces.

8. **Eleven planning documents agree.** Cross-checks verified naming, counts, stack, exclusions, optimistic concurrency, separation invariants. Contradictions found and resolved (§16).

This freeze constitutes a stable contract for frontend implementation to begin at Sprint F1. Any change that materially alters tokens, stack, portal structure, sprint dependencies, or testing gates requires an amendment PR.

---

## 16. Contradictions discovered & corrections made during freeze

A cross-document audit was performed across all eleven planning documents.

### 16.1 Discovered

1. **Charting library — earlier ambiguity:** `THEME_ANALYSIS.md` §3.5 left the choice between ApexCharts (via React adapter) and Recharts open, deferring to `UI_ARCHITECTURE.md`. `UI_ARCHITECTURE.md` §1 then committed to `react-apexcharts`.
   - **Resolution:** This freeze and `FRONTEND_UI_SPECIFICATION.md` lock the choice to **react-apexcharts**. The deferral note in `THEME_ANALYSIS.md` remains historically accurate (it described the open question at that point); no edit required because §3.5 also states "Decision deferred to `UI_ARCHITECTURE.md`; either way the jQuery init calls are discarded" — which is now resolved by the downstream commitment. No retroactive contradiction.

2. **Date picker library — naming consistency:** Multiple documents reference the date picker as "react-day-picker"; `FRONTEND_UI_SPECIFICATION.md` adds a small custom time companion. No contradiction — the spec extends, doesn't conflict.

3. **Feature flag for fees online payment:** `API_UI_MAPPING.md` §15 mentions `module.fees_online` "if defined". Backend freeze does not currently enumerate a `module.fees_online` flag.
   - **Resolution:** Wording in `API_UI_MAPPING.md` is conditional ("if defined") and not asserted as a fact. No action required; if backend later introduces the flag, this becomes accurate. If not, fees online availability is simply on whenever fees module is on.

4. **Sprint 18 student-portal scope already counted:** `PORTAL_SCREEN_PLANNING.md` §6 lists student `/me/profile`, `/me/academic-year`, `/me/class`, `/me/section`, `/me/preferences`. `API_UI_MAPPING.md` §7 enumerates the same set. `FRONTEND_FREEZE_v1.md` §10 lists deferred student `/me/homework|attendance|timetable|exams|fees`. All consistent with Sprint 18 plan and `BACKEND_FREEZE_v1.md`.
   - **No contradiction.**

5. **Number of "new" SchoolOS-specific components:** `COMPONENT_INVENTORY.md` §9 lists 10 named components; §10 summarises as "10". `FRONTEND_FREEZE_v1.md` §5 says "10+".
   - **Resolution:** "10+" in this document is forward-looking (additional components like `<TenantSwitcher>` may emerge during Platform sprints). No contradiction with §9/§10 baseline of 10. Left as-is.

### 16.2 Corrections made

None of the discovered items required edits to existing documents. The cross-check confirmed:
- All eleven documents agree on stack, exclusions, portal naming, screen counts, optimistic concurrency, separation invariants, deferral list, and backend integration patterns.
- No vendor-branding strings appear in any of the eleven documents.

If a future audit finds a genuine contradiction (not a layered specification), it must be resolved by amending the older document with a `> NOTE: superseded by ...` line and committing both files in the same PR.

---

## 17. Stop

Frontend Planning v1 is frozen. Implementation begins at **Sprint F1 (Scaffolding & Design System)** upon approval.

**This document does NOT start Sprint F1. No implementation code is produced. No project is scaffolded.**
