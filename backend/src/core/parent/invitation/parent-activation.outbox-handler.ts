/**
 * ParentActivationOutboxHandler — consumes
 * `provisioning.password.first_login.completed` and flips the matching
 * `ParentUser` row from `PENDING_INVITE` → `ACTIVE`.
 *
 * The dispatcher invokes handlers OUTSIDE any RequestContext. We restore
 * one for the duration of the lookup/write via `runWithSystemContext`
 * (actorScope='global' tagged so audit rows show the system actor) and
 * narrow it to the tenant by setting `schoolId`. The eventual audit row
 * for the activation transition lands inside the same wrapping context.
 *
 * Idempotency: the handler tolerates "no matching ParentUser" (the
 * password-reset confirm event also fires for non-parent users — admin,
 * staff, etc.) and "already ACTIVE" (re-delivery of the same outbox row
 * is silently no-op'd by the FSM, which permits PENDING_INVITE → ACTIVE
 * but not ACTIVE → ACTIVE — we therefore check before transitioning).
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { runWithSystemContext } from '../../request-context';
import type { OutboxEventRow } from '../../outbox/outbox.types';
import { OutboxHandlerRegistry } from '../../outbox/services/outbox-handler.registry';
import { ProvisioningOutboxTopics } from '../../provisioning/provisioning.constants';
import { ParentUserRepository } from '../parent-user/parent-user.repository';
import { ParentUserService } from '../parent-user/parent-user.service';

interface FirstLoginCompletedPayload {
  readonly userId: string;
  readonly schoolId: string;
  readonly email?: string | null;
  readonly completedAt: string;
}

@Injectable()
export class ParentActivationOutboxHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ParentActivationOutboxHandler.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly parentUsers: ParentUserService,
    private readonly parentUserRepo: ParentUserRepository,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.registerTopic(
      ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED,
      (event) => this.handle(event),
    );
    this.logger.log(
      `Subscribed to "${ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED}" for ParentUser activation.`,
    );
  }

  private async handle(event: OutboxEventRow): Promise<void> {
    const payload = event.payload as FirstLoginCompletedPayload | null;
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.userId !== 'string' ||
      typeof payload.schoolId !== 'string'
    ) {
      throw new Error(
        `provisioning.password.first_login.completed payload malformed: ${JSON.stringify(event.payload)}`,
      );
    }

    await runWithSystemContext(
      { schoolId: payload.schoolId, actorScope: 'global', requestId: `outbox:${event.eventId}` },
      async () => {
        const row = await this.parentUserRepo.findAliveByUserId(payload.userId);
        if (row === null) {
          // Common case: the user that just completed first-login isn't a
          // parent (admin/staff/teacher). Nothing to do.
          this.logger.debug(
            `No alive ParentUser for userId=${payload.userId} schoolId=${payload.schoolId}; skipping.`,
          );
          return;
        }
        if (row.status === 'ACTIVE') {
          // Re-delivery or admin already activated manually.
          this.logger.debug(
            `ParentUser ${row.id} already ACTIVE; skipping activation.`,
          );
          return;
        }
        if (row.status !== 'PENDING_INVITE') {
          // SUSPENDED or ARCHIVED — activation event is meaningless. Log
          // and drop; the dispatcher should not retry.
          this.logger.warn(
            `ParentUser ${row.id} status=${row.status} but first-login completed; ignoring.`,
          );
          return;
        }
        await this.parentUsers.activate({
          id: row.id,
          expectedVersion: row.version,
          at: new Date(payload.completedAt),
        });
        this.logger.log(
          `ParentUser ${row.id} activated via first-login (userId=${payload.userId}).`,
        );
      },
    );
  }
}
