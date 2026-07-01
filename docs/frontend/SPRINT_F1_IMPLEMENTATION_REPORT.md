# Sprint F1 — Frontend Foundation & Project Scaffolding

**Status:** ✅ Completed
**Date:** 2026-06-27
**Scope:** Next.js App Router scaffold, design tokens, providers, foundation/overlay/layout components, auth pages + dashboard placeholder, foundation tests.

---

## 1. Deliverables

### 1.1 Project scaffold (`frontend/`)

| Artifact | Path |
|---|---|
| `package.json` | Node ≥ 20.10. Next 14.2.15, React 18.3.1, TS 5.6.2 strict, React Bootstrap 2.10.5 + Bootstrap 5.3.8 + SASS, TanStack Query 5.59 + devtools, Axios 1.7, react-hook-form 7.53 + zod 3.23, Lucide 0.447, Vitest 2.1 + Testing Library 16 + jsdom 25. |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `@/* → src/*`, vitest globals + `jest-dom` types. |
| `next.config.mjs` | App Router, security headers (X-Frame-Options, Permissions-Policy, etc.), SASS `includePaths`, `optimizePackageImports` for `lucide-react` + `react-bootstrap`. |
| `.eslintrc.json` | `next/core-web-vitals` + TS rules, `consistent-type-imports`. |
| `vitest.config.ts` | jsdom, `@` alias, setup file. |
| Scripts | `dev` (port 3001), `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`. |

### 1.2 SCSS architecture (`src/styles/`)

`globals.scss` orchestrates the load order: Bootstrap SCSS overrides → Bootstrap → tokens → base reset/typography → layout (header/sidebar/page) → component classes (`.so-*`).

| File | Purpose |
|---|---|
| `_bootstrap-overrides.scss` | `$primary: #2D4FCC`, Inter font, button/input/card/table/modal/offcanvas variable overrides. |
| `_tokens.scss` | All design-system tokens as CSS custom properties: brand, semantic, surface, text, border, sidebar (light), header, focus rings, shadows, radii, 4-pt spacing (0–8), Inter typography scales, motion (120/200/320 ms), z-index. Dark overrides under `[data-theme='dark']`. |
| `_base.scss` | Reset, headings, `:focus-visible` ring, `prefers-reduced-motion`. |
| `_layout.scss` | `.main-wrapper`, `.app-header` (sticky, 60/56 px), `.app-sidebar` (260/72/drawer + modifiers + backdrop), `.app-page`, `.app-content`, impersonation banner, skip link. |
| `_components.scss` | `.so-spinner`, `.so-skeleton`, `.so-empty`, `.so-error`, `.so-avatar`, `.so-search-trigger`, `.so-cmdk-*`, `.so-toast*`, `.so-breadcrumb`, `.so-auth__card`, form helpers, Bootstrap minor tweaks. |

### 1.3 Providers (`src/providers/`)

Composition (outer → inner): `QueryProvider → ThemeProvider → AuthProvider → PermissionProvider → FeatureFlagProvider → TenantProvider → ToastProvider → AppLayout`.

| Provider | Hooks | Key behavior |
|---|---|---|
| `QueryProvider` | — | TanStack Query client, `staleTime` 60 s, `gcTime` 5 min, skip retry on 4xx, devtools in dev. |
| `ThemeProvider` | `useTheme()` | `light \| dark \| system`. Sets `data-theme` + `data-bs-theme` on `<html>`. Watches `prefers-color-scheme`. Persists to `localStorage`. `toggle()` cycles light→dark→system. |
| `AuthProvider` | `useAuth()`, `useSession()` | `idle → loading → authenticated/unauthenticated`. On mount: read tokens → `Promise.all([fetchSession, fetchPermissions, fetchFeatureFlags])`. Registers global 401 handler that resets state and `router.replace('/login')`. |
| `PermissionProvider` | `usePermission()` | `has / hasAny / hasAll` with wildcard `*` support. |
| `FeatureFlagProvider` | `useFeatureFlag(key)`, `useFeatureFlags()` | Reads flag map from session; returns `boolean` for `isEnabled`. |
| `TenantProvider` | `useTenant()` | Derives `{ id, name }` from session. |
| `ToastProvider` | `useToast()`, `useToastList()` | Per-variant durations (default/success/info 4 s, warning 6 s, danger 8 s). Auto-dismiss timers tracked in a ref. Helpers `success/info/warning/danger`. |

### 1.4 API layer (`src/lib/api/`)

- `client.ts` — Axios singleton. Augments `AxiosRequestConfig` with `idempotent`, `ifMatch`, `skipAuth`, `_retriedAfterRefresh`. Request interceptor sets `X-Trace-Id`, `Authorization Bearer`, `If-Match` (quoted), `Idempotency-Key` (POST), `X-Tenant-Host`. Response interceptor refreshes on 401 (deduplicated via a shared `refreshInFlight` Promise), maps errors to `ApiError`. Exports `registerUnauthorizedHandler()`.
- `errors.ts` — `ApiError` class (code/status/traceId/fields) + `isUnauthorized/isForbidden/isConflict/isVersionMismatch/isValidation`, `describeError()`.
- `http.ts` — Typed `apiGet/apiPost/apiPatch/apiPut/apiDelete` that unwrap the `{ data }` envelope.
- `trace-id.ts` — `newTraceId()` → `web-${uuid()}`.
- `clients/auth.ts` — `login`, `fetchSession`, `fetchPermissions`, `fetchFeatureFlags`, `logout`, `requestPasswordReset`, `confirmPasswordReset`.

### 1.5 Components

#### Foundation (`src/components/foundation/`)
- **Spinner** — `sm/md/lg/centered`, `role="status"` + `aria-live="polite"`.
- **LoadingSkeleton** — `text/title/metric/circle/card/row/custom` variants, `count` multiplier.
- **EmptyState** — Icon (default `Inbox`) + title + description + action.
- **ErrorState** — Alert role, trace ID display, retry button.
- **ErrorBoundary** — Class component with fallback render prop; default fallback uses `ErrorState`.
- **Avatar** — `xs/sm/md/lg/xl/2xl` + square + status dot; deterministic palette fallback; image when `src` provided.

#### Overlays (`src/components/overlays/`)
- **ToastRegion** — Renders `useToastList()`, dismiss button, variant icons.
- **Modal** — Wraps React-Bootstrap `Modal`; size `sm/md/lg/xl`, centered by default.
- **Drawer** — Wraps React-Bootstrap `Offcanvas`; `start/end/top/bottom`.
- **ConfirmationDialog** — `ConfirmationProvider` + `useConfirm()` returning `Promise<boolean>`; danger tone support.
- **CommandPalette** — `CommandPaletteProvider` + `useCommandPalette()`. `⌘K / Ctrl+K` global shortcut. Dialog scaffold with search input + footer hints (results wiring deferred).

#### Layout (`src/components/layout/`)
- **AppLayout** — Skips chrome on `/login|/forgot-password|/reset-password`. Redirects unauthenticated users to `/login?next=…`. Mounts `Sidebar`, `Header`, `ErrorBoundary`, `ToastRegion`, `CommandPaletteProvider`, `ConfirmationProvider`. Manages sidebar collapse/mobile-drawer state with `localStorage` persistence.
- **Sidebar** — 3 sections (Main, Academics, Operations). Lucide icons. Active state from `usePathname`. Brand mark + footer version. Collapsed + mobile-open modifiers + backdrop.
- **Header** — Hamburger (mobile), `SearchBar`, notification bell, `ThemeSwitcher`, `UserMenu`.
- **Breadcrumb** — Items with optional `href`; chevron separators; last item is `aria-current="page"`.
- **ThemeSwitcher** — Cycles theme; icon adapts to current mode.
- **UserMenu** — Avatar trigger → dropdown with profile/settings/sign-out. Closes on outside click + Escape.
- **SearchBar** — Pill trigger opening Command Palette; shows `⌘K` / `Ctrl K` hint based on platform.

### 1.6 App Router (`src/app/`)

- `layout.tsx` — Root HTML, `<head>` Inter font, **inline pre-hydration theme script** to avoid FOUC, mounts `<Providers>`.
- `page.tsx` — Redirects `/` → `/dashboard`.
- `login/page.tsx` — Sign-in form (Suspense-wrapped for `useSearchParams`).
- `forgot-password/page.tsx` — Email entry.
- `reset-password/page.tsx` — New-password form (Suspense-wrapped).
- `dashboard/page.tsx` + `DashboardClient.tsx` — Greeting + four metric placeholders.
- `not-found.tsx` — 404 via `ErrorState`.
- `error.tsx` — Route-level error boundary.

All auth forms use react-hook-form + zod resolvers, surface inline field errors and a top-of-form alert with `describeError()`.

---

## 2. Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ 0 errors (strict + `noUncheckedIndexedAccess`). |
| Lint | `npm run lint` | ✅ 0 warnings, 0 errors. |
| Tests | `npm test` | ✅ **5 files, 19 tests passed.** |
| Build | `npm run build` | ✅ 8 static pages generated, 0 errors. |

### Test inventory (19 tests across 5 files)

| File | Tests |
|---|---|
| `components/foundation/foundation.test.tsx` | Spinner ARIA, Skeleton count, EmptyState rendering, ErrorState trace ID. |
| `components/layout/layout.test.tsx` | Sidebar renders sections + marks active route; collapsed modifier; Breadcrumb renders intermediate links + final crumb; empty items returns null. |
| `providers/ThemeProvider.test.tsx` | Defaults to system→light; toggle cycles light→dark→system→light; setMode persists; throws outside provider. |
| `providers/PermissionProvider.test.tsx` | Has granted permission; wildcard grants all; `hasAll` requires all; `hasAny` matches one. Plus `FeatureFlagProvider` on/off. |
| `providers/ToastProvider.test.tsx` | `show()` appends instance; auto-dismiss after duration with fake timers. |

### Build output

```
Route (app)                              Size     First Load JS
┌ ○ /                                    142 B          87.3 kB
├ ○ /_not-found                          142 B          87.3 kB
├ ○ /dashboard                           3.75 kB         122 kB
├ ○ /forgot-password                     3.45 kB         145 kB
├ ○ /login                               4.04 kB         145 kB
└ ○ /reset-password                      3.58 kB         145 kB
+ First Load JS shared by all            87.2 kB
```

---

## 3. Theme preservation compliance

- ✅ Bootstrap markup retained: `.card`, `.btn`, `.form-control`, `.table`, `.modal`, `.offcanvas`, `.alert`, `.dropdown-menu`, `.row`/`.col-*`.
- ✅ Inter font loaded; brand `#2D4FCC` applied via SCSS variable override (cascades into compiled `.btn-primary`, `.form-control:focus`, etc.).
- ✅ Sidebar 260/72/drawer, header 60/56, 4-pt spacing, 120/200/320 ms motion all encoded as CSS custom properties.
- ✅ Dark mode via `[data-theme='dark']` token overrides; theme switcher writes both `data-theme` and `data-bs-theme`; inline pre-hydration script prevents FOUC.
- ❌ Discarded (replaced with React equivalents): jQuery, DataTables, Select2, Owl Carousel, Summernote, slimScroll. **`package.json` has zero jQuery dependencies; verified.**

---

## 4. Routing surface

| Route | Auth | Notes |
|---|---|---|
| `/` | n/a | Redirects to `/dashboard`. |
| `/login` | public | Suspense-wrapped (uses `useSearchParams`). |
| `/forgot-password` | public | |
| `/reset-password?token=…` | public | Suspense-wrapped. |
| `/dashboard` | required | Shell renders behind authenticated guard. Unauthenticated visitors are redirected to `/login?next=…`. |

---

## 5. Pending for later sprints (explicit)

- Command Palette result wiring and recent-items persistence (storage key reserved: `STORAGE_KEYS.cmdkRecent`).
- Notifications bell dropdown.
- Data-grid, form-builder, and feature pages (deferred to Sprint F2+).
- Drawer footer styling polish.
- Avatar `next/image` migration once a CDN domain is settled.

---

## 6. Files added/modified

```
frontend/
├── .env.example
├── .eslintrc.json
├── .gitignore
├── next-env.d.ts
├── next.config.mjs
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── app/
    │   ├── dashboard/{page.tsx,DashboardClient.tsx}
    │   ├── forgot-password/page.tsx
    │   ├── login/page.tsx
    │   ├── reset-password/page.tsx
    │   ├── error.tsx
    │   ├── layout.tsx
    │   ├── not-found.tsx
    │   └── page.tsx
    ├── components/
    │   ├── auth/{LoginForm.tsx,ForgotPasswordForm.tsx,ResetPasswordForm.tsx}
    │   ├── foundation/{Avatar.tsx,EmptyState.tsx,ErrorBoundary.tsx,ErrorState.tsx,LoadingSkeleton.tsx,Spinner.tsx,foundation.test.tsx}
    │   ├── layout/{AppLayout.tsx,Breadcrumb.tsx,Header.tsx,SearchBar.tsx,Sidebar.tsx,ThemeSwitcher.tsx,UserMenu.tsx,layout.test.tsx}
    │   └── overlays/{CommandPalette.tsx,ConfirmationDialog.tsx,Drawer.tsx,Modal.tsx,ToastRegion.tsx}
    ├── lib/
    │   ├── api/{client.ts,errors.ts,http.ts,trace-id.ts,clients/auth.ts}
    │   ├── auth/token-storage.ts
    │   ├── config/app.ts
    │   └── utils/{cn.ts,initials.ts,uuid.ts}
    ├── providers/{AuthProvider.tsx,FeatureFlagProvider.tsx,PermissionProvider.tsx,Providers.tsx,QueryProvider.tsx,TenantProvider.tsx,ThemeProvider.tsx,ToastProvider.tsx,PermissionProvider.test.tsx,ThemeProvider.test.tsx,ToastProvider.test.tsx}
    ├── styles/{_base.scss,_bootstrap-overrides.scss,_components.scss,_layout.scss,_tokens.scss,globals.scss}
    ├── test/setup.ts
    └── types/{api.ts,domain.ts,toast.ts}
```

---

## 7. Stop

Sprint F1 is complete. **Sprint F2 has not been started.**
