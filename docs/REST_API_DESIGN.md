# REST API DESIGN — SchoolOS SaaS

_Upstream: API_STANDARDS.md, BACKEND_ARCHITECTURE.md, DATABASE_DESIGN.md, MODEL_INVENTORY.md, ROLES_AND_PERMISSIONS.md. Downstream: FRONTEND_ARCHITECTURE.md._

> Complete REST API specification for SchoolOS. Production-grade, NestJS-ready, Swagger-documented, mobile-app friendly, versioned at `/api/v1`.
>
> Source-of-truth for all API contracts. Every endpoint here must exist in OpenAPI 3.1 / Swagger UI at `/api/docs`.
>
> Conventions inherited from `API_STANDARDS.md`. Data model inherited from `DATABASE_DESIGN.md` (140 tables across 25 schema files in `prisma/schema/`).

---

## 0. Global Conventions (Recap)

### 0.1 Base URLs

| Surface              | Base URL                                          | Audience                       |
| -------------------- | ------------------------------------------------- | ------------------------------ |
| Tenant API           | `https://{school-slug}.schoolos.in/api/v1`        | School users + parents/students/teachers |
| Tenant API (path)    | `https://app.schoolos.in/api/v1` + JWT tenant     | Mobile apps (single host)      |
| Platform Admin API   | `https://admin.schoolos.in/api/v1/admin`          | Super Admin / Platform staff   |
| Public API           | `https://api.schoolos.in/api/v1/public`           | Marketing, signup, status      |
| Webhook Inbound      | `https://api.schoolos.in/api/v1/hooks/{provider}` | Razorpay, MSG91, Gupshup, etc. |

### 0.2 Headers (every request)

| Header                  | Required | Notes                                                          |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `Authorization`         | Yes\*    | `Bearer <jwt>` (\* except `/public/*` and OTP-start endpoints) |
| `X-Client-Name`         | Yes      | e.g. `web-tenant`, `web-admin`, `mobile-parent-android`        |
| `X-Client-Version`      | Yes      | SemVer, e.g. `1.4.2`                                           |
| `X-Tenant-Slug`         | Cond.    | Required when JWT does not carry tenant + host is generic      |
| `Idempotency-Key`       | Cond.    | Required on side-effect `POST` (payments, bulk, notifications) |
| `X-Request-Id`          | Optional | Client-supplied trace id; server echoes back                   |
| `Accept-Language`       | Optional | `en-IN` (default), `hi-IN`, etc.                               |
| `If-Match`              | Cond.    | Required on PATCH/PUT for resources that carry a `version` column. Format: `If-Match: "<version>"` (quotes optional). Missing → `422 IF_MATCH_REQUIRED`; stale → `409 VERSION_CONFLICT`. Parser: `backend/src/core/http/if-match.ts`. See API_STANDARDS §12 and DECISIONS D-014. |

### 0.3 Standard Response Envelope

**Success (single)**
```json
{ "data": { ... }, "meta": { "requestId": "req_01HX...", "serverTime": "2026-06-17T10:11:12.345Z" } }
```

**Success (list)**
```json
{
  "data": [ { ... }, { ... } ],
  "meta": {
    "requestId": "req_01HX...",
    "page": { "nextCursor": "eyJpZCI6...", "prevCursor": null, "limit": 50, "total": null }
  }
}
```

**Error**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields failed validation.",
    "details": [ { "field": "email", "issue": "INVALID_FORMAT" } ],
    "requestId": "req_01HX..."
  }
}
```

### 0.4 Canonical Error Codes

The shipped enum in `backend/src/contracts/api.ts` is the source of truth — currently **11 codes**:

`VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `INSUFFICIENT_PERMISSIONS` (403), `RESOURCE_NOT_FOUND` (404), `VERSION_CONFLICT` (409), `DUPLICATE_RESOURCE` (409), `STATE_INVALID` (409), `LOCKED_RESOURCE` (423), `RATE_LIMITED` (429), `EXTERNAL_PROVIDER_ERROR` (502), `INTERNAL_ERROR` (500).

Codes the marketing surface or older design notes sometimes reference but are **not implemented** today (these collapse onto an existing code in the table above):

| Mentioned code | Today returns | Notes |
|---|---|---|
| `SERVICE_UNAVAILABLE` (503) | `INTERNAL_ERROR` / framework default | Reserved; add only if a maintenance window route ships. |
| `UPGRADE_REQUIRED` (426) | not emitted | Client-version floor is documented in §0.9 but not yet enforced server-side. |
| `FEATURE_DISABLED` (403) | `STATE_INVALID` (409) via `FeatureFlagDisabledError` | Subscription/feature-flag gating reuses `STATE_INVALID`. |
| `TENANT_SUSPENDED` (403) | `STATE_INVALID` (409) via `SubscriptionInactiveError` | Sprint 16 write-guard returns 409, not 403 — see SUBSCRIPTION_FOUNDATION §13.5 §B. |
| `IDEMPOTENCY_KEY_REUSED` (409) | not yet implemented | Idempotency middleware ships in a later sprint. |

Any new code requires a contracts update in `api.ts` **and** an entry in API_STANDARDS §20.

### 0.5 Pagination, Filtering, Sorting (defaults)

- **Pagination:** Cursor by default. `?limit=50` (default 50, max 200), `?cursor=<opaque>`. Offset variant `?page=1&pageSize=25` only on small/static lookups.
- **Filtering:** `?filter[field]=value` or `?filter[field][op]=value` where `op ∈ {eq, ne, gt, gte, lt, lte, in, nin, like, between}`.
- **Sorting:** `?sort=field` (asc) or `?sort=-field` (desc). Multi-sort: `?sort=-createdAt,name`.
- **Search:** `?q=<term>` (per-endpoint full-text scope documented).
- **Field selection:** `?fields=id,name,email`.
- **Expansion:** `?include=relation1,relation2` (documented per endpoint).

### 0.6 Validation Rule Notation

Each request body field annotates: `type | required? | constraints`.
Examples: `string|req|3..120`, `email|req`, `uuid|req`, `int|opt|≥0`, `enum(ACTIVE,INACTIVE)|req`, `phone(E.164)|req`, `iso8601-date|req`, `money(paise,int)|req|≥0`.

### 0.7 Authorization Model

Every endpoint declares one or more `permission` keys (`resource.action` form). Permission resolution: `JWT.role_ids → role_permissions → permissions`. Special pseudo-permissions: `self` (acts on own user record), `tenant.any` (any role within tenant), `platform.any` (any platform role).

### 0.8 Rate Limits (per identity)

| Class                  | Limit          | Endpoints                            |
| ---------------------- | -------------- | ------------------------------------ |
| Default                | 60 req/min     | All authenticated                    |
| Batch / Export         | 600 req/min    | `/bulk`, `/exports`                  |
| OTP / Password reset   | 5 req/min      | `/auth/otp/*`, `/auth/password/*`    |
| Public signup / probe  | 10 req/min/IP  | `/public/*`                          |
| Webhook                | 1000 req/min   | `/hooks/*` (signature gated)         |

### 0.9 Versioning & Deprecation

- Path-based: `/api/v1`. Breaking changes → `/api/v2` introduced alongside v1.
- Response header `X-API-Deprecation: 2027-01-01; sunset=2027-06-30` on deprecated endpoints.
- Client min-version enforced: `426 UPGRADE_REQUIRED` when `X-Client-Version` below floor. *(Planned; today returns the framework default — `UPGRADE_REQUIRED` is not yet in the canonical enum. See §0.4.)*

---

## 1. AUTHENTICATION APIs

Auth endpoints serve 5 surfaces: school staff (password+MFA), platform staff (password+MFA mandatory), parents (phone OTP primary, password optional), students (school-issued credentials), service tokens (API keys).

### 1.1 Login (Password)

| Field   | Value                                  |
| ------- | -------------------------------------- |
| URL     | `/api/v1/auth/login`                   |
| Method  | `POST`                                 |
| Auth    | None                                   |
| Idempo. | No                                     |
| Perm.   | Public                                 |

**Request**
```json
{
  "identifier": "principal@stxavier.in",
  "password": "S3cret!Pass",
  "tenantSlug": "stxavier",
  "deviceId": "dev_abc123",
  "mfaCode": "482917"
}
```
Validation:
- `identifier`: `string|req|3..255` (email OR phone E.164 OR username)
- `password`: `string|req|8..128`
- `tenantSlug`: `string|opt|3..63` (omit if host is sub-domain)
- `deviceId`: `string|opt|≤128`
- `mfaCode`: `string|opt|6..8` (required if account has MFA enrolled)

**Response 200**
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresIn": 900,
    "refreshToken": "rft_01HX...",
    "refreshTokenExpiresIn": 2592000,
    "tokenType": "Bearer",
    "user": {
      "id": "usr_01HX...",
      "displayName": "Fr. Joseph",
      "email": "principal@stxavier.in",
      "phone": "+919812345678",
      "tenantId": "ten_01HX...",
      "tenantSlug": "stxavier",
      "roles": ["principal", "school_admin"],
      "permissions": ["student.read", "student.write", "..."],
      "mfaEnrolled": true,
      "passwordResetRequired": false,
      "language": "en-IN",
      "tz": "Asia/Kolkata"
    }
  }
}
```

**Errors**
| Status | Code                       | When                                      |
| ------ | -------------------------- | ----------------------------------------- |
| 400    | `VALIDATION_FAILED`        | Missing fields / bad format               |
| 401    | `UNAUTHENTICATED`          | Wrong password / unknown user             |
| 401    | `MFA_REQUIRED`             | Account has MFA, `mfaCode` missing        |
| 401    | `MFA_INVALID`              | Wrong TOTP                                |
| 409    | `STATE_INVALID`            | School subscription inactive (Sprint 16 write-guard; see SUBSCRIPTION_FOUNDATION §13.5 §B) |
| 403    | `ACCOUNT_LOCKED`           | Too many failed attempts                  |
| 429    | `RATE_LIMITED`             | >5/min for same identifier                |

### 1.2 Phone OTP — Start

| URL   | `/api/v1/auth/otp/start` |
| ----- | ------------------------ |
| Method| `POST`                   |
| Auth  | None                     |
| Perm. | Public                   |

**Request**
```json
{ "phone": "+919812345678", "purpose": "LOGIN", "tenantSlug": "stxavier" }
```
- `phone`: `phone(E.164)|req`
- `purpose`: `enum(LOGIN, SIGNUP, PASSWORD_RESET, MFA_ENROLL)|req`
- `tenantSlug`: `string|opt`

**Response 202**
```json
{ "data": { "otpId": "otp_01HX...", "expiresIn": 300, "resendAfter": 30, "channel": "SMS" } }
```

**Errors:** `RATE_LIMITED` (429), `EXTERNAL_PROVIDER_ERROR` (502), `RESOURCE_NOT_FOUND` (404 if phone not registered + purpose=LOGIN).

### 1.3 Phone OTP — Verify

| URL    | `/api/v1/auth/otp/verify` |
| ------ | ------------------------- |
| Method | `POST`                    |

**Request**
```json
{ "otpId": "otp_01HX...", "code": "482917", "deviceId": "dev_abc123" }
```
- `code`: `string|req|6..6`

**Response 200** — identical body to `1.1 Login`.

**Errors:** `OTP_INVALID` (401), `OTP_EXPIRED` (410), `OTP_ATTEMPTS_EXCEEDED` (429).

### 1.4 Refresh Token

| URL    | `/api/v1/auth/refresh` |
| ------ | ---------------------- |
| Method | `POST`                 |
| Auth   | None (uses refresh)    |

**Request**
```json
{ "refreshToken": "rft_01HX...", "deviceId": "dev_abc123" }
```

**Response 200**
```json
{ "data": { "accessToken": "...", "accessTokenExpiresIn": 900, "refreshToken": "rft_01HY...", "refreshTokenExpiresIn": 2592000 } }
```
> Refresh token rotates on every use; old token is revoked.

**Errors:** `REFRESH_INVALID` (401), `REFRESH_REUSED` (401, all sessions revoked), `STATE_INVALID` (409, subscription inactive — see SUBSCRIPTION_FOUNDATION §13.5 §B).

### 1.5 Logout (current device)

| URL    | `/api/v1/auth/logout` |
| ------ | --------------------- |
| Method | `POST`                |
| Auth   | Bearer                |

**Request:** `{ "refreshToken": "rft_01HX..." }`
**Response 204** — empty.

### 1.6 Logout All Devices

| URL    | `/api/v1/auth/logout-all` |
| Method | `POST`                    |
| Perm.  | `self`                    |

**Response 204** — revokes every refresh token and all access JTIs for the user.

### 1.7 MFA Enroll (TOTP)

| URL    | `/api/v1/auth/mfa/enroll/start` | `POST` | Perm: `self` |

**Response 200**
```json
{ "data": { "secret": "JBSWY3DPEHPK3PXP", "otpauthUrl": "otpauth://totp/SchoolOS:...", "qrPngBase64": "iVBORw0..." } }
```

| URL    | `/api/v1/auth/mfa/enroll/confirm` | `POST` |
**Request:** `{ "code": "482917" }` → 200 with backup codes.

| URL    | `/api/v1/auth/mfa/disable` | `POST` |
**Request:** `{ "currentPassword": "...", "code": "482917" }` → 204.

### 1.8 WebAuthn (Passkey) — operator console

`POST /api/v1/auth/webauthn/register/options` → 200 (PublicKeyCredentialCreationOptions JSON)
`POST /api/v1/auth/webauthn/register/verify` → 201
`POST /api/v1/auth/webauthn/login/options` → 200
`POST /api/v1/auth/webauthn/login/verify` → 200 (login payload)

### 1.9 Password Reset

`POST /api/v1/auth/password/forgot` — body `{ identifier, tenantSlug }` → 202 (always 202, never leak existence)
`POST /api/v1/auth/password/reset` — body `{ token, newPassword }` → 204
`POST /api/v1/auth/password/change` (auth required) — `{ currentPassword, newPassword }` → 204

### 1.10 Current Session

`GET /api/v1/auth/me` → 200 user + roles + permissions + flags + locale.
`GET /api/v1/auth/sessions` → 200 list of active sessions.
`DELETE /api/v1/auth/sessions/{sessionId}` → 204 revoke one session.

### 1.11 Tenant Discovery (mobile bootstrap)

`GET /api/v1/auth/tenants?identifier=...` → 200 list of tenants the identifier belongs to (parents linked to multiple schools).

### 1.12 Service / API Keys (platform-issued, tenant-scoped)

`POST /api/v1/auth/api-keys` — Perm `apikey.create` — body `{ name, scopes[], expiresAt? }` → 201 with secret shown ONCE.
`GET /api/v1/auth/api-keys` — Perm `apikey.read` → 200 list (no secrets).
`DELETE /api/v1/auth/api-keys/{id}` — Perm `apikey.delete` → 204.

### 1.13 Mobile-specific Auth Helpers

- `POST /api/v1/auth/device/register` — body `{ deviceId, platform: ios|android, pushToken, appVersion, osVersion }` → 201
- `POST /api/v1/auth/device/unregister` — body `{ deviceId }` → 204
- `POST /api/v1/auth/biometric/bind` — body `{ deviceId, publicKey }` → 201 (server stores pubkey for biometric step-up)

---

## 2. SUPER ADMIN APIs

All Super Admin endpoints live under `/api/v1/admin`. No tenant context required in JWT (scope=`platform`). 4-eyes approval enforced for designated mutations (marked **[4-eyes]** below).

### 2.1 Platform Dashboard

| URL    | `/api/v1/admin/dashboard/overview` | `GET` | Perm: `platform.dashboard.read` |

**Response 200** — KPIs: total tenants, active subscriptions, MRR, ARR, churn 30d, signups 30d, support tickets open, SMS credits balance, error budget burn, last 24h auth failures.

### 2.2 Tenant (School) Management

| Method | URL                                     | Perm                          | Notes                                   |
| ------ | --------------------------------------- | ----------------------------- | --------------------------------------- |
| GET    | `/api/v1/admin/tenants`                 | `tenant.read`                 | list, filter, sort, pagination          |
| POST   | `/api/v1/admin/tenants`                 | `tenant.create`               | create tenant shell                     |
| GET    | `/api/v1/admin/tenants/{id}`            | `tenant.read`                 | full record + plan + flags + usage      |
| PATCH  | `/api/v1/admin/tenants/{id}`            | `tenant.update`               | name, contacts, settings                |
| POST   | `/api/v1/admin/tenants/{id}/suspend`    | `tenant.suspend` **[4-eyes]** | reason required                         |
| POST   | `/api/v1/admin/tenants/{id}/unsuspend`  | `tenant.suspend` **[4-eyes]** |                                         |
| DELETE | `/api/v1/admin/tenants/{id}`            | `tenant.delete` **[4-eyes]**  | soft delete; 30-day purge job           |
| POST   | `/api/v1/admin/tenants/{id}/restore`    | `tenant.restore` **[4-eyes]** | point-in-time restore primitive         |

**GET list** query: `?filter[status]=ACTIVE|TRIAL|SUSPENDED|DELETED&filter[planId]=...&filter[region]=...&sort=-createdAt&q=name`.

**Tenant POST request**
```json
{
  "name": "St. Xavier's High School",
  "slug": "stxavier",
  "ownerEmail": "principal@stxavier.in",
  "ownerName": "Fr. Joseph",
  "ownerPhone": "+919812345678",
  "board": "CBSE",
  "city": "Pune",
  "state": "MH",
  "country": "IN",
  "planId": "pln_starter",
  "trialDays": 30,
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "locale": "en-IN"
}
```
Validation: `slug`: `string|req|3..63|^[a-z0-9-]+$|unique`. `board`: `enum(CBSE,ICSE,STATE,IB,IGCSE,OTHER)`.

### 2.3 Tenant Impersonation (Break-glass)

| URL    | `/api/v1/admin/tenants/{id}/impersonate` | `POST` | Perm: `tenant.impersonate` **[4-eyes]** |

**Request:** `{ "reason": "Customer raised ticket #4821", "durationMinutes": 60 }`
**Response 200:** `{ "data": { "impersonationToken": "...", "expiresAt": "...", "sessionId": "..." } }`
> Every action under impersonation is double-logged (operator id + tenant id) and surfaced to school owner email.

### 2.4 Platform Users (Operator Staff)

`GET/POST/PATCH/DELETE /api/v1/admin/platform-users` — Perm `platform.user.*`. Role assignments to `super_admin`, `platform_support`, `platform_billing`, `platform_engineer`, `platform_readonly`.

### 2.5 Plans

| Method | URL                                  | Perm              |
| ------ | ------------------------------------ | ----------------- |
| GET    | `/api/v1/admin/plans`                | `plan.read`       |
| POST   | `/api/v1/admin/plans`                | `plan.create`     |
| GET    | `/api/v1/admin/plans/{id}`           | `plan.read`       |
| PATCH  | `/api/v1/admin/plans/{id}`           | `plan.update`     |
| POST   | `/api/v1/admin/plans/{id}/archive`   | `plan.archive`    |
| POST   | `/api/v1/admin/plans/{id}/clone`     | `plan.create`     |

**Plan body**
```json
{
  "code": "growth-2026",
  "name": "Growth",
  "billingCycle": "ANNUAL",
  "currency": "INR",
  "basePriceMinor": 4999900,
  "perStudentPriceMinor": 4500,
  "minStudents": 100,
  "maxStudents": 2000,
  "trialDays": 30,
  "features": { "ATTENDANCE": true, "FEES": true, "EXAMS": true, "WHATSAPP": false },
  "smsCreditsIncluded": 5000,
  "whatsappCreditsIncluded": 0,
  "storageGbIncluded": 50,
  "gstHsn": "998313",
  "isPublic": true
}
```

### 2.6 Tenant Plan Assignment

| URL    | `/api/v1/admin/tenants/{id}/subscription` | `PUT` | Perm: `subscription.assign` **[4-eyes for downgrade]** |

**Request:** `{ "planId": "pln_growth", "effective": "IMMEDIATE", "prorate": true, "notes": "annual deal" }`

### 2.7 Feature Flags (Platform)

| Method | URL                                            | Perm                  |
| ------ | ---------------------------------------------- | --------------------- |
| GET    | `/api/v1/admin/feature-flags`                  | `flag.read`           |
| POST   | `/api/v1/admin/feature-flags`                  | `flag.create`         |
| PATCH  | `/api/v1/admin/feature-flags/{key}`            | `flag.update`         |
| DELETE | `/api/v1/admin/feature-flags/{key}`            | `flag.delete`         |
| POST   | `/api/v1/admin/feature-flags/{key}/rollout`    | `flag.rollout`        |
| GET    | `/api/v1/admin/feature-flags/{key}/overrides`  | `flag.read`           |
| PUT    | `/api/v1/admin/feature-flags/{key}/overrides/{tenantId}` | `flag.override` |

### 2.8 Platform Billing / GST

| Method | URL                                          | Perm                       |
| ------ | -------------------------------------------- | -------------------------- |
| GET    | `/api/v1/admin/platform-invoices`            | `platform-invoice.read`    |
| GET    | `/api/v1/admin/platform-invoices/{id}`       | `platform-invoice.read`    |
| POST   | `/api/v1/admin/platform-invoices/{id}/void`  | `platform-invoice.void` **[4-eyes]** |
| POST   | `/api/v1/admin/platform-invoices/{id}/resend`| `platform-invoice.send`    |
| GET    | `/api/v1/admin/gst/gstr1?period=YYYY-MM`     | `gst.export`               |
| POST   | `/api/v1/admin/gst/irn/{invoiceId}`          | `gst.irn`                  |
| GET    | `/api/v1/admin/credit-notes`                 | `credit-note.read`         |
| POST   | `/api/v1/admin/credit-notes`                 | `credit-note.create` **[4-eyes if >₹10k]** |

### 2.9 Notification Provider Management

`GET/POST/PATCH /api/v1/admin/providers` — manage MSG91 / Gupshup / Razorpay credentials per region.
`GET /api/v1/admin/providers/{id}/health` — last DLR rate, latency, balance.

### 2.10 System Health & Operations

| URL                                              | Perm                       |
| ------------------------------------------------ | -------------------------- |
| `GET /api/v1/admin/health`                       | `platform.any`             |
| `GET /api/v1/admin/health/detailed`              | `platform.health.read`     |
| `GET /api/v1/admin/jobs`                         | `job.read`                 |
| `POST /api/v1/admin/jobs/{id}/retry`             | `job.retry`                |
| `POST /api/v1/admin/jobs/{id}/cancel`            | `job.cancel`               |
| `GET /api/v1/admin/outbox`                       | `outbox.read`              |
| `POST /api/v1/admin/outbox/{id}/replay`          | `outbox.replay`            |
| `GET /api/v1/admin/cross-tenant-probes`          | `security.read`            |

### 2.11 Tenant Data Export / Backup / Restore

`POST /api/v1/admin/tenants/{id}/exports` — body `{ scope: FULL|FINANCE|ACADEMIC, format: JSONL|CSV }` → 202 + jobId.
`POST /api/v1/admin/tenants/{id}/restore-point` — body `{ pitTimestamp }` → 202.
`GET /api/v1/admin/tenants/{id}/backups` → 200.

### 2.12 Account-Ownership Transfer

`POST /api/v1/admin/tenants/{id}/owner-transfer/initiate` **[4-eyes]** — body `{ newOwnerEmail, reason, coolOffHours }` → 202.
`POST /api/v1/admin/tenants/{id}/owner-transfer/{transferId}/approve` → 202.
`POST /api/v1/admin/tenants/{id}/owner-transfer/{transferId}/cancel` → 204.

### 2.13 Audit (Platform Scope)

`GET /api/v1/admin/audit` — query: `?filter[actorType]=PLATFORM&filter[action]=...&filter[from]=...&filter[to]=...`.

---

## 3. SCHOOL APIs

Tenant-side endpoints for managing the school's own configuration. `/api/v1/schools` returns the **current** tenant only (no list — list is platform-side).

### 3.1 School Profile

| Method | URL                              | Perm                |
| ------ | -------------------------------- | ------------------- |
| GET    | `/api/v1/school`                 | `school.read`       |
| PATCH  | `/api/v1/school`                 | `school.update`     |
| GET    | `/api/v1/school/usage`           | `school.read`       |
| GET    | `/api/v1/school/limits`          | `school.read`       |

**PATCH body**
```json
{
  "displayName": "St. Xavier's",
  "shortName": "SXHS",
  "addressLine1": "FC Road",
  "city": "Pune", "state": "MH", "postalCode": "411005",
  "phone": "+912025551234",
  "email": "office@stxavier.in",
  "website": "https://stxavier.in",
  "logoFileId": "fil_01HX...",
  "brandPrimaryHex": "#0F4C81",
  "academicYearStartMonth": 4,
  "weeklyOffDays": ["SUN"],
  "language": "en-IN"
}
```
Validation: `brandPrimaryHex`: `hex|opt|^#[0-9A-F]{6}$`. `academicYearStartMonth`: `int|opt|1..12`.

### 3.2 Branches / Campuses

`GET/POST/PATCH/DELETE /api/v1/branches` — Perm `branch.*`. Soft delete cascades to classes/sections.

### 3.3 Academic Years & Sessions

`GET/POST/PATCH /api/v1/academic-years` — Perm `academic-year.*`.
`POST /api/v1/academic-years/{id}/activate` — Perm `academic-year.activate` (only one active).
`POST /api/v1/academic-years/{id}/rollover` — Perm `academic-year.rollover` — kicks job to promote students.

### 3.4 Classes, Sections, Subjects

`GET/POST/PATCH/DELETE /api/v1/classes` — Perm `class.*`.
`GET/POST/PATCH/DELETE /api/v1/sections` — Perm `section.*`.
`GET/POST/PATCH/DELETE /api/v1/subjects` — Perm `subject.*`.
`POST /api/v1/sections/{id}/assign-class-teacher` — body `{ teacherId }`.

### 3.5 Departments, Designations, Houses

CRUD under `/api/v1/departments`, `/api/v1/designations`, `/api/v1/houses`. Perm `setup.*`.

### 3.6 Rooms / Facilities

CRUD `/api/v1/rooms` — Perm `room.*`. Fields: `name, type(CLASSROOM|LAB|HALL|OFFICE), capacity, branchId`.

### 3.7 School Calendar / Holidays

`GET/POST/PATCH/DELETE /api/v1/calendar/events` — Perm `calendar.*`. Body: `title, type(HOLIDAY|EVENT|EXAM|PTM), startDate, endDate, allDay, audience`.
`GET /api/v1/calendar/upcoming?limit=10` — Perm `calendar.read` (audience-filtered).

### 3.8 School Settings (key-value)

`GET /api/v1/school/settings` — returns grouped settings.
`PATCH /api/v1/school/settings` — body `{ "key": "...", "value": ... }[]`. Perm `school.settings.write`.

---

## 4. STUDENT APIs

### 4.1 List Students

| URL    | `/api/v1/students` | `GET` | Perm: `student.read` |

**Query**
- `filter[classId]`, `filter[sectionId]`, `filter[academicYearId]`, `filter[status]=ACTIVE|INACTIVE|GRADUATED|TC_ISSUED|EXPELLED`, `filter[admissionNoLike]`, `filter[gender]`, `filter[parentPhone]`, `filter[admissionDate][gte]`, `filter[hasUnpaidFees]=true`
- `sort=-createdAt | name | rollNo | admissionNo`
- `q` matches against `name, admissionNo, rollNo, parent.phone`
- `include=parents,address,documents,classSection`

**Response 200** — paginated list.

### 4.2 Get Student

`GET /api/v1/students/{id}` — Perm `student.read`. `?include=parents,address,documents,siblings,fees,attendance,exams`.

### 4.3 Create Student

`POST /api/v1/students` — Perm `student.create`. Idempotency-Key supported.

**Request**
```json
{
  "firstName": "Aarav",
  "lastName": "Patel",
  "dateOfBirth": "2014-03-12",
  "gender": "MALE",
  "bloodGroup": "B+",
  "religion": "HINDU",
  "category": "GENERAL",
  "motherTongue": "Marathi",
  "nationality": "Indian",
  "admissionDate": "2026-04-01",
  "admissionNo": "SXHS-2026-0421",
  "classId": "cls_01HX...",
  "sectionId": "sec_01HX...",
  "academicYearId": "ay_01HX...",
  "rollNo": "21",
  "houseId": "hse_01HX...",
  "transportRouteId": null,
  "hostelRoomId": null,
  "previousSchool": "ABC Primary",
  "aadhaarMasked": "XXXX-XXXX-1234",
  "addresses": [ { "type": "PERMANENT", "line1": "...", "city": "Pune", "state": "MH", "postalCode": "411005" } ],
  "parents": [
    { "relation": "FATHER", "firstName": "Raj", "lastName": "Patel", "phone": "+919812345678", "email": "raj@example.com", "occupation": "Engineer", "isPrimaryContact": true, "canPickup": true },
    { "relation": "MOTHER", "firstName": "Priya", "phone": "+919812345679", "isPrimaryContact": false }
  ],
  "documents": [ { "type": "BIRTH_CERTIFICATE", "fileId": "fil_01HX..." } ]
}
```
Validation:
- `firstName`: `string|req|1..80`
- `dateOfBirth`: `iso8601-date|req|≤today`
- `gender`: `enum(MALE,FEMALE,OTHER)|req`
- `admissionDate`: `iso8601-date|req`
- `admissionNo`: `string|req|unique-per-tenant|1..40`
- `classId/sectionId/academicYearId`: `uuid|req|exists+sameTenant`
- `parents`: `array|req|min:1` — exactly one `isPrimaryContact:true`
- `aadhaarMasked`: `string|opt|pattern XXXX-XXXX-\d{4}` (raw never accepted)

**Response 201** — full student record.

**Errors:** `DUPLICATE_RESOURCE` (admissionNo), `VALIDATION_FAILED`, `STATE_INVALID` (`HOSTEL` flag off but `hostelRoomId` supplied — via `FeatureFlagDisabledError`; see §0.4), `STATE_INVALID` (plan student cap exceeded — via `FeatureLimitExceededError`).

### 4.4 Update Student

`PATCH /api/v1/students/{id}` — Perm `student.update`. Send only changed fields. Requires `If-Match: "<version>"` header for optimistic locking (see §0.2).
**Errors:** `VERSION_CONFLICT` (409).

### 4.5 Promote / Transfer / Status

| URL                                                    | Perm                  | Body                                         |
| ------------------------------------------------------ | --------------------- | -------------------------------------------- |
| `POST /api/v1/students/{id}/promote`                   | `student.promote`     | `{ toClassId, toSectionId, toAcademicYearId }` |
| `POST /api/v1/students/{id}/transfer-section`          | `student.transfer`    | `{ toSectionId, effectiveDate, reason }`     |
| `POST /api/v1/students/{id}/issue-tc`                  | `student.tc.issue`    | `{ leavingDate, reason, conductRemarks }`    |
| `POST /api/v1/students/{id}/deactivate`                | `student.update`      | `{ reason }`                                 |
| `POST /api/v1/students/{id}/reactivate`                | `student.update`      | `{ reason }`                                 |

### 4.6 Bulk Operations

`POST /api/v1/students/bulk` — body `{ "operations": [ { "op": "CREATE|UPDATE|DEACTIVATE", "data": {...} }, ... ] }` (max 1000 sync, beyond → 202+jobId). Perm `student.bulk`.
`POST /api/v1/students/import` — body `{ fileId, sheet, mapping }` → 202+jobId. Perm `student.import`.
`GET /api/v1/students/import/{jobId}` → progress.
`POST /api/v1/students/exports` → 202+jobId. Perm `student.export`.

### 4.7 Documents

`GET /api/v1/students/{id}/documents` / `POST` / `DELETE /{docId}`. Perm `student.document.*`.

### 4.8 Delete Student

`DELETE /api/v1/students/{id}` — Perm `student.delete`. Soft delete; rejected if active fees/marks unless `?force=true` + `principal` role.

### 4.9 Validation Rules Summary (Student)

| Field         | Rule                                                    |
| ------------- | ------------------------------------------------------- |
| admissionNo   | unique per tenant; format configurable per school       |
| rollNo        | unique per (sectionId, academicYearId)                  |
| dateOfBirth   | yields age within `[minAge, maxAge]` of target class    |
| parents.phone | E.164; at most 3 parents per student                    |

---

## 5. PARENT APIs

Parent portal endpoints. JWT `role=parent` restricts to children linked via `parent_student_links`. All list endpoints implicit-filter to the parent's children.

### 5.1 My Profile & Linked Children

`GET /api/v1/parent/me` — Perm `self`. Returns parent + list of children with class/section.
`PATCH /api/v1/parent/me` — fields: `phone, email, alternatePhone, address, language, notificationPrefs`.
`GET /api/v1/parent/children` — list children with summary (today's attendance, pending fees, latest marks).
`GET /api/v1/parent/children/{studentId}` — Perm `self+linked` (404 if not linked).

### 5.2 Child Attendance

`GET /api/v1/parent/children/{studentId}/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` — 200 with daily statuses + monthly summary.
`POST /api/v1/parent/children/{studentId}/leave-applications` — body `{ fromDate, toDate, reason, documentFileId? }` → 201.
`GET /api/v1/parent/children/{studentId}/leave-applications`.

### 5.3 Child Fees

`GET /api/v1/parent/children/{studentId}/fees` — 200 invoices grouped by term.
`GET /api/v1/parent/children/{studentId}/fees/{invoiceId}` — 200 invoice detail.
`POST /api/v1/parent/children/{studentId}/fees/{invoiceId}/pay` — body `{ method: UPI|CARD|NETBANKING|WALLET, returnUrl }` → 200 `{ paymentSessionId, providerOrderId, providerName, checkoutUrl }`. Idempotency-Key required.
`GET /api/v1/parent/children/{studentId}/fees/{invoiceId}/receipt` — 200 PDF link.

### 5.4 Child Marks / Exams

`GET /api/v1/parent/children/{studentId}/exams` — list exams visible to parents.
`GET /api/v1/parent/children/{studentId}/exams/{examId}/marks` — 200.
`GET /api/v1/parent/children/{studentId}/report-cards` — list published report cards.
`GET /api/v1/parent/children/{studentId}/report-cards/{id}` — download.

### 5.5 Timetable

`GET /api/v1/parent/children/{studentId}/timetable?week=YYYY-Www`.

### 5.6 Homework & Diary

`GET /api/v1/parent/children/{studentId}/homework?status=PENDING|DONE`.
`POST /api/v1/parent/children/{studentId}/homework/{id}/acknowledge`.
`GET /api/v1/parent/children/{studentId}/diary?date=YYYY-MM-DD`.

### 5.7 Messages / Announcements

`GET /api/v1/parent/announcements?audience=PARENT`.
`GET /api/v1/parent/messages` — 1:1 threads with teachers/admin (if `MESSAGING` flag on).
`POST /api/v1/parent/messages` — body `{ recipientUserId, subject, body }` → 201.

### 5.8 Transport & Pickup

`GET /api/v1/parent/children/{studentId}/transport` — route + ETA (if `TRANSPORT_LIVE` flag on).
`POST /api/v1/parent/children/{studentId}/pickup-authorizations` — body `{ name, phone, validFrom, validTo, photoFileId }`.

### 5.9 Notification Preferences

`GET /api/v1/parent/notification-prefs` / `PATCH` — per-channel (SMS/Email/WhatsApp/Push) per-category opt-in.

### 5.10 Parent Validation Notes

- Parent can only view children where `parent_student_links.is_active=true`.
- All write endpoints rate-limited to 20/min/user; leave-application 3/day/child.

---

## 6. TEACHER APIs

Endpoints under `/api/v1/teacher` are role-scoped helpers; CRUD on `/api/v1/staff/...` for admins. Teachers see only sections they teach.

### 6.1 Teacher Profile

`GET /api/v1/teacher/me` — own profile.
`PATCH /api/v1/teacher/me` — limited fields (phone, address, emergency contact).

### 6.2 My Classes / Sections

`GET /api/v1/teacher/sections` — list sections the teacher teaches.
`GET /api/v1/teacher/sections/{sectionId}/students` — roster (read-only).

### 6.3 Attendance (Teacher-facing)

`GET /api/v1/teacher/sections/{sectionId}/attendance?date=YYYY-MM-DD` — pre-filled grid.
`POST /api/v1/teacher/sections/{sectionId}/attendance` — body `{ date, entries: [{ studentId, status: PRESENT|ABSENT|LATE|HALF_DAY|LEAVE, remarks? }] }` → 200. Idempotency by `(sectionId, date)`. Edit window enforced.
`PATCH /api/v1/teacher/sections/{sectionId}/attendance/{date}` — within edit window only; otherwise 423 `LOCKED_RESOURCE`.

### 6.4 Marks Entry

`GET /api/v1/teacher/exams/{examId}/sections/{sectionId}/marks` — grid.
`PUT /api/v1/teacher/exams/{examId}/sections/{sectionId}/subjects/{subjectId}/marks` — body `{ entries: [{ studentId, marksObtained, isAbsent?, remarks? }] }` → 200. Optimistic lock per session via `If-Match: "<version>"` header (see §0.2 / D-014).
`POST /api/v1/teacher/exams/{examId}/sections/{sectionId}/subjects/{subjectId}/submit` — finalizes, locks edits.

### 6.5 Homework / Diary

`GET/POST /api/v1/teacher/homework` — Perm `homework.*`. Body: `sectionId, subjectId, title, description, dueDate, attachments[]`.
`PATCH/DELETE /api/v1/teacher/homework/{id}`.
`GET /api/v1/teacher/homework/{id}/submissions`.
`POST /api/v1/teacher/homework/{id}/submissions/{studentId}/grade` — `{ marks, feedback }`.

### 6.6 Timetable (Teacher View)

`GET /api/v1/teacher/timetable?week=YYYY-Www`.

### 6.7 Lesson Plans

`GET/POST/PATCH /api/v1/teacher/lesson-plans` — Perm `lesson-plan.*`.

### 6.8 Leaves (Teacher Self)

`GET/POST /api/v1/teacher/me/leaves` — body `{ fromDate, toDate, type, reason }`.
`POST /api/v1/teacher/me/leaves/{id}/withdraw`.

### 6.9 Substitutions

`GET /api/v1/teacher/substitutions/assigned-to-me` — Perm `self`.

### 6.10 Messages & Announcements

`POST /api/v1/teacher/announcements` — to own sections — `{ title, body, audience: STUDENTS|PARENTS|BOTH }`.
`GET/POST /api/v1/teacher/messages` — same shape as parent.

### 6.11 Staff Admin Endpoints (school admin only)

CRUD `/api/v1/staff` — Perm `staff.*`. Fields: `firstName, lastName, employeeCode, joiningDate, designationId, departmentId, subjectsTaught[], email, phone, qualifications[]`.
`POST /api/v1/staff/{id}/assignments` — assign to sections/subjects.

---

## 7. ATTENDANCE APIs

Two attendance domains: student attendance (daily/period) and staff attendance (biometric/HR).

### 7.1 Student Attendance — Admin/Reports

| Method | URL                                                    | Perm                  |
| ------ | ------------------------------------------------------ | --------------------- |
| GET    | `/api/v1/attendance/students`                          | `attendance.read`     |
| GET    | `/api/v1/attendance/students/{studentId}`              | `attendance.read`     |
| GET    | `/api/v1/attendance/sections/{sectionId}`              | `attendance.read`     |
| GET    | `/api/v1/attendance/summary?scope=class|section|grade` | `attendance.read`     |
| POST   | `/api/v1/attendance/bulk`                              | `attendance.write`    |
| POST   | `/api/v1/attendance/lock`                              | `attendance.lock`     |
| POST   | `/api/v1/attendance/unlock`                            | `attendance.unlock`   |

**GET list query:** `?filter[date]=2026-06-17` or `?filter[date][between]=2026-06-01,2026-06-30`, `?filter[status]=ABSENT`, `?filter[sectionId]=...`, `sort=date,studentName`, `include=student,section`.

**Bulk body**
```json
{
  "date": "2026-06-17",
  "mode": "DAILY|PERIOD",
  "period": null,
  "entries": [
    { "studentId": "stu_...", "status": "PRESENT" },
    { "studentId": "stu_...", "status": "ABSENT", "reason": "SICK" }
  ]
}
```
Validation: `entries`: `array|req|≤1000`. `status` enum as above. Idempotency-Key required.

**Errors:** `LOCKED_RESOURCE` (attendance for date locked), `STATE_INVALID` (date is holiday), `LIMIT_EXCEEDED`.

### 7.2 Period / Subject Attendance

Same shape, with `period` and `subjectId`. `GET /api/v1/attendance/periods/{date}/{period}`.

### 7.3 Leave Applications

`GET/POST /api/v1/leave-applications`. Body: `studentId|staffId, fromDate, toDate, reason, type, documentFileId`.
`POST /api/v1/leave-applications/{id}/approve` — Perm `leave.approve`.
`POST /api/v1/leave-applications/{id}/reject` — body `{ remarks }`.
`POST /api/v1/leave-applications/{id}/cancel` — Perm `self`.

### 7.4 Biometric / Device Integration

`POST /api/v1/attendance/devices` — register device.
`POST /api/v1/attendance/punches` — body `{ deviceId, identifier, ts, type: IN|OUT }`. Idempotent by `(deviceId, identifier, ts)`. Used by gateway.

### 7.5 Reports

`GET /api/v1/attendance/reports/monthly?month=YYYY-MM&sectionId=...` — 200 matrix.
`GET /api/v1/attendance/reports/defaulters?threshold=75&from=...&to=...` → list students below threshold.
`POST /api/v1/attendance/exports` → 202+jobId.

### 7.6 Staff Attendance

CRUD under `/api/v1/staff-attendance`. Perm `staff-attendance.*`. Same patterns.

### 7.7 Notifications Triggered

- Absent without leave → SMS/WhatsApp to primary parent (configurable cutoff time per school).
- Three consecutive absences → escalation to class teacher.

---

## 8. FEES APIs

Fees domain covers heads, structures, discounts, fines, invoices, payments, receipts, reminders, refunds, ledger.

### 8.1 Fee Heads

`GET/POST/PATCH/DELETE /api/v1/fees/heads` — Perm `fee-head.*`. Fields: `code, name, category(TUITION|TRANSPORT|HOSTEL|MISC|ONE_TIME), hsnSac, isRefundable, isTaxable, defaultAmount, glAccount`.

### 8.2 Fee Structures

`GET/POST/PATCH/DELETE /api/v1/fees/structures` — Perm `fee-structure.*`.

**POST body**
```json
{
  "name": "Class 5 - Annual 2026-27",
  "academicYearId": "ay_...",
  "appliesTo": { "type": "CLASS", "classIds": ["cls_..."] },
  "currency": "INR",
  "lines": [
    { "feeHeadId": "fh_...", "amount": 1200000, "frequency": "MONTHLY", "dueDay": 10, "lateFinePolicyId": "lfp_..." },
    { "feeHeadId": "fh_...", "amount": 500000, "frequency": "ANNUAL", "dueDay": null }
  ],
  "version": 1
}
```
Validation: `amount`: `int|req|≥0|money(paise)`. Optimistic lock via `If-Match: "<version>"` header (see §0.2 / D-014); the `version` field in the example body above is illustrative of the persisted row state, not the wire-protocol mechanism.

`POST /api/v1/fees/structures/{id}/publish` — locks edits, enables invoice generation.
`POST /api/v1/fees/structures/{id}/clone-from/{sourceId}` — for next year.

### 8.3 Discounts / Concessions

`GET/POST/PATCH/DELETE /api/v1/fees/discounts` — Perm `discount.*`. Fields: `code, name, type(PERCENT|FLAT), value, appliesToHeads[], maxAmount, validFrom, validTo, approvalRequired`.
`POST /api/v1/fees/student-discounts` — assign discount to student: `{ studentId, discountId, reason, approvedBy }`. **[4-eyes if >₹5000 or >50%]**

### 8.4 Late Fine Policies

`GET/POST/PATCH /api/v1/fees/fine-policies` — Fields: `name, gracePeriodDays, type(FLAT_PER_DAY|FLAT_ONCE|PERCENT_PER_DAY), value, capAmount`.

### 8.5 Invoices

| Method | URL                                            | Perm                |
| ------ | ---------------------------------------------- | ------------------- |
| GET    | `/api/v1/fees/invoices`                        | `invoice.read`      |
| GET    | `/api/v1/fees/invoices/{id}`                   | `invoice.read`      |
| POST   | `/api/v1/fees/invoices/generate`               | `invoice.generate`  |
| POST   | `/api/v1/fees/invoices/{id}/void`              | `invoice.void` **[4-eyes]** |
| POST   | `/api/v1/fees/invoices/{id}/recompute`         | `invoice.recompute` |
| POST   | `/api/v1/fees/invoices/{id}/send`              | `invoice.send`      |
| GET    | `/api/v1/fees/invoices/{id}/pdf`               | `invoice.read`      |

**Generate body**
```json
{
  "scope": "CLASS|SECTION|STUDENT|ACADEMIC_YEAR",
  "academicYearId": "ay_...",
  "classIds": ["cls_..."],
  "studentIds": [],
  "feeStructureId": "fs_...",
  "dueDate": "2026-07-10",
  "term": "Q1",
  "dryRun": false
}
```
Returns `202` + `jobId`. Subsequent `GET /api/v1/jobs/{id}` for progress.

**List query:** `?filter[studentId]=`, `?filter[status]=DRAFT|SENT|PARTIAL|PAID|OVERDUE|VOID|REFUNDED`, `?filter[dueDate][lte]=...`, `?filter[balance][gt]=0`, `sort=-dueDate`.

### 8.6 Payments

`GET /api/v1/fees/payments` — list.
`POST /api/v1/fees/payments` — manual offline payment recording (cash/cheque/DD/bank-transfer). Body: `{ invoiceId, amount, method, reference, paidAt, collectedById, remarks }`. Idempotency-Key required. **[4-eyes if cash >₹50k]**

**Online payment flow**
`POST /api/v1/fees/invoices/{id}/checkout` — body `{ method, returnUrl, channel: WEB|MOBILE }` → 200 `{ paymentSessionId, providerName: RAZORPAY, providerOrderId, amount, currency, checkoutUrl|sdkData }`. Idempotency-Key required.
`POST /api/v1/hooks/razorpay` — webhook (signature verified).
`GET /api/v1/fees/payments/{id}` — status (`PENDING|CAPTURED|FAILED|REFUNDED`).
`POST /api/v1/fees/payments/{id}/refund` — Perm `payment.refund` **[4-eyes]**. Body: `{ amount, reason }`.

### 8.7 Receipts

`GET /api/v1/fees/receipts` — list.
`GET /api/v1/fees/receipts/{id}` — detail.
`GET /api/v1/fees/receipts/{id}/pdf` — download.
> Receipt numbers gap-free via `tenant_sequences` table; rendered with school logo + GST details.

### 8.8 Reminders / Dunning

`GET /api/v1/fees/reminders/policies` / `PATCH` — `{ remindAtDaysOffset: [-3, 0, 3, 7, 14], channels: [SMS, WHATSAPP, EMAIL] }`.
`POST /api/v1/fees/reminders/send` — body `{ invoiceIds[], channels[], template }` → 202+jobId.

### 8.9 Ledger / Statement of Account

`GET /api/v1/fees/students/{studentId}/ledger?from=...&to=...` — chronological debits/credits.
`GET /api/v1/fees/students/{studentId}/statement.pdf?academicYearId=...`.

### 8.10 Reports

`GET /api/v1/fees/reports/collection?from=...&to=...&groupBy=day|class|head`.
`GET /api/v1/fees/reports/outstanding?asOf=...`.
`GET /api/v1/fees/reports/daybook?date=...`.
`POST /api/v1/fees/exports` → 202+jobId.

### 8.11 Errors (Fees-specific)

| Code                          | When                                              |
| ----------------------------- | ------------------------------------------------- |
| `INVOICE_ALREADY_PAID`        | Pay on PAID invoice                               |
| `PAYMENT_AMOUNT_MISMATCH`     | Online amount differs from invoice balance        |
| `DUPLICATE_RECEIPT_REFERENCE` | Same cheque#/UTR seen twice                       |
| `DISCOUNT_NOT_APPROVED`       | Concession needs approval                         |
| `FEE_STRUCTURE_UNPUBLISHED`   | Cannot invoice from draft structure               |
| `REFUND_EXCEEDS_PAID`         | Refund > paid                                     |

---

## 9. EXAMINATION APIs

### 9.1 Exam Schemes (Grading Systems)

`GET/POST/PATCH/DELETE /api/v1/exams/schemes` — Perm `exam-scheme.*`. Fields: `name, boardType, gradeBands[{minPct, maxPct, grade, gpa}], passingPct, weightagePattern`.

### 9.2 Exams

`GET/POST/PATCH/DELETE /api/v1/exams` — Perm `exam.*`.

**POST body**
```json
{
  "name": "Half-Yearly 2026",
  "academicYearId": "ay_...",
  "type": "TERM|UNIT|HALF_YEARLY|FINAL|PRE_BOARD|BOARD",
  "schemeId": "es_...",
  "appliesTo": { "classIds": ["cls_..."], "sectionIds": [] },
  "startsOn": "2026-09-10",
  "endsOn": "2026-09-22",
  "weightagePct": 30
}
```

`POST /api/v1/exams/{id}/publish` — locks setup, opens marks entry.
`POST /api/v1/exams/{id}/lock-marks` — closes entry.
`POST /api/v1/exams/{id}/publish-results` — generates report cards, sends notifications.

### 9.3 Exam Schedule / Datesheet

`GET/POST/PATCH/DELETE /api/v1/exams/{examId}/schedule` — items: `{ subjectId, sectionIds[], date, startTime, endTime, roomIds[], maxMarks, passMarks }`.

### 9.4 Hall Tickets

`POST /api/v1/exams/{examId}/hall-tickets/generate?sectionId=...` → 202+jobId.
`GET /api/v1/exams/{examId}/hall-tickets/{studentId}.pdf`.

### 9.5 Seating Plan

`POST /api/v1/exams/{examId}/seating/generate` — algorithm: spread across rooms.
`GET /api/v1/exams/{examId}/seating?roomId=...`.

### 9.6 Marks Entry (Admin/Teacher)

`GET /api/v1/exams/{examId}/marks?sectionId=...&subjectId=...` — matrix.
`PUT /api/v1/exams/{examId}/marks` — body `{ sectionId, subjectId, entries: [{ studentId, marksObtained, isAbsent, remarks }] }` → 200. Optimistic lock via `If-Match: "<version>"` header (see §0.2 / D-014).
`POST /api/v1/exams/{examId}/marks/import` — CSV/Excel → 202.

### 9.7 Co-Scholastic / Skills

`GET/PUT /api/v1/exams/{examId}/coscholastic` — body `[{ studentId, skill, grade }]`.

### 9.8 Result Computation & Report Cards

`POST /api/v1/exams/{examId}/results/compute` — Perm `result.compute`. Idempotency-Key required. → 202.
`GET /api/v1/exams/{examId}/results/{studentId}` — 200.
`GET /api/v1/exams/{examId}/report-cards/{studentId}.pdf`.
`POST /api/v1/exams/{examId}/results/publish?sectionId=...` — Perm `result.publish` **[4-eyes]**.
`POST /api/v1/exams/{examId}/results/unpublish?sectionId=...` — Perm `result.publish` **[4-eyes]**.

### 9.9 Revaluation

`POST /api/v1/exams/{examId}/marks/{markId}/revaluation` — body `{ requestedById, reason }` → 201.
`POST /api/v1/exams/{examId}/revaluations/{id}/decision` — `{ status: ACCEPTED|REJECTED, revisedMarks?, remarks }`.

### 9.10 Reports

`GET /api/v1/exams/{examId}/reports/topper?sectionId=...&limit=10`.
`GET /api/v1/exams/{examId}/reports/pass-percentage?groupBy=section|subject`.
`GET /api/v1/exams/{examId}/reports/grade-distribution`.
`POST /api/v1/exams/{examId}/exports` → 202+jobId.

### 9.11 Errors (Exam-specific)

`MARKS_LOCKED` (423), `MAX_MARKS_EXCEEDED` (422), `STUDENT_NOT_IN_SECTION` (422), `RESULT_ALREADY_PUBLISHED` (409), `SCHEME_MISMATCH` (422).

---

## 10. TIMETABLE APIs

### 10.1 Period Definitions

`GET/POST/PATCH/DELETE /api/v1/timetable/period-templates` — Perm `timetable.*`. Body: `{ name, branchId, days[], periods: [{ index, label, startTime, endTime, type: TEACHING|BREAK }] }`.

### 10.2 Timetable Versions

`GET/POST /api/v1/timetable/versions` — body `{ name, academicYearId, effectiveFrom, status: DRAFT|ACTIVE|ARCHIVED }`.
`POST /api/v1/timetable/versions/{id}/activate` — deactivates current active for same scope.

### 10.3 Timetable Entries

`GET /api/v1/timetable/versions/{versionId}/entries?sectionId=...|teacherId=...|roomId=...`.
`POST /api/v1/timetable/versions/{versionId}/entries` — body: `[{ sectionId, day, periodIndex, subjectId, teacherId, roomId }]`. Bulk allowed.
`PATCH/DELETE /api/v1/timetable/versions/{versionId}/entries/{entryId}`.

**Validation / Conflict detection (server-side):**
- One teacher cannot occupy the same `(day, periodIndex)`.
- One room cannot occupy the same `(day, periodIndex)`.
- Section cannot have two entries in the same slot.
- Teacher must teach the assigned subject (per `staff_subject_qualifications`).
- Errors: `TIMETABLE_TEACHER_CONFLICT`, `TIMETABLE_ROOM_CONFLICT`, `TIMETABLE_SECTION_CONFLICT`, `TEACHER_NOT_QUALIFIED`.

### 10.4 Generator (Auto-Schedule)

`POST /api/v1/timetable/versions/{id}/auto-generate` — body `{ constraints: { teacherMaxPerDay, subjectMinPerWeek, ... } }` → 202+jobId.
`GET /api/v1/timetable/versions/{id}/auto-generate/{jobId}` — status + score + conflicts.

### 10.5 Substitutions

`GET /api/v1/timetable/substitutions?date=YYYY-MM-DD`.
`POST /api/v1/timetable/substitutions` — body `{ date, originalTeacherId, substituteTeacherId, periodIndex, sectionId, reason }`.
`DELETE /api/v1/timetable/substitutions/{id}`.

### 10.6 Views

`GET /api/v1/timetable/section/{sectionId}?week=YYYY-Www`.
`GET /api/v1/timetable/teacher/{teacherId}?week=YYYY-Www`.
`GET /api/v1/timetable/room/{roomId}?week=YYYY-Www`.

### 10.7 Exports

`POST /api/v1/timetable/exports?type=section|teacher|room&format=pdf|xlsx` → 202+jobId.

---

## 11. NOTIFICATION APIs

Three channels: SMS (DLT-compliant), Email (SPF/DKIM/DMARC), WhatsApp (WABA template), plus Push (FCM/APNs). All sends consume the per-tenant credit pool atomically.

### 11.1 Templates

| Method | URL                                          | Perm                  |
| ------ | -------------------------------------------- | --------------------- |
| GET    | `/api/v1/notifications/templates`            | `notification.read`   |
| POST   | `/api/v1/notifications/templates`            | `notification.template.create` |
| PATCH  | `/api/v1/notifications/templates/{id}`       | `notification.template.update` |
| DELETE | `/api/v1/notifications/templates/{id}`       | `notification.template.delete` |
| POST   | `/api/v1/notifications/templates/{id}/submit-dlt` | `notification.template.submit` |
| POST   | `/api/v1/notifications/templates/{id}/submit-waba` | `notification.template.submit` |

**Template body**
```json
{
  "name": "fee_due_reminder",
  "channel": "SMS|EMAIL|WHATSAPP|PUSH",
  "category": "TRANSACTIONAL|PROMOTIONAL|SERVICE",
  "language": "en-IN",
  "subject": "Fee Due Reminder",
  "body": "Dear {{parentName}}, fee of Rs.{{amount}} for {{studentName}} is due on {{dueDate}}.",
  "variables": ["parentName", "amount", "studentName", "dueDate"],
  "dltTemplateId": "1107170000001234567",
  "wabaTemplateName": "fee_due_reminder_v2",
  "senderId": "SXAVPN"
}
```

### 11.2 Send (Direct)

`POST /api/v1/notifications/send` — Perm `notification.send`. Idempotency-Key required.
```json
{
  "templateId": "ntpl_...",
  "channel": "SMS",
  "recipients": [
    { "userId": "usr_...", "phone": "+919812345678", "variables": { "parentName": "Raj", "amount": "12000", "studentName": "Aarav", "dueDate": "10-Jul-2026" } }
  ],
  "scheduleAt": null,
  "campaignId": null,
  "respectQuietHours": true,
  "respectOptOut": true
}
```
Validation: `recipients`: `array|req|≤1000` sync, beyond → 202+jobId. `scheduleAt`: future ISO 8601.
**Response 202**: `{ "data": { "batchId": "nbat_...", "accepted": 1000, "creditsReserved": 1000 } }`.

**Errors:** `INSUFFICIENT_CREDITS` (402), `TEMPLATE_NOT_APPROVED_DLT`, `RECIPIENT_OPTED_OUT`, `QUIET_HOURS_BLOCKED`, `STATE_INVALID` (channel disabled by plan — collapses onto `STATE_INVALID`; see §0.4).

### 11.3 Campaigns (Bulk)

`GET/POST /api/v1/notifications/campaigns` — body `{ name, templateId, audienceQuery, scheduleAt, channel }` → 201.
`POST /api/v1/notifications/campaigns/{id}/start` → 202.
`POST /api/v1/notifications/campaigns/{id}/pause` / `/resume` / `/cancel`.
`GET /api/v1/notifications/campaigns/{id}/stats` — sent / delivered / failed / opted-out / cost.

### 11.4 Message Status

`GET /api/v1/notifications/messages?filter[batchId]=...&filter[status]=QUEUED|SENT|DELIVERED|FAILED|BOUNCED`.
`GET /api/v1/notifications/messages/{id}`.
`GET /api/v1/notifications/messages/{id}/events` — provider DLR/open/click events.

### 11.5 Credit Pool & Usage

`GET /api/v1/notifications/credits` — current balances per channel.
`GET /api/v1/notifications/credits/ledger?from=...&to=...&channel=SMS`.
`POST /api/v1/notifications/credits/topup` — Perm `credit.topup` — body `{ channel, amount, paymentMethod }` → 200 + payment session.

### 11.6 Opt-out / Preferences

`GET /api/v1/notifications/opt-out` — list.
`POST /api/v1/notifications/opt-out` — body `{ phone|email, channel, category }`.
`DELETE /api/v1/notifications/opt-out/{id}`.
`GET /api/v1/notifications/preferences/{userId}` / `PATCH`.

### 11.7 Provider Webhooks (Inbound)

`POST /api/v1/hooks/msg91/dlr` — DLR receipts.
`POST /api/v1/hooks/gupshup` — WhatsApp events.
`POST /api/v1/hooks/sendgrid` — email events.
> All webhook endpoints verify signature → enqueue → 200 `{ ok: true }` ASAP; processing is async.

### 11.8 Push Notifications

`POST /api/v1/notifications/push` — body `{ userIds[], title, body, data, deeplink, badge, sound }`. Resolves device tokens, dedupes per device.

### 11.9 Quiet Hours / Policy

`GET /api/v1/notifications/policy` / `PATCH` — `{ quietHoursStart: "21:00", quietHoursEnd: "07:00", timezone: "Asia/Kolkata", promotionalOnlyWindow: { start, end } }`.

### 11.10 Test Send

`POST /api/v1/notifications/test` — Perm `notification.send` — body `{ templateId, channel, recipient, variables }` → 200. Counts against test-credits bucket only.

---

## 12. BILLING APIs (Platform → Tenant)

These are the tenant-facing endpoints to view billing for its own subscription. Operator-side counterparts live under `/admin/platform-invoices` (§2.8).

### 12.1 Current Subscription Summary

`GET /api/v1/billing/summary` — Perm `billing.read`. Returns plan, status, next renewal date, next renewal amount (gross/tax/net), payment method on file, dunning state, credits.

### 12.2 Platform Invoices (issued by us to school)

| Method | URL                                            | Perm           |
| ------ | ---------------------------------------------- | -------------- |
| GET    | `/api/v1/billing/invoices`                     | `billing.read` |
| GET    | `/api/v1/billing/invoices/{id}`                | `billing.read` |
| GET    | `/api/v1/billing/invoices/{id}/pdf`            | `billing.read` |
| POST   | `/api/v1/billing/invoices/{id}/pay`            | `billing.pay`  |

**Pay body**: `{ method: UPI|CARD|NETBANKING|AUTOPAY, returnUrl }` → 200 checkout session. Idempotency-Key required.

### 12.3 Payment Methods

`GET /api/v1/billing/payment-methods` — list saved methods (mandate IDs, last4, brand).
`POST /api/v1/billing/payment-methods/setup` — body `{ type: CARD|UPI_AUTOPAY|EMANDATE }` → 200 setup session.
`DELETE /api/v1/billing/payment-methods/{id}` — revoke mandate.

### 12.4 Credit Notes

`GET /api/v1/billing/credit-notes` / `GET /{id}` / `GET /{id}/pdf`.

### 12.5 GST Details (Buyer side)

`GET /api/v1/billing/gst` / `PATCH` — `{ gstin, legalName, placeOfSupply, addressLines[] }`.
Validation: `gstin` `string|opt|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$`.

### 12.6 Usage Statements

`GET /api/v1/billing/usage?period=YYYY-MM` — per-meter (SMS sent, WhatsApp sent, storage GB, students count snapshot).
`GET /api/v1/billing/forecast` — projected next-invoice line items.

### 12.7 Dunning State

`GET /api/v1/billing/dunning` — current state (`HEALTHY|RETRYING|GRACE|SUSPENDED`), retry schedule, next action date.

### 12.8 Webhook (Razorpay → us)

`POST /api/v1/hooks/razorpay-platform` — same envelope, separate route for platform-level subscription/payment events.

### 12.9 Errors

`PAYMENT_METHOD_REQUIRED`, `PAYMENT_FAILED`, `MANDATE_EXPIRED`, `GSTIN_INVALID`, `INVOICE_ALREADY_PAID`, `TENANT_NOT_ON_PAID_PLAN`.

---

## 13. SUBSCRIPTION APIs

Sprint 15 shipped the Subscription Foundation (Plan + PlanFeature + Subscription + SchoolUsage + Guard). Sprint 16 wired enforcement into Student / Staff / Branch / FileStorage and added a global `SubscriptionWriteGuardInterceptor`. The shipped surface is split into three trees:

- **Super-admin** (`/api/v1/super-admin/...`) — platform staff manage plans, plan features, and per-school subscription lifecycle.
- **Tenant self** (`/api/v1/me/...`) — a school reads its own subscription + usage.
- **Public** (planned) — `GET /api/v1/public/plans` is **not yet implemented**.

All super-admin subscription/usage controllers carry `@AllowWhenInactive()` so they remain reachable for a school whose subscription is EXPIRED / SUSPENDED / CANCELLED. See SUBSCRIPTION_FOUNDATION.md §13.5 for the full enforcement contract.

### 13.1 Plans Catalog

| Route                                                       | Method | Audience        | Notes                                  |
|-------------------------------------------------------------|--------|-----------------|----------------------------------------|
| `/api/v1/public/plans`                                      | GET    | Public          | **Planned, not yet shipped.**          |

Catalogue browsing today happens via the super-admin plans + plan-features routes below.

### 13.2 Plan Features (Super-admin)

Source: `plan-feature.controller.ts`. All under `/api/v1/super-admin/plans/:planId/features`.

| Route                            | Method | Purpose                                                  |
|----------------------------------|--------|----------------------------------------------------------|
| `/`                              | GET    | List plan features for a plan.                           |
| `/`                              | POST   | Add a single plan feature.                               |
| `/:id`                           | PATCH  | Update a plan feature row.                               |
| `/:id`                           | DELETE | Soft-delete a plan feature row.                          |
| `/bulk`                          | POST   | Bulk replace the plan's feature matrix.                  |

PlanFeature.limit is a **signed BIGINT** (Sprint 15.0.2 hotfix) to support `storage_bytes`. See DECISIONS D-034.

### 13.3 Subscription Lifecycle (Super-admin)

Source: `subscription.controller.ts`. All under `/api/v1/super-admin/schools/:schoolId/subscription`.

| Route                | Method | Permission                              | Purpose                                          |
|----------------------|--------|-----------------------------------------|--------------------------------------------------|
| `/`                  | GET    | `subscription.read`                     | Read the active subscription for a school.       |
| `/all`               | GET    | `subscription.read`                     | List every subscription row (active + history). |
| `/history`           | GET    | `subscription.history.read`             | Paginated subscription history journal.          |
| `/assign`            | POST   | `subscription.assign`                   | Create a new PENDING/TRIAL subscription.         |
| `/:id/activate`      | POST   | `subscription.activate`                 | TRIAL/PENDING → ACTIVE.                          |
| `/:id/upgrade`       | POST   | `subscription.change`                   | Change plan upward; prorated.                    |
| `/:id/downgrade`     | POST   | `subscription.change`                   | Change plan downward; effective at period end.   |
| `/:id/renew`         | POST   | `subscription.renew`                    | Renew at end-of-period or immediately.           |
| `/:id/suspend`       | POST   | `subscription.suspend`                  | ACTIVE → SUSPENDED.                              |
| `/:id/reactivate`    | POST   | `subscription.reactivate`               | SUSPENDED/CANCELLED → ACTIVE.                    |
| `/:id/cancel`        | POST   | `subscription.cancel`                   | Terminate at period end (or immediate).          |

Transitions are enforced by the Subscription Lifecycle FSM — see DECISIONS D-028.

### 13.4 Tenant Self-View

Source: `subscription-self.controller.ts` + `usage-self.controller.ts`.

| Route                 | Method | Purpose                                            |
|-----------------------|--------|----------------------------------------------------|
| `/api/v1/me/subscription` | GET | The signed-in tenant reads their active subscription. |
| `/api/v1/me/usage`        | GET | The signed-in tenant reads their current usage counters. |

### 13.5 Usage Counters (Super-admin)

Source: `usage.controller.ts`. All under `/api/v1/super-admin/schools/:schoolId/usage`.

| Route          | Method | Purpose                                                    |
|----------------|--------|------------------------------------------------------------|
| `/`            | GET    | Read the school_usage snapshot row.                        |
| `/events`      | GET    | Paginated UsageEvent ledger (signed deltas).               |
| `/recompute`   | POST   | Reconcile snapshot from the event ledger.                  |

### 13.6 Enforcement Behavior (not endpoints)

`SubscriptionWriteGuardInterceptor` (Sprint 16) blocks all tenant POST/PUT/PATCH/DELETE when `Subscription.status ∉ {TRIAL, ACTIVE, EXPIRING}`. Bypass conditions:

- Read methods (`GET`/`HEAD`/`OPTIONS`).
- Platform context (no `schoolId` in request context).
- Controller decorated with `@AllowWhenInactive()` (auth, password-reset, super-admin subscription, school-lifecycle).

Limit consumption (`student_count`, `staff_count`, `branch_count`, `storage_bytes`) is wired into the four metered domain services via `SubscriptionGuardService.assertAndConsume(... tx)`. Over-limit attempts roll the create back atomically inside the caller's Prisma transaction.

### 13.7 Not Yet Shipped

The following endpoints from earlier design notes are **not implemented** and live on the Sprint-17+ roadmap:

- `POST /api/v1/subscription/change` (tenant self-serve plan change)
- `POST /api/v1/subscription/cancel`, `/reactivate` (tenant self-serve)
- `GET|POST|DELETE /api/v1/subscription/addons`
- `/credit-packs/purchase`
- `/trial/extend-request`
- `/quote`, `/promo/validate`, `/promo/apply`

### 13.8 Error Codes

Subscription-domain errors all surface through the standard `ErrorEnvelope`. Today's catalogue:

| Domain error                  | Wire code         | HTTP | Source                                              |
|-------------------------------|-------------------|------|-----------------------------------------------------|
| `SubscriptionInactiveError`   | `STATE_INVALID`   | 409  | Write-guard interceptor on EXPIRED/SUSPENDED/CANCELLED. |
| `FeatureLimitExceededError`   | `STATE_INVALID`   | 409  | `assertAndConsume` over-limit on a metered feature. |
| `FeatureDisabledError`        | `STATE_INVALID`   | 409  | Feature flag off (entitlement) for the route's feature. |
| `InvalidPlanFeatureError`     | `VALIDATION_FAILED` | 422 | Bulk replace with malformed feature rows.           |
| `SubscriptionTransitionError` | `STATE_INVALID`   | 409  | Lifecycle FSM rejects the requested transition.     |

Codes that pre-Sprint-15 design notes called out (`PLAN_LIMIT_BREACHED`, `PLAN_CHANGE_NOT_ALLOWED`, `PROMO_INVALID`, `TRIAL_ALREADY_USED`, etc.) collapse onto these today.

---

## 14. FEATURE FLAG APIs

Two flag types: **entitlement flags** (plan-gated, persistent) and **kill-switch flags** (operational, ephemeral). All flag reads cached with explicit invalidation on plan/flag change.

### 14.1 Read Flags (Tenant Self)

`GET /api/v1/feature-flags` — Perm `tenant.any`. Returns object map:
```json
{
  "data": {
    "ATTENDANCE": { "enabled": true, "source": "PLAN" },
    "WHATSAPP":   { "enabled": false, "source": "PLAN", "reason": "NOT_IN_PLAN" },
    "FEES_AUTO_REMIND": { "enabled": true, "source": "OVERRIDE", "expiresAt": "2026-12-31T23:59:59Z" }
  },
  "meta": { "evaluatedAt": "2026-06-17T10:00:00Z", "cacheTtl": 300 }
}
```

`GET /api/v1/feature-flags/{key}` — single flag with evaluation trace.
`GET /api/v1/feature-flags/effective?userId=...` — user-scoped evaluation (role-aware).

### 14.2 Admin (Platform-side) — see §2.7

Definitions, rollout %, overrides per tenant, deletion.

### 14.3 Tenant-Scoped Toggles (Self-service subset)

`GET /api/v1/feature-flags/tenant-toggles` — flags that the school admin can toggle within their plan envelope (e.g. enable/disable a module they paid for).
`PATCH /api/v1/feature-flags/tenant-toggles/{key}` — body `{ enabled: true }`. Perm `feature-flag.toggle`. Validates against entitlement.

### 14.4 Flag Audit Trail

`GET /api/v1/feature-flags/{key}/history` — last 100 changes (who, when, before/after, reason).

### 14.5 Errors

`FLAG_NOT_FOUND`, `FLAG_NOT_TOGGLEABLE` (kill-switch / plan-gated), `FLAG_ENTITLEMENT_MISSING`, `FLAG_DEPENDENCY_UNMET` (e.g. enabling EXAMS_REPORT_CARD requires EXAMS).

---

## 15. AUDIT APIs

Append-only audit log per tenant. Finance subset is hash-chained and anchored to WORM S3 daily.

### 15.1 Query Audit Log (Tenant)

| URL    | `/api/v1/audit` | `GET` | Perm: `audit.read` |

**Query**
- `filter[from]=ISO`, `filter[to]=ISO`
- `filter[actorId]=usr_...`, `filter[actorType]=USER|SYSTEM|API_KEY|IMPERSONATION`
- `filter[action]=student.created|fee.paid|...`
- `filter[entityType]=student|invoice|...`
- `filter[entityId]=...`
- `filter[ip]=...`
- `filter[category]=FINANCE|ACADEMIC|IDENTITY|SETTINGS|SECURITY|NOTIFICATION`
- `?q=` full-text on `description`
- `sort=-occurredAt`, cursor pagination.

**Response 200**
```json
{
  "data": [
    {
      "id": "aud_01HX...",
      "occurredAt": "2026-06-17T10:11:12.345Z",
      "actor": { "id": "usr_...", "type": "USER", "displayName": "Fr. Joseph", "roles": ["principal"] },
      "action": "student.updated",
      "entityType": "student",
      "entityId": "stu_...",
      "category": "ACADEMIC",
      "ipAddress": "203.0.113.45",
      "userAgent": "Mozilla/...",
      "requestId": "req_01HX...",
      "before": { "rollNo": "20" },
      "after":  { "rollNo": "21" },
      "description": "Roll no changed from 20 to 21",
      "version": 134,
      "prevHash": "sha256:...",
      "hash": "sha256:..."
    }
  ],
  "meta": { "page": { "nextCursor": "..." } }
}
```

### 15.2 Audit Entry Detail

`GET /api/v1/audit/{id}` — full record + hash-chain neighbours (for finance category).

### 15.3 Export

`POST /api/v1/audit/exports` — body `{ from, to, filters, format: JSONL|CSV }` → 202+jobId. Perm `audit.export`.

### 15.4 Hash-Chain Verification (Finance)

`GET /api/v1/audit/finance/verify?from=...&to=...` → 200 `{ ok: true, anchors: [{ date, s3Url, sha256, signedAt }], breaks: [] }`.
Operator-side: `POST /api/v1/admin/audit/finance/reanchor`.

### 15.5 Security Events Subset

`GET /api/v1/audit/security` — read-only view filtered to login failures, impersonations, permission denials, MFA changes, API-key rotations. Perm `audit.security.read`.

### 15.6 Retention

Returns `meta.retentionPolicy`: `{ generalDays: 1825, financeDays: 2920, securityDays: 1825 }`. Older records archived to S3; queryable via export-only path.

### 15.7 Errors

`AUDIT_ENTRY_NOT_FOUND`, `AUDIT_RANGE_TOO_LARGE` (>90 days without export), `INSUFFICIENT_PERMISSIONS` (cross-actor view requires `audit.read.cross-actor`).

---

## Appendix A — Common Path Helpers

| Helper                                  | Returns                                 |
| --------------------------------------- | --------------------------------------- |
| `GET /api/v1/jobs/{id}`                 | background job status                   |
| `GET /api/v1/exports/{id}`              | export job + signed download URL        |
| `POST /api/v1/uploads`                  | pre-signed S3 PUT URL (mobile-friendly) |
| `GET /api/v1/uploads/{id}`              | uploaded file metadata                  |
| `GET /api/v1/lookups/states`            | list of Indian states                   |
| `GET /api/v1/lookups/boards`            | board enums                             |
| `GET /api/v1/lookups/permissions`       | catalogue (admin UI helper)             |
| `GET /api/v1/health`                    | liveness                                |
| `GET /api/v1/ready`                     | readiness                               |
| `GET /api/v1/version`                   | server commit + build time              |

## Appendix B — Swagger / OpenAPI

- Spec served at `GET /api/v1/openapi.json` (no auth, rate-limited).
- Swagger UI at `GET /api/docs`.
- Schemas auto-generated from NestJS DTOs (class-validator decorators).
- Tag per category: `Authentication`, `Super Admin`, `School`, `Student`, `Parent`, `Teacher`, `Attendance`, `Fees`, `Examination`, `Timetable`, `Notification`, `Billing`, `Subscription`, `Feature Flag`, `Audit`.
- Securitey schemes: `bearerAuth`, `refreshToken`, `apiKey` (X-API-Key), `webhookSignature`.

## Appendix C — Mobile-App Considerations

- All list endpoints support cursor pagination (works under flaky network).
- All write endpoints accept `Idempotency-Key` (retry-safe).
- `ETag`/`If-None-Match` on read-mostly endpoints (timetable, calendar, student profile).
- `X-Min-Client-Version` response header tells mobile to upgrade.
- Deep-link metadata in push payload (`data.deeplink`).
- File uploads via pre-signed S3 URLs (no large bodies through API).
- Locale negotiation via `Accept-Language`; server translates error messages.

## Appendix D — Endpoint Counts by Category

| Category         | Approx. Endpoints |
| ---------------- | ----------------: |
| Authentication   |                28 |
| Super Admin      |                42 |
| School           |                30 |
| Student          |                22 |
| Parent           |                22 |
| Teacher          |                26 |
| Attendance       |                18 |
| Fees             |                40 |
| Examination      |                32 |
| Timetable        |                18 |
| Notification     |                28 |
| Billing          |                14 |
| Subscription     |                14 |
| Feature Flag     |                 9 |
| Audit            |                 8 |
| Helpers          |                10 |
| **Total**        |          **~360** |

---

**End of REST_API_DESIGN.md.** Cross-references: `API_STANDARDS.md` (conventions), `DATABASE_DESIGN.md` (schema), `DATABASE_ARCHITECTURE.md` (clusters), `ROLES_AND_PERMISSIONS.md` (perm keys), `MODULES.md` (feature flags).
