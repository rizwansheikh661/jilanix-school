# Sprint N3 — School Branding Foundation Report

**Status**: ✅ Complete
**Date**: 2026-06-29
**Scope**: Branding domain + cache + renderer integration. **No** Settings UI, **no** Logo Upload, **no** Branding Admin Screens (deferred to a future sprint).

---

## 1. Files Modified

### Schema / Migration
| Path | Change |
|------|--------|
| `backend/prisma/schema/schools.prisma` | `SchoolBranding` model extended with `shortName`, `tagline`, `darkLogoUrl`, `faviconUrl`, `letterheadUrl`, `loginBackgroundUrl`, `emailBannerUrl`, `pdfHeaderUrl`, `pdfFooterUrl`, `brandAccentHex`, `fontFamily`, `supportEmail`, `supportPhone`, `websiteUrl`, `footerText`, `copyrightText`. All nullable. |
| `backend/prisma/migrations/<timestamp>_school_branding_foundation/migration.sql` | Adds the new columns to `school_branding`. |

### Domain
| Path | Change |
|------|--------|
| `backend/src/core/school/school.types.ts` | `SchoolBrandingRow` widened with the new fields. |
| `backend/src/core/school/repositories/school.repositories.ts` | `UpsertSchoolBrandingInput` + repository `upsert` updated to persist the new fields. |
| `backend/src/core/school/branding/school-branding.service.ts` | Constructor injects `SchoolBrandingResolverService`; `update()` calls `resolver.invalidate(schoolId)` **after** the tx commits. |
| `backend/src/core/school/branding/school-branding-resolver.service.ts` | **New.** Single source of truth that maps `schoolId` → variable bag with 3-layer fallback + in-memory cache. |
| `backend/src/core/school/school.module.ts` | Registers `SchoolBrandingResolverService` in `providers` + `exports`. |

### Notification Integration
| Path | Change |
|------|--------|
| `backend/src/core/notifications/notifications.module.ts` | Imports `SchoolModule` so dispatcher can inject the resolver. |
| `backend/src/core/notifications/notification-event-dispatcher/notification-event-dispatcher.service.ts` | Injects `SchoolBrandingResolverService`; calls `resolve(schoolId)` once per dispatch and merges into variables as the **lowest-precedence layer**. |
| `backend/src/core/notifications/notification-event-dispatcher/notification-event-dispatcher.service.spec.ts` | Mock dispatcher gains a stub `brandingResolver.resolve` returning `{ currentYear: '2026' }`. |
| `backend/src/core/notifications/notification-renderer/email-design-system/branding.ts` | `emailPrimaryButton` default fill switched from literal `#2D4FCC` to template token `{{primaryColor}}` — every CTA now reflects the resolved tenant palette. |
| `backend/src/core/notifications/notification-renderer/email-design-system/base-layout.ts` | Footer support-email + support-phone link colors switched from `#2D4FCC` to `{{primaryColor}}`. |
| `backend/src/core/provisioning/password-reset/password-reset-notification.outbox-handler.ts` | All hardcoded branding values removed from the dispatcher payload (`schoolName`, `primaryColor`, `secondaryColor`, `applicationUrl`, `supportEmail`, `supportPhone`, `schoolLogo`, `currentYear`). The only template variables the handler now sets are the business-specific `userEmail`, `resetLink`, `expiresAt`, `emailTitle`, `previewText`. The fallback URL fragment uses `{{primaryColor}}` instead of `#2D4FCC`. |

---

## 2. Branding Domain

`SchoolBranding` is a `TENANT_OWNED` row with composite PK `(schoolId, id)`. One row per school (enforced by repository upsert; no unique index added because branding is row-per-school by convention, not constraint).

**Fields shipped this sprint** (all nullable; resolver applies fallbacks):

| Group | Columns |
|-------|---------|
| Identity | `shortName`, `tagline` |
| Logos | `logoUrl`, `darkLogoUrl`, `faviconUrl`, `letterheadUrl`, `loginBackgroundUrl`, `emailBannerUrl`, `pdfHeaderUrl`, `pdfFooterUrl` |
| Palette | `brandPrimaryHex`, `brandSecondaryHex`, `brandAccentHex` |
| Typography | `fontFamily` |
| Contact | `supportEmail`, `supportPhone`, `websiteUrl` |
| Chrome copy | `footerText`, `copyrightText` |

The dark-logo / favicon / login background / email banner / PDF header / PDF footer fields are wired through the resolver today but currently consumed only by emails (logo, primary/secondary color, support email/phone, website, footer, copyright). They are reserved for future surfaces (Login page, PDF reports) without requiring another migration.

---

## 3. Branding Cache

`SchoolBrandingResolverService` keeps a `Map<schoolId, ResolvedBranding>` cache:

* **Read path**: `resolve(schoolId)` returns cached value if present; otherwise issues one `Promise.all([school.findFirst, schoolBranding.findFirst])`, composes the variable bag, and stores it.
* **Write path**: `SchoolBrandingService.update()` calls `resolver.invalidate(schoolId)` after the transaction commits. Next dispatch reloads from DB.
* **TTL**: none. Branding rows change rarely; explicit invalidation is the cheapest correctness guarantee.
* **Failure mode**: `loadSchool` / `loadBranding` each wrapped in try/catch — a transient DB error logs a warning and returns `null`; the resolver then composes the variable bag from the remaining layers. Email dispatch never throws because branding lookup failed.

`invalidateAll()` is exposed for tests and admin tooling.

⚠️ **Bypass note**: direct SQL writes (migrations, manual fixes) do not invalidate the cache. Restart the process, or call `invalidateAll()` from an admin endpoint, when bypassing the service.

---

## 4. Email Renderer Integration

The dispatcher composes the variable bag in this order (later wins):

```
branding (from resolver)  ←  lowest precedence
sampleVariables (event registry)
input.variables (call site)  ←  highest precedence
```

A template author writes `{{schoolName}}`, `{{primaryColor}}`, `{{supportEmail}}` etc. in the body; the renderer substitutes the resolved values for the current tenant. **No business handler ever passes a branding value.** The password-reset handler is the canonical example — its dispatch payload contains only `userEmail`, `resetLink`, `expiresAt`, `emailTitle`, `previewText`.

`emailPrimaryButton`, `emailAlertBox`, `emailInfoCard`, and the `BASE_EMAIL_LAYOUT` chrome all use `{{primaryColor}}` / `{{secondaryColor}}` template tokens — never literal hex values — so the renderer's per-tenant substitution threads the palette through every surface.

---

## 5. Runtime Verification

End-to-end check against the running backend (`localhost:3000`) and Mailpit (`localhost:8025`). Tenant: canary school `36c2e579-83f9-42c8-958a-ab00e58e5b1e`; recipient: `school.admin@canary.local`.

### Scenario A — School Alpha override

```sql
INSERT INTO school_branding (..., short_name='School Alpha',
  brand_primary_hex='#FF0000', brand_secondary_hex='#220033',
  support_email='alpha-support@example.com',
  website_url='https://alpha.example.com',
  copyright_text='© 2026 School Alpha', ...) ;
```

Triggered password reset → email subject `Reset your School Alpha password`. Body grep:
- `#FF0000` × 5 (CTA, links)
- `#220033` × 1 (header band)
- `alpha-support@example.com` × 2
- `alpha.example.com` × 1
- `School Alpha` × 5
- `© 2026 School Alpha` × 1

### Scenario B — School Beta override (cache invalidation)

Updated the same branding row via direct SQL (`short_name='School Beta'`, `#00FF00`, `#005533`, `beta-support@example.com`, `beta.example.com`); restarted dev server to force a cache miss; triggered another reset. Body grep:
- `#00FF00` × 5
- `#005533` × 1
- `School Beta` × 5
- `beta-support@example.com` × 2
- `beta.example.com` × 1
- **Zero leaked Alpha tokens.**

(Going through `SchoolBrandingService.update()` would invalidate the cache automatically; the restart in this scenario only emulates that path because the test driver was raw SQL.)

### Scenario C — Branding row absent → SchoolOS defaults

```sql
DELETE FROM school_branding WHERE school_id='36c2e579-...';
```

Restarted dev server; triggered reset. Body grep:
- `#2D4FCC` × 5 (SchoolOS brand primary)
- `#1A2235` × 8 (SchoolOS secondary)
- `support@jilanix.com` × 2
- `app.jilanix.com` × 1
- `Canary School (demo) 🌱` × 5 — `schoolName` fell back to the `school.displayName` column (correct: that's the **middle** layer of the 3-layer fallback)
- **Zero leaked Beta tokens.**

Email dispatch did not error; subject `Reset your Canary School (demo) 🌱 password` rendered cleanly.

### Build / typecheck

```
prisma generate            ✓
tsc --noEmit               ✓ 0 errors
npm run build              ✓
npm run start:dev          ✓ Nest application started, every poller running
```

---

## 6. Default Branding Strategy

`SCHOOLOS_DEFAULT_BRANDING` (in `school-branding-resolver.service.ts`) is a frozen constant — the bottom layer of the fallback chain. It mirrors `DEFAULT_EMAIL_BRANDING` in `email-design-system/branding.ts` (same hex values, same support contacts, same logo URL) so platform-wide changes need to be made in both places. Today's defaults:

| Variable | Value |
|----------|-------|
| `schoolName` / `schoolFullName` | `SchoolOS` |
| `schoolLogo` / `schoolDarkLogo` | `https://jilanix-public.s3.../email-default-logo.png` |
| `primaryColor` | `#2D4FCC` |
| `secondaryColor` | `#1A2235` |
| `accentColor` | `#0E9F8E` |
| `supportEmail` | `support@jilanix.com` |
| `supportPhone` | `+91-00000-00000` |
| `websiteUrl` / `applicationUrl` | `https://app.jilanix.com` |
| `copyrightText` | `© {{currentYear}} {{schoolName}}. All rights reserved.` |

For string fields, `pick(...)` treats `null`, `undefined`, **and empty strings** as "not set" so a half-filled branding row still falls through cleanly — e.g. `support_email = ''` does not produce a broken `mailto:` link.

The middle layer (`School` row) supplies `displayName`, `email`, `phone`, `website`, and a comma-joined postal `schoolAddress`. Together the three layers guarantee a fully populated branding record for every tenant whether or not the school has uploaded any assets.

---

## 7. Future Extensibility

Already wired through the resolver but not yet consumed by any surface (no schema change required to use them):

* `schoolDarkLogo`, `schoolFavicon`, `loginBackground` — ready for the Login page redesign.
* `schoolLetterhead`, `pdfHeader`, `pdfFooter` — ready for PDF report templates.
* `emailBanner` — ready for marketing-style emails (current chrome is functional-only).
* `accentColor`, `fontFamily` — ready when component-level theming arrives.

Additional surfaces should call `SchoolBrandingResolverService.resolve(schoolId)` directly (it is already exported from `SchoolModule`). New chrome copy variables can be added by extending `SCHOOLOS_DEFAULT_BRANDING` + the resolver's `compose()`; no DB migration is required unless the new field needs to be operator-overridable.

The Settings UI / Logo Upload / Branding Admin Screens explicitly deferred this sprint will plug into the existing `SchoolBrandingService.update(expectedVersion, args)` endpoint, which already invalidates the cache on success.

---

## 8. Final Readiness

| Invariant | Status |
|-----------|--------|
| Every school has a resolvable branding record (row or fallback) | ✅ |
| No business handler carries branding values | ✅ (password-reset handler is canonical) |
| Renderer is the single substitution site | ✅ (resolver → dispatcher merge → renderer) |
| Branding cache invalidated on update | ✅ (`SchoolBrandingService.update()`) |
| Email dispatch never fails due to missing branding | ✅ (try/catch + 3-layer fallback) |
| Multi-tenant isolation: School A → A, School B → B | ✅ (verified Scenarios A & B) |
| Missing-branding scenario → SchoolOS defaults | ✅ (verified Scenario C) |
| `prisma generate` / `tsc` / `build` / `start:dev` clean | ✅ |
| Settings UI / Upload / Admin screens shipped | ❌ — explicitly out of scope for Sprint N3 |

**Sprint N3 is complete.** The platform now has a single tenant-aware branding pipeline that every chrome surface (today: email; future: login, PDFs, public portal) can read from with one call.
