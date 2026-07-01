import { Injectable, Logger } from '@nestjs/common';

import type { JobHandler } from '../jobs.types';

/**
 * In-process registry of named job handlers. Modules call
 * `register('handler.send-sms', handlerFn)` at boot. The processor
 * resolves handlers by `Job.type` (which maps to a definition's
 * `handlerName`).
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly logger = new Logger(JobHandlerRegistry.name);
  private readonly handlers = new Map<string, JobHandler>();

  public register<T = unknown>(handlerName: string, handler: JobHandler<T>): void {
    if (this.handlers.has(handlerName)) {
      this.logger.warn(`Job handler "${handlerName}" replaced.`);
    }
    this.handlers.set(handlerName, handler as JobHandler);
  }

  public get(handlerName: string): JobHandler | undefined {
    return this.handlers.get(handlerName);
  }

  public list(): readonly string[] {
    return Array.from(this.handlers.keys()).sort();
  }
}
