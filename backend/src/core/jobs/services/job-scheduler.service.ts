import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ConfigService } from '../../config';
import { InvalidCronExpressionError } from '../jobs.errors';
import type { JobDefinitionRow } from '../jobs.types';
import { JobDefinitionRepository } from '../repositories/job-definition.repository';
import { JobEnqueueService } from './job-enqueue.service';

/**
 * Cron scheduler. Periodically scans active JobDefinitions with a
 * scheduleCron and enqueues a Job when the previous occurrence has
 * passed and a new one is due.
 *
 * Cron grammar (5-field): minute hour day-of-month month day-of-week.
 * Supported tokens for Sprint 5:
 *   - `*` (any)
 *   - `*\/N` (every N) — minute/hour only
 *   - integer literal
 *   - comma list (e.g. `1,15,30`)
 *
 * To swap in a richer parser later, replace `nextFireAfter` only.
 * Dedup: we keep `lastFired` in-memory keyed by definition id to avoid
 * re-firing within the same minute window. Tolerable: scheduler is the
 * single in-process scheduler; multi-replica scheduling lands with a
 * leader-lock in Sprint 7.
 */
@Injectable()
export class JobSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = false;
  private readonly lastFired = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly definitions: JobDefinitionRepository,
    private readonly enqueueService: JobEnqueueService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.queue.processorEnabled) {
      this.logger.log('Job scheduler disabled (JOBS_PROCESSOR_ENABLED=false).');
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
    // Scheduler ticks at most once per minute.
    const interval = Math.max(this.config.queue.pollIntervalMs * 5, 30_000);
    this.timer = setInterval(() => {
      void this.tickSafe();
    }, interval);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(`Job scheduler started (interval=${interval}ms).`);
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick(now: Date = new Date()): Promise<{ scheduled: number }> {
    const defs = await this.definitions.listActiveScheduled();
    let scheduled = 0;
    for (const def of defs) {
      if (def.scheduleCron === null) continue;
      try {
        if (this.shouldFire(def, now)) {
          await this.enqueueService.enqueue({
            queue: def.queue,
            handlerName: def.handlerName,
            schoolId: def.schoolId,
            payload: (def.payloadTemplate ?? {}) as Prisma.InputJsonValue,
          });
          this.lastFired.set(def.id, this.minuteKey(now));
          scheduled += 1;
        }
      } catch (err) {
        if (err instanceof InvalidCronExpressionError) {
          this.logger.warn(`definition ${def.id} cron="${def.scheduleCron}" invalid; skipping.`);
        } else {
          this.logger.error(
            `scheduler failed for definition ${def.id}: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }
    }
    return { scheduled };
  }

  private async tickSafe(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      const result = await this.tick();
      if (result.scheduled > 0) {
        this.logger.debug(`scheduler tick scheduled=${result.scheduled}`);
      }
    } catch (err) {
      this.logger.error(`scheduler tick failed: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.draining = false;
    }
  }

  private shouldFire(def: JobDefinitionRow, now: Date): boolean {
    if (def.scheduleCron === null) return false;
    const key = this.minuteKey(now);
    if (this.lastFired.get(def.id) === key) return false;
    return this.cronMatches(def.scheduleCron, now);
  }

  private minuteKey(date: Date): number {
    return Math.floor(date.getTime() / 60_000);
  }

  /**
   * Minimal cron matcher. Tokens supported per field: `*`, `*\/N` (minute
   * and hour only), integer, comma list. Anything else throws.
   */
  public cronMatches(expression: string, date: Date): boolean {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new InvalidCronExpressionError(expression);
    }
    const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
    const m = date.getMinutes();
    const h = date.getHours();
    const d = date.getDate();
    const mo = date.getMonth() + 1;
    const dw = date.getDay();
    return (
      this.matchField(minute, m, 0, 59, true) &&
      this.matchField(hour, h, 0, 23, true) &&
      this.matchField(dom, d, 1, 31, false) &&
      this.matchField(month, mo, 1, 12, false) &&
      this.matchField(dow, dw, 0, 6, false)
    );
  }

  private matchField(token: string, value: number, min: number, max: number, allowStep: boolean): boolean {
    if (token === '*') return true;
    if (allowStep) {
      const stepMatch = /^\*\/(\d+)$/.exec(token);
      if (stepMatch !== null) {
        const step = Number(stepMatch[1]);
        if (!Number.isFinite(step) || step <= 0) return false;
        return value % step === 0;
      }
    }
    if (token.includes(',')) {
      return token.split(',').some((part) => this.matchSingle(part, value, min, max));
    }
    return this.matchSingle(token, value, min, max);
  }

  private matchSingle(token: string, value: number, min: number, max: number): boolean {
    const n = Number(token);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return false;
    if (n < min || n > max) return false;
    return n === value;
  }
}
