import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { OutboxHandlerRegistry } from '../../outbox/services/outbox-handler.registry';
import type { OutboxEventRow } from '../../outbox/outbox.types';
import { FEATURE_FLAG_CHANGED_TOPIC } from '../feature-flag.constants';
import { FeatureFlagCacheService } from './feature-flag-cache.service';

/**
 * Subscribes to the `feature_flag.changed` outbox topic and clears the
 * relevant entry in the in-process cache. Co-located with the cache so
 * it ships and tears down together.
 */
@Injectable()
export class FeatureFlagCacheInvalidator implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeatureFlagCacheInvalidator.name);

  constructor(
    private readonly cache: FeatureFlagCacheService,
    private readonly handlerRegistry: OutboxHandlerRegistry,
  ) {}

  public onApplicationBootstrap(): void {
    this.handlerRegistry.registerTopic(FEATURE_FLAG_CHANGED_TOPIC, async (event) => {
      this.invalidate(event);
      return Promise.resolve();
    });
    this.logger.log(`Subscribed to "${FEATURE_FLAG_CHANGED_TOPIC}" for cache invalidation.`);
  }

  private invalidate(event: OutboxEventRow): void {
    const payload = event.payload as { flagKey?: unknown } | null;
    if (payload !== null && typeof payload === 'object' && typeof payload.flagKey === 'string') {
      this.cache.invalidate(payload.flagKey);
    } else {
      this.cache.invalidateAll();
    }
  }
}
