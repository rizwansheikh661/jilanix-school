/**
 * NotificationSendQueueBootstrap — Sprint N1.
 *
 * `JobProcessorService.discoverQueues()` only polls queues whose name
 * appears on an active `JobDefinition` row (plus the implicit "default"
 * queue). The notification send pipeline enqueues ad-hoc jobs on the
 * `"notifications"` queue without owning a JobDefinition, so the
 * processor never claims them.
 *
 * This bootstrap upserts a no-cron JobDefinition purely to register the
 * queue name with the discovery loop. `scheduleCron = null` keeps
 * `JobSchedulerService.listActiveScheduled()` from creating spurious
 * scheduled runs — the row exists only as a queue marker.
 *
 * Idempotent: existing row is refreshed, primary id preserved.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ulid } from 'ulid';

import { PrismaService } from '../../../infra/prisma';
import { JobDefinitionRepository } from '../../jobs/repositories/job-definition.repository';
import {
  NOTIFICATION_SEND_JOB_HANDLER,
  NOTIFICATION_SEND_JOB_QUEUE,
} from './notification-queued.outbox-handler';

const DEFINITION_NAME = 'notifications.send.queue-marker';

@Injectable()
export class NotificationSendQueueBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationSendQueueBootstrap.name);

  constructor(
    private readonly definitions: JobDefinitionRepository,
    private readonly prisma: PrismaService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Notifications queue bootstrap failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const existing = await this.definitions.findByName(null, DEFINITION_NAME);
    if (existing === null) {
      await this.definitions.create({
        id: ulid(),
        schoolId: null,
        name: DEFINITION_NAME,
        queue: NOTIFICATION_SEND_JOB_QUEUE,
        handlerName: NOTIFICATION_SEND_JOB_HANDLER,
        scheduleCron: null,
        isActive: true,
        description:
          'Sprint N1 — queue-discovery marker so JobProcessorService polls the "notifications" queue. Not a scheduled job (scheduleCron is null).',
        createdBy: null,
      });
      this.logger.log(
        `Notifications send queue marker JobDefinition seeded (queue="${NOTIFICATION_SEND_JOB_QUEUE}").`,
      );
      return;
    }
    await this.prisma.client.jobDefinition.updateMany({
      where: { id: existing.id },
      data: {
        queue: NOTIFICATION_SEND_JOB_QUEUE,
        handlerName: NOTIFICATION_SEND_JOB_HANDLER,
        scheduleCron: null,
        isActive: true,
      },
    });
    this.logger.log(
      `Notifications send queue marker JobDefinition refreshed (id=${existing.id}).`,
    );
  }
}
