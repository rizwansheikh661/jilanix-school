import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ulid } from 'ulid';

import { ConfigService } from '../../config';
import { JobHandlerRegistry } from '../handlers/job-handler.registry';
import { WORKER_ID_PREFIX } from '../jobs.constants';
import type { JobRow } from '../jobs.types';
import { JobClaimRepository } from '../repositories/job-claim.repository';
import { JobDeadLetterRepository } from '../repositories/job-dead-letter.repository';
import { JobDefinitionRepository } from '../repositories/job-definition.repository';
import { JobRunRecorderService } from './job-run-recorder.service';

/**
 * Polling job processor. When `JOBS_PROCESSOR_ENABLED=true`, claims a
 * batch of due jobs from each known queue, executes their handler, and
 * records a JobRun row + (on terminal failure) a JobDeadLetter row.
 *
 * Queues: derived from active JobDefinitions every tick. For Sprint 5
 * we poll the default queue ("default") in addition to any discovered
 * queues so on-demand `JobEnqueueService.enqueue({ queue: 'default', …})`
 * works without a definition.
 */
@Injectable()
export class JobProcessorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobProcessorService.name);
  private readonly workerId = `${WORKER_ID_PREFIX}-${ulid()}`;
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly claims: JobClaimRepository,
    private readonly registry: JobHandlerRegistry,
    private readonly recorder: JobRunRecorderService,
    private readonly dlq: JobDeadLetterRepository,
    private readonly definitions: JobDefinitionRepository,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.queue.processorEnabled) {
      this.logger.log('Job processor disabled (JOBS_PROCESSOR_ENABLED=false).');
      return;
    }
    this.start();
  }

  public onModuleDestroy(): void {
    this.stop();
  }

  public start(): void {
    if (this.timer !== null) return;
    this.stopped = false;
    const interval = this.config.queue.pollIntervalMs;
    this.timer = setInterval(() => {
      void this.tickSafe();
    }, interval);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(`Job processor started worker=${this.workerId} interval=${interval}ms.`);
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick(): Promise<{ claimed: number; completed: number; failed: number; dead: number }> {
    const queues = await this.discoverQueues();
    let claimed = 0;
    let completed = 0;
    let failed = 0;
    let dead = 0;
    for (const queue of queues) {
      const rows = await this.claims.claimBatch({
        queue,
        batchSize: this.config.queue.claimBatchSize,
        workerId: this.workerId,
        now: new Date(),
      });
      claimed += rows.length;
      for (const job of rows) {
        const outcome = await this.runOne(job);
        if (outcome === 'completed') completed += 1;
        else if (outcome === 'dead') dead += 1;
        else failed += 1;
      }
    }
    return { claimed, completed, failed, dead };
  }

  private async tickSafe(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      const result = await this.tick();
      if (result.claimed > 0) {
        this.logger.debug(
          `jobs tick claimed=${result.claimed} completed=${result.completed} failed=${result.failed} dead=${result.dead}`,
        );
      }
    } catch (err) {
      this.logger.error(`jobs tick failed: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.draining = false;
    }
  }

  private async runOne(job: JobRow): Promise<'completed' | 'failed' | 'dead'> {
    const definition = await this.definitions.findByName(job.schoolId, job.type).catch(() => null);
    const definitionId = definition?.id ?? null;
    await this.claims.markRunning(job.id);
    const { attempt, startedAt } = await this.recorder.startRun(job, definitionId);

    const handler = this.registry.get(job.type);
    if (handler === undefined) {
      await this.recorder.finishRun({
        job,
        definitionId,
        attempt,
        startedAt,
        success: false,
        errorMessage: `No handler registered with name "${job.type}".`,
        errorCode: 'HANDLER_NOT_REGISTERED',
      });
      const dead = (job.attempts + 1) >= job.maxAttempts;
      await this.markJobFailed(job, definitionId, `handler "${job.type}" not registered`, dead);
      return dead ? 'dead' : 'failed';
    }

    try {
      const output = await handler(job.payload, { job, attempt });
      await this.recorder.finishRun({
        job,
        definitionId,
        attempt,
        startedAt,
        success: true,
        ...(output !== undefined && output !== null ? { output } : {}),
      });
      await this.claims.complete(job.id, { status: 'completed' });
      return 'completed';
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      await this.recorder.finishRun({
        job,
        definitionId,
        attempt,
        startedAt,
        success: false,
        errorMessage: message,
      });
      const dead = (job.attempts + 1) >= job.maxAttempts;
      await this.markJobFailed(job, definitionId, message, dead);
      return dead ? 'dead' : 'failed';
    }
  }

  private async markJobFailed(
    job: JobRow,
    definitionId: string | null,
    lastError: string,
    dead: boolean,
  ): Promise<void> {
    if (dead) {
      await this.claims.complete(job.id, { status: 'dead', lastError });
      await this.dlq.create({
        id: ulid(),
        jobId: job.id,
        definitionId,
        schoolId: job.schoolId,
        queue: job.queue,
        handlerName: job.type,
        payload: job.payload as never,
        attempts: job.attempts + 1,
        firstFailedAt: job.startedAt ?? new Date(),
        lastFailedAt: new Date(),
        lastError,
      });
      return;
    }
    const nextAttemptAt = this.computeBackoff(job.attempts + 1);
    await this.claims.complete(job.id, { status: 'failed', lastError, nextAttemptAt });
  }

  private computeBackoff(attempts: number): Date {
    const csv = this.config.queue.defaultBackoffMs;
    const idx = Math.min(attempts - 1, csv.length - 1);
    return new Date(Date.now() + (csv[idx] ?? 30_000));
  }

  private async discoverQueues(): Promise<readonly string[]> {
    const rows = await this.definitions.list({ isActive: true, limit: 1000 });
    const set = new Set<string>(['default']);
    for (const r of rows) set.add(r.queue);
    return Array.from(set);
  }
}
