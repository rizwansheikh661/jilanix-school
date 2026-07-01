import { Injectable, Logger } from '@nestjs/common';
import { ulid } from 'ulid';

import type { PrismaTx } from '../../../infra/prisma/types';
import { PublishRequiresTransactionError } from '../outbox.errors';
import type { OutboxEventRow, PublishOutboxInput } from '../outbox.types';
import { OutboxRepository } from '../repositories/outbox.repository';

/**
 * Transactional outbox publisher. Callers MUST hand in the same
 * `Prisma.TransactionClient` they're using for the business mutation;
 * otherwise the dual-write guarantee is lost and we throw.
 *
 * Use as:
 *   await this.prisma.transaction(async (tx) => {
 *     await someRepo.create(input, tx);
 *     await outboxPublisher.publish(tx, { topic, eventType, ... });
 *   });
 */
@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(private readonly repo: OutboxRepository) {}

  public async publish(
    tx: PrismaTx | undefined,
    input: PublishOutboxInput,
  ): Promise<OutboxEventRow> {
    if (tx === undefined || tx === null) {
      throw new PublishRequiresTransactionError();
    }
    const eventId = input.eventId ?? ulid();
    const row = await this.repo.create(
      {
        id: ulid(),
        schoolId: input.schoolId ?? null,
        topic: input.topic,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventId,
        eventType: input.eventType,
        payload: input.payload,
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
      },
      tx,
    );
    this.logger.debug(
      `outbox queued topic=${input.topic} eventType=${input.eventType} eventId=${eventId}`,
    );
    return row;
  }
}
