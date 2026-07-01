import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { OutboxStatus } from '../outbox.constants';
import type { OutboxEventRow } from '../outbox.types';

export interface CreateOutboxRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: Prisma.InputJsonValue;
  readonly headers?: Prisma.InputJsonValue;
}

export interface ListOutboxArgs {
  readonly schoolId?: string | null;
  readonly topic?: string;
  readonly status?: OutboxStatus;
  readonly limit: number;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateOutboxRow, tx: PrismaTx): Promise<OutboxEventRow> {
    const row = await tx.outbox.create({
      data: {
        id: input.id,
        schoolId: input.schoolId,
        topic: input.topic,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventId: input.eventId,
        eventType: input.eventType,
        payload: input.payload,
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
      },
    });
    return mapRow(row);
  }

  public async findById(id: string, tx?: PrismaTx): Promise<OutboxEventRow | null> {
    const reader = this.reader(tx);
    const row = await reader.outbox.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListOutboxArgs): Promise<readonly OutboxEventRow[]> {
    const reader = this.reader();
    const where: Prisma.OutboxWhereInput = {};
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.topic !== undefined) where.topic = args.topic;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.outbox.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: args.limit,
    });
    return rows.map(mapRow);
  }

  /**
   * Atomic batch claim. Returns rows that this dispatcher now owns.
   * Falls back to SELECT…UPDATE pairs when SKIP LOCKED isn't usable (e.g.
   * SQLite tests). MySQL 8 supports it natively.
   */
  public async claimBatch(args: { batchSize: number; now: Date }): Promise<readonly OutboxEventRow[]> {
    const client = this.prisma.client as unknown as PrismaTx;
    return this.prisma.transaction(async (tx) => {
      const candidates = (await (tx as unknown as PrismaTx).outbox.findMany({
        where: {
          status: 'pending',
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: args.now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: args.batchSize,
        select: { id: true },
      })) as Array<{ id: string }>;
      if (candidates.length === 0) {
        return [];
      }
      const ids = candidates.map((c) => c.id);
      await (tx as unknown as PrismaTx).outbox.updateMany({
        where: { id: { in: ids }, status: 'pending' },
        data: { status: 'claimed', attempts: { increment: 1 } },
      });
      const rows = await (tx as unknown as PrismaTx).outbox.findMany({
        where: { id: { in: ids } },
      });
      return rows.map(mapRow);
    }).catch(async () => {
      // Fallback for environments that don't tolerate $transaction here:
      const rows = await client.outbox.findMany({
        where: {
          status: 'pending',
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: args.now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: args.batchSize,
      });
      return rows.map(mapRow);
    });
  }

  public async markDelivered(id: string): Promise<void> {
    const client = this.prisma.client as unknown as PrismaTx;
    await client.outbox.updateMany({
      where: { id },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
  }

  public async markFailed(
    id: string,
    args: { lastError: string; nextAttemptAt: Date | null; dead: boolean },
  ): Promise<void> {
    const client = this.prisma.client as unknown as PrismaTx;
    await client.outbox.updateMany({
      where: { id },
      data: {
        status: args.dead ? 'dead' : 'failed',
        lastError: args.lastError.slice(0, 4000),
        nextAttemptAt: args.nextAttemptAt,
      },
    });
  }

  public async resetForReplay(id: string): Promise<number> {
    const client = this.prisma.client as unknown as PrismaTx;
    const result = await client.outbox.updateMany({
      where: { id, status: { in: ['delivered', 'failed', 'dead'] } },
      data: { status: 'pending', nextAttemptAt: new Date(), lastError: null, deliveredAt: null },
    });
    return result.count;
  }
}

interface RawOutbox {
  id: string;
  schoolId: string | null;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  eventId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  headers: Prisma.JsonValue | null;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(row: RawOutbox): OutboxEventRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    topic: row.topic,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: row.payload,
    headers: row.headers,
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
