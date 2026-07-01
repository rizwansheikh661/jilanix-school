# Theme Analysis — Purchased Bootstrap Admin Theme

> **Status:** Analysis only. No code, no theme modification.
> **Source:** Local copy of a purchased Bootstrap 5.x school-admin HTML theme (vendor-neutral; referenced throughout as "the source theme" or "the purchased theme").
> **Purpose:** Classify every theme asset as **Reusable / Needs Modification / Discard** so frontend Sprint F1 can begin with a clear inventory of what to keep, what to refactor into the target React stack, and what to drop entirely.
> **Companion docs:** `PAGE_INVENTORY.md`, `COMPONENT_INVENTORY.md`, `UI_ARCHITECTURE.md`, `PORTAL_SCREEN_PLANNING.md`, `FRONTEND_IMPLEMENTATION_PLAN.md`, `FRONTEND_SPRINT_PLAN.md`.

---

## 1. Summary verdict

| Bucket | Count of aspects | Notes |
|---|---|---|
| Reusable as-is (visual reference only) | 8 | Layout structure, color palette, page archetypes, dashboard widget shapes, form/table vocabulary, dark-mode toggle UX, sidebar hierarchy, auth-screen composition |
| Needs modification | 11 | Bootstrap version pin, SCSS source reconstruction, color tokenization, icon set unification, chart library choice, calendar widget, form controls, modals/dropdowns, accessibility, RTL strategy, responsive breakpoints |
| Discard | 9 | jQuery and every jQuery-dependent plugin, DataTables, Select2, Owl Carousel, Summernote, bootstrap-datetimepicker, daterangepicker, slimScroll, theme-script.js customizer |

The theme's **visual design** is a strong starting point and matches the school-admin domain. Its **runtime layer** (jQuery + 10+ jQuery plugins) is incompatible with the target React stack and must be discarded wholesale; equivalent React-native replacements are listed in §5.

---

## 2. Reusable as-is

These can be carried into the new frontend with no behavioural change — they serve as **visual reference** for the React rebuild, not as code to copy.

### 2.1 Layout structure
- `.main-wrapper > .header + .sidebar + .page-wrapper > .content` shell.
- Header sits fixed at top; sidebar pinned left; content scrolls independently.
- This shell maps cleanly onto a Next.js App Router layout (`app/(portal)/layout.tsx`).

### 2.2 Color palette
- Primary `#3D5EE1`, Secondary `#6FCCD8`, Success `#1ABE17`, Danger `#E82646`, Warning `#FFB200`, Info `#1B84FF`.
- Neutral grey scale and surface tones are well chosen.
- Reuse the **values**; reconstruct them as CSS variables / SCSS tokens (see §3.3).

### 2.3 Page archetypes
- Admin dashboard, student/teacher/parent dashboards, list pages, detail pages, form pages, kanban-style boards, calendar pages, auth pages, status/error pages.
- These archetypes match the SchoolOS portal requirement set (see `PORTAL_SCREEN_PLANNING.md`).

### 2.4 Dashboard widget shapes
- Stat tiles, progress cards, activity feeds, schedule lists, leaderboards, attendance summary cards, fee-collection cards.
- Layout and information density are appropriate for school operations.

### 2.5 Form & table vocabulary
- Field grouping, label-on-top with subtle helper text, action buttons right-aligned at the bottom of forms, sticky table headers, row hover, status pills.
- Visual conventions only — implementation is replaced (see §4.7).

### 2.6 Dark-mode toggle UX
- Header carries `#dark-mode-toggle` and `#light-mode-toggle`.
- The mental model (one click flips the whole app, preference persists) is correct; reimplement on top of `data-theme` attribute and React context.

### 2.7 Sidebar nav hierarchy
- Grouped menu (Main, Academics, Operations, Finance, Reports, Settings) with expand/collapse and mini-sidebar mode.
- Information architecture is reusable; React rebuild must merge with backend RBAC so menu items appear only when the calling user has the permission.

### 2.8 Auth-screen composition
- Login, signup, forgot-password, reset-password, OTP — split-screen with illustration on one side, form on the other.
- Layout reusable; backend integration replaces theme stubs.

---

## 3. Needs modification

These aspects are conceptually right but must be rebuilt for the target stack before they fit SchoolOS.

### 3.1 Bootstrap version pin
- Theme ships with Bootstrap 5.x (older minor).
- Target: **Bootstrap 5.3.8** + **React Bootstrap** wrappers — same class names, but JS bundle replaced by React state.

### 3.2 SCSS source reconstruction
- Theme ships **compiled `style.css` only (~28,500 lines)**; no SCSS source.
- Required: hand-author a SCSS layer that imports Bootstrap's own SCSS, exposes design tokens as CSS custom properties, and re-derives the theme's visual look in maintainable partials (`_tokens.scss`, `_layout.scss`, `_components/_card.scss`, etc.).

### 3.3 Color tokenization
- Colors are hardcoded literals throughout the compiled CSS (no `:root` variables).
- Required: introduce `--color-primary`, `--color-surface`, `--color-text`, etc., as CSS custom properties; let `data-theme="dark"` rebind them. This is what makes runtime dark-mode possible without dual stylesheets.

### 3.4 Icon set unification
- Theme uses **four** icon libraries simultaneously: Tabler Icons (dominant), Feather, Font Awesome, Boxicons.
- Target: single icon library — **Lucide Icons** (per `UI_ARCHITECTURE.md`). Tabler usage maps cleanly to Lucide; Feather is already a Lucide ancestor.

### 3.5 Chart library choice
- Theme uses **ApexCharts** with jQuery wrapper calls.
- Modification: keep ApexCharts (it has an official React adapter) OR switch to **Recharts**. Decision deferred to `UI_ARCHITECTURE.md`; either way the jQuery init calls are discarded.

### 3.6 Calendar widget
- Theme uses FullCalendar via jQuery.
- Modification: adopt **FullCalendar's React adapter** (`@fullcalendar/react`) — same library, native React API.

### 3.7 Form controls
- Theme uses native `<input>` styled with `.form-control` plus jQuery plugins for date/time, select, file upload.
- Modification: form controls are rebuilt as React Bootstrap `<Form.Control>` driven by **React Hook Form**; date/time pickers replaced (§5); file upload replaced.

### 3.8 Modals, dropdowns, tabs, accordions, offcanvas
- Theme uses Bootstrap's jQuery JS bundle.
- Modification: use React Bootstrap's controlled components (`<Modal show>`, `<Dropdown>`, `<Tab.Container>`, `<Accordion>`, `<Offcanvas>`) — visual identical, React state-managed.

### 3.9 Accessibility
- Theme suppresses focus rings with `outline: none`, has no skip-to-content link, no documented `aria-` patterns on the menu, no obvious `:focus-visible` handling.
- Modification: add visible focus rings via `:focus-visible`, add `<a href="#main-content" className="skip-link">`, add proper `aria-expanded` / `aria-current` on sidebar items, audit color contrast.

### 3.10 RTL strategy
- Theme has 100+ RTL selectors **compiled into** `style.css` and an "RTL" toggle in the customizer.
- Modification: SchoolOS v1 ships **LTR only**. Keep the SCSS RTL layer scaffolded but unbuilt; revisit when a school requires Arabic/Urdu/Hebrew. This is a v2 concern.

### 3.11 Responsive breakpoints
- Theme breakpoints follow Bootstrap defaults but the sidebar collapses too late on tablet (≥992px).
- Modification: collapse sidebar at `≥768px` so iPad portrait gets the mini-sidebar; mobile shows the offcanvas drawer.

---

## 4. Discard

These are fundamentally incompatible with the React/Next.js target stack. Do not port; replace.

### 4.1 jQuery (3.7.1) and `script.js`
- 2,699 lines of jQuery initialization for sidebar, plugins, fullscreen, OTP input, sidebar popup, chat helpers, counter animations.
- All behaviours are reimplemented as React effects/components.

### 4.2 jQuery DataTables
- Server-side and client-side sorting/filtering plugins.
- Replace with **TanStack Table** (headless) + cursor pagination from backend.

### 4.3 Select2
- jQuery autocomplete-select widget.
- Replace with **React Select** or **headless Combobox** styled to match Bootstrap.

### 4.4 Owl Carousel
- jQuery carousel/slider plugin used on some dashboards.
- Replace with **Swiper React** if a carousel is required; most cases can become a CSS-grid horizontal scroll.

### 4.5 Summernote
- jQuery WYSIWYG editor for HTML content.
- Replace with **TipTap** (React, ProseMirror-based) for any rich-text fields (announcements, lesson notes).

### 4.6 bootstrap-datetimepicker, daterangepicker
- Two separate jQuery date widgets.
- Replace with a **single** React date picker — recommend **react-day-picker** (lightweight, headless, ARIA-correct) for both single-date and range selection.

### 4.7 slimScroll
- jQuery custom scrollbar plugin on the sidebar.
- Replace with native CSS `overflow-y: auto` + `scrollbar-gutter: stable`; modern browsers' default scrollbars are acceptable.

### 4.8 counterUp
- jQuery odometer-style number animation on dashboard tiles.
- Replace with a small React hook (`useCountUp`) or simply render the final number — animation is decorative.

### 4.9 `theme-script.js` (422-line customizer)
- The floating offcanvas with Layout / Top Bar Color / Color Mode / Sidebar Color / Theme Colors / RTL switches.
- Discard the **end-user customizer entirely** for SchoolOS v1. Theme switching collapses to a single dark/light toggle. School-level branding (logo, primary color) is a future capability driven by backend settings, not a runtime customizer.

---

## 5. Plugin replacement map

| Discarded jQuery plugin | React-native replacement | Notes |
|---|---|---|
| DataTables | TanStack Table | Headless; we render with Bootstrap classes. Pagination consumes backend cursor. |
| Select2 | React Select OR Downshift | React Select if multi-select / async loading needed; Downshift for headless minimalism. |
| Owl Carousel | Swiper React | Only where carousel is genuinely needed. |
| Summernote | TipTap | ProseMirror under the hood; modular extensions. |
| bootstrap-datetimepicker | react-day-picker | Single picker covers date + range. |
| daterangepicker | react-day-picker `mode="range"` | Same library, range mode. |
| slimScroll | Native scrollbars + CSS | `scrollbar-gutter: stable`. |
| counterUp | Custom `useCountUp` hook | ~20 lines. |
| FullCalendar (jQuery) | `@fullcalendar/react` | Same library; React adapter. |
| ApexCharts (jQuery) | `react-apexcharts` OR Recharts | Decided in `UI_ARCHITECTURE.md`. |
| Bootstrap JS bundle (modal/dropdown/tab/etc.) | React Bootstrap | Controlled components, React state. |
| `theme-script.js` customizer | Single dark/light toggle | School-level branding later, via backend settings. |

---

## 6. Asset reuse decisions

| Asset | Decision | Action |
|---|---|---|
| `assets/css/style.css` | Discard | Hand-author SCSS partials; use as visual reference only |
| `assets/css/feather.css`, `tabler-icons.css`, `font-awesome.css`, `boxicons.css` | Discard | Replace all four with Lucide Icons |
| `assets/js/script.js` | Discard | Behaviours rebuilt as React |
| `assets/js/theme-script.js` | Discard | Customizer dropped |
| `assets/js/jquery-*.js` | Discard | No jQuery in target |
| `assets/img/` (logo, illustrations, default avatars) | Reuse with caveat | Re-export logo placeholders; vendor illustrations may carry license restrictions — confirm before reuse, or commission replacements |
| `assets/plugins/*` | Discard | All plugins replaced (see §5) |
| HTML pages (58 total) | Visual reference only | See `PAGE_INVENTORY.md` for per-page disposition |
| Font choice (Roboto / Nunito / Poppins) | Pick one | Recommend **Nunito** as system font; self-host via `next/font` instead of Google CDN |

---

## 7. Dark mode

- Theme implements dark mode via `data-theme="dark"` on `<html>`, with a 177-selector dark-mode CSS block compiled in.
- Target: keep the **mental model** (one attribute on `<html>`, persisted in `localStorage`), but drive it via CSS custom properties so each token rebinds without per-selector overrides.
- Initial preference resolution order: explicit user setting → `prefers-color-scheme` → light.

## 8. RTL

- Compiled into the source CSS today (~100 selectors).
- v1 ships LTR only. Defer until a tenant requires it. When revisited, use logical CSS properties (`margin-inline-start`, etc.) rather than mirrored selectors.

## 9. Accessibility scorecard (source theme as-is)

| Concern | Status in theme | Required for SchoolOS |
|---|---|---|
| Skip-to-content link | Missing | Required |
| Visible focus indicators | Suppressed with `outline:none` | Restore via `:focus-visible` |
| Sidebar `aria-expanded` | Inconsistent | Required on all collapsibles |
| Sidebar `aria-current="page"` on active item | Missing | Required |
| Form labels properly associated | Mostly yes | Audit |
| Color contrast | Mostly meets AA | Audit dark mode separately |
| Keyboard-only navigation | Partial (jQuery menu traps focus) | Required across all interactive components |

Accessibility work is a dedicated track in the sprint plan (see `FRONTEND_SPRINT_PLAN.md`).

---

## 10. Browser support target

- Latest two stable versions of Chrome, Edge, Firefox, Safari.
- iOS Safari 16+ and Chrome on Android 12+ for parent/student usage.
- Internet Explorer is out of scope (matches theme).

---

## 11. What this analysis explicitly does NOT do

- Does not modify the theme.
- Does not generate React components, TypeScript, or HTML conversion.
- Does not pick exact npm versions beyond Bootstrap 5.3.8 and the stack named in `UI_ARCHITECTURE.md`.
- Does not commit to FullCalendar vs. an alternative, nor ApexCharts vs. Recharts — those land in `UI_ARCHITECTURE.md`.
- Does not begin Sprint F1.

---

## 12. Conclusion

The purchased theme is a **strong visual baseline** for SchoolOS but a **weak runtime baseline**. Reuse the design language, the page archetypes, the sidebar hierarchy, and the color palette. Rebuild everything that runs in the browser on top of Next.js + React Bootstrap + the plugin replacements listed in §5. The customizer is dropped; accessibility is upgraded; RTL is deferred; icons collapse to one library; CSS becomes tokenized SCSS.

The next document, `COMPONENT_INVENTORY.md`, walks the same survey one level deeper and classifies each UI control individually.
