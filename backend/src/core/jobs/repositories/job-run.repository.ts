import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { JobRunRow, JobRunStatus } from '../jobs.types';

export interface CreateJobRunInput {
  readonly id: string;
  readonly jobId: string | null;
  readonly definitionId: string | null;
  readonly schoolId: string | null;
  readonly queue: string;
  readonly handlerName: string;
  readonly attempt: number;
  readonly status: JobRunStatus;
  readonly startedAt: Date;
  readonly finishedAt?: Date | null;
  readonly errorMessage?: string | null;
  readonly errorCode?: string | null;
  readonly outputJson?: Prisma.InputJsonValue;
  readonly durationMs?: number | null;
}

export interface ListJobRunsArgs {
  readonly schoolId?: string | null;
  readonly definitionId?: string;
  readonly jobId?: string;
  readonly status?: JobRunStatus;
  readonly limit: number;
}

@Injectable()
export class JobRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateJobRunInput, tx?: PrismaTx): Promise<JobRunRow> {
    const c = this.client(tx);
    const row = await c.jobRun.create({
      data: {
        id: input.id,
        jobId: input.jobId,
        definitionId: input.definitionId,
        schoolId: input.schoolId,
        queue: input.queue,
        handlerName: input.handlerName,
        attempt: input.attempt,
        status: input.status,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        errorMessage: input.errorMessage ?? null,
        errorCode: input.errorCode ?? null,
        ...(input.outputJson !== undefined ? { outputJson: input.outputJson } : {}),
        durationMs: input.durationMs ?? null,
      },
    });
    return mapRow(row);
  }

  public async findById(id: string): Promise<JobRunRow | null> {
    const c = this.client();
    const row = await c.jobRun.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListJobRunsArgs): Promise<readonly JobRunRow[]> {
    const c = this.client();
    const where: Prisma.JobRunWhereInput = {};
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.definitionId !== undefined) where.definitionId = args.definitionId;
    if (args.jobId !== undefined) where.jobId = args.jobId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await c.jobRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: args.limit,
    });
    return rows.map(mapRow);
  }
}

interface Raw {
  id: string;
  jobId: string | null;
  definitionId: string | null;
  schoolId: string | null;
  queue: string;
  handlerName: string;
  attempt: number;
  status: JobRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  errorCode: string | null;
  outputJson: Prisma.JsonValue | null;
  durationMs: number | null;
  createdAt: Date;
}

function mapRow(r: Raw): JobRunRow {
  return {
    id: r.id,
    jobId: r.jobId,
    definitionId: r.definitionId,
    schoolId: r.schoolId,
    queue: r.queue,
    handlerName: r.handlerName,
    attempt: r.attempt,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    errorMessage: r.errorMessage,
    errorCode: r.errorCode,
    outputJson: r.outputJson,
    durationMs: r.durationMs,
    createdAt: r.createdAt,
  };
}
