/**
 * StudentActivationOutboxHandler — consumes
 * `provisioning.password.first_login.completed` and flips the matching
 * `StudentUser` row from `PENDING_INVITE` → `ACTIVE`.
 *
 * Mirrors `ParentActivationOutboxHandler`. Idempotent: tolerates "no
 * matching StudentUser" (the first-login event also fires for non-student
 * users) and "already ACTIVE" (re-delivery of the outbox row).
 *
 * The dispatcher invokes handlers OUTSIDE any RequestContext; we restore
 * one via `runWithSystemContext` so the inner repository calls satisfy
 * the tenant-scope assertion and the audit row carries the system actor.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { OutboxEventRow } from '../../outbox/outbox.types';
import { OutboxHandlerRegistry } from '../../outbox/services/outbox-handler.registry';
import { ProvisioningOutboxTopics } from '../../provisioning/provisioning.constants';
import { runWithSystemContext } from '../../request-context';
import { StudentUserRepository } from '../student-user/student-user.repository';
import { StudentUserService } from '../student-user/student-user.service';

interface FirstLoginCompletedPayload {
  readonly userId: string;
  readonly schoolId: string;
  readonly email?: string | null;
  readonly completedAt: string;
}

@Injectable()
export class StudentActivationOutboxHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(StudentActivationOutboxHandler.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly studentUsers: StudentUserService,
    private readonly studentUserRepo: StudentUserRepository,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.registerTopic(
      ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED,
      (event) => this.handle(event),
    );
    this.logger.log(
      `Subscribed to "${ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED}" for StudentUser activation.`,
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
        const row = await this.studentUserRepo.findAliveByUserId(payload.userId);
        if (row === null) {
          this.logger.debug(
            `No alive StudentUser for userId=${payload.userId} schoolId=${payload.schoolId}; skipping.`,
          );
          return;
        }
        if (row.status === 'ACTIVE') {
          this.logger.debug(
            `StudentUser ${row.id} already ACTIVE; skipping activation.`,
          );
          return;
        }
        if (row.status !== 'PENDING_INVITE') {
          this.logger.warn(
            `StudentUser ${row.id} status=${row.status} but first-login completed; ignoring.`,
          );
          return;
        }
        await this.studentUsers.activate({
          id: row.id,
          expectedVersion: row.version,
          at: new Date(payload.completedAt),
        });
        this.logger.log(
          `StudentUser ${row.id} activated via first-login (userId=${payload.userId}).`,
        );
      },
    );
  }
}
