# UI Architecture — SchoolOS Frontend

> **Status:** Architecture recommendation only. No code, no scaffolding.
> **Purpose:** Recommend the technology stack, project structure, state model, and integration patterns for the SchoolOS frontend, and justify each choice against the constraints set by the frozen backend (`BACKEND_FREEZE_v1.md`) and the purchased Bootstrap admin theme (`THEME_ANALYSIS.md`).

---

## 1. Stack summary

| Concern | Choice | Rejected alternative | Why |
|---|---|---|---|
| Framework | **Next.js (App Router)** | Vite + React Router | Per-portal route grouping, server components for static shell, built-in i18n/middleware, well-suited to multi-tenant URL patterns, first-class TypeScript |
| Language | **TypeScript (strict)** | JavaScript | Backend exposes typed contracts; matching types end-to-end prevents drift |
| UI library | **React Bootstrap** | Tailwind, MUI, Chakra | Drops in over Bootstrap 5.3.8 classnames; matches the theme's visual vocabulary; no class-soup; lowest porting cost from the source theme |
| CSS framework | **Bootstrap 5.3.8** | Tailwind | Source theme is Bootstrap; React Bootstrap consumes it; keeps the design language intact |
| Styling | **SCSS** (hand-authored partials) | CSS-in-JS, CSS modules | Bootstrap is SCSS-native; lets us import Bootstrap source and override tokens; design tokens become CSS custom properties |
| Forms | **React Hook Form** | Formik, native | Smallest re-render footprint; integrates with Zod for schema validation; matches backend `class-validator` DTOs |
| Validation | **Zod** | Yup | Type-inferred schemas; mirror DTOs |
| Data fetching / cache | **TanStack Query (React Query)** | SWR, Redux | Server-state semantics with retries, cache invalidation, optimistic updates, mutation lifecycle |
| HTTP client | **Axios** | fetch | Interceptors for `Authorization`, `If-Match`, `Idempotency-Key`, `X-Trace-Id`; uniform error envelope handling |
| Icons | **Lucide Icons** | Tabler, Feather, FA, Boxicons | Single library, tree-shakable, MIT-licensed; collapses the source theme's four-icon situation |
| Auth | **Custom JWT integration** (no NextAuth) | NextAuth | Backend already owns sessions, password reset, MFA scaffolding; NextAuth would duplicate and conflict |
| Routing | **Next.js App Router** | — | Built into Next |
| State (client) | **React Context + Zustand (per-feature, opt-in)** | Redux Toolkit | Most state is server state; Zustand only where ephemeral cross-component coordination is needed (e.g., layout sidebar collapse) |
| Tables | **TanStack Table (headless)** | DataTables, AG Grid | Pairs with backend cursor pagination; controllable from URL search params |
| Charts | **react-apexcharts** | Recharts, Chart.js | Same visuals as the source theme; React adapter avoids jQuery |
| Calendar | **@fullcalendar/react** | react-big-calendar | Source theme is FullCalendar already; React adapter is identical |
| Rich text | **TipTap** | Quill, Draft.js, Slate | ProseMirror-based, modular, React-friendly |
| Date picker | **react-day-picker** | react-datepicker, Mui Pickers | Headless, ARIA-correct, range mode covers both pickers in theme |
| File upload | **react-dropzone** | uppy, native | Composable, lightweight; pairs with backend pre-signed upload |
| Combobox / async select | **React Select** | Downshift | Battle-tested, theming via classnames |
| Toast | **React Bootstrap `<ToastContainer>`** | react-toastify, sonner | Already in the stack; consistent visual |
| Testing | **Vitest + React Testing Library + Playwright** | Jest + Cypress | Faster Vite-based Vitest; Playwright for cross-browser e2e |
| Linting / format | **ESLint + Prettier** | — | Standard |
| Package manager | **pnpm** | npm, yarn | Workspaces if monorepo is adopted; fastest installs |

**Explicit non-choices:** No Tailwind. No jQuery. No NextAuth. No Material UI. No Chakra. No Redux. These were prescribed by the user and align with the design constraints.

---

## 2. Why Next.js App Router

- **Route groups** map naturally to portals: `app/(platform)/`, `app/(school)/`, `app/(teacher)/`, `app/(student)/`, `app/(parent)/` — each portal gets its own root layout (header + sidebar + theme).
- **Middleware** runs at the edge for tenant-from-subdomain resolution (`acme.schoolos.app` → `tenant=acme`) and for JWT presence checks.
- **Server components** keep the initial HTML shell small; client components opt in for interactive widgets only.
- **Parallel and intercepting routes** are useful for modal-as-route patterns (e.g., open a student detail in a modal over the list).
- **`next/font`** self-hosts fonts (Nunito) — replaces Google Fonts CDN from the source theme.
- **`next/image`** handles avatars and illustrations without manual resize work.

---

## 3. Why React Bootstrap over Tailwind / MUI

- The source theme is Bootstrap; React Bootstrap is the lowest-friction port path — the same `.btn`, `.card`, `.form-control` classes apply.
- React Bootstrap exposes Bootstrap's JS behaviours (modal, dropdown, accordion, offcanvas) as controlled React components — no jQuery required.
- Tailwind would require redesigning the visual layer from scratch and reworking every theme reference.
- MUI / Chakra would override Bootstrap classnames and produce a visual mismatch with the purchased theme's design language.

---

## 4. Project structure (recommended)

```
apps/
  web/                                Next.js app (the SchoolOS frontend)
    src/
      app/
        (auth)/                       /login, /forgot-password, /reset-password
          login/page.tsx
          ...
        (platform)/                   Super-admin / operator portal
          dashboard/page.tsx
          schools/page.tsx
          billing/...
          ...
        (school)/                     School-admin portal
          dashboard/page.tsx
          students/page.tsx
          students/[id]/page.tsx
          ...
        (teacher)/                    Teacher portal
        (student)/                    Student self-service portal
        (parent)/                     Parent self-service portal
        layout.tsx                    Root layout — fonts, theme provider
        globals.scss
      components/
        foundation/                   AppHeader, AppSidebar, AppShell, Avatar
        form/                         IfMatchForm, FieldArrayRow, FileDropzone
        table/                        CursorPaginator, StatusBadge
        layout/                       Card variants, StatCard, PageHeader
        feedback/                     Toast wrappers, ErrorEnvelopeToast
        rbac/                         PermissionGate, FeatureFlagBoundary
        domain/{module}/              Module-specific compositions
      lib/
        api/                          axios instance + interceptors
        api/clients/                  per-module typed clients (students.ts, fees.ts)
        api/types.ts                  shared envelope + error types
        query/                        TanStack Query keys + queryClient
        rbac/                         permission helpers
        auth/                         token storage, refresh
        config/                       env, feature flags fetcher
        utils/
      styles/
        _tokens.scss                  CSS custom properties
        _bootstrap-overrides.scss
        _layout.scss
        _components/_card.scss
        ...
      hooks/                          useDarkMode, useDebounce, usePermission
      providers/                      ThemeProvider, RBACProvider, ToastProvider
      types/                          domain types mirroring backend DTOs
      test/                           vitest setup
    public/                           static assets (logo placeholder)
    next.config.js
    tsconfig.json
    package.json
packages/                             (optional — if monorepo)
  ui/                                 shared component library across apps
  types/                              shared TS types (backend-mirrored)
```

If a monorepo with `packages/ui` is overkill in v1, keep everything in `apps/web/src/`.

---

## 5. Tenant resolution

Two valid models — pick one and commit:

- **Subdomain-per-tenant:** `acme.schoolos.app`. Middleware reads the host header, sets a cookie / header, and TanStack Query keys are scoped by it. Best for branding (logos per tenant) and clean URLs.
- **Path-prefix-per-tenant:** `app.schoolos.app/acme/...`. Easier to bootstrap; no DNS work per tenant. Worse aesthetics.

Recommendation: **subdomain-per-tenant** for production. Path-prefix for local dev.

The backend already enforces tenant scope via `RequestContextRegistry`; the frontend only needs to put the right `Authorization` and (optionally) `X-Tenant-Id` headers on each request.

---

## 6. Authentication flow

- Login `POST /api/v1/auth/login` → returns short-lived access JWT + refresh token (HTTP-only secure cookie).
- Access token in `Authorization: Bearer` on every request (axios interceptor).
- 401 → refresh interceptor calls `POST /api/v1/auth/refresh`; on failure, redirect to `/login`.
- First-login mandatory password change: backend sets `mustChangePassword=true` on User; frontend route guard redirects to `/change-password` until cleared.
- Password reset: `POST /api/v1/auth/password-reset/confirm { token, newPassword }` — token comes from email link.
- MFA: future. Backend has scaffolding; frontend will add `/login/verify` step when enabled.

**No NextAuth.** It would conflict with backend session ownership.

---

## 7. Axios interceptors (the spine)

Every request:
1. Attach `Authorization: Bearer <accessToken>`.
2. Attach `X-Trace-Id: <uuid>` for backend correlation.
3. For PATCH / POST-state-change requests with optimistic concurrency: attach `If-Match: "<version>"` from cached entity.
4. For POST mutations that should be retried safely: attach `Idempotency-Key: <uuid>` from React Hook Form's submit cycle.

Every response:
1. On 412 Precondition Failed → surface optimistic-concurrency conflict to the form (`<IfMatchForm>` shows a toast + refetch + diff).
2. On 401 → refresh-and-retry once; second 401 → redirect.
3. On standardised error envelope `{ error: { code, message, traceId } }` → `<ErrorEnvelopeToast>`.
4. On 5xx → toast + log + Sentry breadcrumb.

---

## 8. TanStack Query patterns

- Query keys mirror REST paths: `['students', schoolId, { cursor, search }]`.
- Mutations always invalidate the related list query.
- Optimistic updates only where the user expects instant feedback (e.g., toggling a switch).
- `staleTime` defaults to 30s; tunable per query.
- Cursor pagination uses `useInfiniteQuery`.

---

## 9. RBAC integration

- On login, fetch `GET /api/v1/auth/me/permissions` → array of permission keys.
- Stored in `RBACProvider` context.
- `<PermissionGate permission="students.read">{...}</PermissionGate>` short-circuits subtrees.
- Sidebar menu items are filtered by the same provider.
- Backend remains source of truth — frontend gating is UX, not security.

---

## 10. Feature flag integration

- On app boot, fetch `GET /api/v1/feature-flags` (effective for the calling tenant + user).
- `<FeatureFlagBoundary flag="module.billing">{...}</FeatureFlagBoundary>` hides whole sections.
- New module surfaces (e.g., Communication Center, Billing) ship hidden behind their flag until enabled per tenant.

---

## 11. Notification preferences UI

- Per-user preferences are stored backend-side (`NotificationUserPreference`).
- Settings page exposes channel switches (Email / SMS / Push / In-App), quiet-hours window, emergency-override flag.
- Push channel adapter is not yet implemented in backend — the toggle exists; the message simply doesn't deliver until backend ships push. Documented as expected behaviour.

---

## 12. Dark mode

- Implemented via `data-theme="dark"` on `<html>`, driven by `ThemeProvider`.
- All design tokens are CSS custom properties; one attribute flips them.
- Initial resolution: localStorage → `prefers-color-scheme` → light.
- One toggle in the header; the rest of the source theme's customizer is dropped.

---

## 13. Internationalisation

- v1 ships **English (India locale)** only.
- Next.js i18n routing prepared but disabled. Adding `hi`, `mr`, `ta` later requires translation files only, not refactoring.
- Number / currency formatting uses `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

---

## 14. Performance

- Next.js streaming server components for initial paint.
- Code-split per portal (separate route group bundles).
- TanStack Query caches reduce roundtrips.
- Images served via `next/image` with `priority` only for the dashboard hero stat tiles.
- Lighthouse target: Performance 90+ on dashboards, 95+ on auth screens.

---

## 15. Accessibility

- WCAG 2.1 AA target.
- Skip-to-content link as first focusable element.
- Visible `:focus-visible` rings (never `outline: none`).
- Sidebar nav: `aria-expanded` on collapsible groups, `aria-current="page"` on active item.
- Color contrast audited in both light and dark modes.
- Form labels always associated; error messages with `aria-describedby`.

---

## 16. Observability

- `X-Trace-Id` on every outbound request, surfaced in `<TraceIdFooter>` after errors.
- Sentry (or equivalent) wired for client errors with the trace id as a tag — pivots cleanly to backend logs.
- Analytics (e.g., PostHog) gated behind tenant consent.

---

## 17. Testing strategy

- **Unit:** Vitest + React Testing Library for components and hooks. Coverage target: 70% on `lib/`, 50% overall.
- **Contract:** Mock Service Worker (MSW) handlers mirror the backend OpenAPI; tests run against MSW so frontend can develop ahead of unfrozen backend changes (though backend is frozen — this is a future-proofing pattern).
- **E2E:** Playwright on Chromium + WebKit. Smoke tests per portal: login → dashboard → one critical workflow.
- **Visual regression:** Optional, via Playwright screenshots, on the design-system page.

---

## 18. Build & deploy

- `pnpm install` → `pnpm dev` (Next dev) for local.
- `pnpm build` → standalone Next.js output.
- Containerised via Docker; deploy behind the same ingress as backend.
- Env vars: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_TENANT_RESOLUTION_MODE` (subdomain | path).
- No build-time tenant fan-out; tenant is runtime.

---

## 19. Stop

This document is the architecture map only. Sprint F1 (per `FRONTEND_SPRINT_PLAN.md`) takes this and scaffolds the Next.js project, the design tokens, and the foundational components.
