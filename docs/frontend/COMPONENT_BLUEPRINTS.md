# SchoolOS — Component Blueprints

> **Status:** Frozen blueprint specification (Parts 1 + 2 of 3).
> **Authority:** Binds every reusable UI component built during Sprints F1–F16.
> **Scope of this file:** SECTION A — Application Layout (9), SECTION B — Dashboard (8), SECTION C — Table System (7), SECTION D — Form System (3), SECTION E — Overlays (5), SECTION F — Common UI (8). Part 3 will follow.
> **Companions:**
> - `ENTERPRISE_DESIGN_SYSTEM.md` — visual contract, tokens, status palette, design principles.
> - `FRONTEND_UI_SPECIFICATION.md` — UI Standard (RHF, TanStack Query, If-Match, modal/drawer rules).
> - `UI_ARCHITECTURE.md` — folder structure, stack rationale.
> - `THEME_ANALYSIS.md` — purchased-theme verdicts (kept / modified / discarded) and plugin replacement map.
> - `FRONTEND_FREEZE_v1.md` — freeze certificate.

---

## 0. Reading guide

Each blueprint is a **specification, not code**. It defines:

1. **Purpose** — what the component is for and where it lives.
2. **Visual Structure** — anatomy and parts.
3. **ASCII Wireframe** — geometry and proportion.
4. **Responsive Behaviour** — desktop / tablet / mobile rules.
5. **States** — every UI state the component must handle.
6. **Accessibility Rules** — keyboard, ARIA, focus.
7. **API Integration Expectations** — which endpoints it consumes (per `API_UI_MAPPING.md`) and the integration contract.
8. **Reusability Rules** — where this component MUST be reused vs forbidden bespoke alternatives.
9. **Do's** — prescriptive rules.
10. **Don'ts** — explicit prohibitions (often citing the 25 Design Principles from `ENTERPRISE_DESIGN_SYSTEM.md` §16).

All token names (`--brand-primary`, `--space-4`, `--motion-duration-base`, etc.) refer to design tokens defined in `ENTERPRISE_DESIGN_SYSTEM.md`. No blueprint redefines them.

---

## 0.1 Global Theme Preservation Rules

The purchased Bootstrap admin theme remains the **visual foundation** of SchoolOS. All blueprints below comply with these global rules:

### Reused directly from the theme
- **Shell skeleton.** `.main-wrapper > .header + .sidebar + .page-wrapper > .content` markup convention is preserved.
- **Bootstrap grid.** `.container-fluid`, `.row`, `.col-md-*`, `.col-lg-*`, `.col-xl-*` for layout grids.
- **Bootstrap utilities.** `d-flex`, `align-items-*`, `justify-content-*`, `gap-*`, `text-*`, `bg-*`, `mb-*`, `p-*` continue to be used where they replace a custom rule.
- **Card markup.** `.card`, `.card-header`, `.card-body`, `.card-footer` retained.
- **Form markup.** `.form-control`, `.form-select`, `.form-check`, `.input-group`, `.form-label`, `.form-text` retained.
- **Button markup.** `.btn`, `.btn-primary`, `.btn-outline-secondary`, `.btn-danger`, `.btn-sm`, `.btn-lg`.
- **Table markup.** `.table`, `.table-hover`, `.table-borderless` retained. `.table-striped` is **discarded** (see below).
- **Pagination markup.** `.pagination`, `.page-item`, `.page-link` retained for visual rhythm, but pagination semantics switch to cursor-only (see Part 2).
- **Breadcrumb markup.** `.breadcrumb`, `.breadcrumb-item` retained.
- **Badge markup.** `.badge` retained with status palette overrides.
- **Tabs.** `.nav-tabs`, `.nav-pills`, `.tab-pane` retained.
- **Modal markup.** `.modal`, `.modal-dialog`, `.modal-header`, `.modal-body`, `.modal-footer` (via React Bootstrap).
- **Offcanvas markup.** `.offcanvas`, `.offcanvas-start/end` (via React Bootstrap) — used for Drawer.
- **Dropdown markup.** `.dropdown`, `.dropdown-menu`, `.dropdown-item`.
- **Placeholder skeletons.** `.placeholder`, `.placeholder-glow` retained for loading skeletons.

### Visually modernized
- **Sidebar.** Default is **light** (vs theme's dark default); 260 px / 72 px / drawer breakpoints; Lucide icons replace Feather/Boxicons; flat 1px right border replaces drop shadow.
- **Header.** Locked at **60 px desktop / 56 px mobile**; bg `#FFFFFF`; flat 1px bottom border; brand block at left; search center; actions at right.
- **Brand color.** `#2D4FCC` replaces theme's `#3D5EE1` everywhere via SCSS override.
- **Typography.** Inter replaces Roboto / Nunito / Poppins entirely.
- **Cards.** No top-stripe color bars (discarded); flat `--shadow-sm`; `--radius-md` 12px.
- **Tables.** No row stripes; sticky header; density selector; cursor pagination; sort indicators standardized.
- **Buttons.** No gradients, no rounded-pill except status chips; 32 / 40 / 48 px heights only.
- **Status chips.** Mapped to ENTERPRISE §10 15-status palette; icon-first pattern (Lucide); pill radius `--radius-pill`.
- **Charts.** Apex charts retained but recolored to brand palette; 3D / gradient / dual-axis variants discarded.

### Discarded outright
- jQuery, `script.js`, `theme-script.js` (customizer).
- DataTables → **TanStack Table**.
- Select2 → **React Select**.
- Owl Carousel → **Swiper React**.
- Summernote → **TipTap**.
- bootstrap-datetimepicker + daterangepicker → **react-day-picker**.
- slimScroll → native CSS scrollbars (`overflow: auto`).
- counterUp → discarded; KPI metrics render static (no count-up animation — see Design Principle #20).
- FullCalendar (jQuery) → **@fullcalendar/react**.
- ApexCharts (jQuery) → **react-apexcharts**.
- Bootstrap JS bundle → **React Bootstrap** controlled components.
- Tabler / Feather / FontAwesome / Boxicons → **Lucide** only (Design Principle #10).
- Roboto / Nunito / Poppins → **Inter** only (Design Principle #9).
- Pure-green `#1ABE17`, pure-red `#E82646`, cyan `#6FCCD8`, gradient buttons.
- Card top color stripes, alternating row stripes, bell sound, theme customizer panel.
- RTL (deferred), i18n beyond `en-IN` (v1).

### jQuery → React replacement map (applies across all blueprints)
| jQuery behavior in source theme | React replacement |
|---|---|
| `$('.sidebar').toggle()` collapse | Controlled `useSidebar()` state in `<AppLayout>` |
| `$('.dropdown').dropdown()` | React Bootstrap `<Dropdown>` |
| `$('.modal').modal('show')` | React Bootstrap `<Modal show={...}>` |
| `$('.offcanvas').offcanvas('show')` | React Bootstrap `<Offcanvas show={...}>` |
| `$('.select2').select2()` | `<Select>` from `react-select` |
| `$('.daterangepicker').daterangepicker()` | `<DayPicker mode="range">` from `react-day-picker` |
| `$('.summernote').summernote()` | TipTap editor wrapper |
| `$('table').DataTable()` | `<DataTable>` (TanStack Table) |
| `$('.counter').counterUp()` | Static metric render (no animation) |
| `$('.theme-toggle').on('click', ...)` | `<ThemeSwitcher>` with `useTheme()` |
| Sidebar overlay close on outside click | React Portal + click-outside hook |
| `data-bs-*` attributes | React Bootstrap props (`show`, `onHide`, `placement`) |

---

# SECTION A — APPLICATION LAYOUT

This section defines the structural chrome that every authenticated page renders inside. Anonymous routes (login, password reset) bypass `<AppLayout>` and use the auth-only shell defined in Part 3.

## A.1 Application Layout (`<AppLayout>`)

### Purpose
The single, top-level shell that wraps every authenticated page across all five portals (Platform, SchoolAdmin, Teacher, Student, Parent). It owns the sidebar, header, breadcrumb, content slot, and global feedback regions (toast, command palette, impersonation banner). It is the **only** layout permitted under `app/(authenticated)/*` route groups.

### Visual Structure
- `<ImpersonationBanner>` (conditional, top)
- `<AppHeader>` (sticky, full-width, 60 px)
- `<AppSidebar>` (left, 260 / 72 / drawer)
- `<main role="main">` content region with `<Breadcrumb>` + page body
- `<ToastRegion>` (bottom-right portal)
- `<CommandPalette>` (modal portal, hidden by default)
- `<NotificationDrawer>` (offcanvas-end, hidden by default)
- `<SkipToContent>` link (visually hidden, focusable)

### ASCII Wireframe
```
+--------------------------------------------------------------------+
| [SkipToContent] (visually hidden, focusable)                       |
+--------------------------------------------------------------------+
| ImpersonationBanner (only when impersonating; danger-subtle bg)    |
+--------------------------------------------------------------------+
| AppHeader (60px, sticky)                                           |
|  [Brand] [Search........]              [Theme] [Bell] [User v]     |
+--------+-----------------------------------------------------------+
|        | Breadcrumb: Home / Module / Page                          |
|        +-----------------------------------------------------------+
|        |                                                           |
| Side   |                  Page Content                             |
| bar    |                  (route children)                         |
| 260px  |                                                           |
|        |                                                           |
|        |                                                           |
+--------+-----------------------------------------------------------+
                                              [ToastRegion bottom-r] |
                                                                     |
                            [CommandPalette modal — portal, hidden]  |
                            [NotificationDrawer offcanvas — hidden]  |
+--------------------------------------------------------------------+
```

### Responsive Behaviour
| Breakpoint | Sidebar | Header | Content padding |
|---|---|---|---|
| ≥ 1280 px | Full 260 px, persistent | 60 px | 24 px |
| 992 – 1279 px | Full 260 px, persistent | 60 px | 24 px |
| 768 – 991 px | Mini 72 px, icons only, hover-expand tooltip | 60 px | 20 px |
| < 768 px | Hidden; opens as drawer overlay (100 % width × 100 % height) | 56 px | 16 px |

The breakpoints derive from `ENTERPRISE_DESIGN_SYSTEM.md` §5 and are the **only** breakpoints used by any blueprint in this document.

### States
| State | Behavior |
|---|---|
| Default | Sidebar expanded, header sticky, content scrollable. |
| Sidebar collapsed (desktop) | Persisted in `localStorage:schoolos.sidebar.collapsed`. |
| Sidebar drawer (mobile) | Backdrop dim; `Esc` and outside click close. |
| Impersonating | `<ImpersonationBanner>` visible; height adds 36 px above header. |
| Offline | Snackbar "You're offline" in `<ToastRegion>` (per UI_TESTING_STRATEGY §21). |
| Command palette open | Backdrop dim; sidebar interactions disabled. |
| Loading (initial auth check) | Full-screen `<Spinner size="lg">` centered; no chrome until session resolved. |

### Accessibility Rules
- Landmarks: `role="banner"` on header, `role="navigation"` on sidebar, `role="main"` on content, `role="contentinfo"` on footer (Platform portal only).
- `<SkipToContent>` is the first focusable element; targets `#main-content`.
- Keyboard: `Ctrl/Cmd + B` toggles sidebar; `Ctrl/Cmd + K` opens command palette; `Esc` closes any overlay (palette → drawer → modal → toast).
- Focus is **never** lost when sidebar collapses; focus moves to the trigger button.
- All overlays trap focus (palette, drawer, modal).
- WCAG 2.1 AA contrast (per ENTERPRISE §15).

### API Integration Expectations
- Calls `GET /api/v1/auth/me` once on mount to seed `useSession()`.
- Calls `GET /api/v1/auth/permissions` once on mount to seed `usePermissions()`.
- Calls `GET /api/v1/auth/feature-flags` once on mount to seed `useFeatureFlag()`.
- Calls `GET /api/v1/notifications/unread-count` on a 60 s interval (TanStack Query `refetchInterval`) for header bell badge.
- All four calls are de-duplicated via TanStack Query and shared across child components.
- Every request carries `X-Trace-Id` (from `lib/api/trace-id.ts`).
- 401 from any of the above triggers silent refresh; on second 401 redirect to `/login`.

### Reusability Rules
- **Mandatory** — every authenticated page renders inside `<AppLayout>`. No exceptions, including dashboards and detail pages.
- Forbidden — page-specific custom shells, sidebars, headers.
- The shell is portal-agnostic; the portal differs only in the sidebar menu config (see A.2).

### Do's
- DO render `<AppLayout>` once at the route group level (`app/(school)/layout.tsx`), not per page.
- DO use `<Breadcrumb>` (A.4) for every page — even one-level pages.
- DO place page-level CTAs in the page body, not the header. The header is global only.
- DO hydrate session, permissions, and feature flags before rendering route children (Suspense boundary).

### Don'ts
- DON'T nest layouts. There is exactly one `<AppLayout>` per render tree.
- DON'T put portal-specific styling here; portal differs only by sidebar config.
- DON'T render the customizer panel — discarded.
- DON'T animate sidebar width with anything longer than `--motion-duration-base` (200 ms).
- DON'T inline-style or override layout dimensions per page.

---

## A.2 Sidebar (`<AppSidebar>`)

### Purpose
Primary navigation column. Renders the menu config supplied by the active portal. Collapses to a 72 px mini rail on tablet and to a drawer on mobile. Shows the active route, supports nested menus (one level), and gates each item by permission and feature flag.

### Visual Structure
- Brand block (top, 60 px, identical height to header for grid alignment)
- Scrollable nav region (`role="navigation"`, `aria-label="Primary"`)
- Menu sections with optional section labels (uppercase 11 px / 600)
- Menu items: icon (Lucide, 20 px) + label + optional badge
- Submenu items: indented 32 px, no icon, expand/collapse chevron on parent
- Footer block (optional, sticky bottom): support link, app version

### ASCII Wireframe
```
+------------------------------+
| [SchoolOS]   School Name v   |  <-- 60px brand block
+------------------------------+
| MAIN                         |  <-- section label
|  o Dashboard                 |
|  o Inbox                  3  |  <-- badge (count)
|                              |
| ACADEMICS                    |
|  o Students                  |
|  o Classes        v          |  <-- expandable parent
|     - Class 9                |
|     - Class 10               |
|  o Subjects                  |
|                              |
| FINANCE                      |
|  o Fees                      |
|  o Invoices                  |
|                              |
| ...scrollable...             |
+------------------------------+
| Help & Support               |
| v1.0.0                       |
+------------------------------+
```

Collapsed (mini, 72 px):
```
+----+
| SO |
+----+
| o  |   <-- icons only; tooltip on hover
| o  |
| o  |
| o  |
+----+
```

### Responsive Behaviour
| Breakpoint | Mode |
|---|---|
| ≥ 992 px | Persistent, 260 px wide, full labels. Collapsible to 72 px via `Ctrl/Cmd + B`. |
| 768 – 991 px | Defaults to mini (72 px). Hovering an item shows label tooltip. |
| < 768 px | Drawer, 100 % × 100 %, backdrop dim. Opened from header hamburger. |

### States
| State | Behavior |
|---|---|
| Default | Items render; active item highlighted with `--brand-primary-subtle` bg + 3 px left bar in `--brand-primary`. |
| Active item | bg `--brand-primary-subtle`; text `--brand-primary`; bar visible. |
| Hover (inactive item) | bg `--surface-muted`; text `--text-primary`. |
| Disabled (no permission) | Item is filtered out via `<PermissionGate>`; not rendered. |
| Feature-flag off | Item hidden via `<FeatureFlagBoundary>`. |
| Expandable parent | Chevron rotates 90° on expand; transition `--motion-duration-base`. |
| Loading menu config | Skeleton: 6 placeholder rows, `placeholder-glow`. |
| Mini mode + active | bar visible; icon centered; tooltip shows label on hover. |
| Drawer mode | Backdrop click closes; `Esc` closes; focus returns to hamburger button. |

### Accessibility Rules
- `<nav aria-label="Primary">` wrapping the menu region.
- Active item has `aria-current="page"`.
- Expandable parents use `aria-expanded` + `aria-controls`.
- Keyboard: `↑/↓` move focus between visible items; `Enter`/`Space` activate; `→` expand a parent; `←` collapse.
- Focus ring per ENTERPRISE token (`0 0 0 3px rgba(45,79,204,0.30)`).
- Tooltip labels in mini mode are real `<span>` elements with `aria-hidden="false"` (not pure CSS pseudo-elements).
- Drawer: focus trapped; `Esc` closes.

### API Integration Expectations
- Menu config is **static per portal**, defined in `lib/nav/menus/{portal}.ts`. No menu endpoint.
- Each item declares `{ permission?, featureFlag? }`. The component renders only items whose gates pass.
- Badges (e.g. unread count, pending approvals) come from per-item count queries declared in the menu config: e.g. `countQuery: () => queryKey [...]`. These reuse TanStack Query and refresh every 60 s.

### Reusability Rules
- **Mandatory** — the only sidebar component in the app. Each portal supplies a config; never a separate component.
- Forbidden — portal-bespoke sidebar code.

### Do's
- DO drive items entirely from menu config; no hardcoded items in the component.
- DO collapse counts > 99 to `99+`.
- DO use Lucide icons sized 20 px with stroke 2.

### Don'ts
- DON'T animate icon swaps or use rotating logos.
- DON'T allow more than one nested level (no submenus of submenus).
- DON'T use color stripes other than the 3 px brand bar on the active item.
- DON'T render disabled-state items (per-permission items are filtered, not greyed) — per Design Principle #4.

---

## A.3 Header (`<AppHeader>`)

### Purpose
Top app bar. Hosts brand (mobile), global search trigger, theme switcher, notification bell, and user menu. Persistent across all authenticated routes. Locked height; never grows.

### Visual Structure
- Left: hamburger (mobile) + brand mark (mobile only; desktop shows brand in sidebar).
- Center: `<SearchBar>` (A.5) — desktop only; replaced by a search icon button on mobile.
- Right cluster (right-to-left): `<UserMenu>` → `<NotificationBell>` → `<ThemeSwitcher>` → `<CommandPaletteTrigger>` (desktop only; shows `Ctrl/Cmd + K` hint).
- Bottom: flat 1 px `--border-default`; **no shadow**.

### ASCII Wireframe
```
+---------------------------------------------------------------------+
| [=] [SO]   [ Q  Search anything (Ctrl+K) ]    [SunIcon] [Bell3][Av v] |
+---------------------------------------------------------------------+
   |    |                |                          |       |    |
hamb brand          search bar               theme  bell  user
mob  mob            (desktop)                tog          menu
```

Mobile (< 768 px, 56 px tall):
```
+--------------------------------------+
| [=] [SO]              [Q] [Bell] [Av] |
+--------------------------------------+
```

### Responsive Behaviour
| Breakpoint | Layout |
|---|---|
| ≥ 992 px | Search bar inline (max 480 px wide), all right actions visible. |
| 768 – 991 px | Search collapsed to icon; tapping opens command palette. Right cluster visible. |
| < 768 px | Hamburger + brand left; search icon + bell + avatar right. Theme switcher moves into user menu. |

### States
| State | Behavior |
|---|---|
| Default | All controls active. |
| Offline | Bell shows static (no polling); subtle warning dot on bell. |
| Bell with unread | Red `--color-danger` dot at top-right of bell icon. Count not rendered numerically until drawer opens (Design Principle #5: progressive disclosure). |
| Search focused | Triggers `<CommandPalette>` (search bar is a trigger, not a search input). |
| Theme transitioning | Brief opacity flash 120 ms (Design Principle #20). |
| Impersonating | Border-bottom recolors `--color-danger`; impersonation tag visible. |

### Accessibility Rules
- `<header role="banner">`.
- Each right-cluster button has `aria-label` (e.g. `aria-label="Notifications, 3 unread"`).
- Skip-to-content target sits before the header but rendered above.
- Keyboard: `Tab` flows left-to-right; `Ctrl/Cmd + K` from anywhere opens command palette; `Esc` closes overlays.
- Focus ring per ENTERPRISE token.

### API Integration Expectations
- Unread count: `GET /api/v1/notifications/unread-count`, polled at 60 s.
- Session avatar/name: from `useSession()` (no separate request).
- Tenant brand: from `useTenant()` (provided by `<AppLayout>`).
- No header-owned mutations.

### Reusability Rules
- **Mandatory** — only one header component, used by every portal.
- Portal differences are purely cosmetic (brand text changes via tenant).

### Do's
- DO keep header height at exactly 60 px (desktop) / 56 px (mobile).
- DO render only the four right-side action types listed; no others.
- DO show a single visible focus ring at any time.

### Don'ts
- DON'T add module-specific buttons here (Design Principle #4).
- DON'T render a count numerically on the bell icon — use a dot.
- DON'T animate any icon on hover beyond `--motion-duration-fast` 120 ms color shift.
- DON'T allow the header to scroll with content.

---

## A.4 Breadcrumb (`<Breadcrumb>`)

### Purpose
Linear trail from the portal root to the current page. Renders directly under the header inside the content area. Mandatory on every authenticated page (even one-level pages, which then show only the page title — see Don'ts).

### Visual Structure
- Inline ordered list, left-aligned.
- Separator: `chevron-right` Lucide icon, 14 px, `--text-muted`.
- Items: link (`<a>`) for ancestors; plain text `<span>` with `aria-current="page"` for current.
- Item typography: `--text-small` 13 px / 400, `--text-secondary` for links, `--text-primary` for current.
- Optional right-side meta slot for last-updated timestamp or version chip (used by Detail pages).

### ASCII Wireframe
```
+-------------------------------------------------------------------+
| Home  >  Students  >  Class 10A  >  Aarav Sharma          v.4 12s |
+-------------------------------------------------------------------+
```

### Responsive Behaviour
| Breakpoint | Behavior |
|---|---|
| ≥ 768 px | Full trail rendered. |
| < 768 px | Collapse to last two segments: `... > Class 10A > Aarav Sharma`. The collapsed segment is a popover when tapped. Right meta slot hides; relocates to page subtitle. |

### States
| State | Behavior |
|---|---|
| Default | Ancestors are links; current is plain. |
| Loading title | Last segment renders a 120 px placeholder (`placeholder-glow`). |
| Forbidden ancestor | Skip the ancestor link; render as plain text. |
| Long names | Each segment max 28 chars; truncate with ellipsis; full name in `title` attribute. |

### Accessibility Rules
- `<nav aria-label="Breadcrumb">` wrapping an ordered list.
- Each separator is decorative: wrapped in `<span aria-hidden="true">`.
- Current page item has `aria-current="page"`.
- Keyboard: standard link tab order.

### API Integration Expectations
- No direct API calls. Receives `items: [{ label, href? }]` prop from the page.
- Pages that load a named entity (e.g. a student) provide the breadcrumb via the entity's TanStack Query result, so the trail reflects the loaded record name.

### Reusability Rules
- **Mandatory** — the only breadcrumb component.
- The first segment is always the portal root (e.g. `Home` in SchoolAdmin) and is **non-clickable** if it equals the current page.

### Do's
- DO render exactly one breadcrumb per page.
- DO truncate long entity names but preserve them in `title`.
- DO use `chevron-right` (Lucide) for separators only.

### Don'ts
- DON'T put action buttons here. Actions belong in the page header area beneath the breadcrumb.
- DON'T omit the breadcrumb on dashboards — the dashboard is the portal root, so the breadcrumb is `Home` with `aria-current="page"`.
- DON'T use ` / ` or ` > ` text characters as separators.

---

## A.5 Search Bar (`<SearchBar>`)

### Purpose
The header's central control. Visually a search input but functionally a **trigger** for `<CommandPalette>`. No standalone search results render here. Single, global affordance for "find anything across the app."

### Visual Structure
- Pill-shaped wrapper, height 40 px, max-width 480 px, bg `--surface-muted`, border `--border-default`.
- `search` Lucide icon left, 16 px, `--text-muted`.
- Placeholder: `Search anything…` followed by keyboard hint chip `Ctrl K` (Mac: `⌘ K`).
- Hint chip: 11 px monospace, bg `--surface-card`, border `--border-default`, padding `2px 6px`.

### ASCII Wireframe
```
+--------------------------------------------------+
| Q  Search anything...                  [Ctrl K]  |
+--------------------------------------------------+
```

Focused / hovered:
```
+--------------------------------------------------+
| Q  Search anything...                  [Ctrl K]  |  <-- border: --brand-primary
+--------------------------------------------------+
```

### Responsive Behaviour
| Breakpoint | Behavior |
|---|---|
| ≥ 992 px | Inline, 480 px wide. |
| 768 – 991 px | Inline, 320 px wide. |
| < 768 px | Collapsed to a single search icon; opens command palette directly on tap. |

### States
| State | Behavior |
|---|---|
| Default | Idle, placeholder visible. |
| Hover | Border shifts to `--border-strong`. |
| Focus | Border shifts to `--brand-primary`; focus ring per ENTERPRISE token. Clicking does NOT focus into the bar; instead opens the palette. |
| Keyboard activation | `Ctrl/Cmd + K` opens palette from anywhere, even when search bar is not focused. |
| Disabled | Greyed out only during initial session bootstrapping; restored after. |

### Accessibility Rules
- Role: `button` (not `searchbox`) — because it is a trigger.
- `aria-label="Open command palette"`.
- `aria-keyshortcuts="Control+K Meta+K"`.
- Hint chip is `aria-hidden="true"` (decorative; shortcut announced via `aria-keyshortcuts`).
- Keyboard: `Enter`, `Space`, `Ctrl/Cmd + K`, or click — all open palette.

### API Integration Expectations
- No direct API calls. Pure trigger; palette owns the search.

### Reusability Rules
- **Mandatory** — only one search bar component, used only by `<AppHeader>`.
- Forbidden — page-level "search" inputs that look identical (page-scoped filtering uses `<FilterBar>` in Part 2).

### Do's
- DO keep this purely a trigger; never render results inline.
- DO render the keyboard hint chip on desktop only.

### Don'ts
- DON'T type into this bar — it is not an input.
- DON'T add a clear (✕) button.
- DON'T render multiple search bars on a page.

---

## A.6 Global Command Palette (`<CommandPalette>`)

### Purpose
Spotlight-style global launcher for cross-module search, quick navigation, and command execution. Opened by `Ctrl/Cmd + K`, by the search bar, or by mobile search icon. Always available, every portal.

### Visual Structure
- Portal-rendered overlay; backdrop `rgba(0,0,0,0.40)`.
- Centered dialog, top-aligned (top: 96 px), width 640 px, max-height 480 px.
- Top: input row with `search` Lucide icon (20 px), text input, and right-aligned close `Esc` hint.
- Middle: scrollable results list grouped by category. Each result row: leading icon (Lucide 16 px), label, optional secondary text right-aligned, kbd shortcut on hover for first match.
- Bottom footer: tip strip showing keyboard shortcuts: `↑↓ navigate · Enter open · Esc close`.

### ASCII Wireframe
```
                  +----------------------------------------+
                  | Q  type to search...              Esc  |
                  +----------------------------------------+
                  | RECENT                                 |
                  |  o  Aarav Sharma         Student       |
                  |  o  Class 10A           Class          |
                  +----------------------------------------+
                  | PEOPLE                                 |
                  |  o  Riya Patel          Student        |
                  |  o  Mrs. Verma          Teacher        |
                  +----------------------------------------+
                  | ACTIONS                                |
                  |  >  Create Invoice                     |
                  |  >  Mark Attendance                    |
                  +----------------------------------------+
                  | NAVIGATE                               |
                  |  ->  Dashboard                         |
                  |  ->  Fees                              |
                  +----------------------------------------+
                  | UP/DN navigate  ENTER open  ESC close  |
                  +----------------------------------------+
```

### Responsive Behaviour
| Breakpoint | Width | Height |
|---|---|---|
| ≥ 768 px | 640 px | max 480 px |
| < 768 px | 100 % - 24 px | max 70 vh, top: 24 px |

### States
| State | Behavior |
|---|---|
| Closed | Dialog unmounted; no listeners attached except global shortcut. |
| Opening | Fade + 4 px slide-down, `--motion-duration-base`. |
| Idle (empty query) | Shows Recent (last 5 navigations) + suggested Actions. |
| Typing | Debounced 200 ms; loading shimmer on result rows; current results dimmed while fetching. |
| Results | Up to 7 rows per group; "Show all in {category}" link if > 7. |
| No results | `<EmptyState>` (see Part 2) with `compass` icon, "No matches" message, suggestion to refine. |
| Forbidden item | Hidden per `<PermissionGate>`. |
| Selecting | Arrow keys move highlight; `Enter` activates; clicking activates. |
| Closing | `Esc`, backdrop click, or after a result is chosen. |

### Accessibility Rules
- `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`.
- Input has `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`.
- Result list has `role="listbox"`; items `role="option"`.
- Focus trapped inside dialog; restores to previously focused element on close.
- `Esc` always closes; never swallowed.

### API Integration Expectations
- Search query: `GET /api/v1/search?q={q}&type={people,classes,fees,...}` returning `{ data: { groups: [...] } }`.
- Recent: stored in `localStorage:schoolos.cmdk.recent` (max 5).
- Actions: registered in `lib/cmdk/actions.ts`; each action declares `permission` and `featureFlag`.
- Aborts in-flight requests on subsequent keystrokes (AbortController).
- 60 ms minimum render delay before showing loader to avoid flicker.

### Reusability Rules
- **Mandatory** — the single launcher. Forbidden — module-specific Spotlight clones.
- Action registry is the only way to add palette commands.

### Do's
- DO debounce input at 200 ms.
- DO group results by category with section labels.
- DO show keyboard hints in the footer strip.

### Don'ts
- DON'T fetch on every keystroke without debounce.
- DON'T render more than ~25 visible rows total before scroll.
- DON'T allow free-text submission with `Enter` when no result is highlighted — show a hint instead.

---

## A.7 User Menu (`<UserMenu>`)

### Purpose
Right-most header control. Dropdown menu attached to the user's avatar. Hosts profile shortcuts, role switcher (if multi-role), tenant switcher (Platform portal only), theme switcher (mobile only), and logout. Single point for identity actions.

### Visual Structure
- Trigger: `<Avatar size="sm">` (28 px) + caret `chevron-down` (14 px), inside a 40 px tall pill.
- Menu (`<Dropdown.Menu>` from React Bootstrap):
  - Header row: large `<Avatar size="md">`, full name (`h6` 14 px / 600), role line (`--text-xs` 12 px / 500 muted), tenant name.
  - Divider.
  - Items: `My Profile`, `My Preferences`, `Switch Role` (only if user has > 1 active role), `Switch Tenant` (Platform only), `Theme` (mobile only), divider, `Sign out`.

### ASCII Wireframe
```
Closed:
+---------------+
| (AV) name  v  |
+---------------+

Open:
+---------------+----------------------------+
| (AV) name  ^                               |
+---------------+----------------------------+
                | [AV]  Priya Verma          |
                |       SchoolAdmin          |
                |       Springfield Academy  |
                +----------------------------+
                | o  My Profile              |
                | o  My Preferences          |
                | o  Switch Role         >   |
                +----------------------------+
                | o  Sign out                |
                +----------------------------+
```

### Responsive Behaviour
| Breakpoint | Trigger | Menu width |
|---|---|---|
| ≥ 768 px | Avatar + name + caret | 280 px |
| < 768 px | Avatar + caret (name hidden) | 280 px |

### States
| State | Behavior |
|---|---|
| Closed | Avatar visible; caret idle. |
| Hover | bg `--surface-muted`. |
| Open | Menu visible; caret rotates 180°. |
| Multi-role user | "Switch Role" submenu lists active roles with current marked by check. |
| Single role | "Switch Role" hidden. |
| Platform operator | "Switch Tenant" item visible. |
| Logging out | Menu disabled; button shows spinner; on success redirect to `/login`. |

### Accessibility Rules
- Trigger: `aria-haspopup="menu"`, `aria-expanded`.
- Menu: `role="menu"`; items `role="menuitem"`.
- Focus moves to first item on open; restored to trigger on close.
- `Esc` closes; arrow keys navigate items.

### API Integration Expectations
- Profile/role: from `useSession()`.
- Roles: `GET /api/v1/auth/me/roles` (cached 5 min).
- Logout: `POST /api/v1/auth/logout` (idempotent with `Idempotency-Key`); clears tokens; routes to `/login` with a toast.
- Tenant switch (Platform): `POST /api/v1/platform/impersonations` or tenant switch endpoint per `API_UI_MAPPING.md`.

### Reusability Rules
- **Mandatory** — sole identity menu. Used only inside `<AppHeader>`.

### Do's
- DO render the role + tenant line every time, even for single-tenant users.
- DO sign out via real `POST /logout` (no client-only token wipe).

### Don'ts
- DON'T put module shortcuts here. The sidebar handles navigation.
- DON'T render the theme switcher on desktop — it lives in the header (A.9).

---

## A.8 Avatar (`<Avatar>`)

### Purpose
Reusable visual identity chip for people (users, students, teachers, parents) and entities (schools, classes — for entities the avatar shows initials only). Used in user menu, tables, cards, comments, attendance rosters.

### Visual Structure
- Circle (default) or rounded square (entity variant).
- Image (if URL) or initials fallback.
- Optional status dot (online / offline / busy).
- Optional border for stack/group context (2 px `--surface-card` border, used inside `<AvatarGroup>`).

### ASCII Wireframe
```
Sizes (px):
  xs 20   sm 28   md 36   lg 48   xl 72   2xl 96

Variants:
  +-----+   +-----+      +---+
  | PV  |   |     |      |PV |   <-- entity (rounded square)
  +-----+   +-----+      +---+
   text     image

Stack/group (5 max + overflow chip):
  ( PV )( AR )( MK )( +3 )

With status:
  +-----+
  | AR  |o   <-- online dot bottom-right
  +-----+
```

### Responsive Behaviour
| Context | Size |
|---|---|
| Tables | xs 20 px |
| Inline lists / breadcrumbs | sm 28 px |
| Cards | md 36 px |
| Header user menu trigger | sm 28 px |
| User menu header | md 36 px |
| Profile page | xl 72 px or 2xl 96 px |

### States
| State | Behavior |
|---|---|
| Image loaded | `<img>` renders. |
| Image failed / missing | Initials fallback, generated from `name` (first letter of first two words). bg = deterministic hash of `name` → one of 8 muted palette colors. |
| Loading | `placeholder-glow` circle, same size. |
| Status dot | Optional `status: 'online' | 'offline' | 'busy' | 'away'` prop. Dot size = 25 % of avatar size, min 6 px. |
| Disabled / deactivated | 40 % opacity, no status dot. |

### Accessibility Rules
- `<img>` has `alt={fullName}` always.
- Decorative-only context (e.g. inside a row that already labels the person) → `alt=""` and `role="presentation"`.
- Status dot: visible label via `aria-label="Online"` on a wrapping span; never color-only signaling.
- Contrast on initials background ≥ 4.5:1.

### API Integration Expectations
- No direct API. Accepts `src`, `name`, `status`, `size`, `variant`.
- Image URL pattern: `/storage/avatars/{userId}.jpg` (resolved by parent).
- No retries on image failure; fall through to initials.

### Reusability Rules
- **Mandatory** — the only avatar primitive. Forbidden — bespoke `<UserCircle>` / `<Initials>` components.
- `<AvatarGroup>` is a wrapper that uses `<Avatar>` internally; not a separate visual primitive.

### Do's
- DO derive initials from up to 2 words: `Priya Verma` → `PV`, `Aarav` → `AA` (single name doubled? no — show `AR` from first two letters of the single name).
- DO assign deterministic background color from a fixed 8-color muted palette listed in `ENTERPRISE_DESIGN_SYSTEM.md` §1.4.

### Don'ts
- DON'T use emoji avatars.
- DON'T animate the status dot.
- DON'T use color-only to signal status; always pair with `aria-label`.

---

## A.9 Theme Switcher (`<ThemeSwitcher>`)

### Purpose
Toggles between **light** (default), **dark**, and **system** modes. Lives in the header on desktop and inside the user menu on mobile. Single point of theme control.

### Visual Structure
- Desktop: 40 px icon button in the header (Lucide `sun` for light, `moon` for dark, `monitor` for system).
- Mobile: a menu item inside `<UserMenu>` showing the current mode with chevron, opening a 3-option submenu.
- Tooltip on desktop: `Theme: Light` / `Theme: Dark` / `Theme: System`.

### ASCII Wireframe
```
Desktop:
+-----+
| Sun |   <-- click cycles Light -> Dark -> System -> Light
+-----+

Mobile (inside UserMenu):
+--------------------------------+
| Theme: System            v     |
+--------------------------------+
   (tap)
+--------------------------------+
| o  Light                       |
| o  Dark                        |
| *  System                      |
+--------------------------------+
```

### Responsive Behaviour
| Breakpoint | Affordance |
|---|---|
| ≥ 768 px | Header icon button, single click cycles. Shift+click opens a popover with all 3 options. |
| < 768 px | Inside UserMenu as a submenu item. |

### States
| State | Behavior |
|---|---|
| Light | Sun icon, accent `--brand-primary`. |
| Dark | Moon icon, accent `--brand-primary` (slightly lighter `--brand-primary-dark`). |
| System (auto) | Monitor icon. Component subscribes to `prefers-color-scheme`. |
| Transitioning | 120 ms opacity flash on `body`; no full-page fade (per Design Principle #20). |
| Persisted | Choice stored in `localStorage:schoolos.theme`. |

### Accessibility Rules
- Button: `role="button"`, `aria-label="Theme: Light. Switch to Dark."` (label rewrites per state).
- Respects `prefers-reduced-motion` — disables the 120 ms opacity flash.
- Color tokens swap via CSS custom property cascade, never by class-toggling individual elements.

### API Integration Expectations
- None. Pure client-side preference.

### Reusability Rules
- **Mandatory** — the single theme switcher. Forbidden — page-level theme toggles.

### Do's
- DO offer exactly three modes: Light, Dark, System.
- DO honor `prefers-reduced-motion`.

### Don'ts
- DON'T add additional themes (high-contrast, sepia) in v1.
- DON'T animate the icon swap beyond a color/opacity fade.

---

# SECTION B — DASHBOARD

This section defines the dashboard shell and the seven card types that compose every portal dashboard. Per `ENTERPRISE_DESIGN_SYSTEM.md` §6, every portal dashboard uses the same skeleton with different content.

## B.1 Dashboard Layout (`<DashboardLayout>`)

### Purpose
Universal dashboard skeleton used by every portal's `/dashboard` route. Owns the page title row, KPI strip, primary content grid, and side rail. Composes the seven card primitives (B.2–B.8). Drives the dashboard's responsive grid.

### Visual Structure
- Row 1: page heading row — `h1` title + subtitle (left) + period selector + global actions (right).
- Row 2: KPI strip — up to 4 `<KpiCard>` (B.2) in a `--grid-gap` 20 px row.
- Row 3: main 12-column grid:
  - Left main column (8 cols ≥1280 px, 12 cols below): primary `<AnalyticsCard>` and `<SummaryCard>` stacks.
  - Right rail (4 cols ≥1280 px): `<TimelineCard>`, `<StatusCard>`, optional `<ProfileCard>`.

### ASCII Wireframe
```
+-------------------------------------------------------------------+
| Home                                                              |
| Dashboard                          [Term 1 v]  [Export]  [Refresh]|
+-------------------------------------------------------------------+
| [KPI 1]   [KPI 2]   [KPI 3]   [KPI 4]                             |
+-------------------------------------------------------------------+
| +---------------------------------+ +---------------------------+ |
| | Analytics Card                  | | Timeline Card             | |
| | (chart container B.8)           | |                           | |
| +---------------------------------+ +---------------------------+ |
| +---------------------------------+ +---------------------------+ |
| | Summary Card                    | | Status Card               | |
| +---------------------------------+ +---------------------------+ |
| +---------------------------------+ +---------------------------+ |
| | Summary Card                    | | Profile Card (optional)   | |
| +---------------------------------+ +---------------------------+ |
+-------------------------------------------------------------------+
```

### Responsive Behaviour
| Breakpoint | Grid | KPI count per row |
|---|---|---|
| ≥ 1280 px | 12-col, 8/4 split | 4 KPIs |
| 992 – 1279 px | 12-col, 8/4 split | 4 KPIs |
| 768 – 991 px | 12-col, single column (rail moves below main) | 2 KPIs / row |
| < 768 px | Single column | 1 KPI / row |

### States
| State | Behavior |
|---|---|
| Loading | KPI strip shows 4 skeleton cards; analytics shows chart skeleton; rail shows 3 skeleton cards. |
| Empty (no data) | `<EmptyState>` block centered inside each card. |
| Partial fail | Failing card renders `<ErrorState>` (Part 2); others continue. |
| Refresh requested | Each card shows its own shimmer; the page does not reload. |
| Period change | All cards refetch with new range param. |

### Accessibility Rules
- Page title is the only `<h1>` on the page.
- Each card is a landmark `<section aria-labelledby="...">`.
- Tab order: title → period → actions → KPIs L→R → main column top→bottom → rail top→bottom.

### API Integration Expectations
- The layout itself owns no requests; it orchestrates per-card queries.
- Period selector emits a `{ from, to }` range that every card consumes via TanStack Query keys.
- Refresh button invalidates all dashboard queries via `queryClient.invalidateQueries(['dashboard', portalId])`.

### Reusability Rules
- **Mandatory** — every `/dashboard` route in every portal uses this layout.
- Card composition varies by portal; layout does not.

### Do's
- DO support 0–4 KPI cards (hide the row entirely if 0).
- DO let each card own its own loading/error state.

### Don'ts
- DON'T allow more than 4 KPIs in the top row.
- DON'T render dashboard widgets outside this layout's grid.
- DON'T animate cards' entrance (Design Principle #20).

---

## B.2 KPI Card (`<KpiCard>`)

### Purpose
Single, large numeric metric with optional trend, comparison, and link-out. The atomic unit of dashboards. Examples: `Active Students 1,248`, `Collected Fees ₹12.4L`, `Today's Attendance 92%`.

### Visual Structure
- Card (`.card`, `--radius-md`, `--shadow-sm`, padding 20 px).
- Top row: small label (`--text-xs` 12 px / 500 / uppercase / letter-spacing 0.04em / muted) + optional info icon with tooltip.
- Big metric: `--metric-lg` 32 px / 700, color `--text-primary`.
- Delta row (optional): `arrow-up` / `arrow-down` Lucide 14 px + percent (`--text-delta` 13 px / 600), colored `--color-success` or `--color-danger`, plus comparison text in `--text-muted` (e.g. `vs last week`).
- Optional footer link: `View details →` `--brand-primary`.

### ASCII Wireframe
```
+------------------------------+
| ACTIVE STUDENTS         (i)  |
|                              |
|         1,248                |
|                              |
|  ^ +3.2%  vs last week       |
|                              |
| View details ->              |
+------------------------------+
```

### Responsive Behaviour
- Card scales fluidly inside the grid column. Metric font does not shrink below `--metric-md` 24 px on mobile.
- Footer link wraps below delta if width < 280 px.

### States
| State | Behavior |
|---|---|
| Default | All parts rendered. |
| Loading | 80 px metric placeholder + 14 px delta placeholder, `placeholder-glow`. |
| Empty | Metric renders as `—`; delta hidden. |
| Error | `<ErrorState size="card">` replaces body; footer still shown if it can re-fetch. |
| Negative trend | Down arrow + `--color-danger` text. |
| Positive trend | Up arrow + `--color-success` text. |
| Neutral trend | Hide delta row entirely. |

### Accessibility Rules
- The card is `<section aria-labelledby="kpi-{id}-label">`.
- Metric value is in a `<p aria-label="1248 students, up 3.2 percent versus last week">` so screen readers do not read raw glyphs.
- Trend color is paired with an arrow icon (never color-only).
- Tooltip on info icon: `<button aria-describedby="kpi-{id}-tip">`.

### API Integration Expectations
- Each KPI maps to a single endpoint that returns `{ value, delta?, comparisonLabel?, link? }`.
- KPIs subscribe to the dashboard's period range.
- Refresh on `queryClient.invalidateQueries(['dashboard', portalId, 'kpi', kpiId])`.

### Reusability Rules
- **Mandatory** — the only KPI primitive. Forbidden — bespoke `<MetricBox>`, `<StatTile>`.

### Do's
- DO format numbers with locale `en-IN` (lakh/crore for currency, `Intl.NumberFormat` otherwise).
- DO show `—` for unavailable values, never `0` as fallback.

### Don'ts
- DON'T animate the number with a count-up effect (Design Principle #20).
- DON'T color the entire card background by metric severity. Use the delta arrow only.
- DON'T mix multiple metrics in one card; use `<SummaryCard>` instead.

---

## B.3 Summary Card (`<SummaryCard>`)

### Purpose
Mid-density card that presents a list of related items with a small lead metric and a per-row indicator. Examples: `Top 5 overdue invoices`, `Recent admissions`, `Open homework by class`. Lighter than `<AnalyticsCard>`, denser than `<KpiCard>`.

### Visual Structure
- Card with header (title + optional `View all →` link).
- Body: list of 5–10 rows.
- Each row: leading mini-icon or avatar (24 px), label (`--text-body`), supporting line (`--text-xs --text-muted`), trailing value (`--text-body` right-aligned).
- Optional footer link.

### ASCII Wireframe
```
+------------------------------------------+
| Top 5 Overdue Invoices       View all -> |
+------------------------------------------+
| (AV)  Aarav Sharma                       |
|       Class 10A                  ₹12,400 |
+------------------------------------------+
| (AV)  Riya Patel                         |
|       Class 9B                   ₹ 9,800 |
+------------------------------------------+
| (AV)  Ishaan Kapoor                      |
|       Class 8C                   ₹ 7,200 |
+------------------------------------------+
| ...                                      |
+------------------------------------------+
```

### Responsive Behaviour
- Row stays single-line at all widths.
- Trailing value wraps under label at < 360 px.

### States
| State | Behavior |
|---|---|
| Default | Rows render. |
| Loading | 5 skeleton rows. |
| Empty | `<EmptyState size="card">` with "No items" + optional CTA. |
| Error | `<ErrorState size="card">`. |
| Row click | Optional `onRowClick` navigates to detail page; entire row is the hit-target. |

### Accessibility Rules
- Card is `<section aria-labelledby="...">`.
- Rows are `<a>` if navigable; `<div>` otherwise.
- Trailing values are inside the row link so screen readers read full context.

### API Integration Expectations
- Each summary card consumes a list endpoint with `limit=5..10` typically.
- Cursor pagination is not used here — `<SummaryCard>` shows top-N only; full list is in the linked page.

### Reusability Rules
- **Mandatory** — top-N "ranked list" UIs use this. Forbidden — bespoke list cards on the dashboard.

### Do's
- DO link to a full list page via the header "View all".
- DO keep rows to a fixed visual height (52 px) regardless of content.

### Don'ts
- DON'T paginate within a summary card.
- DON'T mix two columns of trailing values.

---

## B.4 Analytics Card (`<AnalyticsCard>`)

### Purpose
Chart-centric card. Wraps `<ChartContainer>` (B.8) with a header, period selector (optional, can defer to dashboard), legend slot, and footer link. Examples: `Fee collection trend (last 12 months)`, `Daily attendance (this term)`.

### Visual Structure
- Header: title + optional inline period selector + optional kebab menu (Lucide `more-horizontal`).
- Body: `<ChartContainer>` (B.8) sized to fill.
- Legend area: above or below chart per chart type; uses `<Badge>` chips.
- Footer (optional): contextual link.

### ASCII Wireframe
```
+---------------------------------------------+
| Fee Collection Trend      [Last 12m v]  ... |
+---------------------------------------------+
|                                             |
|   chart area (B.8)                          |
|                                             |
|   __/\__/\___/\___                          |
|                                             |
+---------------------------------------------+
|  o Collected   o Outstanding   o Refunded   |
+---------------------------------------------+
| View Fees ->                                |
+---------------------------------------------+
```

### Responsive Behaviour
- Min height 280 px desktop, 240 px tablet, 200 px mobile (per ENTERPRISE §6).
- Legend wraps; never truncates.
- On < 768 px, period selector collapses into the kebab menu.

### States
| State | Behavior |
|---|---|
| Default | Chart renders. |
| Loading | Bar/line skeleton at chart bounds. |
| Empty | `<EmptyState>` in chart area. |
| Error | `<ErrorState>` in chart area with Retry. |
| Period changed | Refetches series; previous data dims while loading. |
| Hover series | Tooltip via Apex's built-in (recolored to theme). |

### Accessibility Rules
- `<section aria-labelledby="...">` with title.
- Each series has a visible legend chip with status color paired with shape (dot for line, square for bar) — color-blind safe.
- Chart container has `role="img" aria-label="{series description}"`.
- A "Data table" hidden behind a toggle option for screen readers (`<details>` with the underlying values).

### API Integration Expectations
- Charts consume aggregated endpoints returning `{ series: [...], categories: [...] }` per `API_UI_MAPPING.md`.
- Series count capped at 4 (Design Principle #15).
- No raw row data; aggregation is server-side.

### Reusability Rules
- **Mandatory** — every chart on a dashboard is an `<AnalyticsCard>` wrapping `<ChartContainer>`. Forbidden — bare `<ApexChart>` placed directly on a dashboard.

### Do's
- DO recolor charts using the brand palette only (`--brand-primary`, `--accent-secondary`, status muted variants).
- DO use a single chart type per card (Design Principle #14).

### Don'ts
- DON'T use 3D, dual-axis, donut-with-center-metric, exploded-pie, or gradient-fill variants.
- DON'T render more than 4 series.
- DON'T render the chart taller than 360 px on the dashboard.

---

## B.5 Profile Card (`<ProfileCard>`)

### Purpose
Compact identity card for a single person or entity. Used in dashboards (e.g. Class Teacher overview), detail-page rails, and parent/student portals (e.g. "My class teacher", "My child"). Not the full profile page (Part 3).

### Visual Structure
- Card header: minimal or none.
- Body row 1: large avatar (md 36 px or lg 48 px) + name + role line.
- Body row 2 (optional): meta grid — 2 columns of label / value pairs (e.g. `Class: 10A`, `Email: ...`).
- Footer (optional): contextual actions, e.g. `View profile`, `Message`.

### ASCII Wireframe
```
+----------------------------------------+
| (AV)  Mrs. Priya Verma                 |
|       Class Teacher · 10A              |
+----------------------------------------+
| Email             priya@school.in      |
| Phone             +91 98xxx xxx21      |
| Office Hours      Mon-Fri 2-3pm        |
+----------------------------------------+
| View Profile ->     [Message]          |
+----------------------------------------+
```

### Responsive Behaviour
- Meta grid collapses to single column < 480 px.
- Footer actions stack < 360 px.

### States
| State | Behavior |
|---|---|
| Default | All sections render. |
| Loading | Skeleton row for avatar + name; skeleton lines for meta. |
| Empty | Card hidden entirely (no "no data" message — the parent layout decides). |
| Anonymous (e.g. unassigned) | Avatar shows entity initials; name reads `Unassigned`. |
| Action disabled (no permission) | Action button hidden via `<PermissionGate>`. |

### Accessibility Rules
- Avatar `<img>` `alt={name}`.
- Meta uses a `<dl><dt><dd>` pattern.
- Actions are real `<button>` or `<a>`; never divs.

### API Integration Expectations
- Receives the resource (user, teacher, student) via prop; does not fetch its own data.
- Fetching is the parent page's responsibility; this card is presentational.

### Reusability Rules
- **Mandatory** — every "person at a glance" UI uses this. Forbidden — bespoke person-card on a dashboard.

### Do's
- DO show role + scope (e.g. `Class Teacher · 10A`) under the name.
- DO use Avatar (A.8) only — never a raw `<img>`.

### Don'ts
- DON'T mix entity types (student + teacher) inside one card. Use two cards.
- DON'T render more than 4 meta rows. Use a detail page for the rest.

---

## B.6 Timeline Card (`<TimelineCard>`)

### Purpose
Vertical, chronological feed of events. Examples: `Recent activity`, `Pending approvals`, `Upcoming class schedule`. Always on the dashboard rail. Visually anchored by a connector line down the left side.

### Visual Structure
- Card header: title + optional `View all →`.
- Body: list of events. Each event row:
  - Left rail: 20 px circular dot (Lucide icon inside) + 1 px connector continuing below.
  - Right content: title (`--text-body` 14 px / 500), description (`--text-small` 13 px / 400 muted), relative timestamp (`--text-xs` 12 px / 500 muted), optional badge.
- 5–7 visible events; rest are paginated to the detail page.

### ASCII Wireframe
```
+--------------------------------------------+
| Recent Activity            View all ->     |
+--------------------------------------------+
|  o   Invoice INV-0042 paid                 |
|  |   Aarav Sharma · ₹12,400                |
|  |   12 minutes ago                        |
|  |                                         |
|  o   Attendance marked                     |
|  |   Class 10A · 32 present                |
|  |   1 hour ago                            |
|  |                                         |
|  o   Homework assigned                     |
|      Math · due 2026-06-28                 |
|      3 hours ago                           |
+--------------------------------------------+
```

### Responsive Behaviour
- Connector and dot scale unchanged.
- At < 480 px, badge wraps below timestamp.

### States
| State | Behavior |
|---|---|
| Default | Events render in reverse-chronological order. |
| Loading | 4 skeleton rows. |
| Empty | `<EmptyState size="card">`. |
| Live (new event since mount) | Top row enters with `--motion-duration-base` fade (no slide). Subtle pulse on dot for 1 cycle, then static. |
| Error | `<ErrorState size="card">` with Retry. |

### Accessibility Rules
- `<ol>` list under the hood; each item is `<li>`.
- Dot + connector is decorative (`aria-hidden="true"`).
- Timestamps use `<time datetime="ISO">` with full date in `title`.

### API Integration Expectations
- Polled at 60 s via TanStack Query.
- Endpoint returns `{ data: [{ id, type, title, description, occurredAt, icon, severity?, link? }] }`.
- Severity → dot color via status palette (ENTERPRISE §10).

### Reusability Rules
- **Mandatory** — only timeline primitive. Forbidden — bespoke activity feeds on dashboards.

### Do's
- DO map event icons consistently — same `type` always renders the same icon.
- DO link a row if a navigable destination exists.

### Don'ts
- DON'T render more than 7 events on the dashboard; defer to the activity page for the rest.
- DON'T render absolute timestamps as the primary label — relative ("12 min ago") with absolute in `title`.

---

## B.7 Status Card (`<StatusCard>`)

### Purpose
Visualizes the distribution of one entity across a finite set of statuses, with quick counts and drill-in links. Examples: `Student status` (Active / Inactive / Graduated), `Invoice status` (Paid / Unpaid / Overdue). Smaller than `<AnalyticsCard>` and tied directly to the 15-status palette.

### Visual Structure
- Card header: title + optional `View all →`.
- Body: list of status rows OR a stacked horizontal bar:
  - **Bar mode (default):** 12 px tall horizontal stacked bar showing proportional split; below it, legend chips with status name + count.
  - **List mode (alt):** each row is `<StatusChip>` + count, right-aligned percentage.
- Total count line at top of body.

### ASCII Wireframe
```
Bar mode:
+------------------------------------------+
| Invoice Status              View all ->  |
+------------------------------------------+
| Total: 248 invoices                      |
|                                          |
|  [===Paid 60%====][Unpaid 25%][Over 15%] |
|                                          |
|  o Paid 149    o Unpaid 62    o Over 37  |
+------------------------------------------+

List mode:
+------------------------------------------+
| Student Status              View all ->  |
+------------------------------------------+
| Total: 1,310                             |
|                                          |
| (Active)    1,248                  95%   |
| (Inactive)     42                   3%   |
| (Graduated)    18                   1%   |
| (TC Issued)     2                   <1%  |
+------------------------------------------+
```

### Responsive Behaviour
- Bar stays 12 px tall at all widths.
- Legend chips wrap to multiple lines as needed.
- At < 480 px, list mode preferred.

### States
| State | Behavior |
|---|---|
| Default | Rendered. |
| Loading | 8 px skeleton bar + 3 skeleton chips. |
| Empty | `<EmptyState size="card">`. |
| All-zero | Bar renders as a single `--surface-muted` placeholder; text "No items yet". |
| Error | `<ErrorState size="card">`. |

### Accessibility Rules
- Bar has `role="img" aria-label="60% paid, 25% unpaid, 15% overdue"`.
- Legend chips paired with `<StatusChip>` (icon-first, color-blind safe per Design Principle #6).
- Drill-in link `aria-label="View all 248 invoices"`.

### API Integration Expectations
- Endpoint: a status-aggregation route per module, returning `{ status, count }[]`.
- Reuses status names verbatim — never translates them (keys match backend enum).

### Reusability Rules
- **Mandatory** — only status-distribution card. Forbidden — pie/donut substitutes (Design Principle #16).

### Do's
- DO use the frozen 15-status palette only.
- DO sort statuses by a fixed order per entity (e.g. Active first, Archived last).

### Don'ts
- DON'T use a donut chart for status distribution.
- DON'T let statuses overflow the bar at < 2% width — group small statuses into "Other" and tooltip the breakdown.

---

## B.8 Chart Container (`<ChartContainer>`)

### Purpose
Lowest-level wrapper around `react-apexcharts`. Centralizes theming, sizing, accessibility, and series limits. All `<AnalyticsCard>` instances and any standalone chart in the app use it; no page wires Apex directly.

### Visual Structure
- A relative-positioned block with fixed aspect ratio or fixed min-height.
- Contained Apex chart (`<Chart options={...} series={...} type={...}>`).
- Overlay layer for loading / empty / error states (absolute positioned, full bleed).
- No own card chrome — the parent (`<AnalyticsCard>`) supplies the card.

### ASCII Wireframe
```
+----------------------------------------+
|                                        |
|      Chart canvas (Apex)               |
|                                        |
|         __/\__/\___                    |
|                                        |
+----------------------------------------+

Loading overlay:
+----------------------------------------+
|                                        |
|      shimmering placeholder bars       |
|                                        |
+----------------------------------------+
```

### Responsive Behaviour
- Width 100% of parent.
- Height controlled by `height` prop (default 280 px on desktop, 240 px tablet, 200 px mobile — matches ENTERPRISE §6).
- Apex `responsive` config is set centrally inside the wrapper, not by callers.

### States
| State | Behavior |
|---|---|
| Default | Chart renders. |
| Loading | Shimmer overlay (`placeholder-glow`) blocks pointer events until data ready. |
| Empty | Hides chart; shows `<EmptyState size="card">`. |
| Error | Hides chart; shows `<ErrorState size="card">` with Retry. |
| Reduced motion | Apex animations disabled when `prefers-reduced-motion: reduce`. |
| Print | Animations off; tooltips off; legend visible. |

### Accessibility Rules
- `role="img"` with `aria-label` summarizing the chart's content.
- A `<details><summary>View data table</summary></details>` accessible alternative renders a data table for screen reader users (per UI_TESTING_STRATEGY §9 keyboard-only flow).
- Tooltip mouse-only by Apex; the data-table fallback covers non-mouse users.
- Color palette is the brand palette plus shape differentiation per series.

### API Integration Expectations
- No direct API calls — pure presentational. Parent supplies `series`, `categories`, and `type`.
- Series shape standardized: `{ name: string, data: number[] | {x,y}[] }[]`.
- Maximum 4 series enforced at the wrapper level (logs a development warning if exceeded).

### Reusability Rules
- **Mandatory** — every Apex chart in the app passes through this. Forbidden — direct `import Chart from 'react-apexcharts'` in page or feature code.

### Do's
- DO supply `type` from a closed set: `line | area | bar | column | sparkline`.
- DO use the central theme options exported by `lib/charts/theme.ts`.

### Don'ts
- DON'T accept arbitrary Apex options that override theme tokens.
- DON'T enable `chart.zoom`, `chart.toolbar`, `chart.export` (use the page-level export instead).
- DON'T use chart types outside the closed set (no pie, donut, radar, polar, treemap, heatmap unless explicitly approved in a future part).

---

# Cross-check (Part 1)

This part has been cross-checked against:

- **`ENTERPRISE_DESIGN_SYSTEM.md`** — typography (Inter), brand color (`#2D4FCC`), header/sidebar dimensions, animation tokens, 15-status palette, Lucide icon library, 25 design principles. **No contradictions.**
- **`FRONTEND_UI_SPECIFICATION.md`** — modal vs drawer rules, button sizes, form patterns, optimistic concurrency, naming conventions. **No contradictions.** (Part 1 does not contain modal/drawer/form blueprints — those land in Part 2.)
- **`UI_ARCHITECTURE.md`** — folder structure (`components/foundation`, `components/domain`), stack rules (no jQuery, React Bootstrap, TanStack Query, Lucide). **No contradictions.**
- **`THEME_ANALYSIS.md`** — plugin replacement map applied verbatim; theme reuse / modernization / discard verdicts honored. **No contradictions.**
- **`FRONTEND_FREEZE_v1.md`** — freeze scope respected; nothing in Part 1 changes the freeze contract.

**Inconsistencies found:** none.
**Corrections made:** none.

**Confirmation:** the purchased Bootstrap theme remains the visual foundation of SchoolOS. Every blueprint in Part 1 preserves the theme's structural markup (Bootstrap shell, grid, cards, buttons, tables, forms) while modernizing color, typography, density, motion, and behavior per the Enterprise Design System.

---

## Part 1 — Component summary

| # | Component | Section | Notes |
|---|---|---|---|
| 1 | `<AppLayout>` | A.1 | Single shell for all authenticated routes |
| 2 | `<AppSidebar>` | A.2 | 260 / 72 / drawer; config-driven; light default |
| 3 | `<AppHeader>` | A.3 | 60 / 56 px; brand + search + theme + bell + user |
| 4 | `<Breadcrumb>` | A.4 | Mandatory on every page; chevron separator |
| 5 | `<SearchBar>` | A.5 | Trigger only; opens command palette |
| 6 | `<CommandPalette>` | A.6 | Spotlight launcher; Cmd/Ctrl + K |
| 7 | `<UserMenu>` | A.7 | Identity, role, tenant, sign out |
| 8 | `<Avatar>` | A.8 | 6 sizes; image + initials fallback; status dot |
| 9 | `<ThemeSwitcher>` | A.9 | Light / Dark / System |
| 10 | `<DashboardLayout>` | B.1 | Universal dashboard skeleton (KPI + 8/4 grid) |
| 11 | `<KpiCard>` | B.2 | Single big metric + delta + link |
| 12 | `<SummaryCard>` | B.3 | Top-N ranked list with mini-rows |
| 13 | `<AnalyticsCard>` | B.4 | Wraps a chart; period + legend |
| 14 | `<ProfileCard>` | B.5 | Person/entity at a glance |
| 15 | `<TimelineCard>` | B.6 | Chronological feed with rail |
| 16 | `<StatusCard>` | B.7 | Status distribution bar / list |
| 17 | `<ChartContainer>` | B.8 | Central Apex wrapper; only chart entry point |

---

## Stop

Part 1 (SECTION A — Application Layout + SECTION B — Dashboard) is complete. **Stop here. Wait for Part 2.**

Part 2 will cover the table & filtering primitives (`<DataTable>`, `<CursorPaginator>`, `<FilterBar>`, `<AdvancedFilterDrawer>`, `<SavedFilters>`, `<ColumnChooser>`, `<ExportDialog>`) and the feedback primitives (`<Modal>`, `<Drawer>`, `<ConfirmationDialog>`, `<Toast>`, `<NotificationCenter>`, `<EmptyState>`, `<ErrorState>`, `<LoadingSkeleton>`, `<Spinner>`).
Part 3 will cover the remaining components (`<FormLayout>`, `<WizardForm>`, `<Tabs>`, `<Accordion>`, `<Calendar>`, `<Timeline>`, `<FileUpload>`) and the auth + profile pages (`<LoginPage>`, `<ForgotPasswordPage>`, `<ResetPasswordPage>`, `<OtpVerificationPage>`, `<ProfilePage>`).
