# Jilanix Design System v1 — Authentication Surface

**Status**: LOCKED for the auth surface. Downstream (dashboard, operator
tools) will extend these tokens; they will not be renamed.

This document describes the frozen visual language of the Jilanix
Operator Console authentication experience. Every value below is
persisted as a CSS custom property in
`frontend/src/styles/_tokens.scss` and consumed by the SCSS module
`frontend/src/styles/_theme-jilanix-auth.scss`. Do not introduce
literal hex codes or fixed px values in components — reach for a
token.

---

## 1. Color

### 1.1 Brand primitives (deep-purple identity)

Used only on branding surfaces (auth-left panel, hero bands, marketing
strips). Never on transactional surfaces (forms, tables).

| Token | Value | Purpose |
|-------|-------|---------|
| `--jlx-bg-primary`     | `#1A1533` | Deep purple, gradient start |
| `--jlx-bg-secondary`   | `#2D1E5A` | Deep purple, gradient end |
| `--jlx-bg-gradient`    | `linear-gradient(140deg, #1A1533 0%, #2D1E5A 100%)` | Composite gradient |
| `--jlx-accent`         | `#6B46C1` | Same as `--brand-primary` |
| `--jlx-accent-hover`   | `#5B3FEF` | Same as `--brand-primary-hover` |
| `--jlx-highlight`      | `#F7B94D` | Gold — accent on brand surfaces |
| `--jlx-on-brand`       | `#FFFFFF` | Primary text on brand |
| `--jlx-on-brand-muted` | `rgba(255,255,255,0.72)` | Secondary text on brand |
| `--jlx-on-brand-faint` | `rgba(255,255,255,0.55)` | Tertiary text on brand |
| `--jlx-brand-border`   | `rgba(255,255,255,0.14)` | Feature-card border on brand |
| `--jlx-brand-card-bg`  | `rgba(255,255,255,0.06)` | Feature-card fill on brand |

### 1.2 Application palette (transactional surfaces)

| Token | Value |
|-------|-------|
| `--brand-primary`         | `#6B46C1` |
| `--brand-primary-hover`   | `#5B3FEF` |
| `--brand-primary-active`  | `#4C33A8` |
| `--brand-primary-subtle`  | `#F2ECFB` |
| `--brand-primary-border`  | `#D5C6F0` |
| `--accent-secondary`      | `#F7B94D` (gold highlight) |
| `--accent-secondary-subtle` | `#FDF3DF` |

### 1.3 Semantic

| Role | Token | Value |
|------|-------|-------|
| Success | `--color-success` / `--color-success-subtle` | `#22C55E` / `#E7F8ED` |
| Warning | `--color-warning` / `--color-warning-subtle` | `#F59E0B` / `#FDF1DA` |
| Danger  | `--color-danger`  / `--color-danger-subtle`  | `#EF4444` / `#FDE7E7` |
| Info    | `--color-info`    / `--color-info-subtle`    | `#3B82F6` / `#E5EFFE` |

### 1.4 Surface & text (light theme)

| Token | Value |
|-------|-------|
| `--bg-app`        | `#F8F9FC` |
| `--surface-card`  | `#FFFFFF` |
| `--surface-muted` | `#F3F4F9` |
| `--text-primary`  | `#1B2330` |
| `--text-secondary`| `#667085` |
| `--text-muted`    | `#98A2B3` |
| `--border-default`| `#E8EAF2` |
| `--border-input`  | `#D8DBE6` |
| `--border-strong` | `#CBD0DA` |
| `--border-subtle` | `#EEF0F4` |

### 1.5 Dark theme (auto via `data-theme='dark'`)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-app`        | `#F8F9FC` | `#0F0B1F` |
| `--surface-card`  | `#FFFFFF` | `#171130` |
| `--surface-muted` | `#F3F4F9` | `#1D1740` |
| `--text-primary`  | `#1B2330` | `#F4F1FA` |
| `--text-secondary`| `#667085` | `#B7B0CE` |
| `--border-default`| `#E8EAF2` | `#2A2350` |

The **branding panel itself intentionally stays deep-purple in both
themes** — Jilanix identity, not a surface. The card + inputs on the
right column swap.

---

## 2. Typography

- **Family**: Inter (loaded via `<link rel="stylesheet" href="https://rsms.me/inter/inter.css">` in `app/layout.tsx`). System stack fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`.
- **Wordmark**: 3px letter-spacing, uppercase, `font-weight: 700` for "JILANIX"; 10px `font-weight: 600` uppercase with 2.4px letter-spacing for "OPERATOR CONSOLE".
- **Card title**: 26 px (mobile: 22 px), `font-weight: 700`, `line-height: 1.2`.
- **Card subtitle**: 14 px, `--text-secondary`, `line-height: 1.55`.
- **Field label**: 13 px, `font-weight: 500`, `--text-primary`.
- **Field input**: 14 px, `--text-primary`, height 48 px.
- **Field error**: 12 px, `--color-danger`.
- **Button label**: 15 px, `font-weight: 600`, `line-height: 1`.
- **Footer**: 12 px, `--text-muted`.

Full scale in `_tokens.scss` (`--text-h1`..`--text-h6`, `--text-lead`,
`--text-body`, `--text-small`, `--text-xs`, `--text-2xs`).

---

## 3. Spacing (4-pt grid)

`--space-0` … `--space-10` = `0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128`.

Rules for the auth surface:
- Card padding: `clamp(28px, 3vw, 40px)`.
- Card inner gap: `24px`.
- Form control gap: `16px`.
- Header row spacing (title / subtitle / brand) 6 px between.

---

## 4. Radius

| Token | Value | Used for |
|-------|-------|----------|
| `--radius-sm`   | 4 px  | Inline chips, hint boxes |
| `--radius-md`   | 8 px  | Inputs, buttons |
| `--radius-lg`   | 12 px | Media / cards |
| `--radius-xl`   | 16 px | Elevated cards |
| `--radius-2xl`  | 20 px | Auth card |
| `--radius-pill` | 999px | Theme toggle, chips |

---

## 5. Shadows

| Token | Value |
|-------|-------|
| `--shadow-sm`         | slight |
| `--shadow-md`         | control resting elevation |
| `--shadow-lg`         | popover/menu |
| `--shadow-overlay`    | modal |
| `--shadow-auth-card`  | `0 24px 48px -12px rgba(26,21,51,0.16)` — the signature auth card lift |

Primary button additionally carries an inline shadow
`0 12px 24px -12px rgba(107,70,193,0.55)` for the tinted lift.

---

## 6. Motion

| Token | Value |
|-------|-------|
| `--motion-duration-fast`  | 120 ms |
| `--motion-duration-base`  | 200 ms |
| `--motion-duration-slow`  | 320 ms |
| `--motion-ease-out`       | `cubic-bezier(0.2, 0, 0.2, 1)` |
| `--motion-ease-in`        | `cubic-bezier(0.4, 0, 1, 1)` |
| `--motion-ease-in-out`    | `cubic-bezier(0.4, 0, 0.2, 1)` |

Primary button `hover` translates the label arrow +3 px on the X axis
using `--motion-duration-fast` — the signature interaction of the
approved design.

---

## 7. Focus

`--focus-ring: 0 0 0 3px rgba(107, 70, 193, 0.30);` applied on every
interactive element via `:focus-visible`.
`--focus-ring-danger` for invalid inputs.

---

## 8. Layout tokens

| Token | Value |
|-------|-------|
| `--auth-branding-width` | `40%` (stacks < 992 px) |
| `--auth-card-width`     | `60%` |
| `--auth-card-max`       | `480 px` |

---

## 9. Components

### 9.1 `AuthLayout`
Two-column shell. Renders `<BrandingPanel />` on the left, and on the
right a header row (theme toggle), body slot, and footer copyright.
Below `lg` stacks vertically.

### 9.2 `BrandingPanel`
Left ~40% column. Composition (top → bottom, LOCKED to mockup):

1. **Hero mark, centered horizontally.** `logo-light.png` at 112 px,
   below it "JILANIX" wordmark at 44 px with 8 px letter-spacing,
   below it "OPERATOR CONSOLE" tag at 11 px flanked by 26 px gold
   rules on either side.
2. **Headline** — "Powering Schools." on line 1, "Enriching Futures."
   on line 2, with *Futures.* in warm gold.
3. **Lede paragraph** — "Jilanix Operator Console helps you manage
   hundreds of schools, subscriptions, and platform operations
   seamlessly."
4. **Four-column horizontal feature strip** — Enterprise Security,
   Role Based Access, Always Available, 24/7 Support. Each column
   has a 44 px translucent-purple circular icon (gold glyph, gold
   border), a bold 12 px title, and a 10.5 px sub in `--jlx-on-brand-faint`.

Background: `/assets/branding/auth-school-building.png` fills the
panel bottom-center. Overlay is a top-heavy vertical gradient — deep
purple `rgba(26,21,51,0.88)` at 0 %, decaying through 55 % at 34 %
and 18 % at 60 % — so the sunset sky, Indian flag, and school
building remain clearly visible in the lower two-thirds of the panel.

A single decorative dot pattern lives in the top-left corner.

### 9.3 `AuthCard`
Container for every form. Props: `title`, optional `subtitle`,
optional `footer`, `showBrand=true`.
LOCKED chrome: 96 px centered dark logo → centered title
(clamp 28–34 px, `-0.4 px` letter-spacing) → centered subtitle → form
slot → centered footer link. Card radius `--radius-2xl` (20 px),
padding `clamp(32px, 4vw, 44px)`, elevation `--shadow-auth-card`.

### 9.4 `AuthButton`
Variants: `primary` (default), `ghost`.
Props: `block=true`, `loading`, `showArrow=true`.
Primary is a **linear-gradient** from `--brand-primary` to
`--jlx-bg-primary` (deep-plum) at 135°, 52 px tall, with an inline
shadow `0 14px 26px -14px rgba(45, 30, 90, 0.6)`. Right-arrow glyph
travels +4 px on hover; the card also lifts 1 px. `loading` swaps
the arrow for `<Spinner size="sm" />` and disables the button.

### 9.5 `AuthInput`
Label (13 px, semibold) + optional leading icon + input + inline
error. Input is 52 px tall with `--radius-md`.

### 9.6 `PasswordInput`
Same chrome as `AuthInput` plus a trailing eye/eye-off toggle that
flips the input `type`. Default leading icon is a lock.

### 9.7 `ThemeToggle`
Dual-icon pill in the top-right of the panel. Both sun and moon are
always visible. Currently-active mode is highlighted by a filled
deep-plum circle around the icon (gold glyph). Clicking the inactive
half jumps straight to that mode via `setMode('light' | 'dark')`
(no cycle-through-system in the LOCKED design).

### 9.8 `AuthSkeleton`
Loading placeholder mirroring an `AuthCard` (title / subtitle / two
fields / cta) with pulsing `.jlx-skeleton` bars. Used as the
`<Suspense>` fallback for the login + reset-password routes.

---

## 10. Class prefix contract

Every class introduced by the Jilanix auth surface is prefixed
`jlx-*`. Bootstrap utilities are still available but should not be
reached for in new components — they will not survive the operator
console refresh in later sprints.

---

## 11. Accessibility

- Every interactive element has a visible `:focus-visible` ring.
- All inputs render a `<label htmlFor>` + `aria-invalid` + `aria-describedby` pair.
- Error paragraphs use `role="alert"` so screen readers announce them.
- The password reveal button carries `aria-label` and `aria-pressed`.
- The theme toggle carries a descriptive `aria-label` + `title` reflecting the *next* mode.
- Colour contrast: primary text 14.5:1 on `--surface-card`; secondary text 5.2:1; primary button label 5.9:1 on `--brand-primary`.

---

## 12. Do-not list

- **No literal hex codes in components.** Use a token.
- **No arbitrary spacing values** (e.g. `padding: 13px`). Use the 4-pt scale.
- **No inline styles** for auth surface. If a value is missing, add a token.
- **No new class prefix.** Use `jlx-*` for auth chrome.
- **No `next/image` remote URLs**. All auth imagery lives under `public/assets/branding/`.

---

## 13. Link accents (LOCKED)

- **Gold** (`--jlx-highlight`, class `.jlx-link-accent`) — used for
  the *actionable, on-brand* links that live inside a form's chrome:
  "Forgot password?", "Contact your administrator",
  "Return to Login", "Sign out". This is the ONLY link colour that
  appears on top of the light card in the approved mockup.
- **Purple** (`--brand-primary`, class `.jlx-link-primary`) — reserved
  for links embedded in flowing body copy (help pages, empty states).
  Not used on the four auth forms today.
