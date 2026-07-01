# Authentication Patch — Implementation Plan (V1)

**Document type:** implementation contract (planning only). No code, DTO, migration, controller, service, or test changes are produced from this document.

**Revision history:**
- **Rev 1** — initial nine-wave plan (replaced).
- **Rev 2** — reduced to V1 scope; five waves; deferred MFA / WebAuthn / JWKS / sessions API / device mgmt / advanced hardening.
- **Rev 3 (current)** — final architecture alignment. Restored basic account protection (failed-attempt tracking, configurable lock); clarified that `LoginDto.schoolId` remains fully supported with no removal scheduled; clarified email is the primary identifier for all personas except students; documented student-identifier extensibility (Roll Number etc. without redesign); confirmed backend feature-flag surface reuses the existing design.
- **Rev 3.1 (current)** — schema-fidelity correction. Removed all references to `Student.studentCode` (the column does not exist in the current Prisma schema — only `Student.admissionNo` exists). V1 officially supports **Admission Number only** for student login. Student ID, Roll Number, and any other identifier are documented as **future extensions** that the `IdentifierResolver` registry will accept without redesigning the authentication architecture. No wave changes, no readiness recalculation.

**Governing principle:** keep V1 authentication **simple, enterprise-grade, and aligned with the approved School ERP architecture**. Do not introduce Identity-Provider features that are unnecessary for V1. Every retained item is required to unblock Sprint F2; every removed item is documented in §A so a future hardening sprint can pick it up.

**Source-of-truth documents reconciled in this plan:**

- `docs/PROJECT_VISION.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/MODULES.md`, `docs/MODULE_BOUNDARIES.md`
- `docs/MULTI_TENANT_ARCHITECTURE.md`
- `docs/ROLES_AND_PERMISSIONS.md`
- `docs/REST_API_DESIGN.md`
- `docs/PROVISIONING_AND_LIFECYCLE.md`
- `docs/SCHOOL_ONBOARDING_FLOW.md`
- `docs/SUBSCRIPTION_FOUNDATION.md`
- `docs/SUPER_ADMIN_ARCHITECTURE.md`
- `docs/AUTHENTICATION_ARCHITECTURE_REVIEW.md`

This plan introduces **no new architecture**. Every endpoint, role key, host pattern, JWT claim, and scope distinction is already prescribed by an approved doc. Where there is contradiction between approved docs, the contradiction is flagged and resolved conservatively (no breaking renames, no unrequested redesign).

---

## A. Removed items (out of Version 1)

These were specified in the previous revision and have been **removed from V1 scope**. They are not deleted from the product roadmap — each is referenced in §B "Future Authentication Hardening" so a separate sprint can pick them up.

| # | Item | Why removed for V1 |
|---|---|---|
| R-1 | **MFA (TOTP enrol/confirm/disable + challenge during login)** | Not required before Sprint F2; the FE has no MFA surface to render against |
| R-2 | **WebAuthn / passkey support** | `SUPER_ADMIN_ARCHITECTURE.md:144` already treats WebAuthn as a separate hardening track |
| R-3 | **JWKS endpoint (`/.well-known/jwks.json`)** | No third-party verifier consumes our tokens in V1; existing `kid` header is sufficient internally |
| R-4 | **Hardware Security Keys** | Subset of WebAuthn |
| R-5 | **Active Sessions API (`GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/:id`)** | "Active devices" UI is a profile-screen feature; not in F2 scope |
| R-6 | **Session Management UI** | Same as R-5 — FE not building it in F2 |
| R-7 | **Device Management (`/auth/device/register|unregister|biometric/bind`)** | Mobile-app concern; web V1 does not need it |
| R-8 | **Advanced lockout features** (adaptive thresholds, ML-based abuse detection, risk-scored lock duration) | Basic failed-attempt tracking + configurable temporary lock IS in V1 — see §17. Only the *advanced* features are deferred. |
| R-9 | **Advanced security hardening** (CAPTCHA, breach-corpus password check, IP allowlist, adaptive authentication, security analytics) | All separate hardening track |
| R-10 | **Parent OTP / phone-number login** | `MODULE_BOUNDARIES.md:41-42` explicitly puts parent OTP in the Portal sprint, not Foundation |
| R-11 | **Strategy parity for global users** (removing the `tenant_id=null` bypass in `JwtStrategy`) | V1 platform-admin surface is small and admin-only; addressed in the hardening track alongside MFA |
| R-12 | **`logout-all` for global users** | Same as R-11 — small surface, admin-only |
| R-13 | **`/v1/auth/tenants` slug-discovery endpoint** | Mobile-only feature per `REST_API_DESIGN.md:304`; V1 web FE always knows its tenant from the host |
| R-14 | **Rename `platform_admin` → `super_admin`** | Doc conflict (see §C); chose conservative path — keep existing key, avoid unnecessary breaking change |

---

## B. Deferred items — "Future Authentication Hardening"

The same R-1 through R-13 items are formally deferred to a follow-up sprint, **Sprint F-Auth-Hardening-1**, after Sprint F2 ships. R-14 is deferred until the doc-conflict between `ROLES_AND_PERMISSIONS.md §3.1` (which uses `super_admin`) and `PROVISIONING_AND_LIFECYCLE.md §6` (which uses `PLATFORM_ADMIN`) is resolved by the doc owner — until then, the existing key stays.

The deferral does NOT remove any of these from the product backlog; it merely sequences them behind V1.

---

## C. Doc-conflict note (resolved conservatively)

Two approved documents use different keys for the platform-admin role:
- `ROLES_AND_PERMISSIONS.md §3.1` lists `super_admin` as a platform role key.
- `PROVISIONING_AND_LIFECYCLE.md §6` uses `PLATFORM_ADMIN` as the seeded role key.

Per the scope-trim directive ("avoid unnecessary breaking changes"), this patch keeps the **existing** `platform_admin` key. The conflict is recorded here and flagged for the doc owner to resolve before any future rename.

---

## V1 scope summary

**KEPT for V1:**
- Tenant Resolution (host-based + slug header for `app.schoolos.in`)
- Login Contract Alignment (slug-based login; UUID never exposed to FE)
- Remember Me (24h default, 30d remember-me)
- Refresh Token improvements (preserve chain expiry on rotation)
- Password Reset (already implemented; this patch ships the email channel)
- Change Password (new authenticated endpoint)
- Must Change Password (server-side enforcement guard)
- Platform Authentication (email+password, kept existing key `platform_admin`)
- School Authentication (school_admin email+password)
- Teacher Authentication (email+password; includes other staff roles)
- Parent Authentication (email+password only; OTP deferred)
- Student Authentication (Admission Number + password in V1; future identifiers added via the `IdentifierResolver` registry without redesigning the auth foundation)
- RBAC Alignment (seed the role catalogue per `ROLES_AND_PERMISSIONS.md §3.2`)
- **Basic Account Protection** (failed-attempt tracking, configurable max-attempts, temporary lock with configurable duration, audit log entries for lock/unlock — see §17)
- **Feature-Flag Surface for the Frontend** (reuses existing backend feature-flag design; no new endpoint invented — see §18)
- Development Seed Data (five demo users — see §13)
- Swagger documentation
- Unit Tests
- E2E Tests

---

## 1. Login Contract Alignment

### V1 personas + login identifier

**Email is the primary authentication identifier for all personas except students.** Email is **not** deprecated for any persona.

| Persona | Identifier | Password | Notes |
|---|---|---|---|
| Platform Admin | **Email** (primary, not deprecated) | Yes | Host: `admin.schoolos.in` |
| School Admin | **Email** (primary, not deprecated) | Yes | Host: `{slug}.schoolos.in` or `app.schoolos.in` + `X-Tenant-Slug` |
| Teacher | **Email** (primary, not deprecated) | Yes | Same login surface as School Admin |
| Parent | **Email** (primary, not deprecated) | Yes | OTP deferred (R-10) |
| Student | **Admission Number** (V1) — future identifiers (Student ID, Roll Number, …) added via `IdentifierResolver` registry without redesign | Yes | Email NOT required for students |

### Single login endpoint

`POST /v1/auth/login` is the **only** login endpoint. Persona is distinguished by `actorScope` + role keys carried on the response, not by URL. No portal-specific path.

### Request body (final V1 contract)

```
{
  identifier: string,           // email (admin/teacher/parent) OR admission number (student)
  password: string,
  tenantSlug: string,           // resolved server-side to schoolId; UUID never crosses the wire
  identifierType?: 'email' | 'admission_no',  // optional hint; backend auto-detects
  deviceId?: string,
  rememberMe?: boolean          // see §5
}
```

The `identifierType` union is **extensible** — future identifiers (`student_id`, `roll_number`, …) will be added as enum values **only when** the corresponding schema columns exist and the matching resolver is registered (see "Future extensibility" below). V1 ships with `email` and `admission_no` only.

### Identifier resolution (current implementation — V1)

Backend resolves `identifier` to a `User` via:
1. If `identifierType` is provided, use that path directly.
2. Else auto-detect: contains `@` → email; matches the school's admission-number regex → `admission_no`. **No other identifier path exists in V1.**
3. Lookup tables (no schema redesign):
   - Email: existing `User.email` index.
   - Admission Number: `Student.admissionNo` (confirmed present in `students.prisma`).
4. From `Student → student_users → User` (existing junction), load the principal.

### Per-school configuration of the student identifier (V1)

`SchoolSettings.studentLoginIdentifier` (new column on the existing settings table) governs which identifier the school accepts. **V1 officially supports `admission_no` only.** The column is shaped as a string-backed enum so that future identifiers can be added without a column-type migration.

```
SchoolSettings.studentLoginIdentifier:
  // V1 — current implementation:
  - 'admission_no'    → V1 supported (the only operative value in V1)

  // Future extensibility (NOT implemented in V1; documented for forward compatibility):
  - 'student_id'      → Future — depends on a `Student.studentCode`
                        (or equivalent) column being added to the schema.
                        That column does NOT exist today.
  - 'roll_number'     → Future — depends on a roll-number module shipping.
  - 'both' / composite → Future — meaningful only once two or more
                        identifiers exist in the same school.
  - any future key    → Adding a new identifier requires (a) a schema
                        column to look it up on, (b) a new resolver
                        function in the IdentifierResolver registry,
                        and (c) a new enum value. The authentication
                        foundation does NOT need to be redesigned.
```

### Future extensibility — IdentifierResolver registry pattern

The `IdentifierResolver` is documented as a registry of resolver functions keyed by identifier type. Each resolver takes `(schoolId, rawIdentifier)` and returns `User | null`. Adding Student ID, Roll Number, Father's-Mobile-Last-4, or any other school-specific identifier in a future version is a **registry insertion plus a supporting schema column**, not a redesign.

**Clear scope boundary:**
- **Current implementation (V1):** Admission Number resolver only. The registry exists with exactly one entry (`admission_no`) plus the persona-agnostic `email` resolver.
- **Future extensibility (not in V1):** Student ID, Roll Number, and any other identifier. **Do NOT implement these now.** This section documents the extensibility contract only, so that a future sprint can add them additively.

The plan does **not** claim that `Student.studentCode` or any other future-identifier column already exists. Only `Student.admissionNo` is referenced as a V1 lookup target.

### Response body (V1)

Envelope per `REST_API_DESIGN.md §0.3`:

```
data: {
  accessToken, accessTokenExpiresAt,
  refreshToken, refreshTokenExpiresAt,
  tokenType: 'Bearer',
  user: {
    userId, schoolId, schoolSlug,
    displayName,
    email | null,                // null for students who have no email
    actorScope: 'tenant' | 'global',
    roles: [{ id, key, scope }],
    permissions: string[],       // wildcard-expanded
    locale, timezone,
    mustChangePassword: boolean,
    sessionId
  }
}
```

Field `mfaEnrolled` is **removed** vs Rev 1 — MFA is deferred (R-1).

### Errors

`MUST_CHANGE_PASSWORD`, `ACCOUNT_INACTIVE`, `INVALID_CREDENTIALS`, `USER_NOT_FOUND` (anti-enumeration: same error code for unknown identifier). `MFA_REQUIRED` is **not** introduced in V1 (R-1).

---

## 2. Tenant Resolution

### V1 target — by environment

`MULTI_TENANT_ARCHITECTURE.md §3 Layer 2` mandates that "Sub-domain or path identifies the tenant" and a guard MUST verify the URL tenant matches the JWT tenant. `REST_API_DESIGN.md §0.1` canonicalises the host triad.

| Environment | Host | Tenant source | Scope |
|---|---|---|---|
| Production | `admin.schoolos.in` | none (platform) | `global` only |
| Production | `{slug}.schoolos.in` | leftmost host label | `tenant` |
| Production | `app.schoolos.in` | `X-Tenant-Slug` header | `tenant` |
| Production | `api.schoolos.in/admin/*` | none (platform) | `global` only |
| Development | `localhost:PORT` | `X-Tenant-Slug` header (required for tenant-scoped requests) | `tenant` or `public` |

A `TenantResolverMiddleware` runs **before** `RequestContextMiddleware`. It parses the host, extracts the slug, resolves slug → `schoolId` via a cached `TenantResolverService`, and stamps `requestTenant = { schoolId, slug }` on the request. `JwtAuthGuard` cross-checks `request.requestTenant.schoolId === jwt.tenant_id`; mismatch → 403 with audit event `tenant_mismatch`.

**School UUID is never exposed to the frontend.** All slug↔UUID conversion is server-side. `AuthMeDto` exposes `schoolSlug` for display + URL building; `schoolId` (UUID) is included on the wire but the FE never types, persists, or shows it. The Sprint F1.3 env var `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` is replaced by `NEXT_PUBLIC_TENANT_SLUG`.

---

## 3. Platform Authentication

### V1 target

- Role key stays `platform_admin` (R-14; no rename in V1).
- `actorScope='global'`, `tenant_id` claim is `null` in the JWT (current behaviour preserved).
- Login is the same `POST /v1/auth/login`; tenant context comes from the host (`admin.schoolos.in`).
- Operator console (`admin.schoolos.in`) is the only consumer of `actorScope='global'` tokens (`SUPER_ADMIN_ARCHITECTURE.md §2.1`).
- Tenant-host requests with a global token → 403 (`SUPER_ADMIN_ARCHITECTURE.md:36`).
- **MFA is NOT enforced in V1** (R-1). Platform admins log in with email + password only.
- **`logout-all` for global users is NOT fixed in V1** (R-12). The existing throw stays; documented in `AUTHENTICATION_ARCHITECTURE_REVIEW.md §I-3` as a known limitation.
- **`JwtStrategy` global-user session bypass stays in V1** (R-11). Documented limitation.

The sentinel `platform` school row is preserved.

---

## 4. Tenant Authentication

One login flow serves all four tenant personas. The only persona-specific work is **role assignment at user-creation time**.

### School Admin

- Created in the provisioning transaction (`PROVISIONING_AND_LIFECYCLE.md:58-73`) with `mustChangePassword=true`.
- First login: identifier=email, `user.mustChangePassword=true` → FE redirects to `/v1/auth/first-login/change-password` (already implemented).

### Teacher (and other staff roles)

- Created via Onboarding Wizard Step 5 (`SCHOOL_ONBOARDING_FLOW.md:79-82`).
- Backend issues an invitation token reusing the existing `PasswordResetService.request` primitive with a 7-day TTL.
- Role assigned at invite time: defaults to `teacher`; `class_teacher` if the user owns a section; `principal`, `vice_principal`, `accountant`, `clerk`, `librarian`, `transport_incharge`, `hostel_warden`, `driver`, `security` may also be assigned via the same invite path (just a different `roleKey` input).
- **All staff personas authenticate through the same teacher/staff authentication foundation.** No separate login flow per staff role (per V1 scope-trim directive).
- First login: identifier=email; flow identical to School Admin.

### Parent

- Created by School Admin via existing `ParentUserController.invite`. The User row gets the seeded `parent` role on creation. Activation reuses `passwordReset.request` (existing).
- Login: identifier=email + password (V1 only — OTP deferred, R-10).
- **Login-time lifecycle check:** `AuthService.login` consults `parent_users.status`. If no `ACTIVE` row → 403 `ACCOUNT_INACTIVE`.

### Student

- Created by School Admin via existing `StudentUserController.invite`. Seeded `student` role on creation. Activation reuses `passwordReset.request`.
- Login: identifier = **Admission Number** (V1 — the only operative value of `SchoolSettings.studentLoginIdentifier` in V1). **Student email is NOT required.** Future identifiers (Student ID, Roll Number, …) are added via the IdentifierResolver registry per §1.
- Student User row may have `email=null`. The provisioning flow must allow `null` email when the school's configured identifier is non-email; if email is provided it is still stored (for future password-reset by email; if not provided, password reset is admin-driven only in V1).
- Same lifecycle enforcement against `student_users.status`.

### Common rules

- Tenant-scoped login requires `tenantSlug` from body OR a slug-bearing host.
- `actorScope` on the JWT is always `tenant`; `tenant_id` is the resolved `schoolId`.
- `AllowWhenInactive` is preserved on `AuthController` (`SUBSCRIPTION_FOUNDATION.md:379-386`).

---

## 5. Remember Me

### Current state

Refresh-token TTL: default 30 days (`env.schema.ts:108`). No `rememberMe` concept.

### V1 target

| Login mode | Refresh TTL | Access TTL |
|---|---|---|
| Default (no `rememberMe`) | **24 hours** | 15 min |
| `rememberMe: true` | **30 days** | 15 min |
| Platform admin (any) | **24 hours**, `rememberMe` ignored | 15 min |

(Note: the previous revision specified an 8-hour cap for platform admins. That was tied to deferred MFA/hardening; with MFA out of V1, platform admins use the same 24h default so behaviour is consistent and the FE doesn't need persona-specific token handling.)

**Mechanism (no DB column added):** `AuthService.login` passes a TTL override into `RefreshTokenService.generate` and `SessionRepository.createForLogin`. The existing `UserSession.expiresAt` column carries the chosen TTL. Refresh rotation preserves the **original** chain expiry — rotations never extend the session horizon.

Two new env entries: `AUTH_REFRESH_TTL_DEFAULT_SECONDS=86400`, `AUTH_REFRESH_TTL_REMEMBER_ME_SECONDS=2592000`.

---

## 6. Password Management

### Already implemented (kept as-is in V1)

| Capability | Endpoint |
|---|---|
| Request reset link | `POST /v1/auth/password-reset/request` |
| Confirm reset | `POST /v1/auth/password-reset/confirm` |
| First-login change | `POST /v1/auth/first-login/change-password` |
| Argon2id + pepper + needsRehash | `password.service.ts:52-125` |
| Anti-enumeration | `password-reset.service.ts:411-416` |
| Session revocation on password change | `password-reset.service.ts:208-244` |

### Added in V1

| Capability | Endpoint | Notes |
|---|---|---|
| Authenticated change password | `POST /v1/auth/password/change` | Old → new. Revokes all OTHER sessions; keeps current. |
| Server-side `MUST_CHANGE_PASSWORD` enforcement | Global guard | Blocks all non-auth endpoints with 403 `MUST_CHANGE_PASSWORD` until the flag clears |
| Email channel for reset link | (operational) | One of `ses.adapter.ts` / `sendgrid.adapter.ts` shipped (pick one per ops; the other stays stubbed) |
| Reconcile password-length policy | (config) | Both login and reset enforce **min 12** in V1. Login `MinLength(8)` is raised to `MinLength(12)`. Existing 8-char hashes still verify; rotation forces 12. |

### Frontend impact

FE clients in `frontend/src/lib/api/clients/auth.ts:16-19, 85-104` are stale — they throw `NotImplementedError`. W5 of this patch repoints them.

---

## 7. Parent Authentication

### Current state

- Schema: `parent_users` junction (`students.prisma:286-327`); status enum `PENDING_INVITE | ACTIVE | SUSPENDED | ARCHIVED`.
- Admin endpoints: invite, resend-invite, suspend, reactivate, archive, list — gated by `parent_portal` feature flag.
- Activation: standard password-reset primitive with 7-day TTL.
- Login uses the generic `/v1/auth/login`.

### V1 work (this patch)

1. Seed the `parent` role per `ROLES_AND_PERMISSIONS.md:88`. Permissions scoped to parent-portal read surfaces.
2. Assign role on invitation.
3. Login-time lifecycle check (`AuthService.login` consults `parent_users.status`).
4. Email delivery (shared with §6).
5. **OTP / phone-number login is deferred (R-10)** — `MODULE_BOUNDARIES.md:41-42` puts parent OTP in the Portal sprint.

---

## 8. Student Authentication

### Current state

- Schema: `student_users` junction (`students.prisma:336-370`); same status enum as parent.
- Admin endpoints mirror parent.
- Activation reuses the password-reset primitive.

### V1 work (this patch)

1. Seed the `student` role per `ROLES_AND_PERMISSIONS.md:89`. Permissions scoped to student-portal read surfaces (own attendance, own grades, own fees).
2. Assign role on invitation.
3. Login-time lifecycle check against `student_users.status`.
4. **Student identifier resolver** (per §1): **Admission Number only** in V1 (`SchoolSettings.studentLoginIdentifier='admission_no'`). Email is **not required** for student users. Future identifiers (Student ID, Roll Number, …) plug into the IdentifierResolver registry without changing the auth foundation; **none are implemented in V1**.
5. Allow `User.email` to be NULL when the user is a student and the school's configured identifier is non-email.
6. Email delivery: only when the student has an email AND the school's reset flow uses email. Otherwise reset is admin-driven (School Admin issues a temporary password and sets `mustChangePassword=true`).

---

## 9. Teacher Authentication

### Current state

Per `AUTHENTICATION_ARCHITECTURE_REVIEW.md §5`: no teacher role, no `teacher_users` table, `Staff.userId` is a nullable FK-less column with no service writing to it.

### V1 work (this patch)

1. Seed `teacher`, `class_teacher` roles per `ROLES_AND_PERMISSIONS.md:81-82`. Additionally seed `principal`, `vice_principal`, `accountant`, `clerk`, `librarian`, `transport_incharge`, `hostel_warden`, `driver`, `security` (§10) — but **no separate authentication flow** per staff role. All of them log in through the same teacher/staff foundation.
2. **Staff invitation flow** — reuse the parent/student invitation pattern:
   - New `StaffInvitationService` — creates a `User` row, links `Staff.userId`, assigns the requested role, dispatches `passwordReset.request` with 7-day TTL.
   - New `POST /api/v1/staff/:id/invite` admin endpoint.
   - CSV-bulk-invite `POST /api/v1/staff/invite-bulk` per `SCHOOL_ONBOARDING_FLOW.md:81`.
3. Login path is the generic `/v1/auth/login`. No teacher-specific endpoint.
4. **Minimal schema change**: add FK constraint to existing `Staff.userId` column. No new junction table.

---

## 10. RBAC Alignment

`ROLES_AND_PERMISSIONS.md §3.2` is authoritative.

| Role key | Doc line | Currently seeded? | V1 action |
|---|---|---|---|
| `school_admin` | 78 | ✅ | Keep |
| `principal` | 79 | ❌ | **Add** to `RoleKeys` + `BuiltInRolesSeeder` |
| `vice_principal` | 80 | ❌ | **Add** |
| `class_teacher` | 81 | ❌ | **Add** |
| `teacher` | 82 | ❌ | **Add** |
| `accountant` | 83 | ❌ | **Add** |
| `clerk` | 84 | ❌ | **Add** |
| `librarian` | 85 | ❌ | **Add** |
| `transport_incharge` | 86 | ❌ | **Add** |
| `hostel_warden` | 87 | ❌ | **Add** |
| `parent` | 88 | ❌ | **Add** |
| `student` | 89 | ❌ | **Add** |
| `driver` | 90 | ❌ | **Add** |
| `security` | 91 | ❌ | **Add** |
| `auditor` | (legacy) | ✅ | Keep |
| `platform_admin` | (existing key) | ✅ | Keep (R-14 — no rename in V1) |

Platform roles `platform_billing`, `platform_support`, `platform_engineer`, `platform_sales`, `platform_readonly` per `ROLES_AND_PERMISSIONS.md §3.1` are **deferred to the hardening sprint** unless an immediate need surfaces — V1 ships with only `platform_admin` on the global side.

Permission grants for each new role come directly from `ROLES_AND_PERMISSIONS.md §3.2` and the existing per-module permission seeders. Where a module's permissions are present but the role mapping is absent, this patch adds the mapping. Where neither exists, the role is seeded with an empty permission set and a TODO comment pointing at the owning sprint.

`AuthMeDto` is extended to carry `roles: [{ id, key, scope }]` so the FE never needs a UUID-to-key lookup.

---

## 11. Session Management

### Already correct (no V1 change)

- RS256 JWT with `kid` header.
- Opaque ULID refresh tokens stored as sha256 hex.
- Refresh rotation with chain ancestry + reuse-detection + chain revocation.
- Per-request DB liveness check for tenant users.
- `logout` revokes the whole chain.
- Login event logging.
- Device fields captured per session row.

### V1 changes

- Token TTL split per §5 (24h / 30d).
- Refresh rotation preserves chain expiry (explicit, not extension on rotation).

### NOT in V1 (deferred per R-5, R-6, R-7, R-11, R-12)

- `GET /v1/auth/sessions` + `DELETE /v1/auth/sessions/:id`.
- Strategy parity for global users.
- `logout-all` for global users.
- Device list / "Active devices" UI.

---

## 12. Auth APIs

### Already implemented (✅ keep)

| Path | Method |
|---|---|
| `/v1/auth/login` | POST |
| `/v1/auth/refresh` | POST |
| `/v1/auth/logout` | POST |
| `/v1/auth/logout-all` | POST (tenant scope only — global throws, unchanged in V1) |
| `/v1/auth/me` | GET |
| `/v1/auth/password-reset/request` | POST |
| `/v1/auth/password-reset/confirm` | POST |
| `/v1/auth/first-login/change-password` | POST |

### Added in V1 (🟥 minimal additive set)

| Path | Method | Purpose |
|---|---|---|
| `/v1/auth/password/change` | POST | Authenticated change (old → new) |
| `POST /api/v1/staff/:id/invite` | POST | Staff invitation (incl. teachers) |
| `POST /api/v1/staff/invite-bulk` | POST | CSV bulk invite |

### Needs update (🟧 modify in place — no path change)

| Path | Change |
|---|---|
| `/v1/auth/login` | Body: add `tenantSlug`, `identifierType`, `rememberMe`; rename `email` → `identifier`. Response: expand `user` object per §1 (roles[].key, permissions[], schoolSlug, displayName, locale, timezone, mustChangePassword). |
| `/v1/auth/refresh` | Preserve original chain expiry; response carries refreshed role grants. |
| `/v1/auth/me` | Add `displayName`, `email | null`, `roles[].key`, `permissions[]`, `schoolSlug`, `locale`, `timezone`, `mustChangePassword`. |

### Out of V1 (deferred per §A)

`/v1/auth/tenants`, `/v1/auth/sessions`, `/v1/auth/sessions/:id`, `/v1/auth/mfa/*`, `/v1/auth/webauthn/*`, `/v1/auth/device/*`, `/.well-known/jwks.json`.

---

## 13. Development Seed Data

Exactly **five demo users** in V1. Module remains restricted to `MODULES.dev` and `MODULES.staging` — never `prod-core`.

| Persona | Identifier | Role | Scope | Notes |
|---|---|---|---|---|
| Platform Admin | `platform.admin@jilanix.dev` | `platform_admin` | `global` | Already exists from F1.3 |
| School Admin | `school.admin@canary.jilanix.dev` | `school_admin` | `tenant` (canary) | Already exists from F1.3 |
| Teacher | `teacher@canary.jilanix.dev` | `teacher` | `tenant` (canary) | New |
| Parent | `parent@canary.jilanix.dev` | `parent` | `tenant` (canary) | New; `parent_users` junction row seeded |
| Student | identifier `STU0001` (admission no) | `student` | `tenant` (canary) | New; `student_users` junction row seeded; `User.email = NULL` |

**No additional demo users** (no principal/accountant/librarian/etc. demo users; their role *catalogue* is seeded per §10 but no demo logins are created — V1 scope-trim directive).

All passwords are obvious dev-only strings; all `mustChangePassword=false` to keep curl tests one-shot. **Argon2 params duplicated in seed (review I-6) are de-duplicated** by importing `DEFAULT_ARGON2_PARAMS` directly from `password.service.ts`.

---

## 14. Frontend Impact

The following FE blockers are closed by V1 of this patch:

| FE blocker | Closed by |
|---|---|
| FE pins one tenant via UUID env var | §2 slug-based tenant resolution + `NEXT_PUBLIC_TENANT_SLUG` |
| `useAuth().permissions` permanently empty | §1 login response + §10 `AuthMeDto.permissions[]` |
| `useAuth().featureFlags` permanently empty | Populated from login (existing `FeatureFlagService`); no separate endpoint added in V1 |
| Role-aware routing impossible | §10 `roles[].key` on `AuthMeDto` |
| `mustChangePassword` banner only | §6 server-side enforcement + `/v1/auth/password/change` enables hard redirect |
| Password-reset clients throw `NotImplementedError` | §6 — backend already shipped; FE adopts in W5 |
| `displayName` / `email` absent from `/v1/auth/me` | §1 expanded `user` object |
| Remember Me checkbox has no backend semantic | §5 `rememberMe` flag |
| Student login impossible (only email accepted) | §1 + §8 Admission Number resolver (V1); registry-extensible for future identifiers |

FE blockers that remain after V1 (FE will not build these screens in F2):

- Active Sessions panel (R-5 / R-6).
- MFA UI (R-1).
- Parent OTP UI (R-10).

---

## 15. Sprint Breakdown (five waves)

### Wave 1 — Authentication Foundation

**Scope:** tenant resolution at the edge; login contract aligned (slug, `identifier`, `rememberMe`, expanded response shape); `AuthMeDto` enrichment; refresh-token chain-expiry preservation; Remember Me TTL split; **basic account protection** (failed-attempt counter, configurable max-attempts, temporary lock with configurable duration, lock/unlock audit events — per §17); **feature-flag surface** populated into login + `/v1/auth/me` response via existing `FeatureFlagService` (per §18).

**Files (read-only inventory; no code changes from this document):**
- `backend/src/core/request-context/tenant-resolver.middleware.ts` (new)
- `backend/src/core/request-context/tenant-resolver.service.ts` (new)
- `backend/src/core/request-context/request-context.middleware.ts`
- `backend/src/core/auth/guards/jwt-auth.guard.ts` (mismatch check)
- `backend/src/core/auth/auth.controller.ts`
- `backend/src/core/auth/auth.service.ts`
- `backend/src/core/auth/auth.dto.ts`
- `backend/src/core/auth/repositories/user.repository.ts` (resolve by email)
- `backend/src/core/auth/token/refresh-token.service.ts` (TTL override)
- `backend/src/core/auth/repositories/session.repository.ts` (TTL override)
- `backend/src/core/config/env.schema.ts` (two TTL keys + two lockout keys per §17)
- `backend/src/core/auth/auth.service.ts` (account-protection hooks per §17)
- `backend/src/core/auth/repositories/user.repository.ts` (`incrementFailedAttempts`, `clearFailedAttempts`, `applyLockUntil` per §17)
- `backend/prisma/schema/identity.prisma` (`User.failedLoginCount`, `User.lockedUntil` per §17)
- `backend/src/core/feature-flag/feature-flag.service.ts` (`resolveForUser(userId, schoolId)` — existing service, new resolver per §18)
- `backend/src/core/auth/dto/auth-me.dto.ts` (`featureFlags` map per §18)
- `backend/src/app.module.ts` (middleware ordering)

**Dependencies:** none.

**Tests:**
- Unit: tenant-resolver middleware for the four host cases (admin / slug / app+header / localhost).
- Unit: `auth.service.login.spec.ts` — login by email under each scope.
- Unit: Remember Me TTL — default 24h vs 30d.
- Unit: refresh rotation preserves original `expiresAt`.
- Unit: failed-attempt counter increments on `INVALID_CREDENTIALS`; resets to zero on successful login (per §17).
- Unit: at `AUTH_LOCKOUT_MAX_ATTEMPTS` reached → `lockedUntil = now + AUTH_LOCKOUT_DURATION_SECONDS`; subsequent attempts → 423 `ACCOUNT_LOCKED`; audit event `account_locked` emitted.
- Unit: locked account auto-unlocks after duration; audit event `account_unlocked` emitted on next successful login.
- Unit: login response carries `featureFlags` map resolved from `FeatureFlagService` (per §18).
- Integration: JWT/host mismatch → 403 + audit row.

**Verification:**
- `curl -H 'Host: canary.localhost' …/v1/auth/me` resolves canary.
- `curl -H 'X-Tenant-Slug: canary' …/v1/auth/me` resolves canary via header.
- Login payload over the wire contains no UUID (`schoolId` is server-derived).
- Login responses carry `user.displayName`, `user.locale`, `user.schoolSlug`.

---

### Wave 2 — RBAC + User Types

**Scope:** seed full tenant role catalogue per §10; `AuthMeDto.roles[].key`; `PermissionService.resolveFor()`; login-time lifecycle check against `parent_users` / `student_users`; student identifier resolver (**Admission Number only in V1**; IdentifierResolver registry shape so future identifiers — Student ID, Roll Number — can be added without redesign); `SchoolSettings.studentLoginIdentifier` column (V1 accepts `admission_no` as the only operative value); staff invitation primitive (incl. teacher).

**Files:**
- `backend/src/core/rbac/rbac.constants.ts` — extend `RoleKeys`
- `backend/src/core/rbac/built-in-roles.seeder.ts` — extend grants
- `backend/src/core/rbac/services/permission.service.ts` — add `resolveFor(userId, schoolId)`
- `backend/src/core/rbac/repositories/role.repository.ts` — `findKeysByIds`
- `backend/src/core/auth/auth.service.ts` — call lifecycle repos
- `backend/src/core/parent/parent-user/parent-user.repository.ts` — `findActiveByUserId`
- `backend/src/core/student/student-user/student-user.repository.ts` — `findActiveByUserId`
- `backend/src/core/auth/repositories/user.repository.ts` — `findForLoginByIdentifier` (multi-path)
- `backend/prisma/schema/school.prisma` — `SchoolSettings.studentLoginIdentifier` enum column
- `backend/prisma/schema/identity.prisma` — `Staff.userId` FK constraint
- `backend/src/core/staff/staff/staff-invitation.service.ts` (new)
- `backend/src/core/staff/staff/staff.controller.ts` — `:id/invite` and `invite-bulk`

**Dependencies:** Wave 1 (response shape, login contract).

**Tests:**
- Unit: `built-in-roles.seeder.spec.ts` asserts all 14 tenant roles upsert.
- Unit: `permission-match.spec.ts` regression.
- Unit: parent SUSPENDED → 403 `ACCOUNT_INACTIVE`.
- Unit: student SUSPENDED → 403 `ACCOUNT_INACTIVE`.
- Unit: student login by Admission Number succeeds.
- Unit: `SchoolSettings.studentLoginIdentifier='admission_no'` is the only operative V1 value (other enum values are reserved for future identifiers and reject at validation time in V1).
- Unit: IdentifierResolver registry exposes an extension point — adding a stub resolver in tests does not require changes to `AuthService.login`.
- Unit: staff invitation creates User + Staff link + role + dispatches reset.
- E2E: staff bulk invite reads CSV and dispatches N invitations.

**Verification:**
- `Role` table contains all 14 tenant keys + `auditor` + `platform_admin` after boot.
- `curl /v1/auth/me` returns `roles[].key`.
- Student demo user logs in via `STU0001`.

---

### Wave 3 — Password Management

**Scope:** `POST /v1/auth/password/change`; `MustChangePasswordGuard`; reconcile length policy to 12; email channel adapter (one of SES/SendGrid) shipped for the existing outbox topic.

**Files:**
- `backend/src/core/provisioning/password-reset/password-reset.controller.ts` — add `POST /v1/auth/password/change`
- `backend/src/core/provisioning/password-reset/password-reset.service.ts` — `changePassword(userId, currentPw, newPw)`
- `backend/src/core/auth/guards/must-change-password.guard.ts` (new) — registered globally, excludes auth controllers
- `backend/src/core/auth/auth.dto.ts` — raise `LoginDto.password` min length to 12 (existing 8-char hashes still verify)
- `backend/src/core/notifications/channels/adapters/ses.adapter.ts` OR `sendgrid.adapter.ts` — production implementation
- `backend/src/core/notifications/notifications.module.ts` — register the picked adapter

**Dependencies:** Wave 1 (error codes).

**Tests:**
- Unit: change-password with wrong current → 400 `INVALID_CREDENTIALS`.
- Unit: change-password revokes all sessions EXCEPT current.
- Unit: any non-auth request with `mustChangePassword=true` → 403 `MUST_CHANGE_PASSWORD`.
- Unit: password shorter than 12 chars rejected with policy violation.
- Integration: outbox topic `password_reset_requested` is consumed by the selected adapter (mocked SMTP capture).

**Verification:**
- Reset link observed in mock SMTP capture.
- FE first-login flow works end-to-end against the seed.

---

### Wave 4 — Seed Data + Testing

**Scope:** five demo users per §13 (Platform Admin, School Admin, Teacher, Parent, Student); junction rows for parent + student; de-duplicate argon2 params; backfill seed-verification asserts.

**Files:**
- `backend/prisma/seed/platform/demo-users.ts` — add three new demo users; remove duplicated argon2 params (import from `password.service.ts`)
- `backend/prisma/seed/platform/demo-parents.ts` (new or merged into demo-users) — seeds `parents` row + `parent_users` junction for the parent demo user
- `backend/prisma/seed/platform/demo-students.ts` (new or merged) — seeds `students` row (with admission_no `STU0001`) + `student_users` junction for the student demo user
- `backend/prisma/seed/index.ts` — register new modules in `MODULES.dev` + `MODULES.staging`

**Dependencies:** Wave 2 (roles must exist before role assignment).

**Tests:**
- Unit: `verifyDemoUsers` asserts all five users exist, are active, have the right role and (for parent/student) an `ACTIVE` junction row.
- E2E: dev-seed boot → curl-login as each persona → 200 with correct `roles[].key`.

**Verification:**
- `SEED_TARGET=dev npm run prisma:seed` idempotent across two consecutive runs.
- All five personas log in via curl against a fresh dev boot.

---

### Wave 5 — Verification + Frontend Readiness

**Scope:** repoint FE password-reset clients; populate `useAuth().permissions` and `featureFlags`; add Remember Me checkbox; hard-redirect on `mustChangePassword`; replace `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` with `NEXT_PUBLIC_TENANT_SLUG`; add `X-Tenant-Slug` header to the axios client. Run full verification checklist (§16). Update Swagger.

**Files:**
- `frontend/src/lib/api/clients/auth.ts` — remove `NotImplementedError`; wire to shipped endpoints
- `frontend/src/providers/AuthProvider.tsx` — populate permissions + featureFlags from login response
- `frontend/src/components/auth/LoginForm.tsx` — Remember Me checkbox; remove env-UUID fallback
- `frontend/src/components/auth/ForgotPasswordForm.tsx` + `ResetPasswordForm.tsx` — adopt real endpoints
- `frontend/src/components/auth/FirstLoginChangePasswordForm.tsx` (new)
- `frontend/src/components/auth/ChangePasswordForm.tsx` (new, profile screen)
- `frontend/src/app/dashboard/DashboardClient.tsx` — banner upgraded to hard redirect
- `frontend/src/lib/api/client.ts` — inject `X-Tenant-Slug` header from `NEXT_PUBLIC_TENANT_SLUG`
- `frontend/src/lib/config/app.ts` — replace `defaultSchoolId` with `tenantSlug`
- `frontend/.env.example` — replace UUID env with slug env

**Dependencies:** Waves 1–4.

**Tests:**
- Vitest: LoginForm sends `tenantSlug` from env + `identifier` + `rememberMe`.
- Vitest: ForgotPasswordForm now posts (no `NotImplementedError`).
- Vitest: AuthProvider populates permissions + featureFlags from login.
- Vitest: dashboard redirects on `mustChangePassword=true`.
- Vitest: change-password form revokes other sessions (mocked).

**Verification:** §16 checklist.

---

## 16. Verification Checklist (recalculated for V1 scope)

| # | Gate | How verified |
|---|---|---|
| 1 | **TypeScript** clean | `npx tsc --noEmit` on both projects |
| 2 | **Build** succeeds | `npm run build` on both projects |
| 3 | **Swagger** documents every new/changed endpoint | `/api/docs` lists `/v1/auth/password/change`, `/api/v1/staff/:id/invite`, `/api/v1/staff/invite-bulk`; `/v1/auth/login` shows the new request/response shape |
| 4 | **Unit tests** all green | `npm test -- --run` |
| 5 | **E2E tests** all green | `npm run test:e2e` |
| 6 | **Tenant Isolation** | Cross-tenant slug spoof → 403; JWT-tenant ≠ host-tenant → 403 with `tenant_mismatch` audit |
| 7 | **Platform Login** | `platform_admin` logs in via `admin.schoolos.in`; same login rejected on tenant host |
| 8 | **School Login** | `school_admin` logs in via `canary.schoolos.in`; `/auth/me` returns `roles:[{key:'school_admin'}]` |
| 9 | **Teacher Login** | Teacher demo user logs in; `roles[].key === 'teacher'`; admin routes 403 |
| 10 | **Parent Login** | Parent demo user logs in; SUSPENDED → 403 `ACCOUNT_INACTIVE` |
| 11 | **Student Login** | Student demo user logs in via `STU0001`; `SchoolSettings.studentLoginIdentifier='admission_no'` honoured |
| 12 | **Remember Me** | Default login → `refreshTokenExpiresAt ≈ now+24h`; `rememberMe:true` → ≈ now+30d |
| 13 | **Password Reset** | Reset email captured by mock adapter → confirm → previous sessions revoked |
| 14 | **Refresh Token** | Rotation preserves original chain expiry; reuse-detection revokes whole chain |
| 15 | **RBAC** | All 14 tenant role keys present after boot; `PermissionService.resolveFor` returns wildcard-expanded set |
| 16 | **Auth Guards** | `JwtAuthGuard` blocks expired/revoked sessions for tenant scope; `PermissionsGuard` honours `@RequirePermissions`; `MustChangePasswordGuard` blocks non-auth endpoints when flag is set; `AllowWhenInactive` still admits login/password-reset for EXPIRED/SUSPENDED schools |
| 17 | **Basic Account Protection** | Failed-attempt counter increments on `INVALID_CREDENTIALS`; account locks at `AUTH_LOCKOUT_MAX_ATTEMPTS` → 423 `ACCOUNT_LOCKED`; lock auto-clears after `AUTH_LOCKOUT_DURATION_SECONDS`; `account_locked` / `account_unlocked` audit events recorded; successful login resets counter |
| 18 | **Feature-Flag Surface** | `POST /v1/auth/login` and `GET /v1/auth/me` responses carry `featureFlags` map resolved by existing `FeatureFlagService`; FE `FeatureFlagProvider` consumes it without a separate endpoint |

**Items NOT in the checklist (deferred per §A):** MFA, WebAuthn, JWKS, hardware keys, active sessions API, session management UI, device management, **advanced** lockout features (adaptive thresholds, ML-based detection), advanced security hardening (CAPTCHA, breach corpus check, IP allowlist, adaptive auth, security analytics), global `logout-all`, global-user strategy parity.

---

## 17. Basic Account Protection (V1)

V1 ships **basic** account-protection only. Advanced lockout features (adaptive thresholds, ML-based abuse detection, risk-scored lock duration) are explicitly deferred (R-8). The advanced security-hardening track (CAPTCHA, breach-corpus check, IP allowlist, adaptive authentication, security analytics) is deferred (R-9). This section defines the **minimum** that V1 must deliver.

### Required capabilities

| # | Capability | V1 contract |
|---|---|---|
| 17.1 | **Failed login attempt tracking** | Each `INVALID_CREDENTIALS` outcome on `POST /v1/auth/login` increments a per-user counter. Successful login resets the counter to zero. Counter is per `User`, not per IP. |
| 17.2 | **Configurable maximum failed attempts** | Driven by env `AUTH_LOCKOUT_MAX_ATTEMPTS` (default `5`). Validated at boot via `env.schema.ts`. |
| 17.3 | **Temporary account lock** | When the counter reaches the configured maximum, the user is locked: `User.lockedUntil = now + AUTH_LOCKOUT_DURATION_SECONDS`. Subsequent login attempts (regardless of credential correctness) return HTTP 423 `ACCOUNT_LOCKED` until the lock expires. |
| 17.4 | **Configurable lock duration** | Driven by env `AUTH_LOCKOUT_DURATION_SECONDS` (default `900` — 15 minutes). |
| 17.5 | **Audit log entries for lock/unlock** | A `LoginEvent` (or equivalent audit row in the existing `LoginEventRepository`) is written with `outcome='account_locked'` at the moment of locking, and `outcome='account_unlocked'` at the moment the next successful login occurs after the lock expires. Includes `userId`, `schoolId`, `ip`, `userAgent`. |

### Schema additions (V1)

Two columns on the existing `User` table (no new table):

| Column | Type | Default | Meaning |
|---|---|---|---|
| `failedLoginCount` | `Int` | `0` | Per-user running counter |
| `lockedUntil` | `DateTime?` | `null` | When non-null and in the future, account is locked |

Both columns are bounded — counters never grow unbounded; `lockedUntil` is wall-clock and self-clearing.

### What is explicitly NOT in V1

- Per-IP / per-device throttling (separate rate-limiting layer; hardening sprint).
- Adaptive lockout thresholds based on risk score.
- CAPTCHA challenge after N failures.
- Email/SMS alert to the user on lock.
- Admin "unlock now" endpoint (admins can null the column directly via existing data tools; a dedicated endpoint is hardening-sprint work).
- Reset of the counter on partial-success events (only full success resets).

### Error contract

`POST /v1/auth/login` may return:

| HTTP | Error code | When |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Wrong identifier/password (counter increments) |
| 423 | `ACCOUNT_LOCKED` | `lockedUntil` is in the future. Response body includes `lockedUntil` (ISO timestamp) so the FE can render a countdown. |

`USER_NOT_FOUND` is collapsed into `INVALID_CREDENTIALS` for anti-enumeration (existing behaviour).

---

## 18. Feature Flag Surface (V1)

The frontend already ships a `FeatureFlagProvider` (see `frontend/src/providers/FeatureFlagProvider.tsx`). V1 of this patch wires the backend feature-flag data into the authentication response so the FE can populate that provider without a dedicated network round-trip and without inventing a new endpoint.

### Source of truth — reuse, do not redesign

The backend already owns a `FeatureFlagService` and per-school flag records (see existing feature-flag module). V1 does **not** introduce a new endpoint, a new schema, or a new resolution algorithm. The authentication layer becomes a **consumer** of the existing service, not its owner.

### V1 surface

1. **At login (`POST /v1/auth/login`):** `AuthService.login` calls `FeatureFlagService.resolveForUser(userId, schoolId)`. The resolved map is returned on the `data.user` object as `featureFlags: Record<string, boolean | string | number>`.
2. **At session restore (`GET /v1/auth/me`):** the same resolver runs, and `AuthMeDto.featureFlags` carries the current state. This guarantees that flags toggled mid-session refresh on the next `/me` call (which the FE already calls on tab focus).
3. **No new endpoint** is added. No `/v1/auth/feature-flags` or `/v1/feature-flags` route is introduced in V1. The hardening sprint may add a dedicated dynamic endpoint if real-time toggling becomes a requirement.

### Frontend impact

- `frontend/src/providers/AuthProvider.tsx` already exposes a `featureFlags` field on `useAuth()` — V1 populates it from the login + `/me` responses (today it is permanently empty per `AUTHENTICATION_ARCHITECTURE_REVIEW.md §9`).
- `frontend/src/providers/FeatureFlagProvider.tsx` consumes the map from `useAuth().featureFlags` — no change to its API.

### What is explicitly NOT in V1

- Real-time flag toggling (no SSE / WebSocket push).
- Per-request flag evaluation (flags are session-scoped in V1; mid-session changes land on next `/me`).
- A dedicated `/v1/auth/feature-flags` endpoint (deferred — not required by the FE for V1).
- A new schema, a new admin UI, or a new evaluation engine. Everything reuses the approved feature-flag design.

---

## Output

### 1. Removed items

R-1 MFA, R-2 WebAuthn, R-3 JWKS, R-4 Hardware Keys, R-5 Active Sessions API, R-6 Session Management UI, R-7 Device Management, R-8 **Advanced** lockout features (basic lockout IS in V1 per §17), R-9 Advanced Security Hardening (CAPTCHA, breach corpus, IP allowlist, adaptive auth, security analytics), R-10 Parent OTP, R-11 Global-user strategy parity, R-12 Global `logout-all`, R-13 `/v1/auth/tenants`, R-14 `platform_admin → super_admin` rename.

### 2. Deferred items

All fourteen items above are deferred to **Sprint F-Auth-Hardening-1** after Sprint F2 ships. R-10 is owned by the Parent Portal sprint per `MODULE_BOUNDARIES.md:41-42`. R-14 is blocked on a doc-conflict resolution (see §C).

### 3. Updated implementation waves

| Wave | Title | Outputs |
|---|---|---|
| W1 | Authentication Foundation | Tenant resolution, login contract, `AuthMeDto` enrichment, Remember Me TTL split, refresh-chain-expiry preservation |
| W2 | RBAC + User Types | 14 tenant roles + permission mappings, student identifier resolver, lifecycle checks, staff invitation primitive |
| W3 | Password Management | `POST /v1/auth/password/change`, `MustChangePasswordGuard`, length-policy reconciliation, email channel adapter |
| W4 | Seed Data + Testing | Five demo users (platform, school, teacher, parent, student) + junctions, verify asserts |
| W5 | Verification + Frontend Readiness | FE adoption (slug env, password-reset clients, permissions/featureFlags maps, Remember Me UI, hard redirect, change-password form); Swagger; full §16 checklist |

### 4. Updated readiness score (post-V1 patch, Rev 3)

Re-scored against the same weighted matrix from `AUTHENTICATION_ARCHITECTURE_REVIEW.md §8` (Backend Production Readiness). Rev 3 restores basic account protection (per §17) and a feature-flag surface for the FE (per §18); both move the score up versus Rev 2. Advanced lockout features, MFA, JWKS, sessions API, device management, and global-user parity remain deferred.

| Dimension | Before | Rev 2 | Rev 3 | Delta vs Rev 2 |
|---|---:|---:|---:|---:|
| Credential verification correctness | 9 | 9 | 9 | = |
| Token issuance & rotation | 9 | 9 | 9 | = |
| Session revocation latency | 9 | 9 | 9 | = |
| Audit-grade logging | 8 | 8 | 9 | +1 (lock/unlock events per §17) |
| RBAC enforcement | 7 | 9 | 9 | = |
| RBAC catalogue completeness | 2 | 10 | 10 | = |
| Multi-tenant correctness | 6 | 9 | 9 | = |
| Password reset end-to-end | 5 | 9 | 9 | = |
| **Account lockout (basic)** | 1 | 1 | **7** | **+6** (basic lockout shipped per §17; only advanced features deferred) |
| Rate limiting | 0 | 0 | 0 | = (deferred) |
| MFA | 0 | 0 | 0 | = (deferred) |
| Key management / rotation | 3 | 3 | 3 | = |
| Lifecycle enforcement | 2 | 9 | 9 | = |
| Platform-admin parity | 4 | 4 | 4 | = (deferred) |
| Operational hardening | 1 | 1 | 1 | = (deferred) |

**Backend score: 62 (baseline) → 78 (Rev 2) → 83 / 100 (Rev 3).** The +5 jump is driven by basic account protection (+4 weighted) and the audit-logging uplift for lock/unlock events (+1). Feature-flag surface (§18) does not score on the backend security matrix — its impact is on the FE.

**Frontend score: 48 (baseline) → 80 (Rev 2) → 85 / 100 (Rev 3).** The +5 jump comes from the feature-flag map now being populated end-to-end (the `useAuth().featureFlags` map stops being permanently empty), and from the FE being able to render a meaningful `ACCOUNT_LOCKED` countdown using the `lockedUntil` field returned by the backend. Active Sessions UI (R-5/R-6) and MFA UI (R-1) remain unbuilt — those keep the score under 100.

V1 outcome: **all five personas log in, multi-tenant works at the edge, password reset is end-to-end, RBAC catalogue matches the doc, basic account protection is live, the FE feature-flag map is populated, and FE blockers for Sprint F2 are closed.**

### 5. Final V1 implementation plan

**Five waves, in strict order:**

1. **W1 — Authentication Foundation.** Tenant resolver middleware + slug-based login + Remember Me TTL split + refresh chain expiry. Files: `auth.controller.ts`, `auth.service.ts`, `auth.dto.ts`, `tenant-resolver.middleware.ts` (new), `tenant-resolver.service.ts` (new), `jwt-auth.guard.ts`, `refresh-token.service.ts`, `session.repository.ts`, `env.schema.ts`, `app.module.ts`. **No dependencies.**

2. **W2 — RBAC + User Types.** All 14 tenant role keys + permission mappings + lifecycle checks against `parent_users`/`student_users` + student-identifier resolver (`SchoolSettings.studentLoginIdentifier`) + staff invitation primitive. Files: `rbac.constants.ts`, `built-in-roles.seeder.ts`, `permission.service.ts`, `role.repository.ts`, `user.repository.ts`, parent/student user repositories, `school.prisma`, `identity.prisma` (FK on `Staff.userId`), `staff-invitation.service.ts` (new), `staff.controller.ts`. **Depends on W1.**

3. **W3 — Password Management.** `/v1/auth/password/change` + `MustChangePasswordGuard` + length-policy reconciliation + email channel adapter (one of SES/SendGrid). Files: `password-reset.controller.ts`, `password-reset.service.ts`, `must-change-password.guard.ts` (new), one email adapter, `notifications.module.ts`. **Depends on W1.**

4. **W4 — Seed Data + Testing.** Five demo users + junctions; de-duplicate argon2 params; `verifyDemoUsers` asserts. Files: `demo-users.ts`, possibly `demo-parents.ts` + `demo-students.ts` (new), `seed/index.ts`. **Depends on W2.**

5. **W5 — Verification + Frontend Readiness.** FE adoption (slug env, password-reset clients, permissions/featureFlags maps, Remember Me UI, hard redirect, change-password form); Swagger; full §16 checklist. Files: `frontend/src/lib/api/clients/auth.ts`, `frontend/src/providers/AuthProvider.tsx`, `frontend/src/components/auth/*`, `frontend/src/lib/api/client.ts`, `frontend/src/lib/config/app.ts`, `frontend/.env.example`. **Depends on W1–W4.**

**Backward compatibility guarantees (Rev 3):**

- All existing endpoint paths preserved.
- **`LoginDto.schoolId` (UUID field) remains fully supported for V1.** It is **not** marked deprecated. Its future replacement depends on the final multi-tenant authentication architecture, and that decision will be taken **after** tenant resolution is fully finalised. **No removal is scheduled in V1.** The field is accepted on the wire alongside the V1 `tenantSlug` field; when both are present, server-side resolution validates they reference the same tenant and rejects mismatches with 400 `TENANT_MISMATCH`.
- **`LoginDto.email` (and `identifier`) — email is the primary authentication identifier for Platform Admin, School Admin, Teacher, and Parent.** Email is **not** deprecated. Only the Student persona uses a configurable identifier (Student ID or Admission Number per §1). The `identifier` field on the V1 contract is a superset that accepts email for those four personas and Student ID / Admission Number for students; the legacy `email` field continues to be accepted for backwards-compat with existing FE callers.
- `AuthTokensDto` and `AuthMeDto` are extended, never replaced.
- `platform_admin` role key unchanged.
- Refresh-token storage layout unchanged.
- New columns `User.failedLoginCount` (default `0`) and `User.lockedUntil` (nullable) are additive; existing rows are unaffected at migration time.

**V1 production deployment profile:** multi-tenant, all five personas, email+password (student via **Admission Number only**; future identifiers via the IdentifierResolver registry), Remember Me, password reset (email-delivered), tenant isolation enforced at the edge, basic account lockout (configurable max-attempts + lock duration), feature-flag surface populated for the FE. **Not** suitable for compliance regimes that require MFA — that ships with the hardening sprint.

### 6. Architecture changes in Rev 3

| Area | Rev 2 stance | Rev 3 stance |
|---|---|---|
| `LoginDto.schoolId` | "Deprecated optional field for one release cycle" | **Fully supported for V1; no removal scheduled; future replacement contingent on tenant-resolution finalisation** |
| `LoginDto.email` | "Deprecated alias for `identifier`" | **Not deprecated. Primary identifier for Platform Admin / School Admin / Teacher / Parent.** Only Student uses a configurable identifier |
| Student identifier configurability | `student_id` / `admission_no` / `both` only | V1 supports **Admission Number only** (`Student.admissionNo` is the only existing schema column for student identifiers — `Student.studentCode` does NOT exist). The **IdentifierResolver registry pattern is documented** so Student ID, Roll Number, and any future identifier can be added later **without redesigning the authentication foundation**. **None of these future identifiers are implemented in V1.** |
| Account protection | All lockout features deferred | **Basic lockout shipped in V1** (failed-attempt counter, configurable max-attempts, temporary lock, configurable duration, audit events on lock/unlock — §17). **Only advanced features** (adaptive thresholds, ML detection, CAPTCHA, breach corpus, IP allowlist, adaptive auth, security analytics) **remain deferred** |
| Feature flags | Backend not explicitly addressed for V1 | **Backend feature-flag service is wired into the login + `/me` responses** (reuses existing `FeatureFlagService` — no new endpoint, no new schema, no new evaluation engine). The FE `FeatureFlagProvider` consumes the populated map (§18) |

### 7. Final V1 Authentication Patch — approval

This document (Rev 3) is the **final** V1 Authentication Patch plan. The five-wave breakdown stands; W1 absorbs basic account protection (§17) and the feature-flag surface (§18). The backward-compatibility position is now explicit: `LoginDto.schoolId` and `LoginDto.email` both remain first-class V1 contract fields with no scheduled removal. The student-identifier registry pattern is documented for forward compatibility without implementing Roll Number now.

**Backend readiness: 83 / 100.** **Frontend readiness: 85 / 100.** Both numbers are at the V1 target. Sprint F2 (Dashboard) is unblocked.

**Approved for implementation under Sprint F-Auth-Patch-1 (V1).**

---

**Stop directive.** This document is a planning revision. No backend or frontend code is modified, no migration is generated, no test is touched. Implementation begins only after sign-off on Sprint F-Auth-Patch-1 (V1 scope) per the five-wave breakdown above.
