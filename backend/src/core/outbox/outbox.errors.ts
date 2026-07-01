import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type OutboxErrorReason =
  | 'publish_requires_transaction'
  | 'duplicate_event_id'
  | 'handler_not_registered'
  | 'event_not_replayable';

export class OutboxError extends DomainError {
  public override readonly name: string = 'OutboxError';
}

export class PublishRequiresTransactionError extends OutboxError {
  public override readonly name = 'PublishRequiresTransactionError';
  constructor() {
    super({
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        'OutboxPublisher.publish must be called with a Prisma.TransactionClient — calling outside a transaction breaks the same-tx delivery guarantee.',
      details: { reason: 'publish_requires_transaction' satisfies OutboxErrorReason },
    });
  }
}

export class DuplicateEventIdError extends OutboxError {
  public override readonly name = 'DuplicateEventIdError';
  constructor(eventId: string) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Outbox event id "${eventId}" already exists.`,
      details: { reason: 'duplicate_event_id' satisfies OutboxErrorReason, eventId },
    });
  }
}

export class HandlerNotRegisteredError extends OutboxError {
  public override readonly name = 'HandlerNotRegisteredError';
  constructor(topic: string) {
    super({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: `No outbox handler registered for topic "${topic}".`,
      details: { reason: 'handler_not_registered' satisfies OutboxErrorReason, topic },
    });
  }
}

export class EventNotReplayableError extends OutboxError {
  public override readonly name = 'EventNotReplayableError';
  constructor(id: string, status: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Outbox event ${id} cannot be replayed from status="${status}".`,
      details: { reason: 'event_not_replayable' satisfies OutboxErrorReason, id, status },
    });
  }
}
