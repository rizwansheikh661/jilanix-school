/**
 * ParentUserService — Sprint 17 parent-portal lifecycle FSM.
 *
 * Owns the four state-transition methods of a `ParentUser` row plus a
 * couple of read helpers. The invite/activate writes are NOT in this
 * service — they're owned by `ParentInvitationService` (W4) and the
 * `ParentActivationOutboxHandler` respectively, both of which call back
 * into this service for the actual FSM transition.
 *
 * FSM (per BUSINESS_RULES §parent-portal):
 *
 *     PENDING_INVITE ──invite()──▶ PENDING_INVITE   (re-invite, idempotent)
 *                   ╲
 *                    ╲──activate()──▶ ACTIVE
 *
 *     ACTIVE ──suspend()──▶ SUSPENDED ──reactivate()──▶ ACTIVE
 *
 *     ACTIVE, SUSPENDED, PENDING_INVITE ──archive()──▶ ARCHIVED  (terminal)
 *
 * Illegal transitions throw `ParentUserStateError` (STATE_INVALID, 409).
 * Every transition writes an audit row (`parent_user.<action>`, category
 * `security`) and queues a `parent.lifecycle.<state>` outbox event with
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
import { ParentOutboxTopics } from '../parent.constants';
import { ParentUserStateError } from '../parent.errors';
import type { ParentUserRow, ParentUserStatusValue } from '../parent.types';
import {
  ParentUserRepository,
  type CreateParentUserInput,
  type UpdateParentUserStatusInput,
} from './parent-user.repository';

/**
 * Allowed source states for each transition. The terminal `ARCHIVED`
 * state has no outgoing edges (deliberately omitted from every list).
 */
const TRANSITION_RULES: Readonly<
  Record<ParentUserStatusValue, readonly ParentUserStatusValue[]>
> = Object.freeze({
  PENDING_INVITE: ['PENDING_INVITE'], // re-invite is the only self-edge
  ACTIVE: ['PENDING_INVITE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: ['PENDING_INVITE', 'ACTIVE', 'SUSPENDED'],
});

/** Outbox topic per terminal-state-of-transition. */
const LIFECYCLE_TOPIC: Readonly<Record<ParentUserStatusValue, string>> = Object.freeze({
  PENDING_INVITE: ParentOutboxTopics.REINVITED,
  ACTIVE: ParentOutboxTopics.LIFECYCLE_ACTIVATED,
  SUSPENDED: ParentOutboxTopics.LIFECYCLE_SUSPENDED,
  ARCHIVED: ParentOutboxTopics.LIFECYCLE_ARCHIVED,
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
export class ParentUserService {
  private readonly logger = new Logger(ParentUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ParentUserRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly resetRepo: PasswordResetRepository,
  ) {}

  // ------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------

  public async getById(id: string): Promise<ParentUserRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('ParentUser', id);
    }
    return row;
  }

  public async getByIdOrNull(id: string, tx?: PrismaTx): Promise<ParentUserRow | null> {
    return this.repo.findById(id, tx);
  }

  public async findAliveByUserId(userId: string, tx?: PrismaTx): Promise<ParentUserRow | null> {
    return this.repo.findAliveByUserId(userId, tx);
  }

  public async listForParent(parentId: string): Promise<readonly ParentUserRow[]> {
    return this.repo.findByParent(parentId);
  }

  // ------------------------------------------------------------------------
  // Lifecycle writes — used by ParentInvitationService and admin controllers.
  // ------------------------------------------------------------------------

  /**
   * Insert a fresh ParentUser in `PENDING_INVITE`. Caller is expected to
   * already be inside a transaction (the invitation service composes this
   * with the User + reset-token writes).
   */
  public async createInvited(
    input: CreateParentUserInput & { readonly invitedAt: Date },
    tx: PrismaTx,
  ): Promise<ParentUserRow> {
    const row = await this.repo.create(
      {
        parentId: input.parentId,
        userId: input.userId,
        relation: input.relation,
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
  ): Promise<ParentUserRow> {
    const current = await this.repo.findById(id, tx);
    if (current === null) {
      throw new NotFoundError('ParentUser', id);
    }
    this.assertTransition(current.status, 'PENDING_INVITE', {
      parentUserId: id,
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
        action: 'parent_user.reinvite',
        category: 'security',
        resourceType: 'ParentUser',
        resourceId: id,
        schoolId: current.schoolId,
        before: { lastInviteAt: current.lastInviteAt },
        after: { lastInviteAt: updated.lastInviteAt },
      },
      { tx: tx as unknown as AuditTxLike },
    );
    await this.outbox.publish(tx, {
      topic: ParentOutboxTopics.REINVITED,
      eventType: 'ParentReinvited',
      aggregateType: 'ParentUser',
      aggregateId: id,
      schoolId: current.schoolId,
      payload: {
        parentUserId: id,
        parentId: current.parentId,
        userId: current.userId,
        lastInviteAt: updated.lastInviteAt?.toISOString() ?? null,
      },
    });
    return updated;
  }

  /**
   * `PENDING_INVITE → ACTIVE`. Called by the activation outbox handler
   * once the parent consumes the password-reset token. May also be
   * invoked by admin override flows in the future.
   */
  public async activate(input: ActivateInput, tx?: PrismaTx): Promise<ParentUserRow> {
    const run = async (t: PrismaTx): Promise<ParentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('ParentUser', input.id);
      }
      this.assertTransition(current.status, 'ACTIVE', {
        parentUserId: input.id,
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
      this.logger.log(`ParentUser ${input.id} ACTIVE (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  /**
   * `ACTIVE → SUSPENDED`. Underlying User row is NOT touched — login still
   * works, but the `/me/*` parent-portal guard blocks because ParentUser
   * is not ACTIVE.
   */
  public async suspend(input: SuspendInput, tx?: PrismaTx): Promise<ParentUserRow> {
    const run = async (t: PrismaTx): Promise<ParentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('ParentUser', input.id);
      }
      this.assertTransition(current.status, 'SUSPENDED', {
        parentUserId: input.id,
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
      this.logger.log(`ParentUser ${input.id} SUSPENDED (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  /** `SUSPENDED → ACTIVE`. Clears `suspendedAt`, refreshes `activatedAt`. */
  public async reactivate(input: ReactivateInput, tx?: PrismaTx): Promise<ParentUserRow> {
    const run = async (t: PrismaTx): Promise<ParentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('ParentUser', input.id);
      }
      // reactivate() is strictly SUSPENDED → ACTIVE. The broader
      // assertTransition('ACTIVE') call would also accept PENDING_INVITE
      // (reserved for first-time activate()) and a SUSPENDED self-edge,
      // neither of which is a reactivation. Reject narrowly here.
      if (current.status !== 'SUSPENDED') {
        throw new ParentUserStateError({
          parentUserId: input.id,
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
      // Use the REACTIVATED topic specifically — the LIFECYCLE_ACTIVATED
      // event is reserved for the first transition out of PENDING_INVITE.
      await this.audit.record(
        {
          action: 'parent_user.reactivate',
          category: 'security',
          resourceType: 'ParentUser',
          resourceId: input.id,
          schoolId: current.schoolId,
          before: { status: current.status, suspendedAt: current.suspendedAt },
          after: { status: updated.status, activatedAt: updated.activatedAt },
        },
        { tx: t as unknown as AuditTxLike },
      );
      await this.outbox.publish(t, {
        topic: ParentOutboxTopics.LIFECYCLE_REACTIVATED,
        eventType: 'ParentReactivated',
        aggregateType: 'ParentUser',
        aggregateId: input.id,
        schoolId: current.schoolId,
        payload: {
          parentUserId: input.id,
          parentId: current.parentId,
          userId: current.userId,
          previousStatus: current.status,
          status: updated.status,
          at: at.toISOString(),
        },
      });
      this.logger.log(`ParentUser ${input.id} reactivated (was ${current.status}).`);
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
  public async archive(input: ArchiveInput, tx?: PrismaTx): Promise<ParentUserRow> {
    const run = async (t: PrismaTx): Promise<ParentUserRow> => {
      const current = await this.repo.findById(input.id, t);
      if (current === null) {
        throw new NotFoundError('ParentUser', input.id);
      }
      this.assertTransition(current.status, 'ARCHIVED', {
        parentUserId: input.id,
        userId: current.userId,
      });
      const at = input.at ?? new Date();
      const updated = await this.repo.updateStatus(
        input.id,
        input.expectedVersion,
        { status: 'ARCHIVED', archivedAt: at },
        t,
      );

      // Hygiene: any unused reset token issued to this user becomes
      // useless. Cancel them so the link in the invite email returns
      // `TOKEN_INVALID` instead of silently no-op'ing.
      await this.resetRepo.cancelOutstandingForUser(
        current.schoolId,
        current.userId,
        at,
        t,
      );

      await this.audit.record(
        {
          action: 'parent_user.archive',
          category: 'security',
          resourceType: 'ParentUser',
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
        topic: ParentOutboxTopics.LIFECYCLE_ARCHIVED,
        eventType: 'ParentArchived',
        aggregateType: 'ParentUser',
        aggregateId: input.id,
        schoolId: current.schoolId,
        payload: {
          parentUserId: input.id,
          parentId: current.parentId,
          userId: current.userId,
          previousStatus: current.status,
          status: updated.status,
          at: at.toISOString(),
          reason: input.reason ?? null,
        },
      });
      this.logger.log(`ParentUser ${input.id} ARCHIVED (was ${current.status}).`);
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  // ------------------------------------------------------------------------
  // Generic transition update (escape hatch for the invitation flow)
  // ------------------------------------------------------------------------

  /**
   * Internal helper for callers that need to drive a transition without
   * the wrapping FSM checks — currently only the activation outbox
   * handler when the source row has already been verified. Use sparingly;
   * prefer the FSM methods above.
   */
  public async transition(
    id: string,
    expectedVersion: number,
    to: ParentUserStatusValue,
    patch: Omit<UpdateParentUserStatusInput, 'status'>,
    tx: PrismaTx,
  ): Promise<ParentUserRow> {
    const current = await this.repo.findById(id, tx);
    if (current === null) {
      throw new NotFoundError('ParentUser', id);
    }
    this.assertTransition(current.status, to, { parentUserId: id, userId: current.userId });
    return this.repo.updateStatus(id, expectedVersion, { ...patch, status: to }, tx);
  }

  // ------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------

  private assertTransition(
    from: ParentUserStatusValue,
    to: ParentUserStatusValue,
    ids: { readonly parentUserId?: string; readonly userId?: string },
  ): void {
    const allowedFroms = TRANSITION_RULES[to];
    if (!allowedFroms.includes(from)) {
      throw new ParentUserStateError({ from, to, ...ids });
    }
  }

  private async emitLifecycleAudit(
    tx: PrismaTx,
    before: ParentUserRow,
    after: ParentUserRow,
    action: 'activate' | 'suspend',
    reason?: string,
  ): Promise<void> {
    await this.audit.record(
      {
        action: `parent_user.${action}`,
        category: 'security',
        resourceType: 'ParentUser',
        resourceId: after.id,
        schoolId: before.schoolId,
        before: { status: before.status },
        after: { status: after.status, reason: reason ?? null },
      },
      { tx: tx as unknown as AuditTxLike },
    );
    await this.outbox.publish(tx, {
      topic: LIFECYCLE_TOPIC[after.status],
      eventType: `Parent${action.charAt(0).toUpperCase()}${action.slice(1)}d`,
      aggregateType: 'ParentUser',
      aggregateId: after.id,
      schoolId: before.schoolId,
      payload: {
        parentUserId: after.id,
        parentId: after.parentId,
        userId: after.userId,
        previousStatus: before.status,
        status: after.status,
        reason: reason ?? null,
      },
    });
  }
}
