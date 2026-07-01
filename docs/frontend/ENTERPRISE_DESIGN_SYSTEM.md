# Enterprise Design System — SchoolOS

> **Status:** Frozen design architecture. Single source of truth for visual identity across the entire School ERP SaaS.
> **Authority:** Binds every frontend sprint (F1–F16) and every future surface. Supersedes color/typography proposals where this document and prior planning differ.
> **Companion:** `FRONTEND_UI_SPECIFICATION.md` (component standards), `FRONTEND_FREEZE_v1.md` (planning freeze).

This document is design architecture. It defines what SchoolOS looks like, why it looks that way, and the principles that prevent visual drift across 22 backend modules and 5 portals.

---

## 1. Visual Identity

SchoolOS targets a specific tone: **trustworthy, calm, professional**. Schools are slow-moving institutions handling parents' money and children's records. The interface must convey competence — not playfulness. The color system is intentionally restrained: one assertive brand color, neutral surfaces, semantic colors reserved strictly for meaning (success / warning / danger / info).

### 1.1 Brand color choice

The source theme's primary is a saturated periwinkle (`#3D5EE1`). It is acceptable but reads slightly consumer-grade. SchoolOS adopts a **deeper, more authoritative indigo** that anchors the brand and reads as enterprise software (think: Linear, Stripe Dashboard, Notion Admin — not consumer EdTech).

| Token | Value | Use |
|---|---|---|
| `--brand-primary` | `#2D4FCC` | Primary brand — buttons, active states, links |
| `--brand-primary-hover` | `#243FA8` | Hover on primary CTAs |
| `--brand-primary-active` | `#1C338A` | Pressed/active state |
| `--brand-primary-subtle` | `#EEF1FC` | Tinted backgrounds (selected rows, info chips) |
| `--brand-primary-border` | `#C9D2F2` | Borders on tinted surfaces |

**Rationale.** A 0.06 luminance drop from the theme's original lifts contrast against `--surface-1` and `--text-inverse`, satisfying WCAG AA on both buttons and links at body size. It also avoids the periwinkle drift that pushes EdTech UIs toward "kids app."

### 1.2 Secondary color

Secondary is **not** a second brand color — it is a supporting accent for non-primary actions (filter chips, charts series 2, link hovers in tinted surfaces). A muted teal pairs well with deep indigo without competing for the eye.

| Token | Value | Use |
|---|---|---|
| `--accent-secondary` | `#0E9F8E` | Secondary actions, chart series 2, subtle highlights |
| `--accent-secondary-subtle` | `#E6F6F4` | Tinted backgrounds |

The source theme's pastel cyan `#6FCCD8` is **discarded** — it lacks contrast against dashboards and reads too light.

### 1.3 Semantic colors

Semantic colors carry meaning. They appear **only** when they mean it — never decoratively, never as brand alternates. Every status pill, alert, banner, toast, and badge maps to exactly one of these.

| Token | Value | Use |
|---|---|---|
| `--color-success` | `#15803D` | Positive outcomes (paid, active, approved) |
| `--color-success-subtle` | `#E8F5EC` | Success-tinted bg |
| `--color-success-border` | `#86CFA0` | Success border |
| `--color-warning` | `#B45309` | Caution (pending, expiring, draft) |
| `--color-warning-subtle` | `#FEF3E6` | Warning-tinted bg |
| `--color-warning-border` | `#F0C18B` | Warning border |
| `--color-danger` | `#B42318` | Destructive / errors / overdue / failed |
| `--color-danger-subtle` | `#FEE8E5` | Danger-tinted bg |
| `--color-danger-border` | `#F49B91` | Danger border |
| `--color-info` | `#1E5FBE` | Informational (processing, invited, in progress) |
| `--color-info-subtle` | `#E7F0FB` | Info-tinted bg |
| `--color-info-border` | `#A8C5EE` | Info border |

**Rationale.** Earthier hues (a deeper green, amber rather than yellow, brick-red rather than scarlet) ladder away from "alert-spam." They retain WCAG AA at 16px against `--surface-0` and `--text-inverse`. The pure-success-green (`#1ABE17`) and pure-danger-red (`#E82646`) from the source theme are **retired** — they vibrate at high saturation and feel consumer.

### 1.4 Sidebar color

The sidebar is the spine. It must read calm, not assertive. Two acceptable modes:

| Mode | Background | Active row | Hover row |
|---|---|---|---|
| **Light sidebar (default)** | `#FFFFFF` | `#EEF1FC` (`--brand-primary-subtle`), left bar `--brand-primary` | `#F4F6FB` |
| **Dark sidebar (opt-in)** | `#0F172A` | `#1E293B` with left bar `--brand-primary` | `#1E293B` |

Default ships **light sidebar** for v1. Dark sidebar is a per-user preference for power users.

The source theme's full dark navy default reads heavy on a 14-hour admin session; light sidebar is the v1 baseline.

### 1.5 Header color

Header is **always light**, regardless of sidebar choice, because it sits adjacent to the content area which is light. A dark header introduces a triple-color seam (dark header / light/dark sidebar / light content) that fights the eye.

| Token | Value |
|---|---|
| `--header-bg` | `#FFFFFF` |
| `--header-border` | `#E4E7EE` |
| `--header-text` | `#1A2235` |

Height fixed at 60px (see §5).

### 1.6 Body background

| Token | Value | Use |
|---|---|---|
| `--bg-app` | `#F7F8FB` | App canvas behind cards |
| `--bg-content` | `#F7F8FB` | Main content area |

A near-white canvas with a faint cool tint. Cards lift via `--surface-1` (`#FFFFFF`) on top of `--bg-app`. Pure white app background washes out cards and removes the spatial hierarchy.

### 1.7 Card background

| Token | Value | Use |
|---|---|---|
| `--surface-card` | `#FFFFFF` | All cards, panels, modals |
| `--surface-elevated` | `#FFFFFF` | Modals, popovers (uses shadow for separation, not color) |
| `--surface-muted` | `#F7F8FB` | Disabled / read-only / inset sections |

Card depth comes from shadow (`--shadow-sm`), not from color shift. This is the modern enterprise pattern (Stripe, Linear, Vercel) and ages better than the heavy gradient/border cards in the source theme.

### 1.8 Border colors

Borders are deliberately quiet. A loud border around every card competes with content.

| Token | Value | Use |
|---|---|---|
| `--border-default` | `#E4E7EE` | Cards, panels, dividers |
| `--border-strong` | `#CBD0DA` | Emphasised dividers, table outer |
| `--border-input` | `#D5DAE3` | Form controls (rest) |
| `--border-input-hover` | `#AEB5C4` | Form controls (hover) |
| `--border-input-focus` | `var(--brand-primary)` | Form controls (focus, paired with ring) |
| `--border-subtle` | `#EEF0F4` | Table row separators |

### 1.9 Hover colors

Hover should suggest interactivity without animating dramatically.

| Token | Value | Use |
|---|---|---|
| `--hover-row` | `#F4F6FB` | Table row, sidebar nav, list item |
| `--hover-button-primary` | `var(--brand-primary-hover)` | Primary button |
| `--hover-button-secondary` | `#EEF1FC` | Secondary/outline button |
| `--hover-button-ghost` | `#F1F3F8` | Ghost / icon button |
| `--hover-link` | `var(--brand-primary-active)` | Anchor underline darken |

Hovers are **background-only**; never animate width/height/border (jitter).

### 1.10 Focus colors

Focus is a first-class state. It must be visible without being ugly.

| Token | Value | Use |
|---|---|---|
| `--focus-ring` | `0 0 0 3px rgba(45, 79, 204, 0.30)` | All focusable elements via `:focus-visible` |
| `--focus-ring-danger` | `0 0 0 3px rgba(180, 35, 24, 0.30)` | Focus on destructive controls |
| `--focus-border` | `var(--brand-primary)` | Border color shift on focus |

`outline: none` is forbidden. Every focusable surface shows `--focus-ring` on `:focus-visible`.

---

## 2. Theme Modernization

The purchased Bootstrap theme is a visual reference, not a template. The following table fixes per-region disposition.

| Region | Keep | Redesign | Simplify |
|---|---|---|---|
| **Sidebar** | Grouped nav hierarchy (Main / Academics / Operations / Finance / Reports / Settings); mini-sidebar concept | Default to light sidebar; flatten to 2-level max; collapse decorative icons in headings | Remove badge counters on every item; show counters only on Notifications / Approvals |
| **Header** | Brand left · search center · user/bell right composition | Replace combined search-and-quick-action area with a single search; promote tenant switcher to header (Platform only) | Drop the multi-icon shortcut row (fullscreen, language, etc.); keep search + bell + dark/light + user menu only |
| **Cards** | Card-with-header pattern | Move from heavy borders + drop shadows to single thin border + `--shadow-sm`; remove decorative top-stripe colors | One card style with size variants; no per-module card decoration |
| **Tables** | Sticky header, row hover | Replace DataTables look with quieter row separators (1px `--border-subtle`); promote density selector to first-class; sortable header indicators standardized | Drop alternating row stripes; drop heavy outer borders; drop colored row backgrounds for status (use status chip column instead) |
| **Forms** | Label-on-top vocabulary | Standardise field heights (40px md), focus rings, helper/error placement; one column by default | Drop the source theme's heavy section dividers; use h4 + thin underline instead |
| **Buttons** | Variant set (Primary/Secondary/Outline/Danger/Success/Warning/Ghost/Link/Icon/FAB) | Reweight: 600 font, 8px radius, 40px md height; primary in `--brand-primary` | Drop gradient buttons, drop rounded-pill buttons except for status chips |
| **Charts** | ApexCharts | Re-theme palette to brand-aligned series (see §13.5); reduce default tooltip noise; thinner axes | Drop 3D, drop exploded pies, drop dual axes, drop gradient fills |
| **Widgets** | Dashboard widgets concept | Redesign all KPI tiles to one common layout (label / value / delta / sparkline); cap to 4 per row | Drop counter-up animation on tile load; show final number |
| **Profile menus** | Avatar + dropdown | Replace the multi-section profile card menu with a clean list: Profile, Preferences, Theme, Logout | Drop the "online status," "balance," "messages" decoration |
| **Notifications** | Bell icon + drawer | Promote to a right-side `<Offcanvas>` instead of dropdown; show unread/all tabs; per-item action | Drop sound, drop bell animation, drop colored category dots — use type icon + timestamp only |
| **Search** | Header search input | Make it a command palette (`⌘K`/`Ctrl+K`) that searches students, parents, staff, invoices, settings | Drop the simple text-only search; one good search is better than three half-good ones |
| **Breadcrumbs** | Standard `home > parent > current` | Smaller (`--fs-xs`), single line, truncate middle when long | Drop icons in breadcrumbs |
| **Filters** | Filter dropdown above table | Promote to a standardised filter bar with chips for applied filters and an "Advanced" disclosure for less common ones; add Saved Filters | Drop per-module ad-hoc filter UIs |

What remains universally:
- Layout shell (`.header + .sidebar + .content`).
- Page archetypes (dashboard, list, detail, form, calendar, kanban).
- Authentication split-screen composition.

What is redesigned globally:
- The color system (this document).
- Typography (§4).
- Card / form / table / button visual language (§§7–9, `FRONTEND_UI_SPECIFICATION.md`).
- Sidebar default mode (light, not dark).

What is simplified globally:
- Dashboards (fewer widgets, more white space).
- Icons (single library, single size scale).
- Animations (subtle).
- Header (search + bell + user only).

---

## 3. Design Philosophy

The SchoolOS visual identity follows ten principles, in priority order. When two principles conflict, the higher-numbered one yields.

1. **Less visual noise.** A school admin holds twelve tabs open. The product must reduce, not add, to their cognitive load. Decorative gradients, drop shadows, animated counters, and colored borders are removed unless they convey information.

2. **Maximum readability.** Body text is 14–16px depending on density. Line length is capped at ~75 characters. Numerical columns are tabular-figures aligned. Tables wrap to readable widths rather than scroll horizontally where possible.

3. **Consistent spacing.** All spacing is a multiple of 4. There is no 13px, no 22px, no 50px anywhere. The 4-pt grid is enforced by tokens and lint rules.

4. **One design language.** A button looks identical in Fees and in Billing. A status pill for `ACTIVE` is the same color in Student and Staff. A card has one footprint, not one per module.

5. **Accessibility first, not as polish.** WCAG 2.1 AA is the design contract. Color, focus, contrast, and keyboard pathway are decided at design time — not retrofitted in Sprint F16.

6. **Professional typography.** One typeface, one scale, one weight ladder. No display fonts, no script accents, no logo-only treatments.

7. **Consistent iconography.** One library. One size grid. Icons supplement labels, never replace them in primary nav. Decorative icons are removed.

8. **Minimal animation.** Animations exist for two reasons: confirming interaction (hover, click) and showing progress (loading). Everything else is decoration and gets removed.

9. **Tokens are the language.** Designers reference `--brand-primary`, not `#2D4FCC`. Engineers consume tokens, not hex values. Any literal is a bug.

10. **Reuse over reinvention.** A module never invents its own button, card, table, or status chip. Shared components win every time. The cost of one module's "slightly different look" is the entire system's drift.

---

## 4. Typography

### 4.1 Recommendation: **Inter**

| Typeface | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **Inter** | Designed specifically for UI / screen reading; superb at 12–16px; OpenType tabular figures for numerical columns; metric-stable across weights; widely adopted in enterprise SaaS (Linear, Vercel, Figma, GitHub readme rendering); supports 30+ scripts | None for our use | **Selected** |
| Nunito | Rounded, friendly; reads well; the prior recommendation | Rounded terminals lean "school/kids" — the opposite of the enterprise tone we want | Rejected |
| Roboto | Excellent, widely used | Slightly dated; Material-coded; less tight at small sizes than Inter | Rejected |
| Poppins | Geometric, fashionable | Designed as a display font; less ideal for body and tables; rounded geometry reads consumer | Rejected |

**Inter is the v1 typeface for SchoolOS.** This supersedes the prior Nunito recommendation in `UI_ARCHITECTURE.md` and `FRONTEND_UI_SPECIFICATION.md`. The change is conscious: SchoolOS positions as enterprise software for school administrators, and Inter is the canonical typeface of modern enterprise SaaS.

Self-host Inter via `next/font` (Google subset). Load weights **400, 500, 600, 700**. Enable `font-feature-settings: "cv11", "ss01", "ss03", "tnum"` globally — these unlock Inter's single-story `a`, alternate `g`, slashed zero, and tabular figures, all of which improve readability in dense ERP UIs.

For monospace (trace IDs, idempotency keys, code blocks): **JetBrains Mono** at weight 400/500.

### 4.2 Heading scale

| Level | Size | Weight | Line height | Use |
|---|---|---|---|---|
| h1 | 28px | 700 | 1.2 | Page title (one per page) |
| h2 | 22px | 700 | 1.25 | Section title |
| h3 | 18px | 600 | 1.3 | Subsection / card header |
| h4 | 16px | 600 | 1.4 | Group title / form section |
| h5 | 14px | 600 | 1.4 | Minor group |
| h6 | 13px | 600 | 1.5 | Smallest heading; rarely used |

Headings drop slightly from the prior spec — 28px h1 instead of 36px — because enterprise dashboards read better with restrained titles. Hero numbers (KPI values) get their own treatment (§6.1).

### 4.3 Body scale

| Token | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `--text-lead` | 16px | 400 | 1.6 | Lead paragraphs, onboarding |
| `--text-body` | 14px | 400 | 1.5 | Default body |
| `--text-small` | 13px | 400 | 1.5 | Captions, helper text |
| `--text-xs` | 12px | 500 | 1.4 | Badges, timestamps, meta |
| `--text-2xs` | 11px | 600 | 1.3 | Uppercase eyebrow labels |

### 4.4 Table font

Tables use `--text-body` (14px / 400) for cell content and `--text-xs` (12px / 600 / `letter-spacing: 0.02em`) for header cells. Numerical columns get `font-variant-numeric: tabular-nums` so digits align on the decimal.

### 4.5 Form font

Inputs use `--text-body` (14px / 400). Labels above use `--text-small` (13px / 500). Helper / error text uses `--text-xs` (12px / 400). Placeholder uses `--text-body` (14px / 400) at `--text-muted` color.

### 4.6 Sidebar font

Top-level nav items use 14px / 500. Subsection items use 13px / 400. Section headings use `--text-2xs` (11px / 600 uppercase / `letter-spacing: 0.06em`) at `--text-muted` color — a quiet typographic device that organises long sidebars without visual heaviness.

### 4.7 Dashboard metric font

KPI numbers are the only place SchoolOS uses large display type.

| Token | Size | Weight | Use |
|---|---|---|---|
| `--metric-xl` | 40px | 700 | Hero metric (one per dashboard) |
| `--metric-lg` | 32px | 700 | Standard KPI tile |
| `--metric-md` | 24px | 700 | Inline metric in a wide tile |
| `--metric-delta` | 13px | 600 | `+12%` delta annotation; color from semantic palette |

Metric numbers use `letter-spacing: -0.01em` to tighten optical balance at large sizes, and `font-variant-numeric: tabular-nums` so the digits don't jump when values update.

---

## 5. Layout Standards

### 5.1 Sidebar

| Mode | Width | Behaviour |
|---|---|---|
| Full | **260px** | Default ≥ 992px |
| Mini | **72px** | 768–991px; expand on hover via overlay (not push) |
| Drawer | **100%** off-canvas | < 768px; toggled by hamburger |

The source theme's 240px is tightened to 260px to accommodate two-level nav text without truncation. Mini sidebar is 72px (was 60px) to fit a 24px icon + 24px padding + 24px hit target.

### 5.2 Header

Fixed at **60px** desktop, **56px** mobile. Always sticky. Box-shadow `--shadow-sm` only when the page has scrolled (`scroll-y > 0`) — clean edge at rest.

### 5.3 Content padding

| Surface | Padding |
|---|---|
| `.page-content` (outer) | 24px desktop / 20px tablet / 16px mobile |
| `.card` body | 20px |
| `.card-header` | 16px 20px |
| `.modal` body | 24px |
| Form section | 24px vertical between sections |

### 5.4 Card spacing

Cards inside a grid: **20px gutter** (both row and column). One global gutter token: `--grid-gap: 20px`. Cards never butt up against each other.

### 5.5 Grid spacing

12-column grid. Bootstrap defaults reused. Container padding 16px on mobile, 24px on desktop. The grid is exclusively for layout — never as a styling channel.

### 5.6 Container widths

| Class | Max width | Use |
|---|---|---|
| `.container-narrow` | 720px | Settings detail panes, profile forms |
| `.container-default` | 1280px | Standard pages |
| `.container-wide` | 1440px | Tables, dashboards |
| `.container-fluid` | 100% | Edge-to-edge views (calendar, kanban) |

### 5.7 Responsive breakpoints

Bootstrap defaults; reaffirmed here as the binding set:

| Breakpoint | Min width | Target |
|---|---|---|
| xs | 0 | Phone portrait |
| sm | 576px | Phone landscape |
| md | 768px | Tablet portrait → sidebar collapses to mini |
| lg | 992px | Tablet landscape / small laptop |
| xl | 1200px | Desktop |
| xxl | 1400px | Wide desktop |

### 5.8 Maximum content width

`1440px` for tables and dashboards. Above 1440px, the content centers; the canvas remains full-width. Reading-heavy layouts (release notes, audit detail) cap at `720px` for typographic line length.

### 5.9 Sticky header rules

The app header is always sticky. Cards never have sticky internals (no sticky card headers). Page-level sub-toolbars (e.g., a filter bar) may stick only when the content below is a table or feed exceeding one viewport.

### 5.10 Sticky table header rules

Table headers stick on scroll when the table exceeds the viewport. Header `position: sticky; top: 0; z-index: var(--z-sticky); background: var(--surface-card);`. Drop shadow appears only after scroll begins (1px shadow). On mobile, the first column also sticks when there are ≥ 4 columns.

---

## 6. Dashboard Standards

Every dashboard across all five portals follows the same skeleton.

### 6.1 Skeleton (12-column grid)

```
Row 1   [ KPI 1 ][ KPI 2 ][ KPI 3 ][ KPI 4 ]          ← 4 × (col-3)
Row 2   [ Primary Chart (col-8)        ][ Side stack (col-4) ]
Row 3   [ Recent Activity (col-8)      ][ Quick Actions (col-4) ]
Row 4   [ Pending Approvals (col-12, optional)                  ]
Row 5   [ Mini Calendar (col-6)         ][ Other (col-6)        ]
```

Below 992px → 2 KPI per row. Below 768px → 1 KPI per row, charts stack to full width.

### 6.2 KPI tiles

One layout for every KPI tile in every portal:

```
[ small label, 13px 500, --text-muted ]
[ metric, 32px 700, --text-primary    ]
[ delta + tiny sparkline               ]
```

Maximum 4 KPI tiles per dashboard row. Beyond four, demote to a "summary table." Tiles are always equal-width within a row; never one wide and one narrow.

### 6.3 Charts

Primary chart card is **col-8**, **height 320px**. Charts use the brand palette (§13.5), no gradients, thin axes, no 3D. One chart per card. Always with a date-range selector top-right.

### 6.4 Today's activities

Activity card uses a vertical timeline (timestamps left). Maximum 8 entries visible; scroll for more. Each entry: avatar / icon (24px) · action sentence · timestamp. No colored dots beyond the type icon.

### 6.5 Recent notifications

A condensed view of the user's recent notifications (last 24 hours), capped at 5. "See all" link routes to the notification drawer.

### 6.6 Pending approvals

Shown only when count > 0. Card with: heading "Pending approvals (n)" · list of items with one primary action each (Approve / Review). Hidden when empty — does not show "0 pending."

### 6.7 Quick actions

Maximum 4 buttons, each guarded by `<PermissionGate>`. Buttons are outline variant; primary variant only used for the single most-important action. Each button has an icon + label.

### 6.8 Calendar

Mini calendar (month view) showing upcoming events; click an entry to open the full Calendar page. Mini calendar height capped at 360px.

### 6.9 Analytics

Beyond the primary chart, dashboards may add 1–2 secondary charts in a "Side stack." Secondary charts are smaller (height 180px) and use mini-sparkline composition. No more than 3 charts on any dashboard.

### 6.10 Universal rules

- Same gutter (20px) everywhere.
- Same card depth (`--shadow-sm`) everywhere.
- Same KPI tile size everywhere.
- One hero metric per dashboard (the most important number); other metrics are equal-weight.
- An empty dashboard renders an onboarding checklist instead of empty cards.

---

## 7. Table Standards

SchoolOS is table-heavy. One standard, used everywhere.

### 7.1 Anatomy

```
[ Toolbar: search · saved filters · filter bar · density · column chooser · export · refresh · bulk-action area ]
[ Sticky header ]
[ Rows ]
[ Pagination ]
```

### 7.2 Search

A single text input in the toolbar, left-aligned. Debounced 300ms. Routes to backend cursor query. Magnifying-glass icon prefix. Clear-button suffix when text present.

### 7.3 Filters

Filter chips appear inline next to the search input as the user applies filters. Each chip shows `Field: Value` with a remove ×. "Clear all" link when ≥ 2 filters are applied.

### 7.4 Advanced filters

Trigger button "Filters (n)" opens a right-side `<Offcanvas>` with all available filter fields. Apply / Reset buttons at the bottom. Applied filters reflect into chips above the table.

### 7.5 Saved filters

Within the Advanced Filters offcanvas, "Save filter" button persists the current filter set under a name. Saved filters appear as a dropdown next to the search input ("My filters"). Per-user storage via backend user-preference key (future) — local storage in v1.

### 7.6 Column chooser

Gear icon in toolbar opens a dropdown listing all columns with checkboxes. Toggle reorder via drag. Persists per-user per-table via localStorage keyed by `table.id`.

### 7.7 Density selector

Dropdown with three options: **Comfortable** (row height 56px), **Default** (48px), **Compact** (40px). Persists per-user globally — once chosen, all tables follow.

### 7.8 Export

"Export" button opens a small menu: CSV, Excel. Triggers a Reporting Foundation export job; surfaces a toast "Export queued — we'll notify you when ready." Never exports synchronously.

### 7.9 Refresh

Manual refresh icon button next to export. Triggers a TanStack Query refetch. Useful for long-lived tabs.

### 7.10 Bulk actions

When ≥ 1 row is checked, a sticky bulk-action bar slides in **below** the table header, occupying its row. It contains: "n selected" · primary bulk action · "More" dropdown · Clear-selection ×. Destructive bulk actions require `<ConfirmDialog>` with typed confirmation.

### 7.11 Pagination

Cursor pagination only. Display: "Showing 1–25 of many" · Previous / Next buttons. No page-number list (incompatible with cursor model). Page size selector (25 / 50 / 100) on the right.

### 7.12 Sorting

Click header to sort; click again to reverse; click third time to clear. Active sort shows arrow icon. Server-driven via `?sort=field:asc`. Multi-column sort disabled by default.

### 7.13 Sticky header

Header sticky to top of scrollable viewport. Shadow appears only when scrolled.

### 7.14 Responsive behavior

| Width | Behaviour |
|---|---|
| ≥ 992px | Full table |
| 768–991px | Horizontal scroll; first column sticky |
| < 768px | Collapse to "data list" — each row becomes a stacked key/value card |

### 7.15 Loading

`<Skeleton>` rows matching column count + density. Skeleton stays at least 200ms (avoid flash) and replaces when data arrives.

### 7.16 Empty state

`<EmptyState>` inside the table body: illustration + heading + 1-line description + primary CTA when applicable. Distinguishes "filtered to zero" ("Clear filters") from "no data exists" ("Add your first ___").

### 7.17 Error state

Replace table body with: error icon + "Couldn't load (module name)." + trace id + Retry button. Header and toolbar remain visible.

### 7.18 Universal rule

No module invents its own table design. There is one `<DataTable>` component family, and every module uses it.

---

## 8. Form Standards

One universal form system. Forms in Fees, Billing, Students, and Settings look identical.

### 8.1 Single vs two column

**Single column is the default.** Single column reads faster, scans better on mobile, and keeps tab order linear.

Two columns are allowed **only** when:
- Both fields are short (single-line inputs, < 24 chars typical).
- Fields are logically paired (`First name` / `Last name`, `City` / `Postcode`, `Start date` / `End date`).
- Viewport is ≥ 768px.

Below 768px, two-column always collapses to single.

Multi-column "dense" admin forms (e.g., bulk fee structure entry) are exceptions and use a table-like grid, not a form layout.

### 8.2 Section grouping

Forms with > 6 fields are sectioned. Each section has:
- `<h4>` title (16px / 600).
- 1px `--border-subtle` underline beneath title.
- 16px space above title, 24px below.
- Fields inside the section.

Sections are flat — never collapsed accordions in v1 (forces guesswork). Long forms become wizards (multi-step) instead of accordions.

### 8.3 Validation

- `onBlur` per field.
- `onSubmit` for the whole form.
- Field-level errors render below input, in `--color-danger`, with `role="alert"` and `aria-describedby` wired.
- Form-level errors (cross-field, non-field) render as a banner above the form.
- Backend field errors (`{ errors: { field: msg } }`) merge into form state via `setError`.

### 8.4 Required indicators

Required fields show an asterisk (`*`) after the label, color `--color-danger`. `aria-required="true"` on the input. Helper text "Required" appears only if explicitly enabled per form.

Optional fields are unmarked. Do **not** label every optional with "(Optional)" — it adds noise.

### 8.5 Helper text

Below input. `--text-xs`, `--text-muted`. Used sparingly — only when the field's purpose isn't obvious from its label.

### 8.6 Success states

A form that has just saved shows a toast "Saved" (3s auto-dismiss). The save button does not turn green or display a check — the toast is the source of truth.

Inline "saved successfully" inside the form is reserved for autosave UX (future).

### 8.7 Error states

Field error: border `--color-danger`, ring `--focus-ring-danger` on focus, error message below, `role="alert"`.

Form error: red banner above form summarising the issue, with a link to the first errored field.

API error envelope from backend → toast (`<ErrorEnvelopeToast>`) plus, if `fields` present, inline field errors.

### 8.8 Autosave indicators (future)

Reserved for v2. When implemented:
- "Saving..." in form footer during the network request.
- "Saved (timestamp)" when settled.
- No alteration to v1 layout — autosave indicator slot is held in the footer area.

### 8.9 Read-only mode

A form in read-only mode shows fields with:
- `bg-surface-muted`
- No border (or `--border-subtle`)
- No focus ring
- Inputs `aria-readonly="true"`
- Buttons hidden (Edit button replaces them when permission grants edit)

### 8.10 Optimistic concurrency indicators

`<IfMatchForm>` standard UX (per `FRONTEND_UI_SPECIFICATION.md` §29):
- Captures `version` on load.
- On 412, opens a diff modal showing **Yours** vs **Server** for each changed field.
- User chooses Apply (overwrite server with new version) or Discard (reset to server state).
- The form does **not** silently overwrite the user's edits.

A subtle indicator in the form footer can show "Last edited 3 min ago by Aanya Verma." This is built from the entity's `updatedAt` / `updatedBy` fields and reassures the user about freshness.

### 8.11 Universal layout

```
[ h4 Section title ]   ─── underline
[ Field 1                  ]
[ Field 2                  ]
( more fields )
[ h4 Next section ]   ─── underline
( fields )
─────────────────────────
[ Cancel ]                    [ Primary action ]
```

The footer is sticky on long forms (≥ 1 viewport tall) so the Cancel / Save pair is always reachable.

---

## 9. Card Standards

One card family with strict size variants. Cards do not bleed module identity.

| Type | Size | Composition |
|---|---|---|
| **Information card** | Any | Title (h4) · body content · optional footer link. Used for non-interactive blocks of info. |
| **Dashboard card** | col-4 / col-6 / col-8 | Title + optional toolbar · body (chart or list) · no footer. Min-height 280px. |
| **Analytics card** | col-3 / col-4 | The KPI tile (§6.2). Min-height 120px. |
| **Profile card** | col-12 on detail page, col-4 in lists | Avatar (64px) · name · role · short meta · primary action. No cover image in v1. |
| **Timeline card** | col-12 / col-8 | Title · scrollable timeline (max 480px). Each entry: icon · text · timestamp. |
| **Status card** | col-3 / col-4 | Status chip · count · "View all" link. Used in dashboards to summarise pipeline states (e.g., "Pending invoices: 12"). |
| **Summary card** | col-3 | Icon (28px) · label · value. Compact alternative to KPI tile when delta + sparkline aren't relevant. |
| **Empty card** | replaces a card body when the underlying list is empty | Small illustration · single-line message · optional small CTA. Same outer dimensions as the populated card. |

Universal rules:
- 1px border `--border-default`.
- `--shadow-sm` at rest.
- 20px body padding.
- 12px radius (`--radius-md`).
- White (`--surface-card`) background.
- Hover does **not** change the card (cards aren't clickable as a whole; their elements are).
- A card never carries a colored top stripe, decorative gradient, or per-module accent.

---

## 10. Status System

The status palette is **global and frozen**. Every module that emits a status uses these mappings. No module may invent its own palette.

| Status | Family | Surface bg | Border | Text | Icon |
|---|---|---|---|---|---|
| `ACTIVE` | success | `--color-success-subtle` | `--color-success-border` | `--color-success` | `check-circle` |
| `INACTIVE` | neutral | `--surface-muted` | `--border-default` | `--text-secondary` | `minus-circle` |
| `PENDING` | warning | `--color-warning-subtle` | `--color-warning-border` | `--color-warning` | `clock` |
| `DRAFT` | neutral | `--surface-muted` | `--border-default` | `--text-secondary` | `file-text` |
| `FAILED` | danger | `--color-danger-subtle` | `--color-danger-border` | `--color-danger` | `x-circle` |
| `SUCCESS` | success | `--color-success-subtle` | `--color-success-border` | `--color-success` | `check-circle` |
| `ARCHIVED` | neutral-dim | `--surface-muted` | `--border-default` | `--text-muted` | `archive` |
| `SUSPENDED` | danger | `--color-danger-subtle` | `--color-danger-border` | `--color-danger` | `pause-circle` |
| `INVITED` | info | `--color-info-subtle` | `--color-info-border` | `--color-info` | `mail` |
| `PAID` | success | `--color-success-subtle` | `--color-success-border` | `--color-success` | `check-circle` |
| `UNPAID` | warning | `--color-warning-subtle` | `--color-warning-border` | `--color-warning` | `alert-circle` |
| `OVERDUE` | danger | `--color-danger-subtle` | `--color-danger-border` | `--color-danger` | `alert-octagon` |
| `REFUNDED` | warning | `--color-warning-subtle` | `--color-warning-border` | `--color-warning` | `corner-up-left` |
| `PROCESSING` | info | `--color-info-subtle` | `--color-info-border` | `--color-info` | `loader` |
| `PENDING_INVITE` | info | `--color-info-subtle` | `--color-info-border` | `--color-info` | `mail` |

The status chip renders as: small icon (12px) · label (`--text-xs` 600). Pill radius `--radius-pill`. Padding `2px 8px`. Borders are optional in v1 (used in dark mode to lift the chip from background).

Mapping helper `statusVariant(status: string): VariantKey` lives in `lib/ui/status.ts`. Any usage of a hard-coded `<Badge bg="success">` outside this helper is a bug.

---

## 11. Icons

### 11.1 Library

**Lucide Icons** is the only icon library. The source theme's four-library cocktail (Tabler / Feather / Font Awesome / Boxicons) is reduced to one.

Why Lucide:
- Open source (ISC license).
- 1,400+ icons covering every ERP need.
- React-native bindings (`lucide-react`), tree-shakable.
- Consistent stroke width and geometry.
- Maintained fork of Feather, with active community.

### 11.2 Icon sizes

| Token | px | Use |
|---|---|---|
| `--icon-xs` | 12 | Inside status chips |
| `--icon-sm` | 16 | Inside buttons, form addons, inline annotations |
| `--icon-md` | 20 | Sidebar nav, table actions, default |
| `--icon-lg` | 24 | Header icons, empty-state thumbnails |
| `--icon-xl` | 32 | Profile cards, summary cards |
| `--icon-2xl` | 48 | Empty-state illustrations, error pages |

Stroke width: **2** for sizes 12–20; **1.75** for ≥ 24 (visual balance at larger sizes).

### 11.3 Navigation icon rules

Sidebar nav items have an icon **left** of the label, 20px size, in `--text-secondary` color. Active nav row icon shifts to `--brand-primary`. Subsection nav items have **no** icon (label-only) — saves horizontal space and reduces visual noise.

### 11.4 Status icon rules

Status chips include their mapped icon (§10), 12px, left of the label. Icon color matches text color (one of the semantic tokens).

### 11.5 Action icon rules

Icon-only buttons (toolbar actions, kebab menus) use 20px icons in 32×32 buttons. Required: `aria-label` describing the action. Tooltip via `<OverlayTrigger>` on hover.

### 11.6 Decorative icons

Decorative icons (those that don't convey new info beyond the adjacent label) are kept to a minimum. When present, mark `aria-hidden="true"` so screen readers skip them.

---

## 12. Animations

Animations are subtle. The product never animates for fun.

### 12.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--motion-duration-fast` | 120ms | Hover, focus, color shifts |
| `--motion-duration-base` | 200ms | Buttons, dropdowns, modals fade-in, accordions |
| `--motion-duration-slow` | 320ms | Drawers, page transitions |
| `--motion-ease-out` | `cubic-bezier(0.2, 0, 0.2, 1)` | Entrances |
| `--motion-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |
| `--motion-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Property changes |

### 12.2 Per-interaction

| Interaction | Duration | Property | Easing |
|---|---|---|---|
| Hover | 120ms | background-color | linear |
| Click / press | 80ms | transform `scale(0.98)` then back; only on buttons | linear |
| Focus | 0ms | ring appears instantly | — |
| Dropdown open | 120ms | opacity 0→1 + translateY(-4px)→0 | ease-out |
| Modal open | 200ms | opacity 0→1, scale 0.96→1 | ease-out |
| Drawer slide | 320ms | translateX | ease-out |
| Toast in | 200ms | translateY(8px)→0, opacity 0→1 | ease-out |
| Toast out | 120ms | opacity 1→0 | ease-in |
| Loading spinner | continuous | rotation | linear |
| Skeleton shimmer | 1.5s loop | background-position | linear |
| Progress bar | indeterminate 1.2s loop | translateX | ease-in-out |
| Page transition | 200ms | opacity 0→1 | ease-out |

### 12.3 Forbidden

- Marquee, parallax, auto-rotating carousels.
- Counter-up animations on KPI tiles (show the final number).
- Bouncing notification badges, pulsing icons.
- Hover-driven width/height changes (jitter).
- Decorative entrance animations on first-page-load content.

### 12.4 Reduced motion

`@media (prefers-reduced-motion: reduce)` reduces all durations to 0ms and removes loop animations entirely (spinner becomes a static "loading" label; skeleton becomes a flat block).

---

## 13. Dark Mode

Dark mode is first-class, not a port. Triggered by `data-theme="dark"` on `<html>`, persisted in `localStorage`, falling back to `prefers-color-scheme`.

### 13.1 Palette

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--bg-app` | `#F7F8FB` | `#0B1220` | Canvas |
| `--surface-card` | `#FFFFFF` | `#131B2C` | Cards |
| `--surface-elevated` | `#FFFFFF` | `#19233A` | Modals, popovers |
| `--surface-muted` | `#F7F8FB` | `#10182A` | Disabled, read-only |
| `--text-primary` | `#1A2235` | `#E6EAF2` | Body |
| `--text-secondary` | `#566073` | `#9AA3B7` | Captions |
| `--text-muted` | `#828B9D` | `#6F7891` | Placeholders |
| `--border-default` | `#E4E7EE` | `#252D43` | Card borders |
| `--border-strong` | `#CBD0DA` | `#3A4360` | Emphasised |
| `--border-subtle` | `#EEF0F4` | `#1B233A` | Row separators |
| `--brand-primary` | `#2D4FCC` | `#6D8AF0` | Lifted in dark for AA |
| `--brand-primary-hover` | `#243FA8` | `#5A78E0` | |
| `--brand-primary-subtle` | `#EEF1FC` | `#1B274A` | |
| `--color-success` | `#15803D` | `#3FBE6B` | |
| `--color-success-subtle` | `#E8F5EC` | `#0F2A1A` | |
| `--color-warning` | `#B45309` | `#E2A24C` | |
| `--color-warning-subtle` | `#FEF3E6` | `#2A1E08` | |
| `--color-danger` | `#B42318` | `#FF6F61` | |
| `--color-danger-subtle` | `#FEE8E5` | `#2A1212` | |
| `--color-info` | `#1E5FBE` | `#5A93EE` | |
| `--color-info-subtle` | `#E7F0FB` | `#0E1F3A` | |

### 13.2 Contrast rules

Every dark-mode token combination meets WCAG AA. The brand primary lifts from `#2D4FCC` to `#6D8AF0` specifically to keep ≥ 4.5:1 against dark surfaces.

### 13.3 Chart colors in dark mode

ApexCharts theme switches via options object on `data-theme` change. Series colors lift in luminance to match dark surfaces:

| Series | Light | Dark |
|---|---|---|
| 1 | `#2D4FCC` | `#7A95F2` |
| 2 | `#0E9F8E` | `#3DD4BD` |
| 3 | `#B45309` | `#E2A24C` |
| 4 | `#7C3AED` | `#A98BF5` |
| 5 | `#0F766E` | `#3DBDB4` |
| 6 | `#B42318` | `#FF8278` |

Grid lines: `#E4E7EE` light / `#252D43` dark. Axis labels: `--text-muted`.

### 13.4 Table colors in dark mode

Rows: `--surface-card` (`#131B2C`). Hover: `#1A2238`. Sticky header: same as card with `--shadow-sm` once scrolled. Stripes are not used in either theme.

### 13.5 Sidebar colors in dark mode

If user picks light-sidebar in dark mode, sidebar uses `#131B2C` (the card surface) to harmonise with cards. If user picks dark-sidebar in dark mode, sidebar deepens to `#0B1220` (the canvas), and active rows use `#1B274A`.

### 13.6 Accessibility in dark mode

- Focus rings keep 3:1 contrast against both `--surface-card` and `--surface-muted`.
- Shadows have doubled alpha; dark surfaces need the extra weight to read elevated.
- Avoid pure black (`#000`) and pure white (`#FFF`); the eye fatigues on pure-black backgrounds.
- Charts re-render on theme switch (subscribe to theme context); no stale colors.

---

## 14. Mobile Strategy

Each portal targets a primary device. Layouts adapt accordingly.

### 14.1 Portal device matrix

| Portal | Primary | Optimised | Functional |
|---|---|---|---|
| Platform | Desktop | Tablet | Mobile |
| SchoolAdmin | Desktop | Tablet | Mobile |
| Teacher | Tablet | Desktop, Mobile | — |
| Student | Mobile | Tablet, Desktop | — |
| Parent | Mobile | Tablet, Desktop | — |

### 14.2 Adaptation rules

**Desktop (≥ 992px)**: Full sidebar + full header + multi-column dashboards + dense tables. The reference experience.

**Tablet (768–991px)**: Mini sidebar (icon-only, hover-expand). Dashboards collapse to 2 KPIs per row + stacked charts. Tables remain horizontal-scroll with sticky first column. Forms remain two-column when room permits.

**Mobile (< 768px)**:
- Sidebar becomes an off-canvas drawer triggered by hamburger.
- Dashboards stack to single column.
- KPI tiles become full-width.
- Charts shrink to height 200px and forfeit dual-axis where applicable.
- Tables collapse to "data list" — each row becomes a stacked card with field labels.
- Forms become single-column always.
- Bottom-nav tab bar appears in Student / Parent portals (mobile-primary), with Home / Search / Notifications / Profile.
- FAB appears for primary action where appropriate (e.g., "Add expense" in Parent fee detail).

### 14.3 Touch targets

Minimum **44 × 44 px** for any tap target on touch devices. Icon buttons at 32px desktop expand to 44px on touch via padding (not size).

### 14.4 Performance on mobile

- Below 768px, charts use the simpler ApexCharts options profile (no animations, no tooltips on tap-and-hold).
- Images served via `next/image` with explicit `sizes` for mobile widths.
- Lazy-loaded chunks for non-critical screens.
- First-load JS budget under 250KB gzipped for Student / Parent dashboards.

### 14.5 Orientation

Layouts work in portrait and landscape. Landscape on tablet uses the desktop layout when width ≥ 992px.

---

## 15. Accessibility

WCAG 2.1 AA is the contract. The product is unshippable if it fails. AAA is targeted for color contrast on body text.

### 15.1 Keyboard navigation

- Every interactive element reachable via Tab in a logical order.
- Skip-to-content link is the first focusable element on every page.
- Sidebar groups: `aria-expanded` + Enter / Space to toggle; Arrow keys to navigate items within.
- Modal: `Esc` closes (unless dirty form), focus trap, return focus to trigger on close.
- Tables: arrow keys navigate cells; Enter activates the row's primary action.
- Dropdowns: Arrow keys for options; Enter selects; Esc closes; type-to-search.

### 15.2 Focus rings

`:focus-visible` ring on every focusable element. Tokens `--focus-ring` (brand) and `--focus-ring-danger`. **`outline: none` is forbidden globally.** Lint-enforced.

### 15.3 ARIA expectations

- Buttons rendered as `<button>`, not divs.
- Links rendered as `<a>` with proper `href`.
- Dialogs: `role="dialog" aria-modal="true" aria-labelledby="…"`.
- Tabs: `role="tablist" / "tab" / "tabpanel"`.
- Alerts: `role="alert"` for errors; `role="status"` for info.
- Live regions: `aria-live="polite"` for non-blocking updates; `aria-live="assertive"` for errors.
- Current page: `aria-current="page"` on the active sidebar item and breadcrumb.

### 15.4 Contrast

- Body text ≥ **7:1** (AAA target).
- Large text (18px+ regular, 14px+ bold) ≥ **4.5:1**.
- UI components and graphical objects ≥ **3:1**.
- Focus indicators ≥ **3:1** against adjacent surface.
- Audited in both themes; CI gates fail the build on contrast regression.

### 15.5 Touch targets

≥ 44 × 44 px on touch devices (per §14.3).

### 15.6 Screen readers

- All icons either labelled (`aria-label`) or hidden (`aria-hidden="true"`).
- Form fields associated with labels via `for` / `id`; helper / error linked via `aria-describedby`.
- Tables have proper `<thead>` / `<tbody>` with `scope="col"` on headers.
- Status changes announced via `aria-live` regions (e.g., toast contents).
- Loading states announced ("Loading students" → "Loaded 25 students").

### 15.7 WCAG goals

- v1 ships **WCAG 2.1 AA conformant** across all five portals.
- AAA color contrast on body text everywhere.
- AAA target deferred for non-text elements.

---

## 16. Design Principles

These 25 principles bind every frontend sprint. They are not suggestions; they are the rules that prevent system drift.

1. **One primary action per page.** Users should know unambiguously what the most important thing they can do here is. If a page has two primaries, one of them is wrong.

2. **Never use more than one primary button in a section.** Within a card, drawer, modal, or form section, the same rule applies.

3. **Never mix status colors.** A `PENDING` is always `--color-warning`. There is no "danger pending" or "info pending." If a status doesn't fit, request a new status in `MODEL_INVENTORY.md`, don't tint differently.

4. **Never create module-specific buttons.** Buttons are universal. If a module thinks it needs its own button, it actually needs `<Button variant="..." size="...">` and a clearer label.

5. **Never create custom spacing.** All spacing is a multiple of 4. Use spacing tokens. No `padding: 13px`.

6. **Never create custom colors.** All colors are tokens. No `#hex` literals in component SCSS. The exception is third-party widgets (ApexCharts, FullCalendar) where the theme is bound via their config — and even there, the values are pulled from tokens.

7. **Reuse shared components only.** If you need a list with cursor pagination, you use `<DataTable>` + `<CursorPaginator>`. You do not write a new list.

8. **Tokens are the only API surface for visual values.** Designers and engineers reference `--brand-primary`. Anyone reaching for `#2D4FCC` is bypassing the system.

9. **Inter is the font.** No second face. No display font. No script accent.

10. **One icon library.** Lucide. No mixing with Tabler, Feather, FA, Boxicons, custom SVGs.

11. **Server data flows through TanStack Query.** Form state flows through React Hook Form. Neither lives in `useState`.

12. **Optimistic concurrency is shown to the user, never silenced.** Conflicts open the diff modal. The user chooses.

13. **Backend errors render via `<ErrorEnvelopeToast>`.** Code, message, trace id, optional copy-button. No bespoke error UIs per module.

14. **RBAC gates surfaces, not enforces security.** A missing permission hides UI for usability. The backend remains the security authority.

15. **Feature flags hide entire surfaces, not warning labels.** A disabled module is not shown with a "coming soon" badge — it isn't shown at all.

16. **Dashboards follow the standard skeleton.** No module's dashboard invents its own layout.

17. **Tables follow the standard anatomy.** No module's list invents its own toolbar.

18. **Forms are single-column by default.** Two-column requires short paired fields; otherwise revert.

19. **Accessibility is decided at design, not retrofitted.** Every new screen passes axe before review.

20. **Animations exist for feedback, not decoration.** If removing an animation doesn't change the user's understanding, remove it.

21. **No `outline: none`.** Ever. Focus is visible on every focusable element.

22. **No infinite animation on persistent UI.** No spinning logos, no pulsing badges. Spinners belong in transient states only.

23. **No vendor branding from the source theme.** No "preskool," no template-vendor strings, no copyrighted illustrations carried into production.

24. **Test the empty case, the loading case, and the error case for every list.** A screen that only renders the populated case is incomplete.

25. **One design language, end to end.** The Parent paying a fee, the Operator provisioning a school, and the Teacher marking attendance see the same buttons, the same cards, the same status colors. Drift is the enemy.

These principles are enforced by:
- Lint rules (`no-literal-colors`, `no-jquery`, `no-restricted-imports`).
- The `FRONTEND_UI_SPECIFICATION.md` review checklist.
- CODEOWNERS approval on `styles/` and `components/foundation/`.
- The CI gates in `UI_TESTING_STRATEGY.md` §24.

---

## Stop

This document is the visual contract for SchoolOS. Sprint F1 begins only after review and approval.

No code generated. No React. No Next.js. No scaffolding. No modifications to prior planning documents.
