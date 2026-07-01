import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { JobRow, JobStatus } from '../jobs.types';

export interface CreateJobInput {
  readonly id: string;
  readonly schoolId: string | null;
  readonly queue: string;
  readonly type: string;
  readonly payload: Prisma.InputJsonValue;
  readonly priority?: number;
  readonly maxAttempts?: number;
  readonly runAt?: Date;
}

export interface CompleteJobArgs {
  readonly status: 'completed' | 'failed' | 'dead';
  readonly lastError?: string | null;
  readonly nextAttemptAt?: Date | null;
}

@Injectable()
export class JobClaimRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async enqueue(input: CreateJobInput, tx?: PrismaTx): Promise<JobRow> {
    const c = this.client(tx);
    const row = await c.job.create({
      data: {
        id: input.id,
        schoolId: input.schoolId,
        queue: input.queue,
        type: input.type,
        payload: input.payload,
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts ?? 5,
        runAt: input.runAt ?? new Date(),
      },
    });
    return mapRow(row);
  }

  public async findById(id: string): Promise<JobRow | null> {
    const c = this.client();
    const row = await c.job.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  /**
   * Atomic batch claim. Returns the rows this worker now owns.
   * The fallback path tolerates SQLite-style test envs that don't honour
   * SKIP LOCKED.
   */
  public async claimBatch(args: { queue: string; batchSize: number; workerId: string; now: Date }): Promise<readonly JobRow[]> {
    const client = this.prisma.client as unknown as PrismaTx;
    return this.prisma.transaction(async (tx) => {
      const candidates = (await (tx as unknown as PrismaTx).job.findMany({
        where: {
          queue: args.queue,
          status: 'queued',
          runAt: { lte: args.now },
        },
        orderBy: [{ priority: 'desc' }, { runAt: 'asc' }],
        take: args.batchSize,
        select: { id: true },
      })) as Array<{ id: string }>;
      if (candidates.length === 0) {
        return [] as readonly JobRow[];
      }
      const ids = candidates.map((c) => c.id);
      await (tx as unknown as PrismaTx).job.updateMany({
        where: { id: { in: ids }, status: 'queued' },
        data: {
          status: 'claimed',
          claimedAt: args.now,
          claimedBy: args.workerId,
        },
      });
      const rows = await (tx as unknown as PrismaTx).job.findMany({ where: { id: { in: ids } } });
      return rows.map(mapRow);
    }).catch(async () => {
      const rows = await client.job.findMany({
        where: { queue: args.queue, status: 'queued', runAt: { lte: args.now } },
        orderBy: [{ priority: 'desc' }, { runAt: 'asc' }],
        take: args.batchSize,
      });
      return rows.map(mapRow);
    });
  }

  public async markRunning(id: string): Promise<void> {
    const c = this.client();
    await c.job.updateMany({
      where: { id, status: 'claimed' },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  public async complete(id: string, args: CompleteJobArgs): Promise<void> {
    const c = this.client();
    const data: Prisma.JobUncheckedUpdateInput = {
      status: args.status,
      completedAt: args.status === 'completed' ? new Date() : null,
    };
    if (args.lastError !== undefined) data.lastError = args.lastError;
    if (args.nextAttemptAt !== undefined) {
      // Re-queue: status='queued', schedule for retry.
      if (args.status === 'failed' && args.nextAttemptAt !== null) {
        data.status = 'queued';
        data.runAt = args.nextAttemptAt;
        data.claimedAt = null;
        data.claimedBy = null;
        data.startedAt = null;
      }
    }
    await c.job.updateMany({ where: { id }, data });
  }

  public async resetForReplay(id: string): Promise<number> {
    const c = this.client();
    const result = await c.job.updateMany({
      where: { id, status: { in: ['failed', 'dead', 'completed'] } },
      data: {
        status: 'queued',
        runAt: new Date(),
        claimedAt: null,
        claimedBy: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
      },
    });
    return result.count;
  }
}

interface Raw {
  id: string;
  schoolId: string | null;
  queue: string;
  type: string;
  payload: Prisma.JsonValue;
  priority: number;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(r: Raw): JobRow {
  return {
    id: r.id,
    schoolId: r.schoolId,
    queue: r.queue,
    type: r.type,
    payload: r.payload,
    priority: r.priority,
    status: r.status as JobStatus,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    runAt: r.runAt,
    claimedAt: r.claimedAt,
    claimedBy: r.claimedBy,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };
}
