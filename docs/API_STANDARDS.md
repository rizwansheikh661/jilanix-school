# API_STANDARDS

_Upstream: BACKEND_ARCHITECTURE.md, BUSINESS_RULES.md. Downstream: REST_API_DESIGN.md._

REST conventions, error format, pagination, versioning, idempotency, security headers. Every backend module follows this. Deviations require an entry in DECISIONS.md.

---

## 1. Style

- **REST + JSON.** GraphQL is out of scope for v1.
- **NestJS** controllers, **class-validator** DTOs, **Prisma** services.
- Resources are nouns, plural: `/students`, `/fee-invoices`.
- Sub-resources nest only one level: `/students/{id}/attendance`. Beyond one level, flatten with query params.
- HTTP verbs map to standard CRUD: `GET`, `POST`, `PATCH` (partial), `PUT` (full replace, rare), `DELETE` (soft delete by default).

---

## 2. URL structure

Two clearly separated trees, both behind the global prefix `api` (set in `apps/api/main.ts` from `APP_GLOBAL_PREFIX`, default `api`) and path-versioned via `@Controller({ version: '1' })`:

```
https://api.schoolos.in/api/v1/<resource>          ← tenant-scoped (JWT carries tenant)
https://api.schoolos.in/api/v1/admin/<resource>    ← platform-scoped (Super Admin only)
```

The literal path prefix is therefore `/api/v1/...`. The shorthand `/v1/...` appears in older design notes but the deployed shape is always `/api/v1/...`. Operational routes (`/health`, `/ready`, `/version`) are explicitly excluded from the global prefix.

Tenant context comes from the JWT, not the URL — no `/schools/{id}/students`. The URL stays clean, and tenant isolation is enforced regardless of the URL.

For Super Admin operating on a specific tenant: `/api/v1/admin/tenants/{tenantId}/...` — tenant ID is explicit and verified against the global scope.

---

## 3. Versioning

- Path-based: `/api/v1/...` via NestJS `VersioningType.URI`. Breaking changes go in `/api/v2/...`.
- Aim to **never break** a published endpoint within a major version. Add fields, never remove without a deprecation window (≥6 months).
- Deprecated endpoints emit a `Deprecation` header and a `Sunset` header per RFC 8594.
- Mobile app clients pin a major version; old majors stay alive until ≤1% traffic.

### 3.1 Client version negotiation
- Mobile and web clients send `X-Client-Name` (e.g., `web`, `android-parent`, `ios-parent`) and `X-Client-Version` (semver).
- Server maintains a per-client **minimum supported version**. Below minimum → `426 Upgrade Required` with a JSON body explaining where to upgrade.
- Below recommended-but-above-minimum → `X-Upgrade-Available: true` header; client surfaces a non-blocking nudge.

### 3.2 Deprecation telemetry
- Every call to a deprecated endpoint increments a counter labelled by (endpoint, client_name, client_version, tenant_id).
- We do not sunset an endpoint until usage on it has dropped to a tolerable threshold (defined per case) or we have personally migrated remaining tenants.
- Internal dashboard tracks "sunset-eligible" endpoints to keep API surface clean.

---

## 4. Authentication

- All endpoints (except public auth) require `Authorization: Bearer <jwt>`.
- JWT claims:
  - `sub` — user id
  - `tenant_id` — the tenant context (or absent for `scope=global`)
  - `scope` — `tenant` | `global`
  - `role_ids` — array
  - `iat`, `exp`, `jti` (for revocation)
- Access tokens: ~15 min. Refresh tokens: ~30 days, rotating, single-use.
- Logout invalidates refresh token; access token rides out its TTL (or join a JTI deny-list for high-risk).

---

## 5. Authorization

- Permissions checked at controller via `@RequirePermission('resource.action')`.
- Scope predicates checked in service layer (e.g., teacher acting only on own classes).
- Super Admin tokens are rejected by tenant routes by default; admin routes accept them.

---

## 6. Request format

- JSON body for `POST/PATCH/PUT`.
- `Content-Type: application/json; charset=utf-8`.
- DTOs use `camelCase` field names in JSON; database columns are `snake_case` and converted in DTOs.
- Dates: ISO 8601 strings (`2026-06-16T08:00:00Z`). Server stores UTC; clients render IST.
- Money: integer minor units (paise) **or** decimal strings — pick one consistently. **Decision: integer paise (INR × 100)** to avoid floating point. DTOs document this.

---

## 7. Response format

Success:
```json
{
  "data": { ... } | [ ... ],
  "meta": { "requestId": "uuid", ...optional pagination... }
}
```

Error:
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Student not found",
    "details": { "id": "..." },
    "requestId": "uuid"
  }
}
```

- `code` is a **stable enum**, machine-readable. UI maps to user-facing copy.
- `message` is a fallback for logs/dev — never display raw to non-English users.
- Validation errors have `code: "VALIDATION_FAILED"` and `details.fields` listing per-field codes.

---

## 8. HTTP status codes

| Code | Meaning                                   | When                                           |
| ---- | ----------------------------------------- | ---------------------------------------------- |
| 200  | OK                                        | Successful read or update                      |
| 201  | Created                                   | Successful POST that creates                   |
| 202  | Accepted                                  | Long-running queued (bulk import, send burst)  |
| 204  | No Content                                | Successful action with no body (rare)          |
| 400  | Bad Request                               | Malformed input not caught by validation       |
| 401  | Unauthorized                              | No / invalid token                             |
| 403  | Forbidden                                 | Authenticated but lacks permission             |
| 404  | Not Found                                 | Resource doesn't exist (or in another tenant)  |
| 409  | Conflict                                  | Optimistic lock failure, duplicate, state issue|
| 410  | Gone                                      | Soft-deleted; explicit "no longer here"        |
| 422  | Unprocessable Entity                      | Validation failed                              |
| 423  | Locked                                    | Resource locked (e.g., closed academic year)   |
| 429  | Too Many Requests                         | Rate limit                                     |
| 500  | Internal Server Error                     | Unexpected; logged + alerted                   |
| 503  | Service Unavailable                       | Maintenance / queue saturated                  |

**Cross-tenant probing returns 404, not 403** (do not leak existence).

---

## 9. Pagination

- Cursor-based for large datasets, offset-based for small/static.
- Default: cursor.

Cursor pagination request:
```
GET /api/v1/students?limit=50&cursor=<opaque>
```

Response:
```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "nextCursor": "...",
      "hasMore": true,
      "limit": 50
    }
  }
}
```

Limits: default 50, max 200. Anything heavier (export) returns `202 Accepted` with a job id.

---

## 10. Filtering, sorting, search

- Filtering: `?filter[status]=active&filter[classId]=...`
- Sorting: `?sort=-createdAt,name` (`-` prefix for descending).
- Search: `?q=...` (full-text on tenant-scoped index).
- Reserved keywords: `limit`, `cursor`, `sort`, `filter`, `q`, `include`.
- `include`: server-side eager joining for known relations: `?include=parents,class`.

---

## 11. Idempotency

- All `POST` that create externally observable side effects (payments, notification dispatches) accept `Idempotency-Key: <uuid>` header.
- Server stores the key + response for 24h; replays return the original response.
- `PUT` is naturally idempotent. `PATCH` is not — clients add `Idempotency-Key` if they care.

---

## 12. Concurrency control

- Resources with optimistic locking carry a `version` column (integer, bumped on every update). It is returned in the response payload so the client can echo it back on the next mutation.
- The wire protocol is the HTTP **`If-Match`** header — the client sends the current row version as `If-Match: "<version>"` (quotes optional). Mutations without `If-Match` return `422 VALIDATION_FAILED` (`IF_MATCH_REQUIRED`); a stale value returns `409 VERSION_CONFLICT` with the current state.
- The expected version is **not** placed in the request body. See `backend/src/core/http/if-match.ts` for the canonical parser used by every PATCH controller. See DECISIONS D-014.

---

## 13. Bulk operations

- Bulk create / update / import endpoints accept up to 1000 items synchronously.
- Beyond that, return `202` and a job id; client polls `/api/v1/jobs/{id}` for progress.
- Validation errors in bulk: per-row error array in response.

---

## 14. Webhooks (inbound, e.g., Razorpay)

- Verify provider signature (HMAC).
- De-dupe on `event_id` (Razorpay) within 7 days.
- Respond 200 fast (< 1s), do work async.
- Idempotent handlers — webhook may replay.
- Audit-logged.

---

## 15. Outbound webhooks (future)

- Tenant can subscribe to events: `student.created`, `payment.captured`, etc.
- Signed with per-tenant secret; retried with exponential backoff up to 24h.
- Out of scope for v1.

---

## 16. Rate limiting

- Per-token: 60 req/min default; 600 req/min for batch endpoints; 5 req/min for password-reset and OTP.
- Per-tenant: configurable cap to prevent one tenant starving others.
- 429 response includes `Retry-After`.

---

## 17. Observability

- Every response includes `X-Request-ID` (UUID, generated if absent in request).
- Logs: structured JSON with `requestId`, `tenantId`, `userId`, `method`, `path`, `status`, `latencyMs`.
- Tracing: OpenTelemetry; tenant id in baggage; trace ID in `traceparent` header.
- Metrics: per-endpoint p50/p95/p99 latency, error rate, RPS, with tenant-id label (top-N exported).

---

## 18. Security headers (responses)

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or CSP frame-ancestors)
- `Content-Security-Policy`: strict, nonce-based for inline scripts.
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: tight defaults.

CORS allowed origins come from a per-environment list. No `*` in production.

---

## 19. File uploads

- Direct-to-S3 with pre-signed URLs:
  1. Client `POST /api/v1/uploads` → server returns signed URL + object key.
  2. Client uploads directly to S3.
  3. Client `POST /api/v1/<resource>` referencing the object key.
- Size limits enforced via signed URL conditions (e.g., 25MB images, 10MB PDFs).
- AV scan job triggered on object creation (S3 event → queue).

---

## 20. Errors — canonical codes

| Code                       | HTTP | Meaning                                        |
| -------------------------- | ---- | ---------------------------------------------- |
| `VALIDATION_FAILED`        | 422  | Field-level validation failed                  |
| `UNAUTHENTICATED`          | 401  | Missing/invalid token                          |
| `INSUFFICIENT_PERMISSIONS` | 403  | Authenticated but no permission                |
| `RESOURCE_NOT_FOUND`       | 404  | Not in this tenant or doesn't exist            |
| `VERSION_CONFLICT`         | 409  | Optimistic lock failure                        |
| `DUPLICATE_RESOURCE`       | 409  | Unique constraint violated                     |
| `STATE_INVALID`            | 409  | Operation not allowed in current state         |
| `LOCKED_RESOURCE`          | 423  | E.g., academic year closed                     |
| `RATE_LIMITED`             | 429  | Slow down                                      |
| `EXTERNAL_PROVIDER_ERROR`  | 502  | Razorpay / SMS provider failed                 |
| `INTERNAL_ERROR`           | 500  | Bug — alerts on-call                           |

UI maps each code to a user-friendly message in each supported language.

---

## 21. Documentation

- Every controller method emits an OpenAPI spec via NestJS Swagger decorators.
- `/api/v1/openapi.json` published behind auth in non-prod, public summary in prod.
- Postman collection generated per release.
- API guide for partners published when needed (post v2).

---

## 22. Anti-patterns

- ❌ Returning raw Prisma errors to clients.
- ❌ 200 with `{"error": ...}` payload.
- ❌ Tenant id in URL when it's already in JWT (redundant + risky).
- ❌ Long-running synchronous endpoints (> 5s).
- ❌ Pagination via `?page=` for unbounded data (offset is O(N) on the database).
- ❌ Returning all rows on `GET /api/v1/students` without pagination.
- ❌ Stateful endpoints (per-user counters) without idempotency keys.
