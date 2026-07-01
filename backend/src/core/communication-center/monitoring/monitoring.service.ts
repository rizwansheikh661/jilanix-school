/**
 * MonitoringService — delivery monitoring summaries.
 *
 * Reuses `CommunicationCenterMetricsRepository.groupByStatus` to render a
 * single-payload counter view across all NotificationMessage statuses,
 * accepting the same `CommunicationFilters` as the dashboard.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequestContextRegistry } from '../../request-context';
import {
  CommunicationCenterMetricsRepository,
  type CommunicationFilters,
} from '../communication-center-metrics.repository';
import { CommunicationCenterFeatureFlags } from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';
import {
  NOTIFICATION_MESSAGE_STATUS_VALUES,
  type NotificationMessageStatusValue,
} from '../../notifications/notifications.constants';

export interface MonitoringStatusBreakdown {
  readonly status: NotificationMessageStatusValue;
  readonly count: number;
}

export interface MonitoringSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<NotificationMessageStatusValue, number>>;
  readonly breakdown: readonly MonitoringStatusBreakdown[];
  readonly generatedAt: Date;
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly metrics: CommunicationCenterMetricsRepository,
  ) {}

  public async getSummary(filters: CommunicationFilters): Promise<MonitoringSummary> {
    const { schoolId } = await this.assertModuleEnabled();
    const rows = await this.metrics.groupByStatus(schoolId, filters);

    const byStatus = NOTIFICATION_MESSAGE_STATUS_VALUES.reduce(
      (acc, s) => {
        acc[s] = 0;
        return acc;
      },
      {} as Record<NotificationMessageStatusValue, number>,
    );
    let total = 0;
    for (const r of rows) {
      byStatus[r.status] = r.count;
      total += r.count;
    }
    return {
      total,
      byStatus,
      breakdown: rows,
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
