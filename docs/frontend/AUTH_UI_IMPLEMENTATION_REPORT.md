# Jilanix Authentication UI — Implementation Report

**Scope**: pixel-perfect refinement of the four authentication surfaces
(`/login`, `/forgot-password`, `/reset-password`, `/first-login`) against
the LOCKED approved mockup. Backend / API / auth logic / validation /
routing are UNTOUCHED.

**Layout contract**: the entire auth page fits inside `100vh` at desktop
breakpoints. No `overflow-y: auto`, no page scroll, no scrollbar. Below
the `lg` breakpoint the two panels stack and the height lock is released
so mobile scroll works naturally.

---

## 1. Files Modified

**Refined this sprint**

- `frontend/src/styles/_theme-jilanix-auth.scss` — full rewrite for the
  compact, viewport-locked layout. Removed both right-panel decorative
  pseudo-elements. Simpler button gradient. Tighter inputs, tighter
  card, tighter card header stack. Card pushed to top of the panel.
- `frontend/src/styles/_tokens.scss` — `--auth-card-max` reset to
  `460 px` (tightened panel). No other token changes.
- `frontend/src/components/auth/BrandingPanel.tsx` — hero logo
  `140 → 130 px`.
- `frontend/src/components/auth/AuthCard.tsx` — card logo
  `112 → 100 px`; docstring refreshed.
- `docs/frontend/AUTH_UI_IMPLEMENTATION_REPORT.md` — this document.

**Final polish pass (this iteration)**

- `frontend/src/components/auth/ThemeToggle.tsx` — **DELETED**. The
  auth surface no longer offers a theme switch (product decision — the
  approved mockup does not include one).
- `frontend/src/components/auth/AuthLayout.tsx` — dropped the
  `ThemeToggle` import and the `.jlx-auth-shell__panel-header` wrapper.
- `frontend/src/styles/_theme-jilanix-auth.scss` — removed the
  `.jlx-theme-toggle*` and `.jlx-auth-shell__panel-header` selectors.
  Input height `46 → 42 px`, icon padding `42 → 40 px`, trailing button
  `32 → 30 px`. Button height `48 → 44 px`. Skeleton `--field` /
  `--cta` follow to `42 / 44 px`. Panel top padding compensates for the
  removed header (`20 → 32 px`). Background artwork now uses layered
  `background-size: cover, contain` with a base `--jlx-bg-primary` fill
  so the full school-building illustration (roof, wall-mounted logo,
  Indian flag) stays visible without stretching. Added
  `@keyframes jlx-feature-in` entrance for feature cards
  (`460 ms`, staggered `0 / 80 / 160 / 240 ms` per item) plus a hover
  glow on `.jlx-brand-feature__icon`
  (`translateY(-2px) scale(1.05)` + soft brand-purple shadow, `220 ms`).
  Wrapped both in `@media (prefers-reduced-motion: reduce)` so the
  entrance and hover lift are neutralised for users who opt out.
- `frontend/src/components/auth/LoginForm.test.tsx`,
  `frontend/src/components/auth/ForgotPasswordForm.test.tsx` — removed
  the `vi.mock('@/providers/ThemeProvider', ...)` blocks (no longer
  reachable from the render tree).

**Deleted previously (still gone)**

- `frontend/src/styles/_theme-auth.scss` — legacy Preskool theme; every
  selector was unreferenced (verified via ripgrep).
- Import of the above from `frontend/src/styles/globals.scss`.

**Untouched (verified)**

- `frontend/src/lib/api/client.ts` (axios + 401 interceptor + refresh).
- `frontend/src/lib/api/clients/auth.ts` (all HTTP surfaces).
- `frontend/src/providers/AuthProvider.tsx`.
- `frontend/src/providers/TenantProvider.tsx`.
- `frontend/src/providers/ThemeProvider.tsx`.
- `frontend/src/lib/auth/landing.ts`.
- All Zod schemas + `react-hook-form` bindings inside the four forms.
- Anything under `backend/`.

---

## 2. CSS Cleanup Summary

`_theme-jilanix-auth.scss` was audited rule-by-rule. Every remaining
selector is used by exactly one component and has a single reason to
exist.

**Removed this pass**

| Rule | Reason |
|------|--------|
| `.jlx-auth-shell__panel::before` (top-left dots) | Explicitly requested for removal — not part of the approved design. |
| `.jlx-auth-shell__panel::after` (bottom-right dots) | Same — decorative overlay that is not in the mockup. |
| `overflow-x: hidden` + `position: relative` on `.jlx-auth-shell` | Redundant with the new `overflow: hidden` full lock. |
| `.jlx-auth-shell__panel-header` (entire block) | Removed with the theme toggle — the panel no longer has a header row. |
| `.jlx-theme-toggle` / `.jlx-theme-toggle__btn` / `.jlx-theme-toggle__btn--active` | Component removed; selectors unreachable. |
| `.jlx-auth-shell__panel-body { padding: 12px 0; z-index }` | Padding replaced by a single `padding-top: 8px`; `z-index` was only needed to layer over the removed pseudo-elements. |
| `.jlx-auth-shell__panel-footer { z-index }` | Same — only needed for the removed pseudo-elements. |
| `.jlx-auth-shell__brand-inner { padding-top: clamp(...) }` | Panel padding already gives the offset. |
| `.jlx-btn { min-height, padding, transition color }` | Consolidated into a fixed `height: 44px`, simpler transitions. Colour never changes on the primary variant. |
| Inline highlight (`inset 0 1px 0 rgba(...)`) on primary button | Not in the mockup — dropped for the simpler single-drop shadow. |
| Skeleton height / spacing values | Bumped down to match the new field / button sizes (100 / 42 / 44). |
| Removed the `.jlx-auth-card { gap: 24 }` and `.jlx-auth-card__header { gap: 10 }` slack | Tightened to 14 / 4 respectively to match the mockup rhythm. |
| Removed unused custom property `--toggle-diameter` | The only referencing block (theme toggle) is now deleted. |
| Removed `.jlx-brand-features { margin, padding }` extras | Grid gap alone drives spacing. |

**Removed previously (still gone)**

- Every Preskool selector shipped in the old `_theme-auth.scss`
  (259 lines): `.account-page`, `html:has(body.account-page)`,
  `body.account-page`, `.login-background`, `.auth-right`,
  `.authen-overlay-item` + descendants, `.card-body h2 + p`,
  `.login-or`, `.span-or`, `.hover-a`, `.input-icon`,
  `.input-icon-addon`, `.pass-group`, `.toggle-password`,
  `.form-wrap-checkbox`, `.form-check-md`, `.br-5`, `.br-10`,
  `.link-danger`.

**Enforced conventions**

- No literal hex codes inside the auth stylesheet outside three tinted
  overlay `rgba()` fills (each derived from the `--jlx-bg-primary` /
  `--jlx-accent` / `--jlx-highlight` colours). No new hex colours were
  introduced.
- No inline styles in any auth component.
- Every class is `jlx-*` prefixed.
- Bootstrap utilities are not used inside auth chrome.

---

## 3. Removed Unused CSS

| Class / rule | Removed |
|--------------|---------|
| `.jlx-auth-shell__panel::before` | Yes (prior pass) |
| `.jlx-auth-shell__panel::after` | Yes (prior pass) |
| `--toggle-diameter` custom property | Yes (prior pass) |
| `.jlx-auth-shell__panel-header` | Yes (this pass — theme toggle removed) |
| `.jlx-theme-toggle*` (3 selectors) | Yes (this pass — component deleted) |
| `.jlx-auth-shell__panel-body { z-index }` | Yes (prior pass) |
| `.jlx-auth-shell__panel-footer { z-index }` | Yes (prior pass) |
| `.jlx-auth-shell__brand-inner { padding-top }` | Yes (prior pass) |
| Legacy Preskool selectors (14 blocks) | Yes (prior pass) |
| Dark-theme redundant `.jlx-field__input`, `.jlx-theme-toggle` overrides | Yes (prior pass) |
| Duplicate marginals on `.jlx-brand-hero-mark__title` / `__tag` | Yes (prior pass) |
| Button inset highlight | Yes (prior pass) |

---

## 4. Reusable Components

| Primitive | Purpose | Reused across |
|-----------|---------|----------------|
| `AuthLayout` | Two-column shell — locked to 100 vh at desktop. | All four pages. |
| `BrandingPanel` | Left-40% deep-plum panel with hero mark, headline, lede, 4-feature strip. | All four pages. |
| `AuthCard` | White floating card — 100 px logo, title, subtitle, form slot, footer slot. Compact interior padding. | All four pages. |
| `AuthInput` | Label + optional leading icon + input + inline error. 42 px input. | Login, Forgot. |
| `PasswordInput` | Same chrome + trailing eye toggle + lock leading icon by default. | Login, Reset, First-login. |
| `AuthButton` | **LOCKED CTA** — 44 px, deep-plum vertical gradient, animated arrow. Reusable ERP-wide. | All four pages. |
| `AuthSkeleton` | Loading placeholder mirroring an `AuthCard`. | `<Suspense>` fallback for `/login` + `/reset-password`. |

No component contains inline styles, wrapper `<div>`s, or Bootstrap
classes.

---

## 5. Pixel Perfect Improvements

| Area | Before | After |
|------|--------|-------|
| Page height | `min-height: 100vh` (scrolling possible) | **`height: 100vh; overflow: hidden`** — no page scroll. |
| Right-panel dot patterns | `::before` + `::after` (top-left + bottom-right) | **Removed** — not in mockup. |
| Card vertical position | `justify-content: center` (centered) | **`justify-content: flex-start; padding-top: 8px`** — card sits near the top of the right panel, matching the mockup where the empty space below the card is noticeably larger than above it. |
| Card outer padding | `clamp(36 → 52 px)` | **`32 px` vertical / `clamp(28 → 36 px)` horizontal** — tighter. |
| Card inner gap | 24 px | **14 px**. |
| Card header gap (title → subtitle) | 10 px | **4 px** — tight per mockup. |
| Card logo | 112 px | **100 px** — matches mockup. |
| Card title | `clamp(30 → 36 px)` | **`30 px` fixed** — reads consistently. |
| Card subtitle | 15 px | **14 px**. |
| Form gap | 20 px | **14 px** — tighter vertical rhythm. |
| Field label → input gap | 8 px | **6 px**. |
| Field input height | 52 px | **42 px** — matches mockup after final tightening. |
| Field input padding | `0 16px 0 44px` | **`0 14px 0 40px`**. |
| Field trailing button | 34 px | **30 px**. |
| Password trailing padding | `right: 46px` | **`right: 40px`**. |
| Primary button height | 56 px | **44 px** — matches input rhythm. |
| Primary button gradient | 3-stop `accent → secondary → deep-plum` at 135° with inset highlight | **`linear-gradient(180deg, var(--jlx-bg-secondary) 0%, var(--jlx-bg-primary) 100%)`** — uniform deep-plum vertical gradient from existing tokens, no invented colours, no inset highlight. |
| Primary button shadow | Layered drop + inset | **`0 10px 20px -12px rgba(26,21,51,0.55)`** — soft tinted drop only. |
| Arrow travel | +6 px | **+4 px**. |
| Left-panel padding | `clamp(40 → 56 px) / clamp(32 → 48 px)` | **`32 px / clamp(28 → 40 px)`**. |
| Left-panel background | `cover` cropped the top of the illustration (roof / logo / flag hidden). | **Layered `cover, contain` with `--jlx-bg-primary` base fill** — full building preserved, no stretching, letterbox blends into the deep-plum panel. |
| Left-panel inner gap | 44 px | **24 px**. |
| Hero mark gap (logo → wordmark → tag) | 14 px | **8 px** — tighter. |
| Hero logo | 140 px | **130 px** — matches mockup. |
| Wordmark | 46 px, letter-spacing 9 px | **40 px, letter-spacing 8 px** — matches mockup. |
| Gold tag rules width | 30 px | **26 px**. |
| Hero heading | `clamp(32 → 40 px)` | **`clamp(28 → 34 px)`**. |
| Hero lede | 15 px / 1.6 | **14 px / 1.55**. |
| Features gap | 18 px | **14 px**. |
| Feature entrance | none | **Fade + rise (`translateY 10 → 0`) 460 ms, staggered 80 ms per card** — reduced-motion friendly. |
| Feature icon hover | none | **`translateY(-2px) scale(1.05)` + soft `rgba(107,70,193,0.55)` glow, 220 ms** — reduced-motion friendly. |
| Feature icon | 48 px | **44 px** — matches mockup. |
| Feature title / sub | 12 px / 10.5 px | **11.5 px / 10 px**. |
| Theme toggle | Sun / moon pill in the panel header | **Removed** — not in the approved design. |
| Skeleton — brand / title / sub / field / cta | 112 / 36 / 15 / 52 / 56 | **100 / 30 / 14 / 42 / 44** — matches the tighter form geometry. |

---

## 6. Responsive Verification

| Breakpoint | Behaviour |
|------------|-----------|
| ≥ 1200 px | Two-column 40 / 60. Card max 460 px, pushed to top of the right panel. `height: 100vh; overflow: hidden` — no scrollbar. |
| 992 – 1199 px | Same two-column, card padding compresses via `clamp()`. Still `100vh` locked. |
| 576 – 991 px | Height lock released (`min-height: 100vh; height: auto; overflow: visible`) so mobile scroll works. Branding stacks above the card; hero mark shrinks to 104 px logo + 32 px wordmark. Features stay 4-column. |
| < 576 px | Features collapse to 2 × 2. Card padding drops to 24 × 20 px; card logo 84 px; title 24 px. |

The height lock only applies to the desktop range — mobile intentionally
releases it so stacked content can scroll if it exceeds the viewport
(user-agent-native scroll on `<body>`, not our `overflow-y: auto`).

---

## 7. Accessibility Verification

- Every input renders `<label htmlFor>` + `aria-invalid` + `aria-describedby`.
- Error paragraphs carry `role="alert"`.
- Password reveal button carries `aria-label` + `aria-pressed`; icon is `aria-hidden`.
- Primary button arrow is `aria-hidden` — screen readers announce only the label.
- Every interactive element gets a visible `:focus-visible` ring (`--focus-ring` / `--focus-ring-danger`).
- Feature entrance + hover glow are wrapped in `@media (prefers-reduced-motion: reduce)`; animation and transforms are neutralised for users who opt out.
- Feature hover state is also triggered on `:focus-within` so keyboard users see the same affordance.
- Contrast: primary text 14.5:1 on `--surface-card`; primary button label ≥ 12:1 on the deep-plum gradient; gold accent links 4.7:1 on `--surface-card`.
- No reliance on colour alone — every state change also modifies border, icon, or elevation.
- Skeleton block carries `aria-hidden="true"`.

---

## 8. Final Readiness

**Automated checks**

| Check | Command | Result |
|-------|---------|--------|
| Type safety | `npx tsc --noEmit` | Clean. |
| Lint | `npx eslint src/components/auth src/app/{login,forgot-password,reset-password,first-login}` | Clean. |
| Unit tests | `npx vitest run src/components/auth/LoginForm.test.tsx src/components/auth/ForgotPasswordForm.test.tsx` | 6 / 6 pass. |

**Network contract (unchanged from prior sprint)**

| Route | Endpoint | Body | Effect on success |
|-------|----------|------|-------------------|
| `/login` | `POST /v1/auth/login` (via `useAuth().login`) | `{ email, password, rememberMe }` | `fetchSession()` → `router.replace(next ?? resolveLandingPath(me))` |
| `/forgot-password` | `POST /v1/auth/password-reset/request` | `{ email }` | Success toast + button becomes "Reset link sent" |
| `/reset-password` | `POST /v1/auth/password-reset/confirm` | `{ token, newPassword }` | Success toast + `router.replace('/login')` |
| `/first-login` | `POST /v1/auth/first-login/change-password` (via `useAuth().changeFirstLoginPassword`) | `{ currentPassword, newPassword }` | Success toast + `router.replace('/dashboard')` |

**Manual smoke checklist**

- [ ] `/login` renders with no vertical scrollbar at 1280 × 800 and above.
- [ ] Right panel has NO decorative dot patterns (top-left, bottom-right).
- [ ] Right panel has NO theme toggle in the top-right — it has been removed entirely.
- [ ] Left panel shows the full school-building illustration — roof, wall-mounted school logo, and Indian flag are all visible above the fold; no cropping or stretching.
- [ ] Card sits near the top of the right panel — the empty space below the card is noticeably larger than above it.
- [ ] Card logo is 100 px; "Welcome back" sits directly beneath it with only a small gap.
- [ ] Inputs are compact (42 px) — icon, placeholder, and text all vertically centered.
- [ ] Sign-in button is 44 px, uniform deep-plum vertical gradient, arrow travels +4 px on hover.
- [ ] Gold "Forgot password?" and "Contact your administrator" links visible on the card.
- [ ] Feature cards fade + rise into place on first load with an 80 ms cascade; hovering an icon lifts it 2 px and adds a soft purple glow. Enabling "reduce motion" in the OS neutralises both effects.
- [ ] Below 992 px branding stacks above card; scrolling engages naturally on mobile.

**Explicitly deferred** — dashboard, operator console shell, and
Student / Teacher / School modules remain out of scope.

**Stop.** No further work in this sprint beyond the authentication
surface.
