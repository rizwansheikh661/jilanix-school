/**
 * NotificationEventRegistry — runtime accessor over the static
 * `NOTIFICATION_EVENTS` catalog. Exposed as an `@Injectable()` so services
 * + controllers can `get(key)` / `has(key)` without importing the catalog
 * map directly, and so unit tests can `jest.spyOn` lookup behaviour.
 *
 * Sprint 10 ships a single read-only registry seeded at module-load time.
 * Future sprints may add per-tenant overrides (e.g. school-specific event
 * gating) via a mutable wrapper that delegates to this base.
 */
import { Injectable } from '@nestjs/common';

import {
  NOTIFICATION_EVENTS,
  type NotificationEventDefinition,
} from './notification-events.catalog';
import { NotificationEventUnknownError } from './notifications.errors';

@Injectable()
export class NotificationEventRegistry {
  private readonly events: Map<string, NotificationEventDefinition>;

  constructor() {
    const entries = Object.values(NOTIFICATION_EVENTS).map(
      (definition) => [definition.key, definition] as const,
    );
    this.events = new Map(entries);
  }

  /** Return every registered event definition (insertion order). */
  public getAll(): NotificationEventDefinition[] {
    return Array.from(this.events.values());
  }

  /** Resolve one event by key; throws `NotificationEventUnknownError` if absent. */
  public get(key: string): NotificationEventDefinition {
    const definition = this.events.get(key);
    if (!definition) {
      throw new NotificationEventUnknownError(key);
    }
    return definition;
  }

  /** True when the catalog knows the event key. */
  public has(key: string): boolean {
    return this.events.has(key);
  }

  /**
   * Register an additional event definition at runtime — used by feature
   * modules that want to extend the catalog beyond the static
   * `NOTIFICATION_EVENTS` baseline (e.g. Sprint 11's Events module adds
   * its lifecycle keys here). Idempotent: re-registering the same key
   * replaces the prior definition.
   */
  public register(definition: NotificationEventDefinition): void {
    this.events.set(definition.key, definition);
  }
}
