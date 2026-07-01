import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';

import { ConfigService } from '../../config';
import { OUTBOX_STATUS } from '../outbox.constants';
import type { OutboxEventRow } from '../outbox.types';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxHandlerRegistry } from './outbox-handler.registry';

/**
 * Periodic dispatcher. When `OUTBOX_DISPATCHER_ENABLED=true`, claims a
 * batch of pending events, invokes the registered topic handler, and
 * marks delivered/failed/dead. On transient failure, schedules a
 * back-off using `nextAttemptAt = now + backoff(attempt)`.
 *
 * The dispatcher is process-local. Running multiple API replicas is
 * safe because the claim step uses `SELECT … FOR UPDATE SKIP LOCKED` on
 * MySQL 8 (with a graceful fallback for SQLite tests).
 */
@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly repo: OutboxRepository,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.outbox.dispatcherEnabled) {
      this.logger.log('Outbox dispatcher disabled (OUTBOX_DISPATCHER_ENABLED=false).');
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
    const interval = this.config.outbox.pollIntervalMs;
    this.timer = setInterval(() => {
      void this.tickSafe();
    }, interval);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(`Outbox dispatcher started (interval=${interval}ms).`);
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Drain one batch. Public for tests and the replay path. */
  public async tick(): Promise<{ claimed: number; delivered: number; failed: number; dead: number }> {
    const batchSize = this.config.outbox.dispatchBatchSize;
    const rows = await this.repo.claimBatch({ batchSize, now: new Date() });
    let delivered = 0;
    let failed = 0;
    let dead = 0;
    for (const row of rows) {
      const result = await this.dispatchOne(row);
      if (result === 'delivered') delivered += 1;
      else if (result === 'dead') dead += 1;
      else failed += 1;
    }
    return { claimed: rows.length, delivered, failed, dead };
  }

  private async tickSafe(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      const result = await this.tick();
      if (result.claimed > 0) {
        this.logger.debug(
          `outbox tick claimed=${result.claimed} delivered=${result.delivered} failed=${result.failed} dead=${result.dead}`,
        );
      }
    } catch (err) {
      this.logger.error(`outbox tick failed: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.draining = false;
    }
  }

  private async dispatchOne(row: OutboxEventRow): Promise<'delivered' | 'failed' | 'dead'> {
    const handler = this.registry.getHandler(row.topic);
    if (handler === undefined) {
      const dead = row.attempts >= this.config.outbox.maxAttempts;
      await this.repo.markFailed(row.id, {
        lastError: `No handler registered for topic "${row.topic}".`,
        nextAttemptAt: dead ? null : this.computeNextAttemptAt(row.attempts),
        dead,
      });
      return dead ? 'dead' : 'failed';
    }

    try {
      await handler(row);
      await this.repo.markDelivered(row.id);
      return 'delivered';
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      const dead = row.attempts >= this.config.outbox.maxAttempts;
      await this.repo.markFailed(row.id, {
        lastError: message,
        nextAttemptAt: dead ? null : this.computeNextAttemptAt(row.attempts),
        dead,
      });
      return dead ? 'dead' : 'failed';
    }
  }

  private computeNextAttemptAt(currentAttempts: number): Date {
    // Exponential backoff: 30s, 2m, 10m, 1h, 4h … capped at 24h.
    const stepsMs = [30_000, 120_000, 600_000, 3_600_000, 14_400_000, 86_400_000];
    const idx = Math.min(currentAttempts, stepsMs.length - 1);
    return new Date(Date.now() + stepsMs[idx]!);
  }

  /** Visible for diagnostics. */
  public get statusKeys() {
    return OUTBOX_STATUS;
  }
}
