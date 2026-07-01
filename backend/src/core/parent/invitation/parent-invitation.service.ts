/**
 * ParentInvitationService — Sprint 17 W4.
 *
 * Orchestrates the entire admin-invites-a-parent flow inside one
 * transaction:
 *
 *   1. Verify the target Parent row exists.
 *   2. Reuse the existing alive ParentUser row if the (parent, user)
 *      pair already exists — admins may "re-invite" without us creating
 *      duplicates. Otherwise:
 *        - Create the underlying User { status='invited',
 *          mustChangePassword=true, passwordResetRequiredAt=now }.
 *        - Seed an unusable UserPassword row (random argon2id hash) so
 *          login fails until the parent rotates via the reset link.
 *        - Insert ParentUser in `PENDING_INVITE` with `invitedAt`.
 *        - Seed NotificationUserPreference with channelPush + emergency
 *          override defaults (Prisma column defaults handle the latter,
 *          but we create the row explicitly so future per-user logic has
 *          something to read).
 *   3. Issue a 7-day password-reset token via the existing
 *      `PasswordResetService.request({ ttlMs })` so the redeem path
 *      reuses `POST /auth/password-reset/confirm`.
 *   4. Publish `parent.invited` (or `parent.reinvited` on resend) with
 *      the activation URL + expiry so the email worker can fan out.
 *   5. Audit `parent_user.invite` (security category).
 *
 * Because step 3 opens its own transaction in `PasswordResetService`,
 * the invite is split across TWO transactions: the row creation +
 * outbox publish in this service's tx, then the reset-token issuance.
 * Failure of the second step leaves a PENDING_INVITE row with no token —
 * the admin can resend to recover.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { PasswordService } from '../../auth/password/password.service';
import { NotFoundError, ValidationFailedError, VersionConflict } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  PasswordResetService,
} from '../../provisioning/password-reset/password-reset.service';
import { RequestContextRegistry } from '../../request-context';
import {
  PARENT_INVITE_TOKEN_TTL_MS,
  ParentOutboxTopics,
} from '../parent.constants';
import type { ParentRelationValue, ParentUserRow } from '../parent.types';
import { ParentUserService } from '../parent-user/parent-user.service';
import { ParentRepository } from '../repositories/parent.repository';

export interface InviteParentArgs {
  readonly parentId: string;
  readonly email: string;
  readonly displayName: string;
  readonly relation: ParentRelationValue;
  readonly locale?: string;
  /**
   * Optional URL template the email worker will substitute the token into.
   * The service does NOT format the link itself — it persists the raw
   * `{tokenPlaceholder, expiresAt}` pair on the outbox payload.
   */
  readonly activationLinkBase?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface InviteParentResult {
  readonly parentUser: ParentUserRow;
  readonly userId: string;
  readonly inviteExpiresAt: Date;
  /**
   * Cleartext reset token. Surfaces only to the outbox handler that ships
   * the email — must NOT be echoed back over the controller response.
   */
  readonly activationToken: string;
}

@Injectable()
export class ParentInvitationService {
  private readonly logger = new Logger(ParentInvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parentRepo: ParentRepository,
    private readonly parentUsers: ParentUserService,
    private readonly passwords: PasswordService,
    private readonly passwordReset: PasswordResetService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async invite(args: InviteParentArgs): Promise<InviteParentResult> {
    const { schoolId, userId: actorUserId } = this.requireTenant();
    const email = args.email.trim().toLowerCase();
    if (email === '') {
      throw new ValidationFailedError(
        [{ path: 'email', code: 'REQUIRED', message: 'email is required.' }],
        'Validation failed',
      );
    }

    const parent = await this.parentRepo.findById(args.parentId);
    if (parent === null) {
      throw new NotFoundError('Parent', args.parentId);
    }

    const now = new Date();

    // Single tx that does the User + UserPassword + ParentUser +
    // NotificationUserPreference + parent.invited writes.
    const stage = await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const existingUser = await tx.user.findFirst({
        where: { schoolId, email },
        select: { id: true, status: true },
      });

      let userId: string;
      let isNewUser = false;
      if (existingUser !== null) {
        userId = existingUser.id;
      } else {
        userId = randomUUID();
        await tx.user.create({
          data: {
            id: userId,
            schoolId,
            email,
            displayName: args.displayName,
            actorScope: 'tenant',
            status: 'invited',
            mustChangePassword: true,
            passwordResetRequiredAt: now,
            tokenSalt: randomUUID().replaceAll('-', '').slice(0, 24),
            ...(args.locale !== undefined ? { locale: args.locale } : {}),
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          } as never,
        });

        // Seed an UNUSABLE password — a real argon2 hash over a random
        // 32-byte secret no one will ever know. Forces the parent down
        // the reset-token path before login can succeed.
        const seed = randomBytes(32).toString('base64url');
        const hash = await this.passwords.hash(seed);
        await tx.userPassword.create({
          data: {
            id: randomUUID(),
            schoolId,
            userId,
            passwordHash: hash.passwordHash,
            algorithm: hash.algorithm,
            paramsJson: hash.params as unknown as never,
            pepperVersion: hash.pepperVersion,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          } as never,
        });
        isNewUser = true;
      }

      // Look up any existing ParentUser for this (parent, user) tuple —
      // strict-unique on (school_id, parent_id, user_id) means at most
      // one row, alive or otherwise.
      const existingLink = await tx.parentUser.findFirst({
        where: { schoolId, parentId: args.parentId, userId },
      });

      let parentUser: ParentUserRow;
      let resend = false;
      if (existingLink !== null) {
        // Resend path — bump lastInviteAt. The FSM allows PENDING_INVITE
        // → PENDING_INVITE only; anything else is a state error.
        if (existingLink.status !== 'PENDING_INVITE') {
          // A live ACTIVE / SUSPENDED / ARCHIVED row exists; the admin
          // is asking to re-invite, which is meaningless. Surface as
          // ValidationFailedError so the controller renders 422.
          throw new ValidationFailedError(
            [
              {
                path: 'email',
                code: 'PARENT_USER_ALREADY_LINKED',
                message: `User is already linked to this parent (status=${String(existingLink.status)}). Archive first if you need to re-invite.`,
              },
            ],
            'Parent user already linked',
          );
        }
        parentUser = await this.parentUsers.markReinvited(
          existingLink.id,
          existingLink.version,
          now,
          tx,
        );
        resend = true;
      } else {
        parentUser = await this.parentUsers.createInvited(
          {
            parentId: args.parentId,
            userId,
            relation: args.relation,
            invitedAt: now,
            lastInviteAt: now,
          },
          tx,
        );
      }

      // Ensure the user has a NotificationUserPreference row so the
      // parent-portal screen lands on defaults from day one. The DB
      // defaults handle channelPush + emergencyOverride; we just provide
      // the required columns explicitly.
      if (isNewUser) {
        await tx.notificationUserPreference.create({
          data: {
            schoolId,
            userId,
            channelEmail: true,
            channelSms: true,
            channelWhatsapp: true,
            channelInApp: true,
            // channelPush and emergencyOverride default to true via the
            // hand-written migration; no need to set them here.
            categoryOptOuts: undefined as unknown as never,
            quietHoursStart: '21:00:00',
            quietHoursEnd: '07:00:00',
            quietHoursTimezone: 'Asia/Kolkata',
            locale: args.locale ?? 'en-IN',
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          } as never,
        });
      }

      await this.audit.record(
        {
          action: 'parent_user.invite',
          category: 'security',
          resourceType: 'ParentUser',
          resourceId: parentUser.id,
          schoolId,
          after: {
            parentUserId: parentUser.id,
            parentId: args.parentId,
            userId,
            email,
            resend,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return { userId, parentUser, resend };
    });

    // 2nd transaction: issue the reset token. We deliberately do this
    // OUTSIDE the parent tx so PasswordResetService keeps its single
    // "always a clean reset tx" guarantee. If issuance fails the admin
    // resends to recover; the PENDING_INVITE row already exists.
    const resetResult = await this.passwordReset.request({
      schoolId,
      email,
      ttlMs: PARENT_INVITE_TOKEN_TTL_MS, // 7d, not the 1h default.
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
      ...(actorUserId !== undefined ? { triggeredByUserId: actorUserId } : {}),
    });
    if (resetResult.clearTextToken === undefined || resetResult.tokenExpiresAt === undefined) {
      // PasswordResetService swallows "user not found" silently. Should
      // never happen here because we created the user moments ago.
      throw new Error(
        `PasswordResetService.request did not issue a token for userId=${stage.userId}`,
      );
    }
    const expiresAt = new Date(resetResult.tokenExpiresAt);

    // Outside-tx outbox publish. We open a tiny tx purely so
    // OutboxPublisherService has a tx handle.
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const topic = stage.resend
        ? ParentOutboxTopics.REINVITED
        : ParentOutboxTopics.INVITED;
      await this.outbox.publish(tx, {
        topic,
        eventType: stage.resend ? 'ParentReinvited' : 'ParentInvited',
        aggregateType: 'ParentUser',
        aggregateId: stage.parentUser.id,
        schoolId,
        payload: {
          parentUserId: stage.parentUser.id,
          parentId: args.parentId,
          userId: stage.userId,
          relation: args.relation,
          email,
          displayName: args.displayName,
          activationToken: resetResult.clearTextToken,
          activationLinkBase: args.activationLinkBase ?? null,
          expiresAt: expiresAt.toISOString(),
          inviteTtlMs: PARENT_INVITE_TOKEN_TTL_MS,
          // For diagnostic comparison against the 1h default.
          defaultResetTtlMs: PASSWORD_RESET_TOKEN_TTL_MS,
        },
      });
    });

    this.logger.log(
      `Parent invitation ${stage.resend ? 'resent' : 'sent'} parentUserId=${stage.parentUser.id} userId=${stage.userId} schoolId=${schoolId}.`,
    );

    return {
      parentUser: stage.parentUser,
      userId: stage.userId,
      inviteExpiresAt: expiresAt,
      activationToken: resetResult.clearTextToken,
    };
  }

  /**
   * Resend the invitation email for an existing PENDING_INVITE ParentUser.
   *
   * Resolves the underlying User row to recover the email + display name +
   * locale, then re-enters `invite()` which already implements the
   * "PENDING_INVITE → PENDING_INVITE" re-invite branch atomically.
   *
   * The `expectedVersion` is checked against the current ParentUser row
   * up-front so a stale admin request fails fast with `VERSION_CONFLICT`
   * before any side effects.
   */
  public async resendInvite(args: {
    readonly parentId: string;
    readonly parentUserId: string;
    readonly expectedVersion: number;
    readonly ip?: string;
    readonly userAgent?: string;
  }): Promise<InviteParentResult> {
    const { schoolId } = this.requireTenant();
    const current = await this.prisma.client.parentUser.findFirst({
      where: { schoolId, id: args.parentUserId },
    });
    if (current === null || current.parentId !== args.parentId) {
      throw new NotFoundError('ParentUser', args.parentUserId);
    }
    if (current.version !== args.expectedVersion) {
      throw new VersionConflict('ParentUser', args.parentUserId, args.expectedVersion);
    }
    if (current.status !== 'PENDING_INVITE') {
      throw new ValidationFailedError(
        [
          {
            path: 'status',
            code: 'PARENT_USER_NOT_PENDING_INVITE',
            message: `Parent user is ${String(current.status)}; only PENDING_INVITE rows can be re-invited.`,
          },
        ],
        'Parent user not pending invite',
      );
    }
    const user = await this.prisma.client.user.findFirst({
      where: { schoolId, id: current.userId },
      select: { email: true, displayName: true },
    });
    if (user === null) {
      throw new NotFoundError('User', current.userId);
    }
    return this.invite({
      parentId: args.parentId,
      email: user.email,
      displayName: user.displayName,
      relation: current.relation as ParentRelationValue,
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
    });
  }

  private requireTenant(): { schoolId: string; userId?: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ParentInvitationService requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId, ...(ctx.userId !== undefined ? { userId: ctx.userId } : {}) };
  }
}
