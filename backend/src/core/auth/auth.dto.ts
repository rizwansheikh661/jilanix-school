/**
 * Auth DTOs — request bodies and response shapes for the auth endpoints.
 *
 * Validation rules use class-validator; the global ValidationPipe
 * (with `whitelist: true`) strips unknown properties so a misbehaving
 * client cannot smuggle extra fields.
 *
 * Strings are trimmed where it matters; password is *not* trimmed —
 * leading/trailing whitespace in passwords is significant and quietly
 * stripping it would silently change a user's secret.
 *
 * W1.3 — Authentication Patch Plan additive fields:
 *   LoginDto      : tenantSlug, identifier, identifierType, rememberMe.
 *   AuthTokensDto : nested `user` summary (typed as AuthMeDto).
 *   AuthMeDto     : displayName, email, roles, permissions, schoolSlug,
 *                   locale, timezone, mustChangePassword, featureFlags.
 *
 * Every new field is `@IsOptional()` and additive. Existing fields keep
 * their TypeScript declared types (so `auth.controller.ts` and
 * `auth.service.ts` compile unchanged) — the underlying validators are
 * relaxed where the new contract requires it. Cross-field gating
 * ("either schoolId+email OR tenantSlug+identifier") is business logic
 * and lives in AuthService in a later wave, not here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Slug pattern shared with TenantResolverService — keep in sync. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

/**
 * Discriminator for the new `identifier` field. The DTO only validates
 * that the value is one of these tokens; AuthService decides which
 * lookup path to take.
 *
 * V1 (Sprint 1 / School ERP launch contract):
 *   - `email`         — staff and parents log in by email.
 *   - `admission_no`  — students log in by admission number (validation-
 *                       allowed in V1; the AuthService lookup path is
 *                       not implemented yet — see W1.4 report §4).
 *
 * Future (documented only — NOT validated in V1):
 *   - `student_id`    — internal student UUID, primarily for SSO bridges
 *                       and admin tooling.
 *   - `roll_number`   — class-level identifier; resolved against a
 *                       (school, academic_year, class) tuple, so adding
 *                       it requires a richer login payload than V1 carries.
 *
 * Adding a future value here must:
 *   1. Update LOGIN_IDENTIFIER_TYPES below.
 *   2. Wire a matching lookup branch in AuthService.
 *   3. Document the input semantics on the LoginDto.identifier field.
 */
export type LoginIdentifierType = 'email' | 'admission_no';

const LOGIN_IDENTIFIER_TYPES: readonly LoginIdentifierType[] = [
  'email',
  'admission_no',
];

export class LoginDto {
  /**
   * Legacy contract: school (tenant) UUID. Marked `@IsOptional()` from
   * W1.3 onwards so the new `tenantSlug` path can supersede it without
   * forcing both fields on the client. AuthService still requires *some*
   * way to resolve a tenant; that check is business logic.
   */
  @ApiPropertyOptional({ description: 'School (tenant) the user belongs to. Legacy field — supersedable by tenantSlug.', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly schoolId!: string;

  /**
   * Legacy contract: email. Marked `@IsOptional()` from W1.3 onwards so
   * the new `identifier` path can supply the same value with a
   * `identifierType`. AuthService rejects empty-identifier attempts at
   * the business layer.
   */
  @ApiPropertyOptional({ description: 'Email — case-insensitive, trimmed. Legacy field — supersedable by identifier/identifierType.' })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  public readonly email!: string;

  @ApiProperty({ description: 'User password.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(256)
  public readonly password!: string;

  @ApiPropertyOptional({ required: false, description: 'Stable per-device id; helps "this is a new device" detection.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  public readonly deviceId?: string;

  // ----------------------------------------------------------------------
  // W1.3 additive — Authentication Patch Plan login contract.
  // ----------------------------------------------------------------------

  /**
   * Tenant slug (e.g. `acme`). Used by the host-agnostic login path:
   * the client posts `tenantSlug + identifier + identifierType` instead
   * of `schoolId + email`. AuthService resolves the slug to a schoolId
   * via the same path TenantResolverService uses.
   */
  @ApiPropertyOptional({
    description: 'Tenant slug (alternative to schoolId). Lower-case alphanumeric + dashes; max 100 chars.',
    example: 'acme',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG_PATTERN, {
    message: 'tenantSlug must be lower-case alphanumeric/dash and start with a letter or digit.',
  })
  public readonly tenantSlug?: string;

  /**
   * The identifier the user typed — email or admission number (V1).
   * Paired with `identifierType` so AuthService picks the correct
   * UserRepository lookup. Trimmed; case-folded by the service when the
   * type is `email`. Future identifier types (`student_id`, `roll_number`)
   * are documented on `LoginIdentifierType` but not yet accepted.
   */
  @ApiPropertyOptional({
    description: 'Login identifier (email or admission number). Paired with identifierType.',
    example: 'jdoe@example.com',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  public readonly identifier?: string;

  /**
   * Discriminator for `identifier`. Validation only checks the value is
   * one of the supported tokens; the lookup branch is AuthService's
   * decision.
   */
  @ApiPropertyOptional({
    description: 'Type of `identifier` — drives which user-lookup path AuthService takes.',
    enum: LOGIN_IDENTIFIER_TYPES,
  })
  @IsOptional()
  @IsIn(LOGIN_IDENTIFIER_TYPES)
  public readonly identifierType?: LoginIdentifierType;

  /**
   * When `true` the issued refresh token uses the longer Remember-Me TTL
   * (`auth.refreshTtlRememberMeSeconds`). Defaults to `false` at the
   * service layer when omitted. The DTO only carries the flag.
   */
  @ApiPropertyOptional({
    description: '"Remember me" — extends the refresh-token TTL when true.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  public readonly rememberMe?: boolean;
}

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token returned from /login or the previous /refresh.' })
  @IsString()
  @Length(30, 64)
  public readonly refreshToken!: string;
}

/**
 * W1.3 — `AuthMeDto` carries the introspection shape returned from
 * `GET /auth/me` and is also reused as the type of the nested `user`
 * field on `AuthTokensDto`. All W1.3-added fields are optional so the
 * existing controller (which constructs a 5-field literal) and the
 * existing service path (which returns `AuthTokenPair` with no `user`
 * key) continue to compile unchanged. Population of the new fields is
 * deferred to later waves.
 */
export class AuthMeDto {
  @ApiProperty({ format: 'uuid' })
  public readonly userId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  public readonly schoolId!: string | null;

  @ApiProperty({ enum: ['tenant', 'global'] })
  public readonly actorScope!: 'tenant' | 'global';

  @ApiProperty({ type: [String], description: 'RBAC role UUIDs (legacy field — keep using `roles` for role keys).' })
  public readonly roleIds!: readonly string[];

  @ApiProperty()
  public readonly sessionId!: string;

  // ----------------------------------------------------------------------
  // W1.3 additive — populated by later waves; absent on the legacy path.
  // ----------------------------------------------------------------------

  @ApiPropertyOptional({ description: 'Human-readable display name.' })
  public readonly displayName?: string;

  @ApiPropertyOptional({ description: 'Primary email address.', format: 'email' })
  public readonly email?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Role *keys* (e.g. `school_admin`, `auditor`). Distinct from `roleIds` (UUIDs).',
  })
  public readonly roles?: readonly string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Flattened permission keys the principal currently has.',
  })
  public readonly permissions?: readonly string[];

  @ApiPropertyOptional({ description: 'School slug — mirrors `schoolId` in human-readable form.' })
  public readonly schoolSlug?: string;

  @ApiPropertyOptional({ description: 'BCP-47 locale tag (e.g. `en-IN`).' })
  public readonly locale?: string;

  @ApiPropertyOptional({ description: 'IANA timezone (e.g. `Asia/Kolkata`).' })
  public readonly timezone?: string;

  @ApiPropertyOptional({
    description: 'When true the user must complete a forced password change before any other action.',
    default: false,
  })
  public readonly mustChangePassword?: boolean;

  @ApiPropertyOptional({
    description:
      'Effective feature flags for this principal as a `{ key: enabled }` map. Empty until the feature-flag wave wires this in.',
    type: 'object',
    additionalProperties: { type: 'boolean' },
  })
  public readonly featureFlags?: Readonly<Record<string, boolean>>;
}

export class AuthTokensDto {
  @ApiProperty()
  public readonly accessToken!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly accessTokenExpiresAt!: string;

  @ApiProperty()
  public readonly refreshToken!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly refreshTokenExpiresAt!: string;

  @ApiProperty({ enum: ['Bearer'] })
  public readonly tokenType!: 'Bearer';

  @ApiProperty({
    description:
      'When true the user must complete a forced password change before any other action. ' +
      'Defaults to false on the refresh path.',
    default: false,
  })
  public readonly mustChangePassword!: boolean;

  /**
   * W1.3 additive — login response now optionally embeds the same shape
   * as `GET /auth/me`. Allows the client to skip a follow-up `/me` round
   * trip after authentication. `AuthService` (in a later wave) populates
   * this; the existing service path returns no `user`, which remains
   * valid because the field is optional.
   */
  @ApiPropertyOptional({ type: () => AuthMeDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMeDto)
  public readonly user?: AuthMeDto;
}

/**
 * Re-exported so consumers (later waves, integration tests) can refer to
 * the array of valid `identifierType` discriminators without redeclaring
 * it. Treat as read-only.
 */
export { LOGIN_IDENTIFIER_TYPES };
