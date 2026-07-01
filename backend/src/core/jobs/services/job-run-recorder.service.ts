import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import type { JobRow } from '../jobs.types';
import { JobRunRepository } from '../repositories/job-run.repository';

/**
 * Append-only JobRun recorder. We log one row when a handler starts
 * (status=RUNNING) and one row when it terminates (status=SUCCESS|FAILED).
 * Because job_runs is append-only, we never UPDATE — we INSERT a second
 * row keyed by the same `jobId` and `attempt`. Queries that want the
 * latest state of a given run group by `(jobId, attempt)` and take the
 * most recent `startedAt`.
 */
@Injectable()
export class JobRunRecorderService {
  constructor(private readonly runs: JobRunRepository) {}

  public async startRun(
    job: JobRow,
    definitionId: string | null,
  ): Promise<{ attempt: number; startedAt: Date }> {
    const startedAt = new Date();
    const attempt = job.attempts + 1;
    await this.runs.create({
      id: ulid(),
      jobId: job.id,
      definitionId,
      schoolId: job.schoolId,
      queue: job.queue,
      handlerName: job.type,
      attempt,
      status: 'RUNNING',
      startedAt,
    });
    return { attempt, startedAt };
  }

  public async finishRun(args: {
    job: JobRow;
    definitionId: string | null;
    attempt: number;
    startedAt: Date;
    success: boolean;
    output?: Prisma.InputJsonValue;
    errorMessage?: string | null;
    errorCode?: string | null;
  }): Promise<void> {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - args.startedAt.getTime();
    await this.runs.create({
      id: ulid(),
      jobId: args.job.id,
      definitionId: args.definitionId,
      schoolId: args.job.schoolId,
      queue: args.job.queue,
      handlerName: args.job.type,
      attempt: args.attempt,
      status: args.success ? 'SUCCESS' : 'FAILED',
      startedAt: args.startedAt,
      finishedAt,
      ...(args.output !== undefined ? { outputJson: args.output } : {}),
      errorMessage: args.errorMessage ?? null,
      errorCode: args.errorCode ?? null,
      durationMs,
    });
  }
}
