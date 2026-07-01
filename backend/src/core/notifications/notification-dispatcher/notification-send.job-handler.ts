/**
 * NotificationSendJobHandler — picks up a queued NotificationMessage,
 * resolves the channel adapter, calls `send()`, and records the result
 * across the message row + its APPEND_ONLY event ledger + outbox topics
 * + audit log.
 *
 * Retry policy: per-message `maxAttempts` (default 5) with the same
 * back-off schedule the OutboxDispatcherService uses:
 *   30s, 2m, 10m, 1h, 4h, 24h (capped).
 * Each retry is enqueued as a fresh `notification.send` job; once the
 * attempt count saturates we drop the message into the JobDeadLetter
 * table and emit `notification.dead_lettered`.
 *
 * Channel-disabled (Wave 6 flag gating) is treated as a permanent
 * failure — disabling a channel mid-flight is an operator decision and
 * a transient retry won't unblock it. Provider-not-implemented (stub
 * adapters) follows the standard retry/DLQ schedule.
 *
 * Concurrency: status mutations go through the optimistic-locked
 * `updateStatus` repo method. If another worker has already advanced
 * the row, we catch `VersionConflict`, re-fetch, and retry once.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { VersionConflict } from '../../errors/domain-error';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { JobDeadLetterRepository } from '../../jobs/repositories/job-dead-letter.repository';
import { JobEnqueueService } from '../../jobs/services/job-enqueue.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { runWithSystemContext } from '../../request-context';
import { CommunicationChannelRegistry } from '../channels/communication-channel.registry';
import type {
  ChannelCode,
  ChannelSendResult,
} from '../channels/communication-channel.port';
import { NotificationMessageRepository } from '../notification-message/notification-message.repository';
import {
  NotificationsOutboxTopics,
  type NotificationMessageStatusValue,
} from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationChannelNotImplementedError,
} from '../notifications.errors';
import type {
  NotificationMessageRow,
} from '../notifications.types';
import {
  NOTIFICATION_SEND_JOB_HANDLER,
  NOTIFICATION_SEND_JOB_QUEUE,
} from './notification-queued.outbox-handler';

interface SendJobPayload {
  readonly messageId: string;
  readonly schoolId: string;
}

const RETRY_BACKOFF_MS: readonly number[] = [
  30_000,
  120_000,
  600_000,
  3_600_000,
  14_400_000,
  86_400_000,
];

const TERMINAL_STATUSES: ReadonlySet<NotificationMessageStatusValue> = new Set([
  'SENT',
  'DELIVERED',
  'READ',
  'CANCELLED',
  'DEAD_LETTER',
]);

@Injectable()
export class NotificationSendJobHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationSendJobHandler.name);

  constructor(
    private readonly jobRegistry: JobHandlerRegistry,
    private readonly prisma: PrismaService,
    private readonly messages: NotificationMessageRepository,
    private readonly channels: CommunicationChannelRegistry,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly jobs: JobEnqueueService,
    private readonly dlq: JobDeadLetterRepository,
  ) {}

  public onApplicationBootstrap(): void {
    this.jobRegistry.register<SendJobPayload>(
      NOTIFICATION_SEND_JOB_HANDLER,
      (payload, ctx) => this.handle(payload, ctx),
    );
    this.logger.log(
      `Registered job handler "${NOTIFICATION_SEND_JOB_HANDLER}".`,
    );
  }

  private async handle(
    payload: SendJobPayload,
    ctx: JobHandlerContext,
  ): Promise<void> {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.messageId !== 'string' ||
      typeof payload.schoolId !== 'string'
    ) {
      throw new Error(
        `notification.send payload malformed: ${JSON.stringify(payload)}`,
      );
    }

    await runWithSystemContext({ schoolId: payload.schoolId }, () =>
      this.process(payload, ctx),
    );
  }

  private async process(
    payload: SendJobPayload,
    ctx: JobHandlerContext,
  ): Promise<void> {
    const initial = await this.loadMessage(undefined, payload);
    if (initial === null) {
      this.logger.debug(
        `notification.send no-op: messageId=${payload.messageId} not actionable.`,
      );
      return;
    }

    const channel = initial.channel as ChannelCode;

    let adapter;
    try {
      const providerCode = this.channels.getDefaultProvider(channel);
      adapter = await this.channels.resolve(channel, providerCode, {
        schoolId: payload.schoolId,
      });
    } catch (err) {
      if (err instanceof CommunicationChannelDisabledError) {
        await this.handleChannelDisabled(payload, initial, err, ctx);
        return;
      }
      throw err;
    }

    const sending = await this.transitionStatus(payload, initial, {
      status: 'SENDING',
    });
    if (sending === null) {
      this.logger.debug(
        `notification.send concurrent transition lost: messageId=${payload.messageId}.`,
      );
      return;
    }

    let result: ChannelSendResult;
    try {
      result = await adapter.send({
        schoolId: payload.schoolId,
        recipientAddress: sending.recipientAddress,
        subject: sending.subjectRendered ?? null,
        bodyText: sending.bodyRendered,
        bodyHtml: sending.bodyHtmlRendered ?? null,
        metadata: {
          messageId: sending.id,
          eventKey: sending.eventKey ?? null,
          dedupeKey: sending.dedupeKey ?? null,
        },
      });
    } catch (err) {
      await this.handleAdapterError(payload, sending, err, ctx);
      return;
    }

    await this.handleSuccess(payload, sending, result);
  }

  // -------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------
  private async handleSuccess(
    payload: SendJobPayload,
    message: NotificationMessageRow,
    result: ChannelSendResult,
  ): Promise<void> {
    const now = new Date();
    const reachedDelivered = result.providerStatus === 'DELIVERED';

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const sentRow = await this.transitionStatusInTx(tx, payload, message, {
        status: 'SENT',
        sentAt: now,
      });
      const baseRow = sentRow ?? message;
      await this.messages.appendEvent(tx, {
        schoolId: payload.schoolId,
        notificationMessageId: payload.messageId,
        eventType: 'SENT',
        occurredAt: now,
        providerCode: result.providerCode,
        providerMessageId: result.providerMessageId,
      });

      if (reachedDelivered) {
        await this.transitionStatusInTx(tx, payload, baseRow, {
          status: 'DELIVERED',
          deliveredAt: now,
        });
        await this.messages.appendEvent(tx, {
          schoolId: payload.schoolId,
          notificationMessageId: payload.messageId,
          eventType: 'DELIVERED',
          occurredAt: now,
          providerCode: result.providerCode,
          providerMessageId: result.providerMessageId,
        });

        await this.outbox.publish(tx, {
          topic: NotificationsOutboxTopics.MESSAGE_DELIVERED,
          eventType: 'NotificationDelivered',
          aggregateType: 'NotificationMessage',
          aggregateId: payload.messageId,
          schoolId: payload.schoolId,
          payload: {
            messageId: payload.messageId,
            schoolId: payload.schoolId,
            channel: message.channel,
            providerCode: result.providerCode,
            providerMessageId: result.providerMessageId,
          },
        });
      }

      await this.audit.record(
        {
          action: 'notification.sent',
          category: 'general',
          resourceType: 'NotificationMessage',
          resourceId: payload.messageId,
          schoolId: payload.schoolId,
          after: {
            status: reachedDelivered ? 'DELIVERED' : 'SENT',
            providerCode: result.providerCode,
            providerMessageId: result.providerMessageId,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------
  // Channel disabled — permanent (not retried)
  // -------------------------------------------------------------------
  private async handleChannelDisabled(
    payload: SendJobPayload,
    message: NotificationMessageRow,
    err: CommunicationChannelDisabledError,
    ctx: JobHandlerContext,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      await this.transitionStatusInTx(tx, payload, message, {
        status: 'DEAD_LETTER',
        failedAt: now,
        lastError: err.message,
      });

      await this.messages.appendEvent(tx, {
        schoolId: payload.schoolId,
        notificationMessageId: payload.messageId,
        eventType: 'DEAD_LETTER',
        occurredAt: now,
        errorCode: 'CHANNEL_DISABLED',
        errorMessage: err.message,
      });

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.MESSAGE_DEAD_LETTERED,
        eventType: 'NotificationDeadLettered',
        aggregateType: 'NotificationMessage',
        aggregateId: payload.messageId,
        schoolId: payload.schoolId,
        payload: {
          messageId: payload.messageId,
          schoolId: payload.schoolId,
          channel: message.channel,
          errorCode: 'CHANNEL_DISABLED',
          errorMessage: err.message,
        },
      });

      await this.dlq.create(
        {
          id: ulid(),
          jobId: ctx.job.id,
          definitionId: null,
          schoolId: payload.schoolId,
          queue: ctx.job.queue,
          handlerName: ctx.job.type,
          payload: ctx.job.payload as Prisma.InputJsonValue,
          attempts: ctx.attempt,
          firstFailedAt: now,
          lastFailedAt: now,
          lastError: err.message,
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'notification.dead_lettered',
          category: 'general',
          resourceType: 'NotificationMessage',
          resourceId: payload.messageId,
          schoolId: payload.schoolId,
          after: {
            reason: 'CHANNEL_DISABLED',
            errorMessage: err.message,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------
  // Generic adapter error — retry until exhausted, then DLQ
  // -------------------------------------------------------------------
  private async handleAdapterError(
    payload: SendJobPayload,
    message: NotificationMessageRow,
    err: unknown,
    ctx: JobHandlerContext,
  ): Promise<void> {
    const now = new Date();
    const errorMessage = (err as Error).message ?? 'unknown adapter error';
    const errorCode =
      err instanceof CommunicationChannelNotImplementedError
        ? 'PROVIDER_NOT_IMPLEMENTED'
        : 'ADAPTER_ERROR';

    const nextAttemptCount = message.attemptCount + 1;
    const shouldRetry = nextAttemptCount < message.maxAttempts;

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      if (shouldRetry) {
        await this.transitionStatusInTx(tx, payload, message, {
          status: 'FAILED',
          failedAt: now,
          lastError: errorMessage,
          attemptCount: nextAttemptCount,
        });

        await this.messages.appendEvent(tx, {
          schoolId: payload.schoolId,
          notificationMessageId: payload.messageId,
          eventType: 'FAILED',
          occurredAt: now,
          errorCode,
          errorMessage,
        });

        await this.outbox.publish(tx, {
          topic: NotificationsOutboxTopics.MESSAGE_FAILED,
          eventType: 'NotificationFailed',
          aggregateType: 'NotificationMessage',
          aggregateId: payload.messageId,
          schoolId: payload.schoolId,
          payload: {
            messageId: payload.messageId,
            schoolId: payload.schoolId,
            channel: message.channel,
            errorCode,
            errorMessage,
            attemptCount: nextAttemptCount,
            willRetry: true,
          },
        });

        const runAt = new Date(now.getTime() + this.backoffMs(message.attemptCount));
        await this.jobs.enqueue(
          {
            queue: NOTIFICATION_SEND_JOB_QUEUE,
            handlerName: NOTIFICATION_SEND_JOB_HANDLER,
            schoolId: payload.schoolId,
            payload: {
              messageId: payload.messageId,
              schoolId: payload.schoolId,
            },
            runAt,
          },
          tx,
        );

        await this.audit.record(
          {
            action: 'notification.failed',
            category: 'general',
            resourceType: 'NotificationMessage',
            resourceId: payload.messageId,
            schoolId: payload.schoolId,
            after: {
              errorCode,
              errorMessage,
              attemptCount: nextAttemptCount,
              maxAttempts: message.maxAttempts,
              willRetry: true,
              retryAt: runAt.toISOString(),
            },
          },
          { tx: tx as unknown as AuditTxLike },
        );
        return;
      }

      // Exhausted attempts — dead-letter.
      await this.transitionStatusInTx(tx, payload, message, {
        status: 'DEAD_LETTER',
        failedAt: now,
        lastError: errorMessage,
        attemptCount: nextAttemptCount,
      });

      await this.messages.appendEvent(tx, {
        schoolId: payload.schoolId,
        notificationMessageId: payload.messageId,
        eventType: 'DEAD_LETTER',
        occurredAt: now,
        errorCode,
        errorMessage,
      });

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.MESSAGE_DEAD_LETTERED,
        eventType: 'NotificationDeadLettered',
        aggregateType: 'NotificationMessage',
        aggregateId: payload.messageId,
        schoolId: payload.schoolId,
        payload: {
          messageId: payload.messageId,
          schoolId: payload.schoolId,
          channel: message.channel,
          errorCode,
          errorMessage,
          attemptCount: nextAttemptCount,
        },
      });

      await this.dlq.create(
        {
          id: ulid(),
          jobId: ctx.job.id,
          definitionId: null,
          schoolId: payload.schoolId,
          queue: ctx.job.queue,
          handlerName: ctx.job.type,
          payload: ctx.job.payload as Prisma.InputJsonValue,
          attempts: ctx.attempt,
          firstFailedAt: now,
          lastFailedAt: now,
          lastError: errorMessage,
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'notification.dead_lettered',
          category: 'general',
          resourceType: 'NotificationMessage',
          resourceId: payload.messageId,
          schoolId: payload.schoolId,
          after: {
            reason: errorCode,
            errorMessage,
            attemptCount: nextAttemptCount,
            maxAttempts: message.maxAttempts,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  private backoffMs(attemptCount: number): number {
    const idx = Math.min(Math.max(attemptCount, 0), RETRY_BACKOFF_MS.length - 1);
    return RETRY_BACKOFF_MS[idx] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
  }

  private async loadMessage(
    tx: PrismaTx | undefined,
    payload: SendJobPayload,
  ): Promise<NotificationMessageRow | null> {
    const row = (await this.messages.findById(
      tx,
      payload.schoolId,
      payload.messageId,
      { includeEvents: false },
    )) as NotificationMessageRow | null;
    if (row === null || row.deletedAt !== null) {
      return null;
    }
    const status = row.status as NotificationMessageStatusValue;
    if (status !== 'QUEUED' && status !== 'FAILED') {
      return null;
    }
    return row;
  }

  private async transitionStatus(
    payload: SendJobPayload,
    current: NotificationMessageRow,
    patch: {
      status: NotificationMessageStatusValue;
      sentAt?: Date | null;
      deliveredAt?: Date | null;
      failedAt?: Date | null;
      lastError?: string | null;
      attemptCount?: number;
    },
  ): Promise<NotificationMessageRow | null> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      return this.transitionStatusInTx(tx, payload, current, patch);
    });
  }

  /**
   * Transition the message's status with optimistic-lock retry-on-conflict.
   * On VersionConflict we re-fetch once and retry; if the row has already
   * advanced past actionable status we return null so the caller can no-op.
   */
  private async transitionStatusInTx(
    tx: PrismaTx,
    payload: SendJobPayload,
    current: NotificationMessageRow,
    patch: {
      status: NotificationMessageStatusValue;
      sentAt?: Date | null;
      deliveredAt?: Date | null;
      failedAt?: Date | null;
      lastError?: string | null;
      attemptCount?: number;
    },
  ): Promise<NotificationMessageRow | null> {
    try {
      return await this.messages.updateStatus(
        tx,
        payload.schoolId,
        payload.messageId,
        current.version,
        patch,
      );
    } catch (err) {
      if (!(err instanceof VersionConflict)) {
        throw err;
      }
      const reloaded = (await this.messages.findById(
        tx,
        payload.schoolId,
        payload.messageId,
        { includeEvents: false },
      )) as NotificationMessageRow | null;
      if (reloaded === null || reloaded.deletedAt !== null) {
        return null;
      }
      const status = reloaded.status as NotificationMessageStatusValue;
      if (TERMINAL_STATUSES.has(status)) {
        return null;
      }
      try {
        return await this.messages.updateStatus(
          tx,
          payload.schoolId,
          payload.messageId,
          reloaded.version,
          patch,
        );
      } catch (retryErr) {
        if (retryErr instanceof VersionConflict) {
          this.logger.warn(
            `notification.send version-conflict retry exhausted messageId=${payload.messageId}.`,
          );
          return null;
        }
        throw retryErr;
      }
    }
  }
}
