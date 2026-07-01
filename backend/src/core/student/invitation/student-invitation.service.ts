/**
 * StudentInvitationService — Sprint 18 W3.
 *
 * Mirrors `ParentInvitationService` (cardinality is 1:1 instead of
 * family-slotted, so no `relation` field). Admin "invites a student"
 * flow:
 *
 *   1. Verify the target Student row exists.
 *   2. If a (student, user) link already exists, run the resend branch
 *      (markReinvited bumps lastInviteAt). Otherwise:
 *        - Create the underlying User { status='invited',
 *          mustChangePassword=true, passwordResetRequiredAt=now }.
 *        - Seed an unusable UserPassword row (random argon2 hash) so
 *          login fails until the student rotates via the reset link.
 *        - Insert StudentUser in PENDING_INVITE.
 *        - Seed NotificationUserPreference defaults.
 *   3. Issue a 7-day password-reset token via
 *      `PasswordResetService.request({ ttlMs: STUDENT_INVITE_TOKEN_TTL_MS })`.
 *   4. Publish `student.invited` (or `.reinvited`) outbox event.
 *   5. Audit `student_user.invite`.
 *
 * As in the parent flow the work is split across two transactions: the
 * row writes happen in tx 1; the password-reset issuance opens its own
 * tx in PasswordResetService; tx 3 publishes the outbox row. Failure of
 * step 3 leaves a PENDING_INVITE row with no token — the admin recovers
 * by re-invoking the resend endpoint.
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
import { StudentRepository } from '../repositories/student.repository';
import {
  STUDENT_INVITE_TOKEN_TTL_MS,
  StudentOutboxTopics,
} from '../student.constants';
import type { StudentUserRow } from '../student.types';
import { StudentUserService } from '../student-user/student-user.service';

export interface InviteStudentArgs {
  readonly studentId: string;
  readonly email: string;
  readonly displayName: string;
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

export interface InviteStudentResult {
  readonly studentUser: StudentUserRow;
  readonly userId: string;
  readonly inviteExpiresAt: Date;
  /**
   * Cleartext reset token. Surfaces only to the outbox handler that ships
   * the email — must NOT be echoed back over the controller response.
   */
  readonly activationToken: string;
}

@Injectable()
export class StudentInvitationService {
  private readonly logger = new Logger(StudentInvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentRepo: StudentRepository,
    private readonly studentUsers: StudentUserService,
    private readonly passwords: PasswordService,
    private readonly passwordReset: PasswordResetService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async invite(args: InviteStudentArgs): Promise<InviteStudentResult> {
    const { schoolId, userId: actorUserId } = this.requireTenant();
    const email = args.email.trim().toLowerCase();
    if (email === '') {
      throw new ValidationFailedError(
        [{ path: 'email', code: 'REQUIRED', message: 'email is required.' }],
        'Validation failed',
      );
    }

    const student = await this.studentRepo.findById(args.studentId);
    if (student === null) {
      throw new NotFoundError('Student', args.studentId);
    }

    const now = new Date();

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

        // Seed an UNUSABLE password — argon2 hash over a random 32-byte
        // secret no one will ever know. Forces the student down the
        // reset-token path before login can succeed.
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

      // Strict-unique on (school_id, student_id, user_id) means at most
      // one row, alive or otherwise.
      const existingLink = await tx.studentUser.findFirst({
        where: { schoolId, studentId: args.studentId, userId },
      });

      let studentUser: StudentUserRow;
      let resend = false;
      if (existingLink !== null) {
        if (existingLink.status !== 'PENDING_INVITE') {
          throw new ValidationFailedError(
            [
              {
                path: 'email',
                code: 'STUDENT_USER_ALREADY_LINKED',
                message: `User is already linked to this student (status=${String(existingLink.status)}). Archive first if you need to re-invite.`,
              },
            ],
            'Student user already linked',
          );
        }
        studentUser = await this.studentUsers.markReinvited(
          existingLink.id,
          existingLink.version,
          now,
          tx,
        );
        resend = true;
      } else {
        studentUser = await this.studentUsers.createInvited(
          {
            studentId: args.studentId,
            userId,
            invitedAt: now,
            lastInviteAt: now,
          },
          tx,
        );
      }

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
            // hand-written migration.
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
          action: 'student_user.invite',
          category: 'security',
          resourceType: 'StudentUser',
          resourceId: studentUser.id,
          schoolId,
          after: {
            studentUserId: studentUser.id,
            studentId: args.studentId,
            userId,
            email,
            resend,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return { userId, studentUser, resend };
    });

    // 2nd transaction: issue the reset token. We deliberately do this
    // OUTSIDE the parent tx so PasswordResetService keeps its single
    // "always a clean reset tx" guarantee.
    const resetResult = await this.passwordReset.request({
      schoolId,
      email,
      ttlMs: STUDENT_INVITE_TOKEN_TTL_MS,
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
      ...(actorUserId !== undefined ? { triggeredByUserId: actorUserId } : {}),
    });
    if (resetResult.clearTextToken === undefined || resetResult.tokenExpiresAt === undefined) {
      throw new Error(
        `PasswordResetService.request did not issue a token for userId=${stage.userId}`,
      );
    }
    const expiresAt = new Date(resetResult.tokenExpiresAt);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const topic = stage.resend
        ? StudentOutboxTopics.REINVITED
        : StudentOutboxTopics.INVITED;
      await this.outbox.publish(tx, {
        topic,
        eventType: stage.resend ? 'StudentReinvited' : 'StudentInvited',
        aggregateType: 'StudentUser',
        aggregateId: stage.studentUser.id,
        schoolId,
        payload: {
          studentUserId: stage.studentUser.id,
          studentId: args.studentId,
          userId: stage.userId,
          email,
          displayName: args.displayName,
          activationToken: resetResult.clearTextToken,
          activationLinkBase: args.activationLinkBase ?? null,
          expiresAt: expiresAt.toISOString(),
          inviteTtlMs: STUDENT_INVITE_TOKEN_TTL_MS,
          defaultResetTtlMs: PASSWORD_RESET_TOKEN_TTL_MS,
        },
      });
    });

    this.logger.log(
      `Student invitation ${stage.resend ? 'resent' : 'sent'} studentUserId=${stage.studentUser.id} userId=${stage.userId} schoolId=${schoolId}.`,
    );

    return {
      studentUser: stage.studentUser,
      userId: stage.userId,
      inviteExpiresAt: expiresAt,
      activationToken: resetResult.clearTextToken,
    };
  }

  /**
   * Resend the invitation email for an existing PENDING_INVITE StudentUser.
   *
   * Resolves the underlying User row to recover the email + display name,
   * then re-enters `invite()` which already implements the
   * "PENDING_INVITE → PENDING_INVITE" re-invite branch atomically.
   */
  public async resendInvite(args: {
    readonly studentId: string;
    readonly studentUserId: string;
    readonly expectedVersion: number;
    readonly ip?: string;
    readonly userAgent?: string;
  }): Promise<InviteStudentResult> {
    const { schoolId } = this.requireTenant();
    const current = await this.prisma.client.studentUser.findFirst({
      where: { schoolId, id: args.studentUserId },
    });
    if (current === null || current.studentId !== args.studentId) {
      throw new NotFoundError('StudentUser', args.studentUserId);
    }
    if (current.version !== args.expectedVersion) {
      throw new VersionConflict('StudentUser', args.studentUserId, args.expectedVersion);
    }
    if (current.status !== 'PENDING_INVITE') {
      throw new ValidationFailedError(
        [
          {
            path: 'status',
            code: 'STUDENT_USER_NOT_PENDING_INVITE',
            message: `Student user is ${String(current.status)}; only PENDING_INVITE rows can be re-invited.`,
          },
        ],
        'Student user not pending invite',
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
      studentId: args.studentId,
      email: user.email,
      displayName: user.displayName,
      ...(args.ip !== undefined ? { ip: args.ip } : {}),
      ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
    });
  }

  private requireTenant(): { schoolId: string; userId?: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StudentInvitationService requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId, ...(ctx.userId !== undefined ? { userId: ctx.userId } : {}) };
  }
}
