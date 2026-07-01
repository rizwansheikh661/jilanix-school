import type { Prisma } from '@prisma/client';

import type { OutboxStatus } from './outbox.constants';

export type { OutboxStatus };

export interface OutboxEventRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: Prisma.JsonValue;
  readonly headers: Prisma.JsonValue | null;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface PublishOutboxInput {
  readonly topic: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Prisma.InputJsonValue;
  readonly headers?: Prisma.InputJsonValue;
  readonly schoolId?: string | null;
  /** Override for the auto-generated ULID — used for deterministic test cases. */
  readonly eventId?: string;
}

/**
 * Handler invoked by the dispatcher for a given topic. Implementations should
 * be idempotent (the dispatcher may retry on transient failure) and throw on
 * permanent failure so the dispatcher can record `lastError` and back off.
 */
export type OutboxHandler = (event: OutboxEventRow) => Promise<void>;
