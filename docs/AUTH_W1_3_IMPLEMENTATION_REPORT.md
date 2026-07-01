# Wave W1.3 — Authentication DTO Layer (Implementation Report)

**Plan reference:** `docs/AUTHENTICATION_PATCH_PLAN.md` (Rev 3.1)
**Wave scope:** DTO layer only — `LoginDto`, `AuthTokensDto`, `AuthMeDto`. No
controller, service, guard, middleware, repository, or RBAC changes. No
business logic; cross-field gating ("either schoolId+email OR tenantSlug+
identifier") is deferred to a later wave.
**Date:** 2026-06-28

## 1. Scope Confirmation

W1.3 is strictly additive at the validator layer of three DTOs:

- `LoginDto` learns the host-agnostic login contract (`tenantSlug`,
  `identifier`, `identifierType`, `rememberMe`).
- `AuthMeDto` learns the richer introspection shape that later waves will
  populate (`displayName`, `email`, `roles`, `permissions`, `schoolSlug`,
  `locale`, `timezone`, `mustChangePassword`, `featureFlags`).
- `AuthTokensDto` learns an optional nested `user: AuthMeDto` so the login
  response can short-circuit the follow-up `/auth/me` round trip — when a
  later wave decides to populate it.

No controller, service, guard, middleware, RBAC, feature-flag, or
repository code was touched.

## 2. Files Modified

| Path | Change |
|------|--------|
| `backend/src/core/auth/auth.dto.ts` | Extended `LoginDto`, `AuthMeDto`, `AuthTokensDto` with the W1.3 additive fields. Added shared `SLUG_PATTERN` and `LoginIdentifierType` token list. Imports updated to include `IsBoolean`, `IsIn`, `IsObject`, `Matches`, `ValidateNested`, `Type`. |

## 3. Files Created

None. All changes are additive edits to the existing DTO file.

## 4. Files NOT Modified (per scope guard)

- `backend/src/core/auth/auth.controller.ts` — unchanged. The 5-field
  `AuthMeDto` literal it builds for `GET /auth/me` and the
  `AuthTokenPair → AuthTokensDto` return path on `POST /auth/login` still
  satisfy both DTOs because every new field is optional.
- `backend/src/core/auth/auth.service.ts` — unchanged. `LoginInput`
  continues to read `schoolId` and `email` as `string`; the DTO keeps the
  declared TypeScript types as `string!` so call sites compile verbatim.
- `backend/src/core/auth/auth.types.ts` — unchanged. `AuthTokenPair` does
  not declare a `user` field; that is fine because `AuthTokensDto.user`
  is `@IsOptional()`.
- `backend/src/core/auth/token/*`, `backend/src/core/auth/repositories/*`,
  `backend/src/core/auth/password/*`, `core/request-context/**`,
  `core/feature-flag/**`, `core/rbac/**` — all untouched.
- `backend/prisma/schema/**` — no schema or migration touched.

## 5. DTOs Modified

### `LoginDto`

Existing fields:

| Field | TS type | Previous validation | W1.3 validation |
|-------|---------|---------------------|-----------------|
| `schoolId` | `string` | `@IsUUID()` | `@IsOptional()` + `@IsUUID()` — declared TS type unchanged. |
| `email` | `string` | `@IsEmail()` + `@MaxLength(255)` + `@Transform(trim)` | `@IsOptional()` added; rest unchanged. |
| `password` | `string` | `@IsString()` + `@IsNotEmpty()` + `@MinLength(8)` + `@MaxLength(256)` | Unchanged — still required. |
| `deviceId` | `string?` | `@IsOptional()` + `@IsString()` + `@MaxLength(64)` | Unchanged. |

New W1.3 fields (all `@IsOptional()`):

| Field | TS type | Validators |
|-------|---------|------------|
| `tenantSlug` | `string?` | `@IsString()` + `@MaxLength(100)` + `@Matches(SLUG_PATTERN)` (shared with TenantResolverService). |
| `identifier` | `string?` | `@Transform(trim)` + `@IsString()` + `@IsNotEmpty()` + `@MaxLength(255)`. |
| `identifierType` | `'email' \| 'username' \| 'phone'` (optional) | `@IsIn(LOGIN_IDENTIFIER_TYPES)`. |
| `rememberMe` | `boolean?` | `@IsBoolean()`. |

`LOGIN_IDENTIFIER_TYPES` is exported so later waves (and integration
tests) can refer to the list without redeclaring it.

### `AuthMeDto`

Existing fields kept as-required:

- `userId: string` — `@ApiProperty({ format: 'uuid' })`.
- `schoolId: string | null` — `@ApiProperty({ format: 'uuid', nullable: true })`.
- `actorScope: 'tenant' | 'global'` — `@ApiProperty({ enum: [...] })`.
- `roleIds: readonly string[]` — RBAC role UUIDs (legacy field; description clarifies relationship to the new `roles` key list).
- `sessionId: string`.

New W1.3 fields (all `@ApiPropertyOptional()`):

| Field | TS type | Notes |
|-------|---------|-------|
| `displayName` | `string?` | Human-readable display name. |
| `email` | `string?` | Primary email — `format: 'email'`. |
| `roles` | `readonly string[]?` | Role *keys* (e.g. `school_admin`). Distinct from `roleIds` (UUIDs). |
| `permissions` | `readonly string[]?` | Flattened permission keys. |
| `schoolSlug` | `string?` | Mirrors `schoolId` in human-readable form. |
| `locale` | `string?` | BCP-47 tag. |
| `timezone` | `string?` | IANA zone. |
| `mustChangePassword` | `boolean?` | Forced password change flag (default `false`). |
| `featureFlags` | `Readonly<Record<string, boolean>>?` | `{ key: enabled }` map; empty until the feature-flag wave wires this in. |

### `AuthTokensDto`

Existing fields kept verbatim:

- `accessToken`, `accessTokenExpiresAt`, `refreshToken`,
  `refreshTokenExpiresAt`, `tokenType`, `mustChangePassword`.

New W1.3 field:

| Field | TS type | Validators |
|-------|---------|------------|
| `user` | `AuthMeDto?` | `@IsOptional()` + `@IsObject()` + `@ValidateNested()` + `@Type(() => AuthMeDto)`. |

When the existing service path returns an `AuthTokenPair` (no `user` key),
the omission is valid because `user` is optional. A later wave can
populate it without further DTO changes.

## 6. Validation Changes

The global `ValidationPipe` is configured with `whitelist: true` (strips
unknown properties) and `forbidNonWhitelisted: false`. W1.3 fields are
covered by the existing pipeline; no pipe configuration was touched.

Notable validator decisions:

1. **`schoolId` + `email` now carry `@IsOptional()`.** This is a
   class-validator–level relaxation only. The TypeScript declared types
   stay `string!` so existing controller and service code compiles
   unchanged (`auth.controller.ts` reads `body.schoolId` and `body.email`
   as `string`; `auth.service.ts:LoginInput` declares `schoolId: string`
   and `email: string`). At runtime the values may now arrive as
   `undefined` when the caller is using the new
   `tenantSlug + identifier` contract — which is fine because
   AuthService is the layer that decides whether *some* tenant +
   identifier combination has been supplied. That cross-field gate is
   business logic, deferred per plan.

2. **`identifier` uses `@Transform(trim)`** like `email` does — leading/
   trailing whitespace in an identifier is almost always a paste artefact.
   Passwords are still not trimmed (per existing DTO header rationale).

3. **`tenantSlug` validation reuses the slug pattern
   `^[a-z0-9][a-z0-9-]{0,99}$`** — same regex as the existing
   `TenantResolverService`. The DTO header explicitly notes this must
   stay in sync; centralising the regex is left to a later wave.

4. **`identifierType` is constrained to a literal token list via
   `@IsIn(LOGIN_IDENTIFIER_TYPES)`** rather than a free string. The
   service chooses the lookup branch based on this token.

5. **`AuthTokensDto.user` uses nested validation** (`@ValidateNested` +
   `@Type(() => AuthMeDto)`) so that *if* a caller ever supplies the
   field, its inner shape is checked. The field's own optionality
   means omitting it remains valid.

6. **No required field was relaxed or removed.** Every change is either
   adding an `@IsOptional()` to a previously-mandatory field (for
   forward-compat with the new contract) or adding a brand-new optional
   field.

## 7. Backward Compatibility Verification

| Surface | Compile check | Notes |
|---------|---------------|-------|
| `auth.controller.ts:POST /login` | Returns `LoginResult` (alias for `AuthTokensDto`) built from `AuthTokenPair`. | Compiles unchanged because the only DTO field added to the response shape is `user?: AuthMeDto`, which is optional. |
| `auth.controller.ts:GET /me` | Builds an `AuthMeDto` literal with 5 fields (`userId`, `schoolId`, `actorScope`, `roleIds`, `sessionId`). | Compiles unchanged because every new W1.3 field on `AuthMeDto` is optional. |
| `auth.service.ts:login()` | Reads `input.schoolId` and `input.email` as `string`. | Compiles unchanged — DTO TS types remained `string!` despite the new validator-level `@IsOptional()`. |
| `auth.service.ts:LoginInput` | Declares `schoolId: string; email: string;`. | Unchanged. The DTO's runtime relaxation does not propagate into the service contract; this remains a wave-W1.4+ concern. |
| `refresh-token.service.spec.ts` | Unrelated to DTOs. | Unchanged. |

## 8. Verification Results

| Step | Command | Result |
|------|---------|--------|
| Prisma client | `npx prisma generate` | OK — `Generated Prisma Client (v6.19.3)`. One transient `EPERM` rename error on the first attempt caused by a stale `start:dev` watcher holding `query_engine-windows.dll.node`; killing the stale process and re-running succeeded. |
| TypeScript | `npx tsc --noEmit` | 0 errors in W1.3 surface. Two pre-existing errors (`test/sprint14/helpers.ts:122`, `test/sprint4_5/branch.e2e-spec.ts:65`) persist; both pre-date W1.1 and are out of scope per `docs/AUTH_W1_2_IMPLEMENTATION_REPORT.md` §9. |
| Build | `npm run build` | `nest build` completes with 0 errors. |
| Boot | `npm run start:dev` | `Nest application successfully started`, `listening on http://127.0.0.1:3000`. No DI errors; no DTO-related runtime warnings. |

### Boot transcript (relevant lines)

```
[10:12:58 am] Found 0 errors. Watching for file changes.
[bootstrap] schoolos-api@0.1.0 listening on http://127.0.0.1:3000
INFO: Nest application successfully started   {"context":"NestApplication"}
```

## 9. Issues Encountered

| # | Issue | Resolution |
|---|-------|------------|
| 1 | `prisma generate` failed with `EPERM: operation not permitted, rename ... query_engine-windows.dll.node.tmp...`. | Caused by a stale `nest start --watch` process from W1.2 verification still holding the engine DLL on Windows. Killed the watcher via `taskkill /F /PID <pid>`, re-ran `npx prisma generate` — succeeded. Not a W1.3-code issue. |
| 2 | First two `start:dev` attempts ended with `EADDRINUSE` on port 3000 because earlier watcher processes were still bound. | `netstat -ano \| grep :3000` to find the holder, `taskkill /F /PID <pid>`, retry. The third attempt produced a clean boot. The W1.3 DTO changes compiled cleanly on all three attempts (`Found 0 errors`); only port contention prevented the listen step. |
| 3 | DTO redesign risk: making `schoolId` / `email` truly TypeScript-optional would break the existing controller/service signature, which the wave forbids. | Resolved by applying `@IsOptional()` at the class-validator decorator layer only, while keeping the TypeScript declared types as `string!`. Controllers and services compile and execute unchanged; the runtime values may now be `undefined` but that is AuthService's gating concern in a later wave. |
| 4 | Pre-existing tsc errors in `test/sprint14/helpers.ts:122` and `test/sprint4_5/branch.e2e-spec.ts:65`. | Out of W1.3 scope; flagged in §8 — these are a known carry-over from W1.1. |

## 10. Stop Point

W1.3 implementation complete. **Not** continuing to W1.4.
