/**
 * SubscriptionGuardService — entry-point used by all feature modules to
 * gate operations on the per-school plan + usage state.
 *
 * Public API (all read-only except `assertAndConsume`):
 *   - checkPlanStatus(schoolId)               : returns the active
 *                                               subscription, or throws
 *                                               SubscriptionInactiveError.
 *   - checkFeatureAvailability(schoolId, key) : returns mode/limit metadata;
 *                                               throws FeatureDisabledError /
 *                                               FeatureNotInPlanError.
 *   - checkLimitAvailability(schoolId, key)   : returns used/limit/remaining
 *                                               for a LIMIT feature without
 *                                               consuming.
 *   - checkUsageRemaining(schoolId, key, by)  : returns true iff there is
 *                                               headroom for `by` units.
 *   - assertAndConsume(schoolId, key, by)     : atomic gate + counter bump.
 *                                               Throws on over-limit unless
 *                                               the ENFORCE_LIMITS flag is
 *                                               off (then logs only). Accepts
 *                                               an outer tx so callers can
 *                                               join the consume into their
 *                                               own create transaction.
 *   - assertMutationAllowed(schoolId)         : status-only gate; used by the
 *                                               global write-guard interceptor
 *                                               and delete paths.
 *   - releaseUsage(schoolId, key, by)         : counter decrement on soft-
 *                                               delete. Records a negative-
 *                                               delta UsageEvent so recompute
 *                                               sees the release. Threshold
 *                                               band is intentionally NOT
 *                                               reset (edge-trigger memory).
 *
 * Threshold notifications:
 *   `assertAndConsume` consults the UsageThresholdState repo's
 *   compare-and-set helper to dispatch a 80/90/100% notification at most
 *   once per band crossing. Notification dispatch is gated by the
 *   NOTIFY_THRESHOLDS feature flag.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { PlanFeatureRepository } from '../plan-feature/plan-feature.repository';
import {
  LIMIT_FEATURE_KEY_TO_USAGE_COLUMN,
  isLimitFeatureKey,
  type BuiltInLimitFeatureKey,
} from '../plan-feature/feature-keys';
import {
  SubscriptionFeatureFlags,
  SubscriptionOutboxTopics,
} from '../subscription.constants';
import {
  FeatureDisabledError,
  FeatureLimitExceededError,
  FeatureNotInPlanError,
  SubscriptionInactiveError,
} from '../subscription.errors';
import type {
  SchoolUsageRow,
} from '../subscription.types';
import { SubscriptionRepository } from '../subscription/subscription.repository';
import { SchoolUsageRepository } from '../usage/school-usage.repository';
import { UsageEventRepository } from '../usage/usage-event.repository';
import {
  UsageThresholdStateRepository,
  deriveBand,
} from '../usage/usage-threshold-state.repository';
import type {
  AssertAndConsumeResult,
  FeatureAvailabilityResult,
  LimitAvailabilityResult,
  PlanStatusResult,
} from './subscription-guard.types';

const USABLE_STATUSES = new Set(['TRIAL', 'ACTIVE', 'EXPIRING']);

@Injectable()
export class SubscriptionGuardService {
  private readonly logger = new Logger(SubscriptionGuardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionRepository,
    private readonly features: PlanFeatureRepository,
    private readonly usage: SchoolUsageRepository,
    private readonly events: UsageEventRepository,
    private readonly thresholds: UsageThresholdStateRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
  ) {}

  // -------------------------------------------------------------------------
  // checkPlanStatus
  // -------------------------------------------------------------------------

  public async checkPlanStatus(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<PlanStatusResult> {
    const subscription = await this.subs.findActiveBySchool(schoolId, tx);
    if (subscription === null) {
      throw new SubscriptionInactiveError(schoolId, 'no_subscription');
    }
    const isUsable = USABLE_STATUSES.has(subscription.status);
    if (!isUsable) {
      throw new SubscriptionInactiveError(schoolId, subscription.status);
    }
    return { subscription, isUsable };
  }

  // -------------------------------------------------------------------------
  // checkFeatureAvailability
  // -------------------------------------------------------------------------

  public async checkFeatureAvailability(
    schoolId: string,
    featureKey: string,
    tx?: PrismaTx,
  ): Promise<FeatureAvailabilityResult> {
    const { subscription } = await this.checkPlanStatus(schoolId, tx);
    const feature = await this.features.findActiveByKey(subscription.planId, featureKey, tx);
    if (feature === null) {
      throw new FeatureNotInPlanError(schoolId, featureKey);
    }
    if (feature.mode === 'DISABLED') {
      throw new FeatureDisabledError(schoolId, featureKey);
    }
    return {
      featureKey,
      featureType: feature.featureType,
      mode: feature.mode,
      limit: feature.limit,
      available: true,
      feature,
    };
  }

  // -------------------------------------------------------------------------
  // checkLimitAvailability
  // -------------------------------------------------------------------------

  public async checkLimitAvailability(
    schoolId: string,
    featureKey: string,
    tx?: PrismaTx,
  ): Promise<LimitAvailabilityResult> {
    const result = await this.checkFeatureAvailability(schoolId, featureKey, tx);
    if (result.featureType !== 'LIMIT') {
      throw new Error(
        `checkLimitAvailability: feature "${featureKey}" is TOGGLE, not LIMIT.`,
      );
    }
    const usage = await this.usage.findBySchool(schoolId, tx);
    const used = readUsageCounter(usage, featureKey);
    if (result.mode === 'UNLIMITED') {
      return {
        featureKey,
        used,
        limit: null,
        remaining: null,
        percent: 0,
        capped: false,
      };
    }
    const limit = result.limit ?? 0;
    const remaining = Math.max(0, limit - used);
    const percent = limit === 0 ? 100 : Math.floor((used / limit) * 100);
    return {
      featureKey,
      used,
      limit,
      remaining,
      percent,
      capped: true,
    };
  }

  // -------------------------------------------------------------------------
  // checkUsageRemaining
  // -------------------------------------------------------------------------

  public async checkUsageRemaining(
    schoolId: string,
    featureKey: string,
    by: number,
    tx?: PrismaTx,
  ): Promise<boolean> {
    const limit = await this.checkLimitAvailability(schoolId, featureKey, tx);
    if (!limit.capped) return true;
    return limit.used + by <= (limit.limit ?? 0);
  }

  // -------------------------------------------------------------------------
  // assertMutationAllowed — status-only gate for the global write-guard and
  // for delete paths (which do not consume limits but must still block on an
  // unusable subscription status).
  // -------------------------------------------------------------------------

  public async assertMutationAllowed(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    await this.checkPlanStatus(schoolId, tx);
  }

  // -------------------------------------------------------------------------
  // assertAndConsume
  // -------------------------------------------------------------------------

  public async assertAndConsume(
    schoolId: string,
    featureKey: string,
    by: number,
    sourceRef?: string | null,
    tx?: PrismaTx,
  ): Promise<AssertAndConsumeResult> {
    if (by <= 0) {
      throw new Error('assertAndConsume: `by` must be a positive integer.');
    }
    if (!isLimitFeatureKey(featureKey)) {
      throw new Error(
        `assertAndConsume: featureKey "${featureKey}" is not a LIMIT-typed built-in key.`,
      );
    }

    const run = (innerTx: PrismaTx) =>
      this.assertAndConsumeInTx(schoolId, featureKey, by, sourceRef ?? null, innerTx);

    if (tx !== undefined) {
      return run(tx);
    }
    return this.prisma.transaction(async (rawTx) =>
      run(rawTx as unknown as PrismaTx),
    );
  }

  // -------------------------------------------------------------------------
  // releaseUsage — counter decrement on soft-delete. Blocks on inactive
  // status. Records a negative-delta UsageEvent so SchoolUsageService.recompute
  // sees the release.
  // -------------------------------------------------------------------------

  public async releaseUsage(
    schoolId: string,
    featureKey: BuiltInLimitFeatureKey,
    by: number,
    sourceRef?: string | null,
    tx?: PrismaTx,
  ): Promise<void> {
    if (by <= 0) {
      throw new Error('releaseUsage: `by` must be a positive integer.');
    }
    if (!isLimitFeatureKey(featureKey)) {
      throw new Error(
        `releaseUsage: featureKey "${featureKey}" is not a LIMIT-typed built-in key.`,
      );
    }

    const run = async (innerTx: PrismaTx) => {
      await this.assertMutationAllowed(schoolId, innerTx);
      const snapshot = await this.ensureUsage(schoolId, innerTx);
      const currentUsed = readUsageCounter(snapshot, featureKey);
      const delta = Math.min(by, currentUsed);
      if (delta <= 0) {
        return;
      }
      const column = LIMIT_FEATURE_KEY_TO_USAGE_COLUMN[featureKey];
      if (column === 'storageBytesUsed') {
        await this.usage.incrementColumn(schoolId, snapshot.id, column, -BigInt(delta), innerTx);
      } else {
        await this.usage.incrementColumn(schoolId, snapshot.id, column, -delta, innerTx);
      }
      await this.events.record(
        {
          schoolId,
          featureKey,
          delta: -delta,
          sourceRef: sourceRef ?? null,
        },
        innerTx,
      );
    };

    if (tx !== undefined) {
      await run(tx);
      return;
    }
    await this.prisma.transaction(async (rawTx) =>
      run(rawTx as unknown as PrismaTx),
    );
  }

  // -------------------------------------------------------------------------
  // private
  // -------------------------------------------------------------------------

  private async assertAndConsumeInTx(
    schoolId: string,
    featureKey: string,
    by: number,
    sourceRef: string | null,
    tx: PrismaTx,
  ): Promise<AssertAndConsumeResult> {
    const { subscription } = await this.checkPlanStatus(schoolId, tx);
    const feature = await this.features.findActiveByKey(subscription.planId, featureKey, tx);
    if (feature === null) throw new FeatureNotInPlanError(schoolId, featureKey);
    if (feature.mode === 'DISABLED') throw new FeatureDisabledError(schoolId, featureKey);

    const snapshot = await this.ensureUsage(schoolId, tx);
    const used = readUsageCounter(snapshot, featureKey);
    const projected = used + by;

    const enforce = await this.featureFlags.isEnabled(
      SubscriptionFeatureFlags.ENFORCE_LIMITS,
      { schoolId },
    );
    const limit = feature.limit ?? 0;
    if (feature.mode === 'LIMITED' && enforce && projected > limit) {
      await this.publishLimitExceeded(tx, schoolId, featureKey, used, limit);
      throw new FeatureLimitExceededError(schoolId, featureKey, used, limit);
    }
    if (feature.mode === 'LIMITED' && !enforce && projected > limit) {
      this.logger.warn(
        `Over-limit consume soft-allowed (ENFORCE_LIMITS off) school=${schoolId} key=${featureKey} used=${used.toString()} +${by.toString()} limit=${limit.toString()}.`,
      );
    }

    const column = LIMIT_FEATURE_KEY_TO_USAGE_COLUMN[featureKey as BuiltInLimitFeatureKey];
    const updated =
      column === 'storageBytesUsed'
        ? await this.usage.incrementColumn(schoolId, snapshot.id, column, BigInt(by), tx)
        : await this.usage.incrementColumn(schoolId, snapshot.id, column, by, tx);
    await this.events.record(
      {
        schoolId,
        featureKey,
        delta: by,
        sourceRef,
      },
      tx,
    );

    const newUsed = readUsageCounter(updated, featureKey);
    const newPercent =
      feature.mode === 'LIMITED' && limit > 0
        ? Math.min(100, Math.floor((newUsed / limit) * 100))
        : 0;
    const band = feature.mode === 'LIMITED' ? deriveBand(newPercent) : null;

    let crossed = false;
    if (band !== null) {
      const advance = await this.thresholds.tryAdvanceBand(
        schoolId,
        featureKey,
        band,
        newPercent,
        tx,
      );
      crossed = advance.crossed;
      if (crossed) {
        const notify = await this.featureFlags.isEnabled(
          SubscriptionFeatureFlags.NOTIFY_THRESHOLDS,
          { schoolId },
        );
        if (notify) {
          await this.outbox.publish(tx, {
            topic: SubscriptionOutboxTopics.USAGE_THRESHOLD_REACHED,
            eventType: 'UsageThresholdReached',
            aggregateType: 'SchoolUsage',
            aggregateId: updated.id,
            schoolId,
            payload: {
              schoolId,
              featureKey,
              band,
              percent: newPercent,
              used: newUsed,
              limit,
            } as unknown as Prisma.InputJsonValue,
          });
        }
      }
    }

    const remaining =
      feature.mode === 'LIMITED' ? Math.max(0, limit - newUsed) : null;
    return {
      featureKey,
      newPercent,
      remaining,
      band,
      bandCrossed: crossed,
      usage: updated,
    };
  }

  private async ensureUsage(schoolId: string, tx: PrismaTx): Promise<SchoolUsageRow> {
    const existing = await this.usage.findBySchool(schoolId, tx);
    if (existing !== null) return existing;
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    return this.usage.create({ schoolId, usagePeriodStart: periodStart, usagePeriodEnd: periodEnd }, tx);
  }

  private async publishLimitExceeded(
    tx: PrismaTx,
    schoolId: string,
    featureKey: string,
    used: number,
    limit: number,
  ): Promise<void> {
    await this.outbox.publish(tx, {
      topic: SubscriptionOutboxTopics.USAGE_LIMIT_EXCEEDED,
      eventType: 'UsageLimitExceeded',
      aggregateType: 'SchoolUsage',
      aggregateId: schoolId,
      schoolId,
      payload: {
        schoolId,
        featureKey,
        used,
        limit,
      } as unknown as Prisma.InputJsonValue,
    });
  }
}

function readUsageCounter(usage: SchoolUsageRow | null, featureKey: string): number {
  if (usage === null) return 0;
  if (!isLimitFeatureKey(featureKey)) return 0;
  const column = LIMIT_FEATURE_KEY_TO_USAGE_COLUMN[featureKey];
  const raw = usage[column] as number | bigint;
  if (typeof raw === 'bigint') {
    return Number(raw);
  }
  return raw;
}
