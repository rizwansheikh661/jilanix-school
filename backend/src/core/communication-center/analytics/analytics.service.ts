/**
 * AnalyticsService — backend communication analytics.
 *
 * Derives rate-style metrics from `NotificationMessage` aggregations:
 *   - delivery rate = DELIVERED / total
 *   - read rate     = READ / DELIVERED  (falls back to 0 when DELIVERED=0)
 *   - failure rate  = (FAILED + DEAD_LETTER) / total
 *   - retry count   = SUM(attemptCount) - total  (i.e. attempts beyond first)
 *   - channel mix   = groupByChannel
 *
 * Reuses `CommunicationCenterMetricsRepository`. No new storage.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequestContextRegistry } from '../../request-context';
import {
  CommunicationCenterMetricsRepository,
  type ByChannelRow,
  type CommunicationFilters,
} from '../communication-center-metrics.repository';
import { CommunicationCenterFeatureFlags } from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';

export interface AnalyticsSummary {
  readonly total: number;
  readonly delivered: number;
  readonly read: number;
  readonly failed: number;
  readonly attemptedTotal: number;
  readonly retryCount: number;
  readonly deliveryRate: number;
  readonly readRate: number;
  readonly failureRate: number;
  readonly channelDistribution: readonly ByChannelRow[];
  readonly generatedAt: Date;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly metrics: CommunicationCenterMetricsRepository,
  ) {}

  public async getSummary(filters: CommunicationFilters): Promise<AnalyticsSummary> {
    const { schoolId } = await this.assertModuleEnabled();
    const base = stripStatus(filters);
    const [total, delivered, read, failed, deadLetter, channelDistribution, attemptedTotal] =
      await Promise.all([
        this.metrics.count(schoolId, base),
        this.metrics.count(schoolId, { ...base, status: 'DELIVERED' }),
        this.metrics.count(schoolId, { ...base, status: 'READ' }),
        this.metrics.count(schoolId, { ...base, status: 'FAILED' }),
        this.metrics.count(schoolId, { ...base, status: 'DEAD_LETTER' }),
        this.metrics.groupByChannel(schoolId, base),
        this.metrics.sumAttempts(schoolId, base),
      ]);

    const failedAll = failed + deadLetter;
    const deliveryRate = total === 0 ? 0 : delivered / total;
    const readRate = delivered === 0 ? 0 : read / delivered;
    const failureRate = total === 0 ? 0 : failedAll / total;
    const retryCount = Math.max(0, attemptedTotal - total);

    return {
      total,
      delivered,
      read,
      failed: failedAll,
      attemptedTotal,
      retryCount,
      deliveryRate,
      readRate,
      failureRate,
      channelDistribution,
      generatedAt: new Date(),
    };
  }

  private async assertModuleEnabled(): Promise<{ schoolId: string }> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === null || ctx.schoolId === undefined) {
      throw new CommunicationCenterDisabledError();
    }
    const enabled = await this.featureFlags.isEnabled(
      CommunicationCenterFeatureFlags.MODULE,
      { schoolId: ctx.schoolId },
    );
    if (!enabled) throw new CommunicationCenterDisabledError();
    return { schoolId: ctx.schoolId };
  }
}

function stripStatus(filters: CommunicationFilters): CommunicationFilters {
  const { status: _ignored, ...rest } = filters;
  void _ignored;
  return rest;
}
