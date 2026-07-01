# Frontend UI Specification — SchoolOS

> **Status:** Frozen UI Standard. Single source of truth for all frontend work.
> **Authority:** This document binds Sprints F1–F16 and every subsequent frontend change.
> **Companion:** `UI_ARCHITECTURE.md` (stack), `COMPONENT_INVENTORY.md` (component verdicts), `API_UI_MAPPING.md` (API↔screen map), `UI_TESTING_STRATEGY.md` (testing).

Any deviation requires an explicit amendment to this document with PR-level approval. "Make it pretty" or "match Figma" are not amendments — they are bug reports against this spec.

---

## 1. Design Tokens

All tokens are declared as CSS custom properties on `:root` in `styles/_tokens.scss` and rebound under `[data-theme="dark"]`. SCSS partials never hardcode values; they reference variables.

### 1.1 Colors — base palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary` | `#3D5EE1` | `#5B7BF5` | Brand, primary CTA |
| `--color-primary-hover` | `#3551CB` | `#7A95FF` | Primary hover |
| `--color-primary-subtle` | `#EEF1FD` | `#1E2A55` | Primary tinted bg |
| `--color-secondary` | `#6FCCD8` | `#5BB8C4` | Secondary accent |
| `--color-secondary-subtle` | `#EAF8FA` | `#1A3438` | Secondary tinted bg |

### 1.2 Semantic colors

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--color-success` | `#1ABE17` | `#39D436` | Positive outcomes |
| `--color-success-subtle` | `#E6F8E6` | `#1A3819` | Success tinted bg |
| `--color-danger` | `#E82646` | `#FF4A66` | Destructive, error |
| `--color-danger-subtle` | `#FCE7EB` | `#3E1820` | Danger tinted bg |
| `--color-warning` | `#FFB200` | `#FFC93D` | Caution |
| `--color-warning-subtle` | `#FFF6E0` | `#3D2E0A` | Warning tinted bg |
| `--color-info` | `#1B84FF` | `#3D9BFF` | Informational |
| `--color-info-subtle` | `#E5F1FF` | `#0E2A4F` | Info tinted bg |

### 1.3 Surface colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-0` | `#FFFFFF` | `#0F1419` | App background |
| `--surface-1` | `#FAFBFC` | `#161B22` | Card/panel base |
| `--surface-2` | `#F1F4F8` | `#1C2129` | Elevated surface (hover, modal) |
| `--surface-3` | `#E7EBF0` | `#252B33` | Highest elevation, overlay |

### 1.4 Background colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-body` | `var(--surface-0)` | `var(--surface-0)` | `<body>` |
| `--bg-sidebar` | `#FFFFFF` | `#0B1014` | Sidebar |
| `--bg-header` | `#FFFFFF` | `#0F1419` | Header |
| `--bg-input` | `#FFFFFF` | `#161B22` | Form controls |
| `--bg-disabled` | `#F1F4F8` | `#1C2129` | Disabled state |

### 1.5 Text colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--text-primary` | `#1B2738` | `#E6EBF1` | Body text |
| `--text-secondary` | `#5C6878` | `#A0AAB8` | Captions, helper |
| `--text-muted` | `#8A95A5` | `#6E7888` | Placeholders, disabled labels |
| `--text-inverse` | `#FFFFFF` | `#0F1419` | On colored backgrounds |
| `--text-link` | `var(--color-primary)` | `var(--color-primary)` | Anchor |

### 1.6 Borders

| Token | Light | Dark | Use |
|---|---|---|---|
| `--border-default` | `#E1E6EC` | `#252B33` | Default 1px border |
| `--border-strong` | `#C7CFD8` | `#3A424D` | Emphasised |
| `--border-input` | `#D5DBE2` | `#2C333D` | Form input |
| `--border-focus` | `var(--color-primary)` | `var(--color-primary)` | `:focus-visible` ring origin |

### 1.7 Shadows

| Token | Value | Use |
|---|---|---|
| `--shadow-none` | `none` | — |
| `--shadow-sm` | `0 1px 2px rgba(15, 20, 25, 0.05)` | Subtle lift (cards) |
| `--shadow-md` | `0 4px 12px rgba(15, 20, 25, 0.08)` | Dropdown, popover |
| `--shadow-lg` | `0 12px 32px rgba(15, 20, 25, 0.12)` | Modal, offcanvas |
| `--shadow-focus` | `0 0 0 3px rgba(61, 94, 225, 0.25)` | Focus ring |

In dark mode shadow alpha doubles: dark surfaces need stronger contrast.

### 1.8 Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-none` | `0` | Sharp edges |
| `--radius-sm` | `4px` | Inputs, badges |
| `--radius-md` | `8px` | Buttons, cards |
| `--radius-lg` | `12px` | Modals, large cards |
| `--radius-xl` | `16px` | Hero / dashboard tiles |
| `--radius-pill` | `999px` | Pills, chips, switches |
| `--radius-circle` | `50%` | Avatars, icon buttons |

### 1.9 Opacity

| Token | Value | Use |
|---|---|---|
| `--opacity-disabled` | `0.5` | Disabled controls |
| `--opacity-muted` | `0.7` | Secondary controls |
| `--opacity-overlay` | `0.5` | Modal backdrops |
| `--opacity-hover` | `0.9` | Hover dim |

### 1.10 Spacing scale (4-pt grid)

| Token | px | Use |
|---|---|---|
| `--space-0` | 0 | — |
| `--space-1` | 4 | Hairline gaps |
| `--space-2` | 8 | Tight groups |
| `--space-3` | 12 | Field gaps |
| `--space-4` | 16 | Default padding |
| `--space-5` | 24 | Section gap |
| `--space-6` | 32 | Card padding |
| `--space-7` | 48 | Block separator |
| `--space-8` | 64 | Page sections |
| `--space-9` | 96 | Hero |
| `--space-10` | 128 | Special layouts |

All margins/paddings reference these. No literal `12px` in component SCSS.

### 1.11 Z-index scale

| Token | Value | Use |
|---|---|---|
| `--z-base` | 0 | Default flow |
| `--z-dropdown` | 1000 | Dropdowns, popovers |
| `--z-sticky` | 1020 | Sticky table header |
| `--z-fixed` | 1030 | Header, sidebar |
| `--z-offcanvas-backdrop` | 1040 | — |
| `--z-offcanvas` | 1045 | Drawer |
| `--z-modal-backdrop` | 1050 | — |
| `--z-modal` | 1055 | Modal dialog |
| `--z-popover` | 1070 | Popover above modal |
| `--z-tooltip` | 1080 | Tooltip above all |
| `--z-toast` | 1090 | Toast above all |

---

## 2. Typography

### 2.1 Font family

- **Primary:** `Nunito` (self-hosted via `next/font/google`, weights 400 / 500 / 600 / 700).
- **Mono:** `JetBrains Mono` (only for code, trace IDs, idempotency keys).
- No Roboto or Poppins (source theme triplet collapsed to one face).

Stack: `Nunito, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.

### 2.2 Font sizes (rem; root = 16px)

| Token | rem | px | Use |
|---|---|---|---|
| `--fs-2xs` | 0.625 | 10 | Badges, meta |
| `--fs-xs` | 0.75 | 12 | Captions, table sub-text |
| `--fs-sm` | 0.875 | 14 | Body small, secondary text |
| `--fs-base` | 1.0 | 16 | Body default |
| `--fs-md` | 1.125 | 18 | Lead paragraph |
| `--fs-lg` | 1.25 | 20 | Card titles |
| `--fs-xl` | 1.5 | 24 | h3 |
| `--fs-2xl` | 1.875 | 30 | h2 |
| `--fs-3xl` | 2.25 | 36 | h1 |
| `--fs-4xl` | 3.0 | 48 | Hero numbers (dashboard stats) |

### 2.3 Font weights

| Token | Value | Use |
|---|---|---|
| `--fw-regular` | 400 | Body |
| `--fw-medium` | 500 | Emphasised body, labels |
| `--fw-semibold` | 600 | Sub-headings, button text |
| `--fw-bold` | 700 | Headings |

No 300, no 800. Use color or size for emphasis instead.

### 2.4 Heading hierarchy

| Level | Token | Weight | Line height | Use |
|---|---|---|---|---|
| h1 | `--fs-3xl` | 700 | 1.2 | Page title |
| h2 | `--fs-2xl` | 700 | 1.25 | Section title |
| h3 | `--fs-xl` | 600 | 1.3 | Subsection / card title |
| h4 | `--fs-lg` | 600 | 1.4 | Group title |
| h5 | `--fs-md` | 600 | 1.4 | Minor group |
| h6 | `--fs-base` | 600 | 1.5 | Smallest heading |

Exactly one `<h1>` per page (page title). Lower headings sequential — no skipping.

### 2.5 Line heights

| Token | Value | Use |
|---|---|---|
| `--lh-tight` | 1.2 | Headings, hero numbers |
| `--lh-snug` | 1.35 | Sub-headings |
| `--lh-normal` | 1.5 | Body |
| `--lh-relaxed` | 1.65 | Long-form text (release notes) |

### 2.6 Letter spacing

| Token | Value | Use |
|---|---|---|
| `--ls-tight` | -0.01em | Hero numbers |
| `--ls-normal` | 0 | Default |
| `--ls-wide` | 0.04em | Eyebrow labels, all-caps badges |

---

## 3. Buttons

All buttons use React Bootstrap `<Button>` with token-driven SCSS overrides. Button text is sentence case (never ALL CAPS in body), 600 weight, single-line.

### 3.1 Variants

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| **Primary** | `--color-primary` | `--text-inverse` | none | Main action (one per view) |
| **Secondary** | `--surface-2` | `--text-primary` | `--border-default` | Secondary action |
| **Outline** | transparent | `--color-primary` | `--color-primary` | Tertiary action, dialogs |
| **Danger** | `--color-danger` | `--text-inverse` | none | Destructive (delete, suspend) |
| **Success** | `--color-success` | `--text-inverse` | none | Confirm, approve |
| **Warning** | `--color-warning` | `#1B2738` | none | Caution actions |
| **Ghost** | transparent | `--text-primary` | none | Toolbar, sidebar items |
| **Link** | transparent | `--color-primary` | none, underline on hover | Inline navigation |
| **Icon button** | transparent | `--text-primary` | none, circular `:hover` bg | Toolbar icons |
| **FAB** | `--color-primary` | `--text-inverse` | none | Mobile-only primary CTA, bottom-right |

Only one Primary per visible viewport. Danger requires `<ConfirmDialog>` for irreversible actions.

### 3.2 States

- **Loading:** button shows `<Spinner size="sm" />` left of text; text unchanged; disables clicks; `aria-busy="true"`.
- **Disabled:** opacity `--opacity-disabled`; `cursor: not-allowed`; `aria-disabled="true"`; do NOT remove from tab order (keep focusable, just non-actionable) unless the entire form is disabled.
- **Active / pressed:** background steps one shade darker (`--color-primary-hover`).
- **Focus:** `:focus-visible` ring via `--shadow-focus`. Never `outline: none`.

### 3.3 Sizes

| Size | Min height | Padding | Font | Use |
|---|---|---|---|---|
| sm | 32px | `0 var(--space-3)` | `--fs-sm` | Toolbar, table actions |
| md (default) | 40px | `0 var(--space-4)` | `--fs-base` | Most actions |
| lg | 48px | `0 var(--space-5)` | `--fs-md` | Primary CTAs on auth pages |

Icon-only buttons are square (32, 40, or 48). FAB is 56px diameter.

---

## 4. Forms

All form controls are wrapped by **React Hook Form** with **Zod** schemas. No uncontrolled inputs. Every input has a `<label>` (visible or `sr-only`).

### 4.1 Field anatomy

```
[Label] [optional badge: Required | Optional]
[Input]
[Helper text | Error message]
```

- Label: above input, `--fw-medium`, `--fs-sm`.
- Required marked with asterisk + `aria-required="true"`.
- Helper text: `--text-secondary`, `--fs-xs`, below input.
- Error message replaces helper, `--color-danger`, `aria-live="polite"`, `aria-describedby` wired to input.

### 4.2 Control catalog

| Control | Source | Notes |
|---|---|---|
| Input (text/email/number) | `<Form.Control>` | Token-styled |
| Textarea | `<Form.Control as="textarea">` | Min rows 3, auto-resize optional |
| Select (simple) | `<Form.Select>` | Native, <8 options |
| Async select | `react-select` | `loadOptions` debounced 300ms; show spinner |
| Date | `react-day-picker` single | ISO 8601 stored; en-IN display |
| Time | Small custom built on day-picker companion | 24-hour storage, locale display |
| Date range | `react-day-picker` `mode="range"` | Apply/Cancel buttons in popover |
| Phone | `react-international-phone` styled | E.164 storage |
| Currency | Custom input + `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` | Stored as minor units (paise) |
| OTP | `input-otp` library | 6 digits default |
| Password | `<Form.Control type="password">` + eye toggle | Optional strength meter on set/reset |
| File upload | `react-dropzone` | Backed by FileStorageService pre-signed URL |
| Checkbox | `<Form.Check type="checkbox">` | |
| Radio | `<Form.Check type="radio">` | Group requires `<fieldset><legend>` |
| Switch | `<Form.Check type="switch">` | Used for boolean settings, never for save/submit |

### 4.3 States

- **Validation error:** red border (`--color-danger`), red helper.
- **Read-only:** `bg-disabled`, full opacity, no border-focus.
- **Disabled:** `bg-disabled`, opacity `--opacity-disabled`, `aria-disabled="true"`.
- **Loading:** for async-fetched fields, show spinner inside input on right.

### 4.4 Submission

- Buttons row: right-aligned. Order = Cancel (Secondary/Outline) → Primary action. Mobile stacks full-width, Primary on top.
- On submit: disable form, show spinner inside Primary button, ensure form-level `aria-busy="true"`.
- Validation occurs `onBlur` for individual fields and `onSubmit` for the whole form.

---

## 5. Cards

All cards inherit from React Bootstrap `<Card>` with token padding `--space-6`, radius `--radius-md`, shadow `--shadow-sm`, background `--surface-1`.

| Variant | Composition |
|---|---|
| **Dashboard Card** | Title + body (chart or list); optional toolbar; min-height 280px |
| **Analytics Card** | Title + KPI value (`--fs-3xl --fw-bold`) + delta (% with arrow icon) + sparkline; min-width 240px |
| **Summary Card** | Icon + label + count; min-height 96px; used in dashboards in groups of 4 |
| **Profile Card** | Avatar + name + role + actions; supports cover image |
| **Chart Card** | Title + ApexCharts canvas; toolbar with date-range + export |
| **Activity Card** | Title + scrollable list with timeline marks; max-height 480px |
| **Information Card** | Title + key/value grid (2 cols on ≥768px, 1 col below) |

No card carries actions in its body without a clear visual hierarchy. Cards never nest more than two levels.

---

## 6. Tables

All tables use **TanStack Table (headless)** rendered with Bootstrap classes (`.table .table-hover`). Custom styling via SCSS partials.

| Feature | Standard |
|---|---|
| Pagination | **Cursor only** — consume backend `{ nextCursor, prevCursor, hasMore }`. Never offset. |
| Sorting | Server-driven via `?sort=field:asc`. UI reflects current sort. Multi-column sort optional, off by default. |
| Filtering | Toolbar above table; debounced text search 300ms; chip-style applied filters. |
| Column chooser | Dropdown in toolbar; persists per-user via localStorage keyed by table id. |
| Bulk actions | Checkbox column left; bulk action bar appears above table when ≥1 row selected; bulk requires `<ConfirmDialog>` for destructive ops. |
| Sticky header | `position: sticky; top: 0; z-index: var(--z-sticky)`. |
| Responsive | Below 768px collapse to "data list" view (key/value stack per row) OR horizontal scroll with sticky first column. |
| Loading | `<Skeleton>` rows matching column count for initial load; shimmer for refetch. |
| Empty | `<EmptyState>` with illustration + heading + optional CTA. |
| Export | Trigger backend export job (Reporting Foundation). Toast on enqueue. |
| Search | Single text input in toolbar; submits as `?q=` cursor query. |
| Status chips | See §7. |

Row click navigates to detail when entire row is clickable; otherwise actions live in a kebab dropdown in the last column.

---

## 7. Badges & status chips

All status pills use `<Badge pill>` with semantic color tokens. The status→color mapping is **fixed** and global.

| Status | Background | Text | Token |
|---|---|---|---|
| `ACTIVE` | `--color-success-subtle` | `--color-success` | success |
| `INACTIVE` | `--surface-2` | `--text-secondary` | neutral |
| `PENDING` | `--color-warning-subtle` | `--color-warning` | warning |
| `PROCESSING` | `--color-info-subtle` | `--color-info` | info |
| `SUCCESS` / `PAID` / `COMPLETED` | `--color-success-subtle` | `--color-success` | success |
| `FAILED` / `ERROR` | `--color-danger-subtle` | `--color-danger` | danger |
| `ARCHIVED` | `--surface-2` | `--text-muted` | neutral |
| `SUSPENDED` | `--color-danger-subtle` | `--color-danger` | danger |
| `PENDING_INVITE` | `--color-info-subtle` | `--color-info` | info |
| `DRAFT` | `--surface-2` | `--text-secondary` | neutral |
| `OVERDUE` | `--color-danger-subtle` | `--color-danger` | danger |
| `REFUNDED` | `--color-warning-subtle` | `--color-warning` | warning |

Helper: `statusVariant(status: string): VariantKey` lives in `lib/ui/status.ts`. No ad-hoc badge colors.

---

## 8. Dashboard standards

- Layout: 12-column grid; gutter `--space-4`.
- Top row: 4 Summary Cards (3 columns wide each on `≥1200px`, 6 on `≥768px`, 12 below).
- Second row: 2 Chart Cards (6 cols each).
- Third row: Activity Card (8 cols) + Quick Actions card (4 cols).
- Widget hierarchy:
  1. Numbers first (today's count, today's collection).
  2. Trends (last 7 / 30 days).
  3. Actionable (pending tasks).
  4. Recent activity.
- Charts: max 1 chart per card. No 3D, no exploded pies, no dual axes.
- Quick Actions: max 4 buttons, all Primary or Outline; each guarded by `<PermissionGate>`.
- Empty dashboard: show onboarding checklist instead of empty cards.

---

## 9. Modal standards

Uses React Bootstrap `<Modal>`.

| Aspect | Standard |
|---|---|
| Sizes | sm (400px), md (560px, default), lg (800px), xl (1080px). No "fullscreen" unless mobile. |
| Padding | Header / body / footer each `--space-6`. |
| Header | Title (`<h3>`) left; close button (icon-only) right; bottom border `--border-default`. |
| Footer | Right-aligned buttons. Cancel (Outline) → Primary action. Stack on mobile. |
| Backdrop | `rgba(15, 20, 25, var(--opacity-overlay))`; click closes only for non-form modals. |
| Keyboard | `Esc` closes only when no field is dirty; otherwise prompts via `beforeunload`-style confirm for forms. |
| Focus | On open, focus moves to first interactive element (or close button); on close, returns to trigger. Focus trap inside while open. |
| Scroll | Body scrolls inside the modal; backdrop locks page scroll. |
| Stacking | Only one modal at a time. Confirm dialogs over modals OK via `<ConfirmDialog>` nested. |
| ARIA | `role="dialog" aria-modal="true" aria-labelledby="modal-title"`. |

---

## 10. Drawer (Offcanvas) standards

Uses React Bootstrap `<Offcanvas>`.

| Aspect | Standard |
|---|---|
| Placement | `end` (right) for detail/edit drawers; `start` (left) for mobile sidebar. |
| Sizes | sm (320px), md (480px, default), lg (640px). |
| Header / Body / Footer | Same structure as modal. |
| Closing | Backdrop click closes; `Esc` closes; "X" button always present. |
| Use | Long forms, detail panels — anywhere a modal would feel too heavy. |
| ARIA | `role="dialog"` with appropriate label. |

---

## 11. Tabs

Uses React Bootstrap `<Tab.Container>`.

| Aspect | Standard |
|---|---|
| Variant | `nav-tabs` (underline) for in-page; `nav-pills` only for filter switches. |
| State | Active tab tied to URL search param `?tab=` for deep-linking. |
| Keyboard | Arrow keys navigate; Enter / Space activate. |
| Mobile | Horizontal scroll; never stack vertically. |
| Max tabs | 6 visible; beyond that, use a dropdown overflow. |

---

## 12. Accordions

Uses React Bootstrap `<Accordion>`.

| Aspect | Standard |
|---|---|
| Default | All collapsed. |
| Multi-open | Off by default. |
| Chevron | Right side; rotates 180° on open. |
| Use | FAQ, filter sections, settings groups. |
| ARIA | `aria-expanded`, `aria-controls` wired. |

---

## 13. Timeline

Custom component. Vertical only.

- Each entry: timestamp (`--fs-xs --text-muted`), title, body, icon dot.
- Group by day; relative time within today ("2 hours ago"), absolute date otherwise.
- Used for: audit log, student history, billing history.
- Empty state replaces list when zero entries.

---

## 14. Calendar

Uses `@fullcalendar/react`.

| Aspect | Standard |
|---|---|
| Default view | `dayGridMonth` for admin; `listWeek` for parent/student. |
| Switcher | Month / Week / Day / List in top-right. |
| Locale | `en-IN`; week starts Monday. |
| Event colors | Map to status palette in §7. |
| Creating event | Click-and-drag opens modal (admin only, RBAC-gated). |
| Mobile | Forces `listWeek` view below 768px. |
| ARIA | FullCalendar's defaults; verify navigation works keyboard-only. |

---

## 15. Notifications

### 15.1 Toast

- Position: top-right desktop, bottom-center mobile.
- Auto-dismiss: 5s for info/success, 8s for warning/error, manual-only for actions requiring acknowledgement.
- Max 3 visible at once; queue beyond that.
- Composition: icon + title + body + close button + optional action link.
- ARIA: `role="status"` for info/success; `role="alert"` for warning/error.

### 15.2 Alerts (inline banners)

- Use for page-level state (e.g., "Subscription expires in 7 days").
- Dismissable optional; remember dismissal in localStorage by alert id.

### 15.3 Banners (top-of-page)

- For session-wide context: impersonation banner, maintenance window, billing overdue.
- Sticky below header; full width; strong color background.

### 15.4 Confirmation dialogs

- Use `<ConfirmDialog>` wrapping `<Modal size="sm">`.
- Title, body explaining consequence, two buttons: Cancel (Outline) → Confirm (Danger for destructive, Primary otherwise).
- Required for: delete, archive, suspend, mass updates, payments, refunds.
- Destructive confirm text: imperative + noun ("Archive student", "Refund ₹1,250").
- For irreversible actions, require typing the name of the object to enable Confirm.

---

## 16. Loading states

| Pattern | Use |
|---|---|
| `<Spinner>` | Inline within buttons or small areas |
| `<Skeleton>` (Bootstrap `placeholder-glow`) | Lists, cards, tables on initial load |
| `<ProgressBar>` | Determinate (file upload, multi-step jobs) |
| `<PageLoader>` | Full-page route transitions only |
| Placeholder image | Avatars while loading |

Rules:
- Show skeleton if expected wait > 200ms.
- Never show both spinner + skeleton in the same area.
- After 10s without response, surface a "Still loading..." message with retry option.

---

## 17. Empty states

Every list / table / detail-with-children section MUST handle the empty case.

Composition: illustration + heading + 1-line description + primary CTA (when applicable).

| Context | CTA |
|---|---|
| First-time empty | "Add your first student" |
| Filtered to zero | "Clear filters" |
| No permission | "Request access" (or hide via `<PermissionGate>`) |
| No data this period | "Change date range" |

---

## 18. Error screens

| Code | Route / trigger | Composition |
|---|---|---|
| 404 | `/_not-found` route | Illustration + "Page not found" + return-home button |
| 403 | Permission denied on any route | "You don't have access" + contact-admin link |
| 500 | Error boundary | "Something went wrong" + trace id + reload button |
| Maintenance | `/maintenance` route | "We're upgrading" + ETA + status link |
| Offline | Network detector | Snackbar "You're offline" + retry button |
| No Permission | Inline within page | Replace section with 403 panel; never blank |
| No Data | Inline | Empty state per §17 |

All error screens display the relevant `X-Trace-Id` so support can correlate with backend logs.

---

## 19. Responsive standards

### 19.1 Breakpoints (Bootstrap-compatible)

| Name | Min width | Target |
|---|---|---|
| xs | 0 | Phone portrait |
| sm | 576px | Phone landscape |
| md | 768px | Tablet portrait → sidebar collapses to mini |
| lg | 992px | Tablet landscape / small laptop |
| xl | 1200px | Desktop |
| xxl | 1400px | Wide desktop |

### 19.2 Per-portal targets

| Portal | Mobile | Tablet | Desktop |
|---|---|---|---|
| Platform | Functional | Optimised | Primary |
| SchoolAdmin | Functional | Optimised | Primary |
| Teacher | Optimised | Primary | Primary |
| Student | **Primary** | Optimised | Functional |
| Parent | **Primary** | Optimised | Functional |

"Primary" = pixel-perfect, every flow tested. "Optimised" = functional + tested smoke flows. "Functional" = works, may have horizontal scroll on edge cases.

### 19.3 Sidebar behavior

- `≥992px`: full sidebar.
- `768–991px`: mini sidebar (icon only, expand on hover).
- `<768px`: offcanvas drawer triggered by hamburger.

---

## 20. Accessibility standards

WCAG 2.1 AA target. Audited per portal in Sprint F16.

| Concern | Standard |
|---|---|
| Skip nav | `<SkipToContent>` is first focusable element; jumps to `#main-content`. |
| Keyboard | Every interactive element reachable via Tab; logical order; no keyboard traps. |
| Focus | Always visible via `:focus-visible` ring; never `outline: none`. |
| ARIA | Proper roles (`button`, `dialog`, `tablist`); `aria-current="page"` on active nav; `aria-expanded` on collapsibles; `aria-describedby` on inputs with helper/error. |
| Screen reader | All icons have `aria-label` or `aria-hidden`. Status changes announced via `aria-live`. |
| Contrast | Body text ≥ 4.5:1; large text ≥ 3:1; UI components ≥ 3:1. Audited in both themes. |
| Forms | Labels associated; errors with `role="alert"` or `aria-live`. |
| Motion | Respect `prefers-reduced-motion: reduce` — disable transitions, parallax, marquee. |

---

## 21. Dark mode rules

- Triggered by `data-theme="dark"` on `<html>`.
- Resolution: explicit user preference → `prefers-color-scheme` → light.
- Persistence: `localStorage["schoolos.theme"]`.
- All colors via tokens; never hardcoded.
- Inverted shadow intensity (heavier alpha).
- Logos: provide both light and dark variants; switch via CSS.
- Images: dim 0.9 in dark mode via filter; or provide dark-mode alternatives for hero illustrations.
- Charts: re-theme ApexCharts via options object responding to current theme.

---

## 22. Animation rules

- Default duration: 150ms (micro), 250ms (component), 350ms (page transitions).
- Default easing: `cubic-bezier(0.2, 0, 0.2, 1)` (ease-out for entrances).
- No infinite animations on persistent UI (no spinning logos).
- Hover transitions: color/background only; never width/height.
- Respect `prefers-reduced-motion`.
- Tokens:
  - `--motion-duration-fast: 150ms;`
  - `--motion-duration-base: 250ms;`
  - `--motion-duration-slow: 350ms;`
  - `--motion-ease-out: cubic-bezier(0.2, 0, 0.2, 1);`
  - `--motion-ease-inout: cubic-bezier(0.4, 0, 0.2, 1);`

---

## 23. Naming standards

| Subject | Convention |
|---|---|
| Files | `PascalCase.tsx` for components; `kebab-case.ts` for utilities; `kebab-case.scss` for styles |
| Components | `PascalCase` |
| Props types | `PascalCaseProps` (e.g. `ButtonProps`) |
| Hooks | `useCamelCase` |
| Booleans | `is*`, `has*`, `should*` |
| Event handlers | `handle*` (internal), `on*` (prop) |
| Constants | `SCREAMING_SNAKE_CASE` |
| CSS variables | `--kebab-case` |
| SCSS partials | `_kebab-case.scss` |
| TS interfaces | No `I` prefix |
| Test files | `*.test.ts` (unit), `*.spec.ts` (integration/e2e) |
| Query keys | `[module, action, ...params]` arrays |
| Routes | `kebab-case` segments; `[id]` for dynamic |

---

## 24. Folder structure standards

```
apps/web/src/
  app/
    (auth)/            login, forgot, reset, change-password
    (platform)/        operator portal
    (school)/          school admin portal
    (teacher)/         teacher self-service
    (student)/         student self-service
    (parent)/          parent self-service
    layout.tsx
    globals.scss
  components/
    foundation/        AppHeader, AppSidebar, Avatar, etc.
    form/              IfMatchForm, FieldArrayRow, FileDropzone
    table/             CursorPaginator, ColumnChooser
    feedback/          Toasts, ErrorEnvelopeToast
    rbac/              PermissionGate, FeatureFlagBoundary
    domain/{module}/   module-specific compositions
  lib/
    api/               axios + interceptors
    api/clients/       per-module typed clients
    query/             TanStack Query keys + client
    auth/              token storage, refresh
    rbac/              permission helpers
    config/            env + constants
    ui/                status helpers, formatters
    utils/
  hooks/               useDarkMode, useDebounce, usePermission
  providers/           ThemeProvider, RBACProvider, ToastProvider
  styles/
    _tokens.scss
    _bootstrap-overrides.scss
    _layout.scss
    _components/_*.scss
  types/               backend DTO mirrors
  test/                vitest setup + MSW handlers
public/                logos, favicons
```

Domain components live next to the route module when used only there; promote to `components/domain/` when shared by ≥2 routes.

---

## 25. Component design rules

1. **Composition over configuration.** Prefer `<Card><Card.Header>...</Card.Header></Card>` to a 30-prop monolith.
2. **One responsibility per component.** A component renders one thing well; container components fetch/coordinate.
3. **No business logic in JSX files.** Extract to hooks or `lib/`.
4. **Props are typed.** Every component exports its `Props` type.
5. **Server data via TanStack Query, never via local state.**
6. **Forms via React Hook Form, never via local state.**
7. **No `any`.** Use `unknown` + narrow.
8. **No dangerouslySetInnerHTML** outside the TipTap rich-text renderer.
9. **Lazy-load** heavy children (Chart cards, FullCalendar) via `next/dynamic`.
10. **No window/document access without `typeof window !== "undefined"` guard** OR mark as client component.

---

## 26. React Hook Form standards

- Schema validation: **Zod** via `@hookform/resolvers/zod`.
- One form = one schema; co-located.
- Default values explicit; never undefined for controlled fields.
- Submit handler is async; returns a Promise so the form can disable until settled.
- Error mapping: backend field errors (`{ errors: { field: "message" } }`) merged into form state via `setError`.
- Optimistic concurrency: wrap in `<IfMatchForm>` which:
  - Reads `version` from cached entity.
  - Sends `If-Match: "<version>"` on PATCH.
  - On 412: shows toast, refetches entity, shows diff modal, re-stages user edits.
- File inputs use `Controller` with `react-dropzone`.
- Reset on success unless the form remains visible (in which case refetch + reset to fresh values).

---

## 27. TanStack Query standards

- Query keys are arrays: `['students', schoolId, { cursor, search, sort }]`.
- `staleTime` default 30s; tune up to 5min for slow-changing reference data; 0 for highly mutable.
- `gcTime` default 5min.
- Mutations invalidate related list queries via `queryClient.invalidateQueries({ queryKey: ['students'] })`.
- Optimistic updates only where instant feedback is required; always with rollback on error.
- `useInfiniteQuery` for cursor pagination — `getNextPageParam` reads backend's `nextCursor`.
- Error retries: default 3 with exponential backoff; disabled for 4xx.
- Suspense disabled by default; use boundary-level loading via `useQuery({ ...})` + `<Skeleton>`.
- Per-feature query factories in `lib/query/{module}.ts`.

---

## 28. Axios standards

- One shared instance in `lib/api/axios.ts`.
- Base URL from `NEXT_PUBLIC_API_BASE_URL`.
- Default timeout 30s.

### 28.1 Request interceptors (in order)

1. **Auth:** `Authorization: Bearer <accessToken>` from token store.
2. **Trace:** `X-Trace-Id: <uuid>` generated per request, stored in pending-requests map.
3. **If-Match:** for `PATCH`/`PUT`/`DELETE` with optimistic concurrency, attach from request config `{ ifMatch: <version> }`.
4. **Idempotency-Key:** for `POST` mutations with the `{ idempotent: true }` config flag — UUID per logical operation, persisted in the form's submission cycle so retries reuse.

### 28.2 Response interceptors

1. **401 Unauthorized:** queue request, call `/auth/refresh`, on success replay original; on failure clear tokens + redirect `/login`.
2. **412 Precondition Failed:** reject with a typed `OptimisticConcurrencyError` carrying the current server entity if returned.
3. **403 Forbidden:** standardised error envelope toast + log; do NOT redirect (UI should already be gated).
4. **5xx:** toast with trace id + Sentry breadcrumb.
5. **Standardised error envelope** `{ error: { code, message, traceId, fields? } }` parsed into `ApiError` instance.

### 28.3 Cancellation

- Use Axios `AbortController` via TanStack Query's signal; cancelled requests do not surface as errors.

---

## 29. If-Match UX standards

The optimistic-concurrency conflict is a first-class UX scenario, not an edge case.

| When | UX |
|---|---|
| User opens edit form | Frontend captures entity `version`. |
| User submits | Axios attaches `If-Match: "<version>"`. |
| 412 returned | `<IfMatchForm>` catches; shows toast "Someone else changed this. Review and try again."; opens a diff modal showing user's pending edits vs. current server state. |
| User reviews | They click Apply (overrides with new version) or Discard (resets to server values). |
| User retries | Form re-submits with refreshed `If-Match`. |
| Multiple 412 in a row | After 3 conflicts in 60s, suggest the user contact admin. |

This UX is mandatory on every PATCH form. Lists do not need it; status-change actions do.

---

## 30. Frontend Review Checklist

A PR is not merged unless every box is true:

### Code
- [ ] No `any` in TypeScript.
- [ ] No `jQuery` import.
- [ ] No literal colors or spacings in SCSS — tokens only.
- [ ] No inline styles for theming concerns.
- [ ] All new shared components have a `Props` type exported.
- [ ] Server data via TanStack Query; forms via React Hook Form.

### Data & API
- [ ] Axios interceptor headers (Auth, Trace, If-Match, Idempotency-Key) verified for any new endpoint usage.
- [ ] Cursor pagination, not offset.
- [ ] Mutations invalidate related queries.
- [ ] PATCH forms wrapped in `<IfMatchForm>`.

### Permissions & flags
- [ ] Every gated UI uses `<PermissionGate>` and/or `<FeatureFlagBoundary>`.
- [ ] Sidebar nav items added to RBAC filter.

### Accessibility
- [ ] Keyboard-navigable.
- [ ] `:focus-visible` ring present.
- [ ] Form fields labelled and error-described.
- [ ] Color contrast ≥ AA in both themes.
- [ ] `prefers-reduced-motion` respected.

### Responsive
- [ ] Tested at 375 / 768 / 1280 / 1440 widths.
- [ ] Portal-specific target met (per §19.2).

### States
- [ ] Loading state implemented.
- [ ] Empty state implemented.
- [ ] Error state shows trace id.

### Testing
- [ ] Unit test for component logic.
- [ ] MSW handler added for any new endpoint.
- [ ] Playwright smoke updated if a new critical journey lands.

### Branding
- [ ] No source-theme vendor strings in code, comments, or assets.

This checklist is enforced via CODEOWNERS review.
