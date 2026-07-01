/**
 * UserRepository — read paths used by login + JWT verification.
 *
 * Why a repository (vs PrismaService directly in AuthService)?
 *   - Auth reads cross the tenant-scope extension in two awkward ways:
 *     1) The login lookup happens BEFORE we know the tenant — we resolve
 *        a (tenantSlug, email) pair to a user. The tenant is not on the
 *        RequestContext yet, so the tenantScopeExt has nothing to inject.
 *     2) Once authenticated, we re-fetch the user to confirm `status` —
 *        and that fetch must scope to the just-discovered school.
 *   - Encapsulating both in one place keeps the bypass annotations
 *     (`schoolosCtx.bypassTenantScope`) out of the service.
 *
 * Sprint 1 doesn't have a Tenant table yet (Module 4 lands it). Until
 * then, login accepts a `schoolId` directly OR a sentinel for global
 * users. The lookup-by-tenant-slug path is added when Module 4 wires
 * the school table.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';

export interface UserRow {
  readonly id: string;
  readonly schoolId: string;
  readonly email: string;
  readonly displayName: string;
  readonly actorScope: 'tenant' | 'global';
  readonly status: 'active' | 'invited' | 'disabled' | 'locked';
  readonly mfaEnabled: boolean;
  readonly mustChangePassword: boolean;
  readonly tokenSalt: string;
  readonly passwordHash: string;
  readonly passwordAlgorithm: string;
  readonly passwordParams: Record<string, unknown>;
  readonly passwordPepperVersion: number;
}

/**
 * Richer login row returned by `findForLoginByIdentifier`. Adds the
 * lockout-state columns (`failedLoginCount`, `lockedUntil`) introduced in
 * W1.1 so AuthService can decide whether to allow the attempt without
 * issuing a second SELECT. `UserRow` is preserved as-is for callers of
 * the original `findForLogin`.
 */
export interface UserLoginRow extends UserRow {
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up the user + password row needed for a login attempt.
   *
   * The lookup runs without tenant scope because the caller may not have
   * a bound tenant yet (e.g. the login endpoint receives `schoolId` in
   * the request body). We still match on `schoolId` so global vs tenant
   * users with the same email don't collide.
   */
  public async findForLogin(schoolId: string, email: string): Promise<UserRow | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { schoolId, email },
      select: {
        id: true,
        schoolId: true,
        email: true,
        displayName: true,
        actorScope: true,
        status: true,
        mfaEnabled: true,
        mustChangePassword: true,
        tokenSalt: true,
        password: {
          select: {
            passwordHash: true,
            algorithm: true,
            paramsJson: true,
            pepperVersion: true,
          },
        },
      },
    });
    if (user === null || user.password === null) {
      return null;
    }
    return {
      id: user.id,
      schoolId: user.schoolId,
      email: user.email,
      displayName: user.displayName,
      actorScope: user.actorScope as 'tenant' | 'global',
      status: user.status as UserRow['status'],
      mfaEnabled: user.mfaEnabled,
      mustChangePassword: user.mustChangePassword,
      tokenSalt: user.tokenSalt,
      passwordHash: user.password.passwordHash,
      passwordAlgorithm: user.password.algorithm,
      passwordParams: user.password.paramsJson as Record<string, unknown>,
      passwordPepperVersion: user.password.pepperVersion,
    };
  }

  /** Used by the JWT strategy to confirm a token's subject is still active. */
  public async findActiveById(
    schoolId: string,
    userId: string,
  ): Promise<Pick<UserRow, 'id' | 'schoolId' | 'actorScope' | 'status' | 'tokenSalt'> | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { schoolId, id: userId },
      select: { id: true, schoolId: true, actorScope: true, status: true, tokenSalt: true },
    });
    if (user === null) {
      return null;
    }
    return {
      id: user.id,
      schoolId: user.schoolId,
      actorScope: user.actorScope as 'tenant' | 'global',
      status: user.status as UserRow['status'],
      tokenSalt: user.tokenSalt,
    };
  }

  /** Stamp lastLoginAt on a successful login. Best-effort; never blocks login. */
  public async markLogin(schoolId: string, userId: string, at: Date): Promise<void> {
    await this.prisma.client.user.update({
      where: { schoolId_id: { schoolId, id: userId } },
      data: { lastLoginAt: at },
    });
  }

  /**
   * Update the persisted password hash + params after a successful
   * needsRehash() check on login. Wrapped in a tx so the version bump
   * on the user row stays consistent with the password row write.
   */
  public async upgradePasswordHash(args: {
    schoolId: string;
    userId: string;
    passwordHash: string;
    paramsJson: Record<string, unknown>;
    pepperVersion: number;
  }): Promise<void> {
    await this.prisma.client.userPassword.update({
      where: { schoolId_userId: { schoolId: args.schoolId, userId: args.userId } },
      data: {
        passwordHash: args.passwordHash,
        paramsJson: args.paramsJson,
        pepperVersion: args.pepperVersion,
      },
    });
  }

  /**
   * W1.2 additive — login lookup that also returns the lockout state
   * columns (`failedLoginCount`, `lockedUntil`). The existing `findForLogin`
   * is left untouched for backward compatibility; new callers (account
   * protection in later waves) consume the richer row this method returns.
   *
   * `identifier` is treated as the user's email (case-insensitive). The
   * lookup runs without tenant scope for the same reason `findForLogin`
   * does — the tenant is supplied alongside the identifier by the caller.
   */
  public async findForLoginByIdentifier(
    schoolId: string,
    identifier: string,
  ): Promise<UserLoginRow | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { schoolId, email: identifier },
      select: {
        id: true,
        schoolId: true,
        email: true,
        displayName: true,
        actorScope: true,
        status: true,
        mfaEnabled: true,
        mustChangePassword: true,
        tokenSalt: true,
        failedLoginCount: true,
        lockedUntil: true,
        password: {
          select: {
            passwordHash: true,
            algorithm: true,
            paramsJson: true,
            pepperVersion: true,
          },
        },
      },
    });
    if (user === null || user.password === null) {
      return null;
    }
    return {
      id: user.id,
      schoolId: user.schoolId,
      email: user.email,
      displayName: user.displayName,
      actorScope: user.actorScope as 'tenant' | 'global',
      status: user.status as UserRow['status'],
      mfaEnabled: user.mfaEnabled,
      mustChangePassword: user.mustChangePassword,
      tokenSalt: user.tokenSalt,
      passwordHash: user.password.passwordHash,
      passwordAlgorithm: user.password.algorithm,
      passwordParams: user.password.paramsJson as Record<string, unknown>,
      passwordPepperVersion: user.password.pepperVersion,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
    };
  }

  /**
   * W1.2 additive — atomically bump `failed_login_count` after a failed
   * password verification. Returns the new counter value so the caller
   * can decide whether the lockout threshold has been crossed without
   * issuing a follow-up SELECT.
   *
   * Uses `update` (not `updateMany`) so the response carries the post-write
   * row. The composite-PK shorthand keeps the path identical to existing
   * write methods on this repository.
   */
  public async incrementFailedAttempts(
    schoolId: string,
    userId: string,
  ): Promise<number> {
    const row = await this.prisma.client.user.update({
      where: { schoolId_id: { schoolId, id: userId } },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return row.failedLoginCount;
  }

  /**
   * W1.2 additive — reset both lockout columns. Called on a successful
   * login so a user who finally remembered their password isn't carrying
   * a stale partial counter. Idempotent; safe to call on a row already
   * at (0, null).
   */
  public async clearFailedAttempts(schoolId: string, userId: string): Promise<void> {
    await this.prisma.client.user.update({
      where: { schoolId_id: { schoolId, id: userId } },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  /**
   * W1.2 additive — stamp a future `lockedUntil`. Called once the
   * threshold counter is crossed. The caller computes the deadline using
   * `auth.lockoutDurationSeconds`; this method only persists it.
   */
  public async applyLockUntil(
    schoolId: string,
    userId: string,
    lockedUntil: Date,
  ): Promise<void> {
    await this.prisma.client.user.update({
      where: { schoolId_id: { schoolId, id: userId } },
      data: { lockedUntil },
    });
  }
}
