# UI_UX_GUIDELINES

**Stack frozen 2026-06-25. Future changes require a new ADR.**

The visual and interaction language of SchoolOS. This document is what every designer and frontend engineer reads before building screens. The goal: a Stripe/Linear-grade SaaS feel, opinionated about school workflows, and usable on a Tier-3 city's mid-range Android.

---

## 1. Design principles

1. **Calm, not loud.** Whitespace, restraint, no carnival of colors. Schools have enough chaos.
2. **Information density that respects the task.** Roster screens are dense; landing dashboards are spacious.
3. **Mobile parity.** If it doesn't work at 360px wide, it's not done.
4. **One primary action per screen.** Secondary actions are restrained.
5. **Predictability beats cleverness.** Same action lives in the same place across modules.
6. **Read at a glance, write with confidence.** Status colors are unambiguous; destructive actions ask twice.
7. **India-first defaults.** INR symbol, lakh formatting, DD-MM-YYYY display, IST.
8. **Accessibility is a feature.** WCAG 2.1 AA from day one.

---

## 2. Tech stack

- **Next.js (latest stable available when frontend development begins)** (App Router) with React Server Components where they help, Client Components where they're needed
- **React**
- **TypeScript** strict
- **Bootstrap 5.3.8** for the CSS framework and grid (pinned exact version)
- **React-Bootstrap** for primitives (Button, Modal, Offcanvas, Form, Dropdown, etc.) — extended with our tokens
- **Axios** as the HTTP client (interceptor-driven for auth refresh and tenant headers)
- **React Hook Form** for all form state
- **TanStack Query** for server state
- **Lucide Icons** as the single icon library
- **Recharts** for charts
- Auth: a custom React hook hits the backend's `/api/v1/auth/...` endpoints; refresh token lives in an `httpOnly` cookie. **NextAuth / Auth.js is not used.**

---

## 3. Design tokens

Tokens live in `frontend/src/styles/tokens.ts` and are emitted as Bootstrap 5.3.8 SCSS variable overrides plus CSS variables; never hard-coded in components.

### 3.1 Color (semantic)

Themed via CSS variables, two themes (light, dark):

| Token              | Light                  | Dark                   | Use                                    |
| ------------------ | ---------------------- | ---------------------- | -------------------------------------- |
| `bg`               | white                  | near-black             | App background                         |
| `surface`          | gray-50                | gray-900               | Card / panel surfaces                  |
| `surface-raised`   | white                  | gray-800               | Modals, popovers                       |
| `border`           | gray-200               | gray-800               | Default borders                        |
| `text`             | gray-900               | gray-100               | Primary text                           |
| `text-muted`       | gray-500               | gray-400               | Secondary text                         |
| `primary`          | indigo-600             | indigo-400             | Brand actions                          |
| `primary-fg`       | white                  | gray-950               | Foreground on primary                  |
| `accent`           | violet-500             | violet-400             | Highlights                             |
| `success`          | emerald-600            | emerald-400            | Paid, present, healthy                 |
| `warning`          | amber-500              | amber-400              | Due-soon, at-risk                      |
| `danger`           | rose-600               | rose-400               | Overdue, absent, error                 |
| `info`             | sky-600                | sky-400                | Neutral notices                        |

Brand color (`primary`) stays subtle; we earn delight from typography and motion, not saturated chrome.

### 3.2 Typography

- Font: Inter (variable). Fallback: system-ui.
- Numerals: tabular for tables and money (`font-feature-settings: 'tnum'`).
- Scale (rem):

| Token       | Size | Use              |
| ----------- | ---- | ---------------- |
| `text-xs`   | 0.75 | Captions         |
| `text-sm`   | 0.875| Body in dense    |
| `text-base` | 1.00 | Default body     |
| `text-lg`   | 1.125| Subhead          |
| `text-xl`   | 1.25 | Section heading  |
| `text-2xl`  | 1.5  | Page heading     |
| `text-3xl`  | 1.875| Hero on dashboard|

- Line-height: 1.5 for body; 1.2 for headings.
- Indian number format helper (`formatINR(amount)`) → `₹ 1,23,456.00`.

### 3.3 Spacing
- 4px base unit. The Bootstrap 5.3.8 spacer scale is overridden to match (`$spacer: 0.25rem` step, so `m-1` = 4px, `m-2` = 8px, etc.).
- Section spacing: 24–32px between sibling cards on desktop, 16–20px on mobile.

### 3.4 Radius
- `rounded-md` (6px) for inputs/buttons.
- `rounded-lg` (8px) for cards.
- `rounded-xl` (12px) for marketing/empty-state illustrations only.

### 3.5 Elevation
- Subtle, not Material-style heavy shadows.
- One shadow for raised surfaces (`shadow-sm`), one for popovers (`shadow-md`). No more.

### 3.6 Motion
- 150ms easing for hover/focus.
- 200–250ms for component transitions (dialogs, sheets).
- Respect `prefers-reduced-motion`.
- No bouncy springs.

---

## 4. Layout system

### 4.1 App shell
- **Top bar:** logo, school switcher (for parents/multi-school staff), tenant name, search, notifications, profile.
- **Left sidebar:** primary nav, role-aware. Collapsible on desktop, drawer on mobile.
- **Content area:** breadcrumbs, page title, primary action button (top-right), filter strip, content cards/tables.

### 4.2 Navigation IA (school-side)

```
Dashboard
Students
  ├─ Students
  ├─ Admissions
  ├─ Promotions
  └─ Transfer Certificates
Parents
Staff
  ├─ Teachers
  ├─ Other Staff
  └─ Leave
Academics
  ├─ Classes & Sections
  ├─ Subjects
  ├─ Timetable
  └─ Calendar
Attendance
Examinations
  ├─ Exams
  ├─ Marks Entry
  └─ Report Cards
Fees
  ├─ Structures
  ├─ Invoices
  ├─ Receipts
  └─ Reports
Communication
  ├─ Notices
  ├─ Messages
  └─ Templates
Library
Transport
Hostel
Inventory
Visitor
Medical
Reports
Settings
  ├─ School Profile
  ├─ Branches
  ├─ Roles & Users
  ├─ Notifications
  ├─ Billing
  └─ Feature Flags (read-only)
```

Modules disabled by feature flag are removed from the sidebar (not greyed-out clutter).

### 4.3 Parent portal IA
- Today (overview)
- My Children (one tab per child if multiple)
- Fees
- Notices & Messages
- Leave Applications
- Settings

### 4.4 Operator console IA
- See SUPER_ADMIN_ARCHITECTURE.md §2.1.

---

## 5. Core component patterns

### 5.1 Page header
- Breadcrumb
- H1 (`text-2xl`, bold)
- Optional subtitle (`text-muted`)
- Right-aligned: primary action button + secondary actions in a kebab menu

### 5.2 Empty states
- Friendly illustration (line-style)
- One-sentence explanation of what this screen will hold
- Primary CTA to create the first record
- Secondary link to docs/help
- Never a blank table.

### 5.3 Tables
- Tabular numerals for numeric columns.
- Sticky header on scroll.
- Bulk-select for moderate-row tables (≤500); pagination beyond.
- Inline filter chips above the table.
- Row hover lifts background by one shade; no full row borders.
- Mobile: tables become cards stacked vertically; the most-important 3 fields surface, the rest fold under "Show more."

### 5.4 Forms
- Inline validation on blur; submit-time recheck.
- Error messages below field, in `danger` color, never alert-popup-style.
- Required fields marked with a discreet asterisk; optional fields say "(optional)".
- Labels above fields (not inside placeholders).
- Submit buttons disabled while pristine; spinner on submit.

### 5.5 Buttons
- **Primary:** filled `primary`. Used once per page region.
- **Secondary:** outline.
- **Tertiary / link:** text only.
- **Destructive:** filled `danger`, with confirmation dialog.
- Sizes: sm (32px), md (40px default), lg (48px for hero CTAs only).
- Touch target ≥ 44×44px on touch devices regardless of visual size.

### 5.6 Status badges
- Pill shape, surface-tinted backgrounds (low-saturation), token-driven.
- States: `paid` (success), `due` (warning), `overdue` (danger), `pending` (info), `draft` (muted), `cancelled` (muted).

### 5.7 Dialogs vs. sheets vs. drawers
- **Dialog (modal):** confirmations, short forms (≤6 fields).
- **Sheet (right):** create/edit forms, detail views; lets users keep page context.
- **Drawer (left):** primary nav on mobile.
- **Inline expand:** for ultra-light edits (toggling a flag).

### 5.8 Toasts
- Top-right.
- Auto-dismiss success in 3s.
- Errors stay until dismissed.
- Never use a toast for a critical destructive confirmation.

---

## 6. Dashboard patterns

The school dashboard is the most-seen screen. It must:

- Open in < 2s on a mid-range 4G phone.
- Show 4–6 KPI cards (today's attendance %, this month's fee collection %, pending complaints, staff attendance, total receivables, defaulter count).
- Show 1 trend chart (last 30 days fee collection or attendance).
- Show 2 activity widgets (latest notices, latest payments).
- Show 1 "needs attention" widget (defaulters, pending approvals).
- Be **role-aware**: principal sees everything, accountant sees money, teacher sees their classes.

KPI cards are uniform: label, big number, subtle trend delta vs. last period, click-through to drilldown.

---

## 7. Data-entry-heavy screens

For attendance, marks entry, fee structure builder:

- Keyboard navigation (Tab, Arrow keys).
- Auto-save with optimistic UI; banner shows save status.
- "Mark all present" / bulk actions visible from row 1.
- Undo within 10s of action.
- Mobile: large touch targets, swipe gestures (swipe right = present, left = absent).

---

## 8. Notifications UX

- Bell icon in top bar with unread count.
- Dropdown shows last 10 grouped (system, billing, school events).
- Click a notification → deep link to its source page.
- Per-channel preferences in profile (parents care most).

---

## 9. Search

- ⌘K / Ctrl+K opens command palette.
- Tenant-scoped: students, parents, staff, fees, classes, notices.
- Keyboard navigable; recent items at top.

---

## 10. Dark mode

- Toggle in profile + system preference detection.
- Same information density; chart colors adjusted for contrast.
- All token-driven; no manual dark-mode class overrides on shared components — themes switch via the data-theme attribute on the root and Bootstrap 5.3.8 SCSS variable indirection.

---

## 11. Responsive breakpoints

| Breakpoint | Width   | Layout                                          |
| ---------- | ------- | ----------------------------------------------- |
| `sm`       | 640px   | One-column; sidebar becomes drawer              |
| `md`       | 768px   | Two-column where it fits                        |
| `lg`       | 1024px  | Full app shell with persistent sidebar          |
| `xl`       | 1280px  | Default desktop                                 |
| `2xl`      | 1536px  | Wide desktops; cap content width at ~1400px     |

Phones are first-class — design *every* screen at 360 px and grow up.

---

## 12. Localization

- Every visible string passes through i18n (`t('students.title')`).
- English (`en-IN`) and Hindi (`hi-IN`) v1; Tamil/Telugu/Kannada/Marathi v2.
- Pluralization (ICU MessageFormat) used; never string concatenation.
- RTL support deferred (no v1 RTL languages).

---

## 13. Accessibility

- Semantic HTML; landmark roles.
- Focus-visible outlines; never `outline: none`.
- 4.5:1 contrast for body text.
- Form fields associated with `<label>`; errors via `aria-describedby`.
- Skip-to-content link.
- All interactive elements keyboard-reachable; trap focus inside dialogs.
- Tested with NVDA / VoiceOver on representative screens before each release.

---

## 14. Performance budgets

- Initial JS bundle: < 200 KB gzipped per route.
- Critical CSS inlined; rest deferred.
- Images: AVIF/WebP, lazy-loaded, sized.
- Avoid client-side heavy charts on initial paint — render server-side or skeleton-load.
- Lighthouse mobile score ≥ 90 for dashboard.

---

## 15. Brand expression

- The product personality is "competent, calm, modern — not playful."
- Illustrations: line-style, single-tone, never cartoonish.
- Iconography: 1.5px stroke, rounded joins, consistent grid.
- No stock photos in the product UI.
- Marketing site can be more expressive; product app stays restrained.

---

## 16. Anti-patterns

- ❌ Filling a screen with cards just to "look full." Empty space is OK.
- ❌ More than one primary button per screen region.
- ❌ Modals stacked on modals.
- ❌ Hover-only affordances (breaks on touch).
- ❌ Left-sidebar nav with > 3 levels of nesting.
- ❌ Non-tabular numerals on money columns.
- ❌ Translating brand names ("School Operating System" stays English).
- ❌ Shipping a feature without a corresponding empty state and error state.
