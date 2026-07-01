/**
 * StudentUserService — Sprint 18 student-portal lifecycle FSM.
 *
 * Owns the four state-transition methods of a `StudentUser` row plus a
 * couple of read helpers. The invite/activate writes are NOT in this
 * service — they're owned by `StudentInvitationService` (W3) and the
 * `StudentActivationOutboxHandler` respectively, both of which call back
 * into this service for the actual FSM transition.
 *
 * FSM (mirrors ParentUserService):
 *
 *     PENDING_INVITE ──invite()──▶ PENDING_INVITE   (re-invite, idempotent)
 *                   ╲
 *                    ╲──activate()──▶ ACTIVE
 *
 *     ACTIVE ──suspend()──▶ SUSPENDED ──reactivate()──▶ ACTIVE
 *
 *     ACTIVE, SUSPENDED, PENDING_INVITE ──archive()──▶ ARCHIVED  (terminal)
 *
 * Illegal transitions throw `StudentUserStateError` (STATE_INVALID, 409).
 * Every transition writes an audit row (`student_user.<action>`, category
 * `security`) and queues a `student.lifecycle.<state>` outbox event with
 * the diff in the payload.
 *
 * The archive path also cancels any outstanding password-reset tokens for
 * the underlying User so an in-flight invite link can't be redeemed
 * post-archive.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { NotFoundError } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { PasswordResetRepository } from '../../provisioning/password-reset/password-reset.repository';
import { StudentOutboxTopics } from '../student.constants';
import { StudentUserStateError } from '../student.errors';
import type { StudentUserRow, StudentUserStatusValue } from '../student.types';
import {
  StudentUserRepository,
  type CreateStudentUserInput,
  type UpdateStudentUserStatusInput,
} from './student-user.repository';

/**
 * Allowed source states for each transition. The terminal `ARCHIVED`
 * state has no outgoing edges (deliberately omitted from every list).
 */
const TRANSITION_RULES: Readonly<
  Record<StudentUserStatusValue, readonly StudentUserStatusValue[]>
> = Object.freeze({
  PENDING_INVITE: ['PENDING_INVITE'], // re-invite is the only self-edge
  ACTIVE: ['PENDING_INVITE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: ['PENDING_INVITE', 'ACTIVE', 'SUSPENDED'],
});

/** Outbox topic per terminal-state-of-transition. */
const LIFECYCLE_TOPIC: Readonly<Record<StudentUserStatusValue, string>> = Object.freeze({
  PENDING_INVITE: StudentOutboxTopics.REINVITED,
  ACTIVE: StudentOutboxTopics.LIFECYCLE_ACTIVATED,
  SUSPENDED: StudentOutboxTopics.LIFECYCLE_SUSPENDED,
  ARCHIVED: StudentOutboxTopics.LIFECYCLE_ARCHIVED,
});

export interface ActivateInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly at?: Date;
}

export interface SuspendInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly reason?: string;
  readonly at?: Date;
}

export interface ReactivateInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly at?: Date;
}

export interface ArchiveInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly reason?: string;
  readonly at?: Date;
}

@Injectable()
export class StudentUserService {
  private readonly logger = new Logger(StudentUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StudentUserRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly resetRepo: PasswordResetRepository,
  ) {}

  // ------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------

  public async getById(id: string): Promise<StudentUserRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('StudentUser', id);
    }
    return row;
  }

  public async getByIdOrNull(id: string, tx?: PrismaTx): Promise<StudentUserRow | null> {
    return this.repo.findById(id, tx);
  }

  public async findAliveByUserId(userId: string, tx?: PrismaTx): Promise<StudentUserRow | null> {
    return this.repo.findAliveByUserId(userId, tx);
  }

  public async findAliveByStudentId(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<StudentUserRow | null> {
    return this.repo.findAliveByStudentId(studentId, tx);
  }

  public async listForStudent(studentId: string): Promise<readonly StudentUserRow[]> {
    return this.repo.findByStudent(studentId);
  }

  // ------------------------------------------------------------------------
  // Lifecycle writes — used by StudentInvitationService and admin controllers.
  // ------------------------------------------------------------------------

  /**
   * Insert a fresh StudentUser in `PENDING_INVITE`. Caller is expected to
   * already be inside a transaction (the invitation service composes this
   * with the User + reset-token writes).
   */
  public async createInvited(
    input: CreateStudentUserInput & { readonly invitedAt: Date },
    tx: PrismaTx,
  ): Promise<StudentUserRow> {
    const row = await this.repo.create(
      {
        studentId: input.studentId,
        userId: input.userId,
        status: 'PENDING_INVITE',
        invitedAt: input.invitedAt,
        lastInviteAt: input.lastInviteAt ?? input.invitedAt,
      },
      tx,
    );
    return row;
  }

  /**
   * Bump `lastInviteAt` on an existing PENDING_INVITE row. Used when the
   * admin asks to resend the invitation. No FSM transition (status stays
   * PENDING_INVITE); it's a logical "re-invite" event.
   */
  public async markReinvited(
    id: string,
    expectedVersion: number,
    at: Date,
    tx: PrismaTx,
  ): Promise<StudentUserRow> {
    const current = await this.repo.findById(id, tx);
    if (current === null) {
      throw new NotFoundError('StudentUser', id);
    }
    this.assertTransition(current.status, 'PENDING_INVITE', {
      studentUserId: id,
      userId: current.userId,
    });
    const updated = await this.repo.updateStatus(
      id,
      expectedVersion,
      { status: 'PENDING_INVITE', lastInviteAt: at },
      tx,
    );
    await this.audit.record(
      {
        action: 'student_user.reinvite',
        category: 'security',
        resourceType: 'StudentUser',
        resourceId: id,
        schoolId: current.schoolId,
        before: { lastInviteAt: current.lastInviteAt },
        after: { lastInviteAt: updated.lastInviteAt },
      },
      { tx: tx as unknown as AuditTxLike },
    );
    await this.outbox.publish(tx, {
      topic: StudentOutboxTopics.REINVITED,
      eventType: 'StudentReinvited',
      aggregateType: 'StudentUser',
      aggregateId: id,
      schoolId: current.schoolId,
      payload: {
        studentUserId: id,
        studentId: current.studentId,
        userId: current.userId,
        lastInviteAt: updated.lastInviteAt?.toISOString() ?? null,
      },
    });
    return updated;
  }

  /**
   * `PENDING_INVITE → ACTIVE`. Called by the activation outbox handler
   * once the student consumes the password-reset token.
   */
  public async activate(input: ActivateInput, tx?: PrismaTx): Promise<StudentUserRow> {
    const run = async (t: PrismaTx): Promise<StudentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('StudentUser', input.id);
      }
      this.assertTransition(current.status, 'ACTIVE', {
        studentUserId: input.id,
        userId: current.userId,
      });
      const at = input.at ?? new Date();
      const updated = await this.repo.updateStatus(
        input.id,
        input.expectedVersion,
        { status: 'ACTIVE', activatedAt: at },
        t,
      );
      await this.emitLifecycleAudit(t, current, updated, 'activate');
      this.logger.log(`StudentUser ${input.id} ACTIVE (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  /**
   * `ACTIVE → SUSPENDED`. Underlying User row is NOT touched — login still
   * works, but the `/me/*` student-portal guard blocks because StudentUser
   * is not ACTIVE.
   */
  public async suspend(input: SuspendInput, tx?: PrismaTx): Promise<StudentUserRow> {
    const run = async (t: PrismaTx): Promise<StudentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('StudentUser', input.id);
      }
      this.assertTransition(current.status, 'SUSPENDED', {
        studentUserId: input.id,
        userId: current.userId,
      });
      const at = input.at ?? new Date();
      const updated = await this.repo.updateStatus(
        input.id,
        input.expectedVersion,
        { status: 'SUSPENDED', suspendedAt: at },
        t,
      );
      await this.emitLifecycleAudit(t, current, updated, 'suspend', input.reason);
      this.logger.log(`StudentUser ${input.id} SUSPENDED (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  /** `SUSPENDED → ACTIVE`. Clears `suspendedAt`, refreshes `activatedAt`. */
  public async reactivate(input: ReactivateInput, tx?: PrismaTx): Promise<StudentUserRow> {
    const run = async (t: PrismaTx): Promise<StudentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('StudentUser', input.id);
      }
      if (current.status !== 'SUSPENDED') {
        throw new StudentUserStateError({
          studentUserId: input.id,
          userId: current.userId,
          from: current.status,
          to: 'ACTIVE',
        });
      }
      const at = input.at ?? new Date();
      const updated = await this.repo.updateStatus(
        input.id,
        input.expectedVersion,
        { status: 'ACTIVE', activatedAt: at, suspendedAt: null },
        t,
      );
      await this.audit.record(
        {
          action: 'student_user.reactivate',
          category: 'security',
          resourceType: 'StudentUser',
          resourceId: input.id,
          schoolId: current.schoolId,
          before: { status: current.status, suspendedAt: current.suspendedAt },
          after: { status: updated.status, activatedAt: updated.activatedAt },
        },
        { tx: t as unknown as AuditTxLike },
      );
      await this.outbox.publish(t, {
        topic: StudentOutboxTopics.LIFECYCLE_REACTIVATED,
        eventType: 'StudentReactivated',
        aggregateType: 'StudentUser',
        aggregateId: input.id,
        schoolId: current.schoolId,
        payload: {
          studentUserId: input.id,
          studentId: current.studentId,
          userId: current.userId,
          previousStatus: current.status,
          status: updated.status,
          at: at.toISOString(),
        },
      });
      this.logger.log(`StudentUser ${input.id} reactivated (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  /**
   * Terminal archive. Cancels any outstanding password-reset tokens for
   * the underlying user so an in-flight invite can't be redeemed after
   * archive. Soft-deletes the row in the same tx (`status=ARCHIVED` is the
   * canonical tombstone; soft-delete is the GDPR escape hatch).
   */
  public async archive(input: ArchiveInput, tx?: PrismaTx): Promise<StudentUserRow> {
    const run = async (t: PrismaTx): Promise<StudentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('StudentUser', input.id);
      }
      this.assertTransition(current.status, 'ARCHIVED', {
        studentUserId: input.id,
        userId: current.userId,
      });
      const at = input.at ?? new Date();
      const updated = await this.repo.updateStatus(
        input.id,
        input.expectedVersion,
        { status: 'ARCHIVED', archivedAt: at },
        t,
      );

      await this.resetRepo.cancelOutstandingForUser(
        current.schoolId,
        current.userId,
        at,
        t,
      );

      await this.audit.record(
        {
          action: 'student_user.archive',
          category: 'security',
          resourceType: 'StudentUser',
          resourceId: input.id,
          schoolId: current.schoolId,
          before: { status: current.status },
          after: {
            status: updated.status,
            archivedAt: updated.archivedAt,
            reason: input.reason ?? null,
          },
        },
        { tx: t as unknown as AuditTxLike },
      );
      await this.outbox.publish(t, {
        topic: StudentOutboxTopics.LIFECYCLE_ARCHIVED,
        eventType: 'StudentArchived',
        aggregateType: 'StudentUser',
        aggregateId: input.id,
        schoolId: current.schoolId,
        payload: {
          studentUserId: input.id,
          studentId: current.studentId,
          userId: current.userId,
          previousStatus: current.status,
          status: updated.status,
          at: at.toISOString(),
          reason: input.reason ?? null,
        },
      });
      this.logger.log(`StudentUser ${input.id} ARCHIVED (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  // ------------------------------------------------------------------------
  // Generic transition update (escape hatch for the invitation flow)
  // ------------------------------------------------------------------------

  public async transition(
    id: string,
    expectedVersion: number,
    to: StudentUserStatusValue,
    patch: Omit<UpdateStudentUserStatusInput, 'status'>,
    tx: PrismaTx,
  ): Promise<StudentUserRow> {
    const current = await this.repo.findById(id, tx);
    if (current === null) {
      throw new NotFoundError('StudentUser', id);
    }
    this.assertTransition(current.status, to, { studentUserId: id, userId: current.userId });
    return this.repo.updateStatus(id, expectedVersion, { ...patch, status: to }, tx);
  }

  // ------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------

  private assertTransition(
    from: StudentUserStatusValue,
    to: StudentUserStatusValue,
    ids: { readonly studentUserId?: string; readonly userId?: string },
  ): void {
    const allowedFroms = TRANSITION_RULES[to];
    if (!allowedFroms.includes(from)) {
      throw new StudentUserStateError({ from, to, ...ids });
    }
  }

  private async emitLifecycleAudit(
    tx: PrismaTx,
    before: StudentUserRow,
    after: StudentUserRow,
    action: 'activate' | 'suspend',
    reason?: string,
  ): Promise<void> {
    await this.audit.record(
      {
        action: `student_user.${action}`,
        category: 'security',
        resourceType: 'StudentUser',
        resourceId: after.id,
        schoolId: before.schoolId,
        before: { status: before.status },
        after: { status: after.status, reason: reason ?? null },
      },
      { tx: tx as unknown as AuditTxLike },
    );
    await this.outbox.publish(tx, {
      topic: LIFECYCLE_TOPIC[after.status],
      eventType: `Student${action.charAt(0).toUpperCase()}${action.slice(1)}d`,
      aggregateType: 'StudentUser',
      aggregateId: after.id,
      schoolId: before.schoolId,
      payload: {
        studentUserId: after.id,
        studentId: after.studentId,
        userId: after.userId,
        previousStatus: before.status,
        status: after.status,
        reason: reason ?? null,
      },
    });
  }
}
