/**
 * NotificationQueuedOutboxHandler — bridges the in-process
 * `notification.queued` outbox event to a `notification.send` Job.
 *
 * The OutboxDispatcherService does NOT pass a transaction to handlers;
 * its `markDelivered` for the outbox row is committed outside the
 * handler. Enqueuing the Job therefore uses its own connection — the
 * idempotency story relies on the send job being safe to no-op when
 * the underlying NotificationMessage has already moved past QUEUED.
 *
 * IN_APP messages bypass this path entirely (the dispatcher publishes
 * `notification.delivered` for IN_APP). A defensive early-return + warn
 * guards against a misconfigured publisher accidentally routing IN_APP
 * here.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { OutboxEventRow } from '../../outbox/outbox.types';
import { OutboxHandlerRegistry } from '../../outbox/services/outbox-handler.registry';
import { JobEnqueueService } from '../../jobs/services/job-enqueue.service';
import {
  NotificationsOutboxTopics,
  type NotificationChannelValue,
} from '../notifications.constants';

interface NotificationQueuedPayload {
  readonly messageId: string;
  readonly schoolId: string;
  readonly channel: NotificationChannelValue;
  readonly recipientUserId: string;
  readonly eventKey?: string;
}

export const NOTIFICATION_SEND_JOB_QUEUE = 'notifications';
export const NOTIFICATION_SEND_JOB_HANDLER = 'notification.send';

@Injectable()
export class NotificationQueuedOutboxHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationQueuedOutboxHandler.name);

  constructor(
    private readonly outboxRegistry: OutboxHandlerRegistry,
    private readonly jobs: JobEnqueueService,
  ) {}

  public onApplicationBootstrap(): void {
    this.outboxRegistry.registerTopic(
      NotificationsOutboxTopics.MESSAGE_QUEUED,
      (event) => this.handle(event),
    );
    this.logger.log(
      `Subscribed to "${NotificationsOutboxTopics.MESSAGE_QUEUED}" for send-job enqueue.`,
    );
  }

  private async handle(event: OutboxEventRow): Promise<void> {
    const payload = event.payload as NotificationQueuedPayload | null;
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.messageId !== 'string' ||
      typeof payload.schoolId !== 'string' ||
      typeof payload.channel !== 'string'
    ) {
      throw new Error(
        `notification.queued payload malformed: ${JSON.stringify(event.payload)}`,
      );
    }

    if (payload.channel === 'IN_APP') {
      this.logger.warn(
        `Skipping notification.queued for IN_APP (messageId=${payload.messageId}); IN_APP is delivered synchronously by the dispatcher.`,
      );
      return;
    }

    await this.jobs.enqueue({
      queue: NOTIFICATION_SEND_JOB_QUEUE,
      handlerName: NOTIFICATION_SEND_JOB_HANDLER,
      schoolId: payload.schoolId,
      payload: {
        messageId: payload.messageId,
        schoolId: payload.schoolId,
      },
      runAt: new Date(),
    });
  }
}
