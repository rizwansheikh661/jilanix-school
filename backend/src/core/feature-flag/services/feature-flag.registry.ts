import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ulid } from 'ulid';

import type { CodeSideFlagRegistration } from '../feature-flag.types';
import { FeatureFlagDefinitionRepository } from '../repositories/feature-flag-definition.repository';

/**
 * Code-side flag registry. Modules call `register({ key, kind, defaultValue, … })`
 * at boot — the registry persists each entry to `feature_flag_definitions`
 * idempotently so the DB row matches the latest code definition.
 *
 * Registrations are kept in-memory so the service can refuse evaluation
 * for unknown keys, even if the DB row was manually deleted.
 */
@Injectable()
export class FeatureFlagRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeatureFlagRegistry.name);
  private readonly registrations = new Map<string, CodeSideFlagRegistration>();
  private bootstrapped = false;

  constructor(private readonly defs: FeatureFlagDefinitionRepository) {}

  public register(entry: CodeSideFlagRegistration): void {
    const existing = this.registrations.get(entry.key);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(entry)) {
      this.logger.warn(`Feature flag "${entry.key}" re-registered with different shape.`);
    }
    this.registrations.set(entry.key, entry);
  }

  public has(key: string): boolean {
    return this.registrations.has(key);
  }

  public get(key: string): CodeSideFlagRegistration | undefined {
    return this.registrations.get(key);
  }

  public list(): readonly CodeSideFlagRegistration[] {
    return Array.from(this.registrations.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    try {
      await this.upsertAll();
    } catch (err) {
      this.logger.error(
        `Feature-flag registry bootstrap failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  public async upsertAll(): Promise<void> {
    for (const entry of this.registrations.values()) {
      await this.defs.upsertByKey({
        id: ulid(),
        key: entry.key,
        name: entry.name,
        description: entry.description ?? null,
        kind: entry.kind,
        owner: entry.owner ?? null,
        defaultValue: entry.defaultValue,
        lifecycle: 'INTRODUCED',
        cleanupDueAt: null,
        createdBy: null,
      });
    }
    this.logger.log(`Feature-flag registry: ${this.registrations.size} keys upserted.`);
  }
}
