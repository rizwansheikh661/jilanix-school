/**
 * PasswordResetService — owns the password-reset and first-login flows.
 *
 * Public surface:
 *   - request({ schoolId, email, ip?, userAgent?, triggeredByUserId? })
 *       Issues a single-use reset token. Always returns a stable shape
 *       (no "user not found" leak) so the request endpoint is safe to
 *       expose anonymously to the internet.
 *
 *   - confirm({ token, newPassword, ip?, userAgent? })
 *       Consumes a reset token, rotates the password hash, and revokes
 *       every active session for the user (forcing a re-login on all
 *       devices). Cancels sibling outstanding tokens.
 *
 *   - firstLoginChange({ userId, schoolId, currentPassword, newPassword })
 *       Authenticated path used right after provisioning when the seeded
 *       admin must rotate the temporary password. Verifies the current
 *       password, clears `must_change_password`, revokes other sessions.
 *
 * Token format:
 *   We mint a cryptographically random 32-byte token (URL-safe base64,
 *   ~43 chars) and persist only sha256(token) as `tokenHash`. Cleartext
 *   travels exactly once — back to the caller of `request()` — and is
 *   then handed to the email worker via the outbox payload.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { PasswordService } from '../../auth/password/password.service';
import { SessionRepository } from '../../auth/repositories/session.repository';
import { UnauthenticatedError, ValidationFailedError } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { runInheritedContext } from '../../request-context';
import { ProvisioningOutboxTopics } from '../provisioning.constants';
import {
  PasswordResetNotRequiredError,
  PasswordResetTokenInvalidError,
} from '../provisioning.errors';
import { PasswordResetRepository } from './password-reset.repository';

/** Reset link is valid for 1 hour after issue. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** 32 random bytes → base64url ~43 chars. */
export const PASSWORD_RESET_TOKEN_BYTES = 32;
/** Minimum password length enforced on confirm + first-login. */
export const PASSWORD_MIN_LENGTH = 12;

export interface RequestPasswordResetInput {
  readonly schoolId: string;
  readonly email: string;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly triggeredByUserId?: string;
  /**
   * Sprint 17 — optional override for the token TTL. Defaults to
   * `PASSWORD_RESET_TOKEN_TTL_MS` (1 hour). The Parent Portal invitation
   * flow passes 7 days; we deliberately allow per-call overrides rather
   * than introducing a second method so token issuance stays single-source.
   */
  readonly ttlMs?: number;
}

export interface RequestPasswordResetResult {
  /** Always "accepted" — we never reveal whether the email matches. */
  readonly accepted: true;
  /**
   * Cleartext token for the email worker. Only present when a user matched;
   * the controller MUST NOT echo this back over the API surface — it is
   * consumed by the outbox handler that sends the reset email.
   */
  readonly clearTextToken?: string;
  readonly tokenExpiresAt?: string;
  readonly userId?: string;
}

export interface ConfirmPasswordResetInput {
  readonly token: string;
  readonly newPassword: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface FirstLoginChangeInput {
  readonly schoolId: string;
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PasswordResetRepository,
    private readonly sessions: SessionRepository,
    private readonly passwords: PasswordService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async request(input: RequestPasswordResetInput): Promise<RequestPasswordResetResult> {
    this.assertNonEmpty('email', input.email);

    // The @Public() /auth/password-reset/request route reaches us with
    // `actorScope: 'public'` and no bound `schoolId`. Every read/write
    // below targets TENANT_OWNED tables. The schoolId is already known
    // from the request payload — bind it for the rest of this async chain
    // so tenantScopeExt can filter instead of throwing.
    return runInheritedContext(
      { schoolId: input.schoolId, actorScope: 'tenant' },
      () => this.requestInBoundContext(input),
    ) as Promise<RequestPasswordResetResult>;
  }

  private async requestInBoundContext(
    input: RequestPasswordResetInput,
  ): Promise<RequestPasswordResetResult> {
    // Look up the user with a tenant-scope bypass (we already know schoolId
    // and the caller may be anonymous → no RequestContext.schoolId).
    const user = await this.prisma.client.user.findFirst({
      where: { schoolId: input.schoolId, email: input.email, status: { not: 'disabled' } },
      select: { id: true, schoolId: true, status: true },
    });

    if (user === null) {
      // Constant-time sleep keeps the timing channel narrow: do a dummy
      // sha256 to mimic the per-request work the success path performs.
      this.dummyHashWork();
      this.logger.debug(
        `Password reset requested for unknown email (schoolId=${input.schoolId}) — silently accepted.`,
      );
      return { accepted: true };
    }

    const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = sha256Hex(token);
    const now = new Date();
    const ttl = input.ttlMs ?? PASSWORD_RESET_TOKEN_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttl);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      // Cancel any outstanding (un-consumed) tokens — only one live token
      // per user at a time.
      await this.repo.cancelOutstandingForUser(user.schoolId, user.id, now, tx);
      await this.repo.create(
        {
          schoolId: user.schoolId,
          userId: user.id,
          tokenHash,
          expiresAt,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          createdBy: input.triggeredByUserId ?? null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED,
        eventType: 'PasswordResetRequested',
        aggregateType: 'User',
        aggregateId: user.id,
        schoolId: user.schoolId,
        payload: {
          userId: user.id,
          schoolId: user.schoolId,
          email: input.email,
          token, // worker uses this to compose the email link
          expiresAt: expiresAt.toISOString(),
        },
      });

      await this.audit.record(
        {
          action: 'auth.password_reset.request',
          category: 'security',
          resourceType: 'User',
          resourceId: user.id,
          schoolId: user.schoolId,
          after: { userId: user.id, expiresAt: expiresAt.toISOString() },
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });

    return {
      accepted: true,
      clearTextToken: token,
      tokenExpiresAt: expiresAt.toISOString(),
      userId: user.id,
    };
  }

  public async confirm(input: ConfirmPasswordResetInput): Promise<void> {
    this.assertPassword(input.newPassword);
    if (input.token.length === 0) {
      throw new PasswordResetTokenInvalidError();
    }
    const tokenHash = sha256Hex(input.token);

    // The @Public() /auth/password-reset/confirm route reaches us with
    // `actorScope: 'public'` and no bound `schoolId`. Discover the
    // owning tenant from the token using the tenantScopeExt bypass marker
    // (documented in prisma/types.ts), then bind a tenant context for the
    // remainder of the rotation so tenant-scoped reads/writes succeed
    // without redesigning the repository surface.
    const discoveredSchoolId = await this.discoverResetTenant(tokenHash);
    if (discoveredSchoolId === null) {
      throw new PasswordResetTokenInvalidError();
    }

    await runInheritedContext(
      { schoolId: discoveredSchoolId, actorScope: 'tenant' },
      () => this.confirmInBoundContext(tokenHash, input),
    );
  }

  private async discoverResetTenant(
    tokenHash: string,
  ): Promise<string | null> {
    // Prisma 6 strips unknown top-level args (including `__schoolosCtx`)
    // before the extension chain runs, so the documented bypass marker is
    // not honored on model-level operations. Use `$queryRaw` for this
    // one-shot tenant-discovery read; raw queries skip the model
    // extensions entirely, which is exactly the bypass we need.
    const rows = await this.prisma.client.$queryRaw<
      Array<{ school_id: string }>
    >`SELECT school_id FROM password_reset_requests WHERE token_hash = ${tokenHash} LIMIT 1`;
    return rows[0]?.school_id ?? null;
  }

  private async confirmInBoundContext(
    tokenHash: string,
    input: ConfirmPasswordResetInput,
  ): Promise<void> {
    const row = await this.repo.findByTokenHash(tokenHash);
    if (row === null || !isTokenUsable(row)) {
      throw new PasswordResetTokenInvalidError();
    }

    const now = new Date();
    const hash = await this.passwords.hash(input.newPassword);

    // Snapshot the user's pre-confirm flag so the outbox event below can
    // tell first-login completion apart from a routine password reset.
    const userBefore = await this.prisma.client.user.findUnique({
      where: { schoolId_id: { schoolId: row.schoolId, id: row.userId } },
      select: { mustChangePassword: true, email: true },
    });
    const wasFirstLogin = userBefore?.mustChangePassword === true;

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      // Mark this token consumed.
      await this.repo.markConsumed(row.schoolId, row.id, now, tx);

      // Cancel any sibling outstanding tokens for hygiene.
      await this.repo.cancelOutstandingForUser(row.schoolId, row.userId, now, tx);

      // Rotate password hash.
      await tx.userPassword.update({
        where: { schoolId_userId: { schoolId: row.schoolId, userId: row.userId } },
        data: {
          passwordHash: hash.passwordHash,
          algorithm: hash.algorithm,
          paramsJson: hash.params as unknown as never,
          pepperVersion: hash.pepperVersion,
        },
      });

      // Clear must-change flag, bump tokenSalt, stamp password change time.
      await tx.user.update({
        where: { schoolId_id: { schoolId: row.schoolId, id: row.userId } },
        data: {
          mustChangePassword: false,
          passwordResetRequiredAt: null,
          passwordChangedAt: now,
          tokenSalt: randomBytes(12).toString('hex'),
        },
      });

      // Revoke every active session — the user must re-authenticate everywhere.
      await this.sessions.revokeAllForUser(
        { schoolId: row.schoolId, userId: row.userId, reason: 'password_changed', at: now },
        tx,
      );

      await this.audit.record(
        {
          action: 'auth.password_reset.confirm',
          category: 'security',
          resourceType: 'User',
          resourceId: row.userId,
          schoolId: row.schoolId,
          after: { userId: row.userId, consumedAt: now.toISOString() },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      // Sprint 17 — generic first-login activation hook. Downstream
      // modules (ParentActivationOutboxHandler, future StaffActivation)
      // listen on this topic to flip their per-domain lifecycle rows.
      if (wasFirstLogin) {
        await this.outbox.publish(tx, {
          topic: ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED,
          eventType: 'PasswordFirstLoginCompleted',
          aggregateType: 'User',
          aggregateId: row.userId,
          schoolId: row.schoolId,
          payload: {
            userId: row.userId,
            schoolId: row.schoolId,
            email: userBefore?.email ?? null,
            completedAt: now.toISOString(),
          },
        });
      }
    });
    this.logger.log(
      `Password reset consumed userId=${row.userId} schoolId=${row.schoolId}.`,
    );
  }

  public async firstLoginChange(input: FirstLoginChangeInput): Promise<void> {
    this.assertPassword(input.newPassword);

    const user = await this.prisma.client.user.findFirst({
      where: { schoolId: input.schoolId, id: input.userId },
      select: {
        id: true,
        schoolId: true,
        mustChangePassword: true,
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
      throw new UnauthenticatedError('Invalid credentials');
    }
    if (!user.mustChangePassword) {
      throw new PasswordResetNotRequiredError(input.userId);
    }
    const ok = await this.passwords.verify(user.password.passwordHash, input.currentPassword);
    if (!ok) {
      throw new UnauthenticatedError('Invalid credentials');
    }

    const now = new Date();
    const hash = await this.passwords.hash(input.newPassword);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      await tx.userPassword.update({
        where: { schoolId_userId: { schoolId: user.schoolId, userId: user.id } },
        data: {
          passwordHash: hash.passwordHash,
          algorithm: hash.algorithm,
          paramsJson: hash.params as unknown as never,
          pepperVersion: hash.pepperVersion,
        },
      });
      await tx.user.update({
        where: { schoolId_id: { schoolId: user.schoolId, id: user.id } },
        data: {
          mustChangePassword: false,
          passwordResetRequiredAt: null,
          passwordChangedAt: now,
          tokenSalt: randomBytes(12).toString('hex'),
        },
      });
      // Drop sibling sessions so the new password takes effect on every device.
      await this.sessions.revokeAllForUser(
        { schoolId: user.schoolId, userId: user.id, reason: 'password_changed', at: now },
        tx,
      );
      // Cancel any in-flight reset tokens too.
      await this.repo.cancelOutstandingForUser(user.schoolId, user.id, now, tx);

      await this.audit.record(
        {
          action: 'auth.first_login.change_password',
          category: 'security',
          resourceType: 'User',
          resourceId: user.id,
          schoolId: user.schoolId,
          after: { userId: user.id, passwordChangedAt: now.toISOString() },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      // Sprint 17 — generic activation hook (same payload shape as the
      // confirm() path). Downstream handlers cannot distinguish between
      // reset-link redemption and authenticated first-login change — both
      // are "first password rotation by this user".
      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED,
        eventType: 'PasswordFirstLoginCompleted',
        aggregateType: 'User',
        aggregateId: user.id,
        schoolId: user.schoolId,
        payload: {
          userId: user.id,
          schoolId: user.schoolId,
          completedAt: now.toISOString(),
        },
      });
    });
    this.logger.log(
      `First-login password change completed userId=${user.id} schoolId=${user.schoolId}.`,
    );
  }

  // ------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------

  private assertNonEmpty(path: string, value: string): void {
    if (value.trim().length === 0) {
      throw new ValidationFailedError(
        [{ path, code: 'REQUIRED', message: `${path} is required.` }],
        'Validation failed',
      );
    }
  }

  private assertPassword(value: string): void {
    if (value.length < PASSWORD_MIN_LENGTH) {
      throw new ValidationFailedError(
        [
          {
            path: 'newPassword',
            code: 'TOO_SHORT',
            message: `Password must be at least ${PASSWORD_MIN_LENGTH.toString()} characters.`,
          },
        ],
        'Validation failed',
      );
    }
  }

  /**
   * Constant-time decoy hash to keep the unknown-email and known-email
   * code paths within a similar latency band. We don't try to match argon2
   * timing — just hash and discard, which is enough to defeat naive
   * timing oracles.
   */
  private dummyHashWork(): void {
    const buf = randomBytes(32);
    const decoy = sha256Hex(buf.toString('base64url'));
    // Touch the result so V8 doesn't dead-code-eliminate the hash.
    void timingSafeEqual(Buffer.from(decoy.slice(0, 32)), Buffer.from(decoy.slice(0, 32)));
  }
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function isTokenUsable(row: {
  consumedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
}): boolean {
  if (row.consumedAt !== null) return false;
  if (row.cancelledAt !== null) return false;
  return row.expiresAt.getTime() > Date.now();
}
