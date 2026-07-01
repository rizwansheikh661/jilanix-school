import { Injectable, Logger } from '@nestjs/common';

import type { OutboxHandler } from '../outbox.types';

/**
 * In-process registry of topic handlers. Downstream modules register at
 * boot via `registerTopic(topic, handler)`; the dispatcher resolves the
 * handler when draining the outbox.
 *
 * Topics are matched by literal string. Wildcard / namespace routing
 * (`notification.*`) is a Sprint 6 concern when we add real transports.
 */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly logger = new Logger(OutboxHandlerRegistry.name);
  private readonly handlers = new Map<string, OutboxHandler>();

  public registerTopic(topic: string, handler: OutboxHandler): void {
    if (this.handlers.has(topic)) {
      this.logger.warn(`Outbox handler for topic "${topic}" replaced.`);
    }
    this.handlers.set(topic, handler);
  }

  public getHandler(topic: string): OutboxHandler | undefined {
    return this.handlers.get(topic);
  }

  public listTopics(): readonly string[] {
    return Array.from(this.handlers.keys()).sort();
  }
}
