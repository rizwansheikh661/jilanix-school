/**
 * PlanFeatureService — CRUD orchestration for the per-plan feature matrix.
 *
 *   - create / update / softDelete: single-row operations with optimistic
 *     concurrency via `version`.
 *   - bulkReplace: full re-pin of the feature matrix for a plan — upsert by
 *     featureKey, soft-delete keys not present in the new set. The whole
 *     operation runs in one transaction.
 *
 * Mutations publish to the outbox + write a tenancy-category audit row
 * inside the same transaction as the write.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import {
  SubscriptionOutboxTopics,
} from '../subscription.constants';
import {
  PlanFeatureDuplicateError,
  PlanFeatureInvalidModeError,
  PlanFeatureNotFoundError,
} from '../subscription.errors';
import type {
  FeatureModeValue,
  FeatureTypeValue,
  PlanFeatureRow,
} from '../subscription.types';
import {
  PlanFeatureRepository,
  type CreatePlanFeatureInput,
  type UpdatePlanFeatureInput,
} from './plan-feature.repository';

export interface BulkReplaceItem {
  readonly featureKey: string;
  readonly featureType: FeatureTypeValue;
  readonly mode: FeatureModeValue;
  readonly limit?: number | null;
  readonly sortOrder?: number;
  readonly description?: string | null;
}

@Injectable()
export class PlanFeatureService {
  private readonly logger = new Logger(PlanFeatureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PlanFeatureRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(planId: string): Promise<readonly PlanFeatureRow[]> {
    return this.repo.listByPlan(planId);
  }

  public async getById(id: string): Promise<PlanFeatureRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new PlanFeatureNotFoundError(id);
    return row;
  }

  public async create(input: CreatePlanFeatureInput): Promise<PlanFeatureRow> {
    assertModeMatchesType(input.featureType, input.mode);
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findActiveByKey(input.planId, input.featureKey, tx);
      if (existing !== null) {
        throw new PlanFeatureDuplicateError(input.planId, input.featureKey);
      }
      const created = await this.repo.create(input, tx);
      await this.publishChanged(tx, created, 'create');
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePlanFeatureInput,
  ): Promise<PlanFeatureRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new PlanFeatureNotFoundError(id);
      if (patch.mode !== undefined) {
        assertModeMatchesType(current.featureType, patch.mode);
      }
      const updated = await this.repo.update(id, expectedVersion, patch, tx);
      await this.publishChanged(tx, updated, 'update', current);
      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new PlanFeatureNotFoundError(id);
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.publishChanged(tx, current, 'delete');
    });
  }

  public async bulkReplace(
    planId: string,
    items: readonly BulkReplaceItem[],
  ): Promise<readonly PlanFeatureRow[]> {
    for (const item of items) {
      assertModeMatchesType(item.featureType, item.mode);
    }
    const incomingKeys = new Set(items.map((i) => i.featureKey));
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.listByPlan(planId, tx);
      const existingByKey = new Map(existing.map((row) => [row.featureKey, row]));

      // Upsert each incoming item.
      const out: PlanFeatureRow[] = [];
      for (const item of items) {
        const upserted = await this.repo.upsertByKey(
          {
            planId,
            featureKey: item.featureKey,
            featureType: item.featureType,
            mode: item.mode,
            limit: item.limit ?? null,
            sortOrder: item.sortOrder ?? 0,
            ...(item.description !== undefined ? { description: item.description } : {}),
          },
          tx,
        );
        out.push(upserted);
      }

      // Prune missing keys.
      for (const row of existing) {
        if (!incomingKeys.has(row.featureKey)) {
          await this.repo.softDelete(row.id, row.version, tx);
        }
      }

      await this.outbox.publish(tx, {
        topic: SubscriptionOutboxTopics.PLAN_FEATURE_CHANGED,
        eventType: 'PlanFeatureBulkReplaced',
        aggregateType: 'Plan',
        aggregateId: planId,
        payload: {
          planId,
          incomingCount: items.length,
          existingCount: existing.length,
          prunedCount: existing.length - out.filter((u) => existingByKey.has(u.featureKey)).length,
        },
      });
      await this.audit.record(
        {
          action: 'subscription.plan_feature.bulk_replace',
          category: 'tenancy',
          resourceType: 'Plan',
          resourceId: planId,
          before: existing,
          after: out,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `PlanFeature bulkReplace planId=${planId} upserted=${out.length.toString()} pruned=${(existing.length - out.length).toString()}.`,
      );
      return out;
    });
  }

  private async publishChanged(
    tx: PrismaTx,
    row: PlanFeatureRow,
    op: 'create' | 'update' | 'delete',
    before?: PlanFeatureRow,
  ): Promise<void> {
    await this.outbox.publish(tx, {
      topic: SubscriptionOutboxTopics.PLAN_FEATURE_CHANGED,
      eventType: `PlanFeature${op[0]?.toUpperCase() ?? ''}${op.slice(1)}d`,
      aggregateType: 'PlanFeature',
      aggregateId: row.id,
      payload: {
        id: row.id,
        planId: row.planId,
        featureKey: row.featureKey,
        featureType: row.featureType,
        mode: row.mode,
        limit: row.limit,
      },
    });
    await this.audit.record(
      {
        action: `subscription.plan_feature.${op}`,
        category: 'tenancy',
        resourceType: 'PlanFeature',
        resourceId: row.id,
        ...(before !== undefined ? { before } : {}),
        after: row,
      },
      { tx: tx as unknown as AuditTxLike },
    );
  }
}

function assertModeMatchesType(type: FeatureTypeValue, mode: FeatureModeValue): void {
  if (type === 'LIMIT') {
    if (mode !== 'LIMITED' && mode !== 'UNLIMITED' && mode !== 'DISABLED') {
      throw new PlanFeatureInvalidModeError(type, mode);
    }
  } else {
    // TOGGLE
    if (mode !== 'ENABLED' && mode !== 'DISABLED') {
      throw new PlanFeatureInvalidModeError(type, mode);
    }
  }
}
