/**
 * AuthService — login, refresh rotation, logout, logout-all.
 *
 * # Refresh-token rotation algorithm (Sprint 1 §9)
 *
 *   1. Hash the inbound refresh token; SELECT the session row by the hash.
 *   2. If no row → RefreshInvalidError (401, reason `refresh_invalid`).
 *   3. If `revokedAt IS NOT NULL` → REUSE DETECTED. Whoever holds the
 *      already-rotated token is either an attacker or the legitimate
 *      client racing with itself; we treat it as compromise:
 *        - revoke the entire `chainId` (one indexed UPDATE).
 *        - record a `refresh_reused` audit event.
 *        - throw RefreshReusedError so the client knows to re-login.
 *   4. If `expiresAt < now` → RefreshExpiredError.
 *   5. Otherwise rotate inside a single transaction:
 *        - INSERT a new session, parent = old.id, chainId = old.chainId.
 *        - UPDATE the old row: revokedAt = now, replacedBySessionId = new.id.
 *        - Issue a fresh access token bound to the NEW session id.
 *
 * The refresh token is single-use by design: even the legitimate client
 * loses access to the old token the moment it consumes it. Concurrent
 * uses of the same refresh value lose to the unique index on
 * `refresh_token_hash` and trip step (3).
 *
 * # Logout vs logout-all
 *
 *   - logout      → revoke the chain that the access token's `chain_id`
 *                   claim points at (idempotent).
 *   - logout-all  → revoke every active session for the user. Use this
 *                   from "Sign out all devices" + on password change.
 *
 * # W1.4 — Authentication Patch Plan business logic
 *
 *   - Login orchestration accepts both contracts in parallel:
 *       legacy: { schoolId, email }
 *       new:    { tenantSlug, identifier, identifierType }
 *     The service resolves to (schoolId, email) internally. For V1 the only
 *     supported `identifierType` lookup is `email`; `admission_no` is
 *     reserved at the DTO layer but rejected here because the student-login
 *     wave has not landed.
 *   - Failed-login counter + timed lockout use the W1.2 UserRepository
 *     methods and the `auth.lockoutMax*` configuration. A successful login
 *     resets the counter and emits an `account_unlocked` audit if the
 *     account had been locked.
 *   - Remember Me extends the chain's lifetime at login by feeding
 *     `{ rememberMe }` into `RefreshTokenService.generate`. Rotations use
 *     the chain root's `expiresAt` as a ceiling so they cannot outlive the
 *     original chain.
 *   - The login response embeds an `AuthMeDto`-shaped `user` summary so the
 *     client can skip a follow-up `GET /auth/me`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';
import type { PrismaTx } from '../../infra/prisma/types';
import { ConfigService } from '../config';
import { FeatureFlagService } from '../feature-flag/services/feature-flag.service';
import { UnknownFeatureFlagError } from '../feature-flag/feature-flag.errors';
import { RoleRepository } from '../rbac/repositories/role.repository';
import { UserRoleRepository } from '../rbac/repositories/user-role.repository';
import { PermissionService } from '../rbac/services/permission.service';
import { RequestContextRegistry, runInheritedContext } from '../request-context';
import type { ResolvedTenant } from '../request-context';
import type { AuthMeDto } from './auth.dto';
import type { LoginIdentifierType } from './auth.dto';
import {
  InvalidCredentialsError,
  RefreshExpiredError,
  RefreshInvalidError,
  RefreshReusedError,
  TenantNotFoundError,
  UserDisabledError,
} from './auth.errors';
import type { AuthPrincipal, AuthTokenPair, LoginContext } from './auth.types';
import { PasswordService, type Argon2Params } from './password/password.service';
import { LoginEventRepository } from './repositories/login-event.repository';
import { SessionRepository } from './repositories/session.repository';
import {
  UserRepository,
  type UserLoginRow,
} from './repositories/user.repository';
import { AccessTokenService } from './token/access-token.service';
import { RefreshTokenService } from './token/refresh-token.service';

export interface LoginInput {
  /**
   * Legacy contract — supply `schoolId` directly when the caller has
   * already resolved the tenant. When omitted, `tenantSlug` must be
   * provided.
   */
  readonly schoolId?: string;
  /**
   * W1.3 — host-agnostic tenant pointer. Resolved by AuthService to the
   * matching `schoolId` via the platform `school` table.
   */
  readonly tenantSlug?: string;
  /**
   * Legacy contract — supply `email` directly. When omitted,
   * `identifier` + `identifierType` must be provided.
   */
  readonly email?: string;
  /**
   * W1.3 — the identifier the user typed. Paired with `identifierType`.
   * For V1 only `identifierType === 'email'` produces a successful
   * lookup; `admission_no` is reserved.
   */
  readonly identifier?: string;
  readonly identifierType?: LoginIdentifierType;
  readonly password: string;
  /**
   * W1.3 — extends the refresh-chain lifetime at login.
   */
  readonly rememberMe?: boolean;
  /**
   * Patch — host-derived tenant context, stamped by
   * `TenantResolverMiddleware` onto `req.resolvedTenant` and forwarded by
   * the controller. When the body carries neither `schoolId` nor
   * `tenantSlug`, `resolveSchoolId` falls back to this. `admin.schoolos.in`
   * resolves to `{ scope: 'platform' }` and routes the lookup to the
   * platform tenant.
   */
  readonly resolvedTenant?: ResolvedTenant;
  readonly context: LoginContext;
}

/**
 * Slug of the dummy `School` row that owns every `actorScope='global'`
 * user. `users.school_id` is part of the composite PK and cannot be null,
 * so platform admins live under this synthetic tenant. Created by
 * `prisma/seed/platform/demo-users.ts::ensurePlatformSchool`.
 */
const PLATFORM_SCHOOL_SLUG = 'platform';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly loginEvents: LoginEventRepository,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly userRoles: UserRoleRepository,
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  /** Verify credentials, mint a token pair, persist a session row. */
  public async login(input: LoginInput): Promise<AuthTokenPair> {
    const resolved = await this.resolveLoginAddress(input);
    // Auth queries hit TENANT_OWNED tables (User, UserSession, UserLoginEvent)
    // before any tenant is bound to the request context — the login route is
    // `@Public()` and the RequestContextMiddleware leaves `schoolId`
    // unset. Bind it for the remainder of this async chain so the
    // tenant-scope Prisma extension can filter on the resolved tenant
    // instead of throwing TenantContextMissing. Guarded so unit tests that
    // call `login()` outside an HTTP context (no bound ALS frame) still work.
    if (RequestContextRegistry.peek() !== undefined) {
      RequestContextRegistry.upgrade({ schoolId: resolved.schoolId });
    }
    const user = await this.users.findForLoginByIdentifier(
      resolved.schoolId,
      resolved.email,
    );
    if (user === null) {
      await this.recordFailure(resolved, null, 'unknown_user', input.context);
      throw new InvalidCredentialsError();
    }

    const now = new Date();
    if (this.isLockedOut(user, now)) {
      await this.recordFailure(resolved, user.id, 'account_locked', input.context);
      throw new UserDisabledError();
    }

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      await this.handleFailedAttempt(user, resolved, input.context);
      throw new InvalidCredentialsError();
    }

    if (user.status === 'disabled' || user.status === 'locked') {
      await this.recordFailure(
        resolved,
        user.id,
        `user_${user.status}`,
        input.context,
      );
      throw new UserDisabledError();
    }

    // Best-effort hash upgrade. Failure here must NOT block login — if the
    // stored params are old we'll try again next time.
    void this.maybeUpgradeHash(user, input.password).catch((err) => {
      this.logger.warn(`password rehash failed for user ${user.id}: ${(err as Error).message}`);
    });

    const wasLocked = user.failedLoginCount > 0 || user.lockedUntil !== null;
    await this.users.clearFailedAttempts(user.schoolId, user.id).catch((err) => {
      this.logger.warn(
        `clearFailedAttempts failed for user ${user.id}: ${(err as Error).message}`,
      );
    });
    if (wasLocked) {
      await this.loginEvents.record({
        schoolId: user.schoolId,
        userId: user.id,
        eventType: 'account_unlocked',
        reason: 'successful_login',
        identifier: resolved.email,
        ip: input.context.ip,
        userAgent: input.context.userAgent,
      }).catch((err) => {
        this.logger.warn(`account_unlocked record failed: ${(err as Error).message}`);
      });
    }

    const refresh = this.refreshTokens.generate({
      rememberMe: input.rememberMe === true,
    });
    const session = await this.sessions.createForLogin({
      schoolId: user.schoolId,
      userId: user.id,
      refreshTokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
      deviceId: input.context.deviceId,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
    });

    // Load the user's currently-active role IDs and embed them in the
    // JWT. This is the only place RBAC role IDs land in the token —
    // the JWT TTL bounds how long a stale role list can survive.
    const roleIds = await this.userRoles.listActiveRoleIdsForUser({
      schoolId: user.schoolId,
      userId: user.id,
    });

    const access = await this.accessTokens.sign({
      userId: user.id,
      schoolId: user.actorScope === 'global' ? null : user.schoolId,
      actorScope: user.actorScope,
      roleIds,
      sessionId: session.id,
      chainId: session.chainId,
    });

    await this.users.markLogin(user.schoolId, user.id, now).catch(() => {
      // markLogin failure is non-fatal — the session row already exists.
    });
    await this.loginEvents.record({
      schoolId: user.schoolId,
      userId: user.id,
      eventType: 'login_success',
      identifier: resolved.email,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
    });

    const me = await this.buildAuthMe({
      user,
      sessionId: session.id,
      roleIds,
    });

    return toTokenPair(
      access.token,
      access.expiresAt,
      refresh.token,
      refresh.expiresAt,
      // Sprint 14.1 — surface the temp-password / reset flag so the client
      // can route into a forced password-change flow on first login.
      user.mustChangePassword,
      me,
    );
  }

  /**
   * Rotate a refresh token. Atomic: both the old session's `revokedAt` and
   * the new session's INSERT happen inside one transaction so a crash
   * between them cannot leave the chain in a half-rotated state.
   */
  public async refresh(args: {
    refreshToken: string;
    context: LoginContext;
  }): Promise<AuthTokenPair> {
    if (!this.refreshTokens.isWellFormed(args.refreshToken)) {
      throw new RefreshInvalidError();
    }
    const tokenHash = this.refreshTokens.hash(args.refreshToken);

    // The @Public() /auth/refresh route reaches us with `actorScope:
    // 'public'` and no bound `schoolId`. UserSession is TENANT_OWNED, so
    // the very first lookup would trip tenantScopeExt. Discover the
    // tenant from the token using the existing tenantScopeExt bypass
    // marker (see prisma/types.ts QueryAnnotations), then bind a tenant
    // context for the remainder of the rotation. This is the smallest
    // additive change that lets the rest of the body run unchanged — no
    // repository signature change, no extension change.
    const discoveredSchoolId = await this.discoverSessionTenant(tokenHash);
    if (discoveredSchoolId === null) {
      throw new RefreshInvalidError();
    }

    return runInheritedContext(
      { schoolId: discoveredSchoolId, actorScope: 'tenant' },
      () => this.refreshInBoundContext(tokenHash, args.context),
    ) as Promise<AuthTokenPair>;
  }

  /**
   * Look up the `schoolId` that owns a session by its refresh-token hash
   * WITHOUT a bound tenant context. Uses `$queryRaw` because Prisma 6
   * strips unknown top-level args (including `__schoolosCtx`) before the
   * extension chain runs, so the documented bypass marker never reaches
   * `tenantScopeExt`. Raw queries skip the model-operation extensions
   * entirely, which is exactly what we need for cross-tenant discovery.
   * Returns `null` when no session matches — the caller maps that to
   * `RefreshInvalidError`.
   */
  private async discoverSessionTenant(
    tokenHash: string,
  ): Promise<string | null> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{ school_id: string }>
    >`SELECT school_id FROM user_sessions WHERE refresh_token_hash = ${tokenHash} LIMIT 1`;
    return rows[0]?.school_id ?? null;
  }

  private async refreshInBoundContext(
    tokenHash: string,
    context: LoginContext,
  ): Promise<AuthTokenPair> {
    return this.prisma.transaction(async (tx) => {
      const txTyped = tx as unknown as PrismaTx;
      const existing = await this.sessions.findByTokenHash(tokenHash, txTyped);
      if (existing === null) {
        throw new RefreshInvalidError();
      }

      // Reuse detection — a revoked row being presented again is the
      // single most reliable signal of token compromise we have.
      if (existing.revokedAt !== null) {
        await this.handleReuse(existing, context, txTyped);
        throw new RefreshReusedError();
      }

      const now = new Date();
      if (existing.expiresAt.getTime() <= now.getTime()) {
        await this.sessions.revokeOne(
          { schoolId: existing.schoolId, sessionId: existing.id, reason: 'admin', at: now },
          txTyped,
        );
        throw new RefreshExpiredError();
      }

      const user = await this.users.findActiveById(existing.schoolId, existing.userId);
      if (user === null || user.status === 'disabled' || user.status === 'locked') {
        await this.sessions.revokeChain(
          { chainId: existing.chainId, reason: 'admin', at: now },
          txTyped,
        );
        throw new RefreshInvalidError();
      }

      // W1.4 — chain expiry preservation. The chain root's `expiresAt`
      // is the absolute deadline set at login (Remember Me-aware). The
      // rotation TTL is clamped to that ceiling so a long-running chain
      // never extends past its original lifetime.
      const chainRoot = await this.sessions.findChainRoot(existing.chainId, txTyped);
      const chainCeiling = chainRoot?.expiresAt ?? existing.expiresAt;

      const refresh = this.refreshTokens.generate({
        chainExpiresAt: chainCeiling,
      });
      const next = await this.sessions.createForRotation(
        {
          schoolId: existing.schoolId,
          userId: existing.userId,
          refreshTokenHash: refresh.tokenHash,
          expiresAt: refresh.expiresAt,
          chainId: existing.chainId,
          parentSessionId: existing.id,
          deviceId: context.deviceId ?? existing.deviceId ?? undefined,
          ip: context.ip ?? existing.ip ?? undefined,
          userAgent: context.userAgent ?? existing.userAgent ?? undefined,
        },
        txTyped,
      );
      await this.sessions.markRotated(
        {
          schoolId: existing.schoolId,
          sessionId: existing.id,
          replacedBySessionId: next.id,
          at: now,
        },
        txTyped,
      );

      // Refresh the role-id list on rotation — a role grant change since
      // the previous access token will be reflected in the new one.
      const roleIds = await this.userRoles.listActiveRoleIdsForUser(
        { schoolId: existing.schoolId, userId: existing.userId },
        txTyped,
      );

      const access = await this.accessTokens.sign({
        userId: user.id,
        schoolId: user.actorScope === 'global' ? null : user.schoolId,
        actorScope: user.actorScope,
        roleIds,
        sessionId: next.id,
        chainId: next.chainId,
      });

      await this.loginEvents.record(
        {
          schoolId: existing.schoolId,
          userId: existing.userId,
          eventType: 'refresh_rotated',
          ip: context.ip,
          userAgent: context.userAgent,
        },
        txTyped,
      );

      return toTokenPair(
        access.token,
        access.expiresAt,
        refresh.token,
        refresh.expiresAt,
        // Refresh path: the user is already authenticated and the trust
        // boundary lives in the existing access token. We don't reload the
        // flag here — defaulting to false keeps the response shape stable
        // while staying additive (Sprint 14.1 contract).
        false,
      );
    });
  }

  /** Revoke the chain a single principal currently belongs to. */
  public async logout(principal: AuthPrincipal, context: LoginContext): Promise<void> {
    const now = new Date();
    await this.sessions.revokeChain({
      chainId: principal.chainId,
      reason: 'logout',
      at: now,
    });
    await this.loginEvents.record({
      schoolId: principal.schoolId ?? '',
      userId: principal.userId,
      eventType: 'logout',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** Revoke every active session for a user — "sign out everywhere". */
  public async logoutAll(principal: AuthPrincipal, context: LoginContext): Promise<number> {
    const now = new Date();
    const schoolId = principal.schoolId;
    if (schoolId === null) {
      // Global users — we still scope by schoolId because the column is
      // non-null. Look up the user's stored schoolId for the revoke.
      throw new Error('logoutAll for global users requires schoolId resolution (not Sprint 1).');
    }
    const count = await this.sessions.revokeAllForUser({
      schoolId,
      userId: principal.userId,
      reason: 'logout_all',
      at: now,
    });
    await this.loginEvents.record({
      schoolId,
      userId: principal.userId,
      eventType: 'logout',
      reason: 'logout_all',
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return count;
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  /**
   * Resolve a `LoginInput` into the `(schoolId, email)` pair the user
   * lookup needs. Honours both the legacy (`schoolId` + `email`) contract
   * and the W1.3 (`tenantSlug` + `identifier` + `identifierType`) contract.
   *
   * The error wording stays generic (`InvalidCredentialsError`) so a
   * malformed-request attacker can't distinguish "wrong tenant" from
   * "wrong password".
   */
  private async resolveLoginAddress(
    input: LoginInput,
  ): Promise<{ schoolId: string; email: string }> {
    const identifierType: LoginIdentifierType =
      input.identifierType ?? (input.identifier !== undefined ? 'email' : 'email');

    // V1 — only the email lookup branch is wired. The `admission_no`
    // branch is accepted at the DTO layer but rejected here until the
    // student-login wave lands. We map to InvalidCredentialsError to
    // keep the wire response indistinguishable from "bad password".
    if (identifierType !== 'email') {
      throw new InvalidCredentialsError();
    }

    const rawEmail = input.identifier ?? input.email;
    if (rawEmail === undefined || rawEmail.trim().length === 0) {
      throw new InvalidCredentialsError();
    }
    const email = normaliseEmail(rawEmail);

    const schoolId = await this.resolveSchoolId(input);
    return { schoolId, email };
  }

  private async resolveSchoolId(input: LoginInput): Promise<string> {
    if (input.schoolId !== undefined && input.schoolId.length > 0) {
      return input.schoolId;
    }
    if (input.tenantSlug !== undefined && input.tenantSlug.length > 0) {
      return this.lookupSchoolIdBySlug(input.tenantSlug);
    }
    // Host-derived fallback. `TenantResolverMiddleware` produces:
    //   admin.schoolos.in        → scope='platform'  → look up the synthetic
    //                              `platform` tenant that owns global users.
    //   <slug>.schoolos.in / app → scope='tenant'    → use the resolved
    //                              `schoolId` directly.
    // Anything else (scope='public') falls through to the existing
    // TenantNotFoundError so a misconfigured caller still sees the same
    // generic failure.
    const resolved = input.resolvedTenant;
    if (resolved !== undefined) {
      if (resolved.scope === 'tenant' && resolved.schoolId !== undefined) {
        return resolved.schoolId;
      }
      if (resolved.scope === 'platform') {
        return this.lookupSchoolIdBySlug(PLATFORM_SCHOOL_SLUG);
      }
    }
    throw new TenantNotFoundError();
  }

  private async lookupSchoolIdBySlug(slug: string): Promise<string> {
    const row = await this.prisma.client.school.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    if (row === null) {
      throw new TenantNotFoundError();
    }
    return row.id;
  }

  private isLockedOut(user: UserLoginRow, now: Date): boolean {
    if (user.lockedUntil === null) {
      return false;
    }
    return user.lockedUntil.getTime() > now.getTime();
  }

  /**
   * Increment the failed-attempt counter and, if the threshold has been
   * crossed, stamp `lockedUntil` for `auth.lockoutDurationSeconds`. Audit
   * trail uses the `account_locked` event type added in W1.2.
   *
   * Failures inside this helper are swallowed and logged — a write
   * failure here must not turn a 401 into a 500.
   */
  private async handleFailedAttempt(
    user: UserLoginRow,
    resolved: { schoolId: string; email: string },
    context: LoginContext,
  ): Promise<void> {
    let nextCount: number | null = null;
    try {
      nextCount = await this.users.incrementFailedAttempts(user.schoolId, user.id);
    } catch (err) {
      this.logger.warn(
        `incrementFailedAttempts failed for user ${user.id}: ${(err as Error).message}`,
      );
    }

    await this.loginEvents.record({
      schoolId: resolved.schoolId,
      userId: user.id,
      eventType: 'login_failure',
      reason: 'invalid_password',
      identifier: resolved.email,
      ip: context.ip,
      userAgent: context.userAgent,
    }).catch((err) => {
      this.logger.warn(`login_failure record failed: ${(err as Error).message}`);
    });

    if (nextCount === null) {
      return;
    }
    const max = this.config.auth.lockoutMaxAttempts;
    if (nextCount < max) {
      return;
    }
    const durationMs = this.config.auth.lockoutDurationSeconds * 1000;
    const lockedUntil = new Date(Date.now() + durationMs);
    try {
      await this.users.applyLockUntil(user.schoolId, user.id, lockedUntil);
    } catch (err) {
      this.logger.warn(
        `applyLockUntil failed for user ${user.id}: ${(err as Error).message}`,
      );
      return;
    }
    await this.loginEvents.record({
      schoolId: resolved.schoolId,
      userId: user.id,
      eventType: 'account_locked',
      reason: `failed_attempts=${nextCount}`,
      identifier: resolved.email,
      ip: context.ip,
      userAgent: context.userAgent,
    }).catch((err) => {
      this.logger.warn(`account_locked record failed: ${(err as Error).message}`);
    });
  }

  /**
   * `GET /auth/me` shape — reuses the same enrichment helpers as
   * `buildAuthMe` (role keys, permissions, school summary, feature flags)
   * but sources its base 5 fields from the JWT principal rather than a
   * freshly-loaded user row. `displayName`, `email`, and
   * `mustChangePassword` are intentionally absent here: they require a
   * user-row lookup the UserRepository does not currently expose for the
   * principal-only path (no `findById` that returns the W1.3 detail
   * columns), so they remain login-response-only until that repository
   * method lands. Clients that need those fields should rely on the
   * `user` summary embedded in the login response (W1.4).
   */
  public async describeMe(principal: AuthPrincipal): Promise<AuthMeDto> {
    const baseSchoolId =
      principal.actorScope === 'global' ? null : principal.schoolId;
    const roleIds = principal.roleIds;

    const [roles, permissions, school, featureFlags] = await Promise.all([
      this.loadRoleKeys(roleIds),
      this.loadPermissions(roleIds),
      baseSchoolId === null
        ? Promise.resolve(null)
        : this.loadSchoolSummary(baseSchoolId),
      this.loadFeatureFlags(baseSchoolId),
    ]);

    const me: AuthMeDto = {
      userId: principal.userId,
      schoolId: baseSchoolId,
      actorScope: principal.actorScope,
      roleIds,
      sessionId: principal.sessionId,
      roles,
      permissions,
      ...(school !== null
        ? {
            schoolSlug: school.slug,
            locale: school.locale,
            timezone: school.timezone,
          }
        : {}),
      featureFlags,
    };
    return me;
  }

  /**
   * Build the `AuthMeDto`-shaped principal summary embedded in the login
   * response. Role keys + permissions + feature flags + school
   * slug/locale/timezone are populated here so the client can skip a
   * follow-up `GET /auth/me`.
   *
   * Each enrichment is best-effort: a failure to load (e.g.) feature
   * flags should not turn a successful login into a 500. The base 5
   * required fields are always populated.
   */
  private async buildAuthMe(args: {
    user: UserLoginRow;
    sessionId: string;
    roleIds: readonly string[];
  }): Promise<AuthMeDto> {
    const { user, sessionId, roleIds } = args;
    const baseSchoolId = user.actorScope === 'global' ? null : user.schoolId;

    const [roles, permissions, school, featureFlags] = await Promise.all([
      this.loadRoleKeys(roleIds),
      this.loadPermissions(roleIds),
      baseSchoolId === null ? Promise.resolve(null) : this.loadSchoolSummary(baseSchoolId),
      this.loadFeatureFlags(baseSchoolId),
    ]);

    const me: AuthMeDto = {
      userId: user.id,
      schoolId: baseSchoolId,
      actorScope: user.actorScope,
      roleIds,
      sessionId,
      displayName: user.displayName,
      email: user.email,
      roles,
      permissions,
      ...(school !== null
        ? {
            schoolSlug: school.slug,
            locale: school.locale,
            timezone: school.timezone,
          }
        : {}),
      mustChangePassword: user.mustChangePassword,
      featureFlags,
    };
    return me;
  }

  private async loadRoleKeys(
    roleIds: readonly string[],
  ): Promise<readonly string[]> {
    if (roleIds.length === 0) {
      return [];
    }
    try {
      const rows = await this.roles.findManyByIds(roleIds);
      return rows.map((r) => r.key);
    } catch (err) {
      this.logger.warn(`loadRoleKeys failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async loadPermissions(
    roleIds: readonly string[],
  ): Promise<readonly string[]> {
    if (roleIds.length === 0) {
      return [];
    }
    try {
      return await this.permissions.resolveForRoles(roleIds);
    } catch (err) {
      this.logger.warn(`loadPermissions failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async loadSchoolSummary(
    schoolId: string,
  ): Promise<{ slug: string; locale: string; timezone: string } | null> {
    try {
      const row = await this.prisma.client.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: { slug: true, localeDefault: true, timezone: true },
      });
      if (row === null) {
        return null;
      }
      return {
        slug: row.slug,
        locale: row.localeDefault,
        timezone: row.timezone,
      };
    } catch (err) {
      this.logger.warn(`loadSchoolSummary failed for ${schoolId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Resolve effective feature flags for the login context. Iterates the
   * code-side registry — a flag absent from the registry has no client-
   * visible effect anyway. Unknown-flag errors are tolerated so a stale
   * registry entry without a DB row doesn't break login.
   */
  private async loadFeatureFlags(
    schoolId: string | null,
  ): Promise<Readonly<Record<string, boolean>>> {
    const keys = this.featureFlags.knownKeys();
    if (keys.length === 0) {
      return {};
    }
    const result: Record<string, boolean> = {};
    await Promise.all(
      keys.map(async (key) => {
        try {
          const evaluation = await this.featureFlags.evaluate(key, { schoolId });
          result[key] = evaluation.value;
        } catch (err) {
          if (err instanceof UnknownFeatureFlagError) {
            return;
          }
          this.logger.warn(
            `feature-flag evaluation failed for "${key}": ${(err as Error).message}`,
          );
        }
      }),
    );
    return result;
  }

  private async handleReuse(
    existing: { schoolId: string; userId: string; chainId: string },
    context: LoginContext,
    tx: PrismaTx,
  ): Promise<void> {
    const now = new Date();
    const revoked = await this.sessions.revokeChain(
      { chainId: existing.chainId, reason: 'reuse_detected', at: now },
      tx,
    );
    await this.loginEvents.record(
      {
        schoolId: existing.schoolId,
        userId: existing.userId,
        eventType: 'refresh_reused',
        reason: `chain_revoked=${revoked}`,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      tx,
    );
    this.logger.warn(
      `refresh reuse detected school=${existing.schoolId} user=${existing.userId} chain=${existing.chainId} revoked=${revoked}`,
    );
  }

  private async recordFailure(
    resolved: { schoolId: string; email: string },
    userId: string | null,
    reason: string,
    context: LoginContext,
  ): Promise<void> {
    await this.loginEvents.record({
      schoolId: resolved.schoolId,
      userId,
      eventType: 'login_failure',
      reason,
      identifier: resolved.email,
      ip: context.ip,
      userAgent: context.userAgent,
    }).catch((err) => {
      // Audit-log failures must never bubble up to the caller — they
      // would change a "wrong password" 401 into a 500.
      this.logger.warn(`login_failure record failed: ${(err as Error).message}`);
    });
  }

  private async maybeUpgradeHash(
    user: { id: string; schoolId: string; passwordParams: Record<string, unknown>; passwordPepperVersion: number },
    cleartextPassword: string,
  ): Promise<void> {
    const params = coerceArgon2Params(user.passwordParams);
    if (!this.passwords.needsRehash({ params, pepperVersion: user.passwordPepperVersion })) {
      return;
    }
    const fresh = await this.passwords.hash(cleartextPassword);
    await this.users.upgradePasswordHash({
      schoolId: user.schoolId,
      userId: user.id,
      passwordHash: fresh.passwordHash,
      paramsJson: { ...fresh.params },
      pepperVersion: fresh.pepperVersion,
    });
  }
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

function toTokenPair(
  accessToken: string,
  accessExpiresAt: Date,
  refreshToken: string,
  refreshExpiresAt: Date,
  mustChangePassword: boolean,
  user?: AuthMeDto,
): AuthTokenPair {
  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    tokenType: 'Bearer',
    mustChangePassword,
    ...(user !== undefined ? { user } : {}),
  };
}

function coerceArgon2Params(value: Record<string, unknown>): Argon2Params {
  const memoryCost = typeof value.memoryCost === 'number' ? value.memoryCost : 0;
  const timeCost = typeof value.timeCost === 'number' ? value.timeCost : 0;
  const parallelism = typeof value.parallelism === 'number' ? value.parallelism : 0;
  return { type: 'argon2id', memoryCost, timeCost, parallelism };
}
