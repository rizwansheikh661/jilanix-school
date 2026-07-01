/**
 * SchoolUsageService — high-level read/write API over the SchoolUsage row.
 *
 *   - getSnapshot(schoolId)       : read or lazy-create the singleton row.
 *   - increment(schoolId, key, by): atomic counter bump + UsageEvent record.
 *   - decrement(schoolId, key, by): inverse of increment (negative delta).
 *   - recompute(schoolId)         : re-derive counters from the
 *                                   UsageEvent ledger; refreshes
 *                                   lastRecomputedAt.
 *
 * Every increment / decrement happens in one tx and writes both the
 * counter and a UsageEvent row so the audit + reconciliation paths agree.
 * The threshold-band notification dispatch is the responsibility of the
 * SubscriptionGuardService (Wave 8) — this service stays pure-arithmetic.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import {
  LIMIT_FEATURE_KEY_TO_USAGE_COLUMN,
  isLimitFeatureKey,
  type BuiltInLimitFeatureKey,
} from '../plan-feature/feature-keys';
import { SubscriptionOutboxTopics } from '../subscription.constants';
import type { SchoolUsageRow } from '../subscription.types';
import {
  SchoolUsageRepository,
  type UsageCounterColumn,
} from './school-usage.repository';
import { UsageEventRepository } from './usage-event.repository';

const USAGE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SchoolUsageService {
  private readonly logger = new Logger(SchoolUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolUsageRepository,
    private readonly events: UsageEventRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Read the singleton row; create with zeroed counters if missing.
   */
  public async getSnapshot(schoolId: string, tx?: PrismaTx): Promise<SchoolUsageRow> {
    const existing = await this.repo.findBySchool(schoolId, tx);
    if (existing !== null) return existing;
    return this.ensureRow(schoolId, tx);
  }

  /**
   * Provisioning hook entry — invoked once per school inside the
   * provisioning transaction to seed the SchoolUsage singleton.
   */
  public async bootstrapForSchool(schoolId: string, tx: PrismaTx): Promise<SchoolUsageRow> {
    return this.ensureRow(schoolId, tx);
  }

  public async increment(
    schoolId: string,
    featureKey: string,
    by: number,
    sourceRef?: string | null,
  ): Promise<SchoolUsageRow> {
    if (!isLimitFeatureKey(featureKey)) {
      throw new Error(
        `SchoolUsageService.increment: featureKey "${featureKey}" is not a LIMIT-typed built-in key.`,
      );
    }
    return this.applyDelta(schoolId, featureKey, by, sourceRef ?? null);
  }

  public async decrement(
    schoolId: string,
    featureKey: string,
    by: number,
    sourceRef?: string | null,
  ): Promise<SchoolUsageRow> {
    if (!isLimitFeatureKey(featureKey)) {
      throw new Error(
        `SchoolUsageService.decrement: featureKey "${featureKey}" is not a LIMIT-typed built-in key.`,
      );
    }
    if (by < 0) {
      throw new Error('SchoolUsageService.decrement: `by` must be non-negative.');
    }
    return this.applyDelta(schoolId, featureKey, -by, sourceRef ?? null);
  }

  /**
   * Recompute counters from the UsageEvent ledger over the current usage
   * period. The reconciliation pass is intentionally simple: sum deltas
   * per key within [usagePeriodStart, usagePeriodEnd] and write them
   * verbatim. Out-of-period drift (student / staff / branch counts) is
   * the responsibility of the owning module's recompute path; this
   * service touches only the counters it owns.
   */
  public async recompute(schoolId: string): Promise<SchoolUsageRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const snapshot = await this.getSnapshot(schoolId, tx);
      const sums = await this.events.sumByKey(
        schoolId,
        snapshot.usagePeriodStart,
        snapshot.usagePeriodEnd,
        tx,
      );
      const updated = await this.repo.setCounters(
        schoolId,
        snapshot.id,
        snapshot.version,
        {
          smsUsedThisPeriod: Math.max(0, sums.get('sms_monthly') ?? 0),
          whatsappUsedThisPeriod: Math.max(0, sums.get('whatsapp_monthly') ?? 0),
          emailUsedThisPeriod: Math.max(0, sums.get('email_monthly') ?? 0),
          lastRecomputedAt: new Date(),
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: SubscriptionOutboxTopics.USAGE_RECOMPUTED,
        eventType: 'UsageRecomputed',
        aggregateType: 'SchoolUsage',
        aggregateId: updated.id,
        schoolId,
        payload: {
          schoolId,
          recomputedAt: updated.lastRecomputedAt?.toISOString() ?? null,
          smsUsed: updated.smsUsedThisPeriod,
          whatsappUsed: updated.whatsappUsedThisPeriod,
          emailUsed: updated.emailUsedThisPeriod,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'subscription.usage.recompute',
          category: 'tenancy',
          resourceType: 'SchoolUsage',
          resourceId: updated.id,
          schoolId,
          before: snapshot,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `SchoolUsage recomputed school=${schoolId} sms=${updated.smsUsedThisPeriod.toString()} email=${updated.emailUsedThisPeriod.toString()} wa=${updated.whatsappUsedThisPeriod.toString()}.`,
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // private
  // -------------------------------------------------------------------------

  private async applyDelta(
    schoolId: string,
    featureKey: BuiltInLimitFeatureKey,
    delta: number,
    sourceRef: string | null,
  ): Promise<SchoolUsageRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const snapshot = await this.getSnapshot(schoolId, tx);
      const column = LIMIT_FEATURE_KEY_TO_USAGE_COLUMN[featureKey] as UsageCounterColumn;
      const updated =
        column === 'storageBytesUsed'
          ? await this.repo.incrementColumn(schoolId, snapshot.id, column, BigInt(delta), tx)
          : await this.repo.incrementColumn(schoolId, snapshot.id, column, delta, tx);
      await this.events.record(
        {
          schoolId,
          featureKey,
          delta,
          sourceRef,
        },
        tx,
      );
      return updated;
    });
  }

  private async ensureRow(schoolId: string, tx?: PrismaTx): Promise<SchoolUsageRow> {
    const existing = await this.repo.findBySchool(schoolId, tx);
    if (existing !== null) return existing;
    const now = new Date();
    const usagePeriodStart = startOfDay(now);
    const usagePeriodEnd = startOfDay(new Date(now.getTime() + USAGE_PERIOD_DAYS * MS_PER_DAY));
    const created = await this.repo.create(
      {
        schoolId,
        usagePeriodStart,
        usagePeriodEnd,
      },
      tx,
    );
    return created;
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
