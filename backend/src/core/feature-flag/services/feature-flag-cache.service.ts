import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '../../config/config.service';
import type { FeatureFlagEvaluation } from '../feature-flag.types';

interface CacheEntry {
  readonly evaluation: FeatureFlagEvaluation;
  readonly expiresAtMs: number;
}

/**
 * In-memory TTL cache for evaluated flag values. Keyed by
 * `${schoolId ?? '__platform__'}::${flagKey}`. Entries are invalidated by:
 *   - TTL expiry (lazy on read).
 *   - Explicit `invalidate(flagKey)` / `invalidateAll()` calls.
 *   - A `feature_flag.changed` outbox event observed by the in-process
 *     handler wired in `FeatureFlagModule`.
 *
 * The cache is process-local — multi-replica deployments rely on the
 * outbox handler being invoked on every node (Sprint 5 ships with the
 * dispatcher running in-API; multi-node fan-out is Sprint 7).
 */
@Injectable()
export class FeatureFlagCacheService {
  private readonly logger = new Logger(FeatureFlagCacheService.name);
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.ttlMs = Math.max(1, config.featureFlagsRuntime.cacheTtlSeconds) * 1000;
  }

  public get(schoolId: string | null, key: string): FeatureFlagEvaluation | undefined {
    const cacheKey = this.cacheKey(schoolId, key);
    const entry = this.entries.get(cacheKey);
    if (entry === undefined) return undefined;
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(cacheKey);
      return undefined;
    }
    return entry.evaluation;
  }

  public set(schoolId: string | null, key: string, evaluation: FeatureFlagEvaluation): void {
    this.entries.set(this.cacheKey(schoolId, key), {
      evaluation,
      expiresAtMs: Date.now() + this.ttlMs,
    });
  }

  public invalidate(key: string): number {
    let removed = 0;
    const suffix = `::${key}`;
    for (const cacheKey of this.entries.keys()) {
      if (cacheKey.endsWith(suffix)) {
        this.entries.delete(cacheKey);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Feature-flag cache invalidated ${removed} entries for "${key}".`);
    }
    return removed;
  }

  public invalidateAll(): void {
    const size = this.entries.size;
    this.entries.clear();
    this.logger.debug(`Feature-flag cache cleared (${size} entries).`);
  }

  public size(): number {
    return this.entries.size;
  }

  private cacheKey(schoolId: string | null, key: string): string {
    return `${schoolId ?? '__platform__'}::${key}`;
  }
}
