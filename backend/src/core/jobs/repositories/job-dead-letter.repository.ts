import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { JobDeadLetterRow, JobDeadLetterStatus } from '../jobs.types';

export interface CreateDeadLetterInput {
  readonly id: string;
  readonly jobId: string;
  readonly definitionId: string | null;
  readonly schoolId: string | null;
  readonly queue: string;
  readonly handlerName: string;
  readonly payload: Prisma.InputJsonValue;
  readonly attempts: number;
  readonly firstFailedAt: Date;
  readonly lastFailedAt: Date;
  readonly lastError: string | null;
}

export interface ListDeadLetterArgs {
  readonly schoolId?: string | null;
  readonly status?: JobDeadLetterStatus;
  readonly queue?: string;
  readonly limit: number;
}

@Injectable()
export class JobDeadLetterRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateDeadLetterInput, tx?: PrismaTx): Promise<JobDeadLetterRow> {
    const c = this.client(tx);
    const row = await c.jobDeadLetter.create({
      data: {
        id: input.id,
        jobId: input.jobId,
        definitionId: input.definitionId,
        schoolId: input.schoolId,
        queue: input.queue,
        handlerName: input.handlerName,
        payload: input.payload,
        attempts: input.attempts,
        firstFailedAt: input.firstFailedAt,
        lastFailedAt: input.lastFailedAt,
        lastError: input.lastError,
      },
    });
    return mapRow(row);
  }

  public async findById(id: string): Promise<JobDeadLetterRow | null> {
    const c = this.client();
    const row = await c.jobDeadLetter.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListDeadLetterArgs): Promise<readonly JobDeadLetterRow[]> {
    const c = this.client();
    const where: Prisma.JobDeadLetterWhereInput = {};
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.status !== undefined) where.status = args.status;
    if (args.queue !== undefined) where.queue = args.queue;
    const rows = await c.jobDeadLetter.findMany({
      where,
      orderBy: { lastFailedAt: 'desc' },
      take: args.limit,
    });
    return rows.map(mapRow);
  }

  public async markReplayed(id: string): Promise<number> {
    const c = this.client();
    const result = await c.jobDeadLetter.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REPLAYED', replayedAt: new Date(), version: { increment: 1 } },
    });
    return result.count;
  }

  public async archive(id: string): Promise<number> {
    const c = this.client();
    const result = await c.jobDeadLetter.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'ARCHIVED', version: { increment: 1 } },
    });
    return result.count;
  }
}

interface Raw {
  id: string;
  jobId: string;
  definitionId: string | null;
  schoolId: string | null;
  queue: string;
  handlerName: string;
  payload: Prisma.JsonValue;
  attempts: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  lastError: string | null;
  status: JobDeadLetterStatus;
  replayedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(r: Raw): JobDeadLetterRow {
  return {
    id: r.id,
    jobId: r.jobId,
    definitionId: r.definitionId,
    schoolId: r.schoolId,
    queue: r.queue,
    handlerName: r.handlerName,
    payload: r.payload,
    attempts: r.attempts,
    firstFailedAt: r.firstFailedAt,
    lastFailedAt: r.lastFailedAt,
    lastError: r.lastError,
    status: r.status,
    replayedAt: r.replayedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };
}
