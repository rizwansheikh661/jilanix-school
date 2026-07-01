# Sprint N2 — SchoolOS Email Design System Implementation Report

**Status:** ✅ Complete and verified end-to-end (compile → boot → dispatch → render → SMTP → Mailpit).
**Date:** 2026-06-29
**Scope:** Establish the single email-safe HTML chassis every future transactional email will land in. Refit the Forgot Password template as the reference implementation. No redesign of the Notification Framework, Dispatcher, Job Queue, Transport Layer, or DB template schema.

---

## 1. Files Modified / Added

### Added
| Path | Purpose |
|------|---------|
| `backend/src/core/notifications/notification-renderer/email-design-system/base-layout.ts` | The single HTML chassis. Header band, title strip, content slot (`{{__content__}}`), footer (support + copyright + "Powered by Jilanix ERP"). Table-based, inline styles, system font, `@media` mobile reflow. |
| `backend/src/core/notifications/notification-renderer/email-design-system/branding.ts` | `EMAIL_DESIGN_TOKENS` (hex palette mirrored from `frontend/src/styles/_tokens.scss`), `DEFAULT_EMAIL_BRANDING`, and four reusable HTML fragment helpers: `emailPrimaryButton`, `emailAlertBox`, `emailInfoCard`, `emailSecondaryText`. |
| `backend/src/core/notifications/notification-renderer/email-design-system/index.ts` | Barrel export. |
| `backend/prisma/schema/migrations/20260703000000_notification_message_body_html/migration.sql` | Adds `notification_messages.body_html_rendered TEXT NULL`. Additive only. |
| `docs/EMAIL_DESIGN_SYSTEM_IMPLEMENTATION_REPORT.md` | This report. |

### Modified
| Path | Change |
|------|--------|
| `backend/src/core/notifications/notification-renderer/notification-template-renderer.ts` | `renderTemplateForChannel` now wraps the per-template HTML fragment inside `BASE_EMAIL_LAYOUT` for EMAIL and merges `DEFAULT_EMAIL_BRANDING` into the variable bag. Fragments that are already full documents (`<!doctype`/`<html` prefix) bypass wrapping for backward compatibility. |
| `backend/src/core/provisioning/password-reset/password-reset-notification.outbox-handler.ts` | Subject changed to `'Reset your {{schoolName}} password'`. Plain-text body kept. New HTML fragment composed from design system helpers (`emailSecondaryText` + `emailPrimaryButton` + `emailInfoCard` + 2 × `emailAlertBox`). Dispatcher payload now passes the full branding variable set. |
| `backend/prisma/schema/notifications.prisma` | One new column on `NotificationMessage`: `bodyHtmlRendered String? @map("body_html_rendered") @db.Text`. |
| `backend/src/core/notifications/notification-event-dispatcher/notification-event-dispatcher.service.ts` | Now persists `rendered.bodyHtml` into the new `bodyHtmlRendered` column at message-creation time. |
| `backend/src/core/notifications/notification-dispatcher/notification-send.job-handler.ts` | Sends `sending.bodyHtmlRendered ?? null` to the channel adapter instead of the hard-coded `null` it had before. |

### Unchanged (deliberately)
- `NotificationEventDispatcherService` pipeline structure, transactional outbox, FK relations, audit calls.
- `NotificationSendJobHandler` retry / DLQ / status-machine logic.
- `SesAdapter` and `EmailTransportService` — they already accepted `html`; we just stopped feeding them `null`.
- `NotificationTemplate` and `NotificationTemplateVersion` schemas.
- Job queue + outbox infrastructure.

---

## 2. Design System Architecture

```
┌──────────────────────────────────────────────────────┐
│ email-design-system/                                 │
│   ├── base-layout.ts        BASE_EMAIL_LAYOUT (one)  │
│   │                          + content slot marker   │
│   ├── branding.ts            tokens + defaults +     │
│   │                          fragment helpers        │
│   └── index.ts               barrel                  │
└──────────────────────────────────────────────────────┘
                       │
                       │ imported by
                       ▼
┌──────────────────────────────────────────────────────┐
│ notification-template-renderer.ts                    │
│   wraps per-template fragment into BASE layout       │
│   merges DEFAULT_EMAIL_BRANDING into variables       │
│   runs existing {{key}} substitution + escaping      │
└──────────────────────────────────────────────────────┘
                       │
                       │ called once per dispatch by
                       ▼
┌──────────────────────────────────────────────────────┐
│ NotificationEventDispatcherService                   │
│   writes both bodyRendered (text) and                │
│   bodyHtmlRendered (full HTML doc) to the DB row     │
└──────────────────────────────────────────────────────┘
                       │
                       │ pulled later by
                       ▼
┌──────────────────────────────────────────────────────┐
│ NotificationSendJobHandler → SesAdapter →            │
│   EmailTransportService.send({ text, html })         │
└──────────────────────────────────────────────────────┘
                       │ SMTP :1025
                       ▼
                    Mailpit
```

Two design rules enforced:
1. **The base layout exists exactly once.** Templates store *content fragments only*. The renderer composes them into the layout at render time, so a future change to the chassis updates every template in one place.
2. **Per-channel formatting stays where it was.** `renderTemplateForChannel` keeps the EMAIL-only / strip-HTML-for-other-channels split it already had. The design system slots in *under* that contract — every other channel path is unchanged.

---

## 3. Base Layout

`backend/src/core/notifications/notification-renderer/email-design-system/base-layout.ts`

Structural sections (top → bottom):
| # | Section | Notes |
|---|---------|-------|
| 1 | Wrapper `<table>` on `#F7F8FB` app surface | App bg color matches `_tokens.scss` |
| 2 | Inner 600px container, white surface, 12px radius, soft shadow | Mobile: `width:100%` via `.sos-container` |
| 3 | Header band `bgcolor={{secondaryColor}}` | Logo (40px tall) on left, school name on right |
| 4 | Title strip — `{{emailTitle}}` H1, 28px, weight 700, `letter-spacing:-0.2px` | Drops to 22px on ≤600 via `.sos-h1` |
| 5 | Content slot — `{{__content__}}` is replaced by the per-template fragment **before** variable substitution | Padding 32px, mobile 20px via `.sos-px-32` |
| 6 | Footer — support email + phone, copyright with `{{schoolName}}` and `{{currentYear}}`, "Powered by [Jilanix ERP](https://jilanix.com)" | Social-link placeholder kept for future wiring |
| 7 | Below-card hairline: "This is an automated message" disclaimer | Plain-text reassurance, matches SaaS norms |

Email-safe choices (all the cross-client gotchas):
- **`<table>` for every layout cell**, not `<div>`. Outlook 2007–2019 silently breaks `<div>` layout.
- **Inline styles only.** Gmail strips most `<style>` blocks; the only `<style>` included is the `@media (max-width: 600px)` block (Gmail keeps these, others ignore harmlessly).
- **System font stack** — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. No web fonts, no `font-display`.
- **Hex colors only.** No `oklch()`, no CSS variables (Outlook rejects both — directly visible in the frontend `_tokens.scss` source, but lifted to hex literals for email).
- **Bulletproof anchor-as-button** via `<table>` + `<a>` with explicit `padding` and `background-color`. Renders consistently from Outlook 2016+ to Gmail to iOS Mail without VML fallbacks.
- **Limited radius palette** (4 / 8 / 12 px) — anything else renders inconsistently across clients.
- **Light-only color-scheme meta tags** so Gmail dark-mode doesn't invert brand colors.

---

## 4. Branding Strategy

`email-design-system/branding.ts` exports two related artifacts.

**`EMAIL_DESIGN_TOKENS`** — a hex-literal mirror of the frontend tokens at `frontend/src/styles/_tokens.scss`. Every value used by the chassis (brand, accent, semantic alerts, surfaces, text, borders, radii) is listed in one block so a brand refresh is a single-file diff. Email clients can't read CSS variables, so the layout file uses literal hex; this module is the source of truth for "what hex matches what semantic role".

**`DEFAULT_EMAIL_BRANDING`** — fallback values that the renderer merges *underneath* the caller's variables. When a brand-new school dispatches its first email before an operator has wired branding, the email still renders with sensible defaults (SchoolOS wordmark, brand blue `#2D4FCC`, `support@jilanix.com`, etc.) instead of leaving `{{schoolName}}` literals in the inbox.

Override flow (later wins):
```
DEFAULT_EMAIL_BRANDING  <  definition.sampleVariables  <  input.variables
```

Per-school branding can be wired in later by changing `input.variables` only — no renderer changes, no template changes. A `TODO(branding)` marker in `password-reset-notification.outbox-handler.ts` flags where that swap belongs once the `SchoolBranding` catalog ships.

---

## 5. Dynamic Variables

Every variable supported by the chassis is one of two kinds:

### Branding variables (resolved per tenant)
| Variable | Used by | Default |
|----------|---------|---------|
| `{{schoolLogo}}` | Header band img src | jilanix-public S3 placeholder PNG |
| `{{schoolName}}` | Header right + footer + copyright + img alt | `SchoolOS` |
| `{{primaryColor}}` | Reserved for primary CTAs / link accents | `#2D4FCC` |
| `{{secondaryColor}}` | Header band background | `#1A2235` |
| `{{supportEmail}}` | Footer mailto: | `support@jilanix.com` |
| `{{supportPhone}}` | Footer tel: | `+91-00000-00000` |
| `{{applicationUrl}}` | Header logo link | `https://app.jilanix.com` |
| `{{currentYear}}` | Footer © | (caller injects) |
| `{{previewText}}` | Preheader hidden in inbox preview pane | `''` |
| `{{emailTitle}}` | `<title>` + title strip | (caller injects) |

### Business variables (resolved per event)
Documented for use by future templates, none implemented here except the password-reset set:

```
Auth/onboarding: userName, userEmail, loginUrl, temporaryPassword,
                  resetUrl / resetLink, otp, expiresAt
Billing:         subscriptionName, invoiceNumber, dueDate, totalAmount,
                  paymentLink
Academic:        studentName, className, attendanceDate, feeAmount,
                  examName, marksObtained
Communication:   circularTitle, announcementTitle, holidayName,
                  eventDate
```

All variables flow through the same regex (`/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g`). HTML-escaping is applied automatically to substitutions made inside `bodyHtml`. Unknown variables are left as their literal `{{key}}` form so operators can spot the gap in the persisted message — no silent loss.

---

## 6. Forgot Password Template (reference implementation)

The only business template materialized in this sprint. Defined entirely as a **content fragment** in `password-reset-notification.outbox-handler.ts`:

```
emailSecondaryText("We received a request to reset the password for {{userEmail}}...")
emailPrimaryButton({ href: '{{resetLink}}', label: 'Reset Password' })
emailInfoCard({ bodyHtml: 'Button not working? Paste this URL... {{resetLink}}' })
emailAlertBox({ tone: 'warning', title: 'This link expires soon', bodyHtml: '...{{expiresAt}}' })
emailAlertBox({ tone: 'info',    title: 'Security notice',     bodyHtml: 'If you didn't request...' })
```

The renderer composes this fragment into the base layout, escapes the user-supplied variables, and produces a 7.8 KB HTML document. Total operator-authored markup in the template: ~25 lines, none of which repeat any layout chrome.

The `ensureTemplate(...)` upsert in the same file auto-provisions a `NotificationTemplate` + version row the first time a tenant requests a reset, so operators never need to seed the template manually. Subsequent dispatches reuse the row. Auditors can replace the body via normal template CRUD; the auto-provision branch only runs when no active template exists.

---

## 7. Mailpit Verification

End-to-end on the live dev stack (Mailpit on `:1025` SMTP / `:8025` UI+API):

1. Cleared the existing canary template row + dependent `notification_message_events` + `notification_messages` + `notification_template_versions` rows (FK-respecting order).
2. Cleared Mailpit inbox.
3. Restarted Nest with `npm run start:dev` — clean boot, zero errors.
4. `POST /api/v1/auth/password-reset/request` with `{schoolId, email}` → `200 {data:{accepted:true}}` (requestId `01KW9XK3SA6GCPBE81RKMM7C8S`).
5. Mailpit picked up 1 message, subject `"Reset your SchoolOS password"`, size 9596 bytes.
6. Markers in the delivered HTML:
   ```
   HasHTML: true, length: 7825
   HasText: true, length: 336
     <!doctype             : YES
     sos-container         : YES
     #2D4FCC               : YES
     Reset Password        : YES
     Powered by            : YES
     Jilanix               : YES
     reset-password?token= : YES
     border-radius         : YES
     mso-hide              : YES
     Security notice       : YES
     expires soon          : YES
   ```

All chassis sections, brand color, CTA, footer attribution, and per-template content fragment are present. The reset link is fully URL-encoded and lands on `{{baseUrl}}/reset-password?token=...`.

---

## 8. Future Template Reuse

To add a new transactional email (e.g., Welcome School, Invoice, Fee Reminder, Holiday Notice), three things change — and only three:

1. **A new outbox/event handler** subscribes to the relevant domain event.
2. **A content fragment** is composed inside that handler using the existing helpers (`emailSecondaryText`, `emailPrimaryButton`, `emailAlertBox`, `emailInfoCard`). No layout HTML.
3. **A dispatcher call** with the variable bag (business vars + any non-default branding).

Nothing in `base-layout.ts`, `branding.ts`, the renderer, the dispatcher, the send-job handler, or the SES adapter needs to change. The next 15+ transactional templates the brief lists (Welcome Admin/Teacher/Parent/Student, Password Changed, Subscription Activated/Renewed, Invoice, Fee Reminder, Attendance, Circular, Holiday, Announcement, Exam Result) all reuse this same path.

A first-draft helper to consider once the second template lands: extract the "ensure-template-row" upsert pattern from `password-reset-notification.outbox-handler.ts` into a shared helper, so each future handler doesn't repeat it. Deferred — premature until we have a second handler to abstract from.

---

## 9. Remaining Work (out of scope this sprint)

- **Per-school branding catalog.** The `TODO(branding)` marker in the password-reset handler is the integration point. Once `SchoolBranding` ships, replace the hard-coded `schoolName / schoolLogo / supportEmail / supportPhone / applicationUrl` with a lookup. Renderer signature does not change.
- **Localization.** All copy is English-only. Renderer already supports per-variable substitution; per-school locale would feed a different template version. No engine work needed.
- **15+ business templates** listed in the sprint brief (Welcome School/Admin/Teacher/Parent/Student, Password Changed, Subscription Activated/Renewed, Invoice, Fee Reminder, Attendance, Circular, Holiday, Announcement, Exam Result) — explicitly deferred per scope.
- **Visual regression tests.** Litmus / Email-on-Acid screenshot diffs would catch chassis drift. Worth wiring once the second template ships.
- **Live attachment (logo CDN).** Currently using the jilanix-public S3 placeholder; production should host per-school logos.

---

## 10. Final Readiness

| Gate | Status |
|------|--------|
| `npx tsc --noEmit` | ✅ Passes (3 pre-existing test type errors unrelated to this sprint, present before any change) |
| `npm run build` | ✅ Passes (Nest build clean) |
| `npm run start:dev` | ✅ Boots, zero errors, picks up bootstrap handler |
| Migration `20260703000000_notification_message_body_html` | ✅ Applied, column present in MySQL |
| End-to-end SMTP via Mailpit | ✅ Forgot Password email delivered with full HTML (7825 bytes), all chassis markers present, plain-text fallback intact |
| Backward compatibility | ✅ Existing seeded templates that ship a full `<!doctype>`/`<html>` document bypass wrapping; non-EMAIL channels unaffected |

**Sprint N2 is complete.** The SchoolOS Email Design System is live and serving the Forgot Password flow with the full branded chassis. Every future transactional email reuses the same single layout; per-template work is reduced to a content fragment.
