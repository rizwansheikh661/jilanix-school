/**
 * CommunicationDashboardService — backend aggregations for the
 * Communication Center landing screen. NO UI; this is a pure data API.
 *
 * Every counter is a single Prisma `count` or `groupBy` on the existing
 * `notification_messages` table — Sprint 19 adds no new storage and
 * reuses the same row that the Notification Foundation writes when a
 * message is dispatched.
 *
 * Filters supported (all optional, AND-combined):
 *   - date window (from / to → createdAt)
 *   - channel (EMAIL / SMS / WHATSAPP / IN_APP / PUSH)
 *   - status  (QUEUED / SENDING / SENT / DELIVERED / FAILED / ...)
 *   - module  (aggregateType — e.g. "Homework", "FeeInvoice")
 *   - recipientType (audience: USER / PARENT / STUDENT)
 *
 * "Communication Type" is modelled as `channel`; the existing
 * `notification_messages.channel` enum is the source of truth.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequestContextRegistry } from '../../request-context';
import {
  CommunicationCenterFeatureFlags,
} from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';
import {
  CommunicationCenterMetricsRepository,
  type CommunicationFilters,
} from '../communication-center-metrics.repository';

export interface DashboardSummary {
  readonly totalCommunications: number;
  readonly todayCommunications: number;
  readonly pendingDeliveries: number;
  readonly scheduledCommunications: number;
  readonly failedDeliveries: number;
  readonly deliveredCommunications: number;
  readonly readCommunications: number;
  readonly generatedAt: Date;
}

@Injectable()
export class CommunicationDashboardService {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly metrics: CommunicationCenterMetricsRepository,
  ) {}

  public async getSummary(filters: CommunicationFilters): Promise<DashboardSummary> {
    const { schoolId } = await this.assertModuleEnabled();
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );

    const baseFilters = stripStatus(filters);

    const [
      totalCommunications,
      todayCommunications,
      pendingDeliveries,
      scheduledCommunications,
      failedDeliveries,
      deliveredCommunications,
      readCommunications,
    ] = await Promise.all([
      this.metrics.count(schoolId, baseFilters),
      this.metrics.count(schoolId, { ...baseFilters, from: startOfToday }),
      this.countAny(schoolId, baseFilters, ['QUEUED', 'SENDING']),
      this.metrics.countScheduled(schoolId, baseFilters, now),
      this.countAny(schoolId, baseFilters, ['FAILED', 'DEAD_LETTER']),
      this.metrics.count(schoolId, { ...baseFilters, status: 'DELIVERED' }),
      this.metrics.count(schoolId, { ...baseFilters, status: 'READ' }),
    ]);

    return {
      totalCommunications,
      todayCommunications,
      pendingDeliveries,
      scheduledCommunications,
      failedDeliveries,
      deliveredCommunications,
      readCommunications,
      generatedAt: now,
    };
  }

  private async countAny(
    schoolId: string,
    filters: CommunicationFilters,
    statuses: readonly NonNullable<CommunicationFilters['status']>[],
  ): Promise<number> {
    const counts = await Promise.all(
      statuses.map((status) => this.metrics.count(schoolId, { ...filters, status })),
    );
    return counts.reduce((sum, n) => sum + n, 0);
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
