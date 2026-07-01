/**
 * PlanFeatureRepository — persistence for the `plan_features` table
 * (PLATFORM_ONLY, soft-delete, version-guarded). Tracks per-plan feature
 * configuration: both LIMIT (numeric caps) and TOGGLE (booleans).
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  FeatureModeValue,
  FeatureTypeValue,
  PlanFeatureRow,
} from '../subscription.types';

export interface CreatePlanFeatureInput {
  readonly planId: string;
  readonly featureKey: string;
  readonly featureType: FeatureTypeValue;
  readonly mode: FeatureModeValue;
  readonly limit?: number | null;
  readonly sortOrder?: number;
  readonly description?: string | null;
}

export interface UpdatePlanFeatureInput {
  readonly mode?: FeatureModeValue;
  readonly limit?: number | null;
  readonly sortOrder?: number;
  readonly description?: string | null;
}

@Injectable()
export class PlanFeatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    const ctx = RequestContextRegistry.peek();
    return ctx?.userId ?? null;
  }

  public async findById(id: string, tx?: PrismaTx): Promise<PlanFeatureRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.planFeature.findFirst({
      where: { id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawPlanFeature);
  }

  public async findActiveByKey(
    planId: string,
    featureKey: string,
    tx?: PrismaTx,
  ): Promise<PlanFeatureRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.planFeature.findFirst({
      where: { planId, featureKey, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawPlanFeature);
  }

  public async listByPlan(
    planId: string,
    tx?: PrismaTx,
  ): Promise<readonly PlanFeatureRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.planFeature.findMany({
      where: { planId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { featureKey: 'asc' }],
    });
    return rows.map((r) => mapRow(r as unknown as RawPlanFeature));
  }

  public async create(
    input: CreatePlanFeatureInput,
    tx?: PrismaTx,
  ): Promise<PlanFeatureRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      id: randomUUID(),
      planId: input.planId,
      featureKey: input.featureKey,
      featureType: input.featureType,
      mode: input.mode,
      limit: input.limit === undefined || input.limit === null ? null : BigInt(input.limit),
      sortOrder: input.sortOrder ?? 0,
      description: input.description ?? null,
      createdBy: userId,
      updatedBy: userId,
    };
    const created = await writer.planFeature.create({ data: data as never });
    return mapRow(created as unknown as RawPlanFeature);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePlanFeatureInput,
    tx?: PrismaTx,
  ): Promise<PlanFeatureRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.mode !== undefined) data.mode = patch.mode;
    if (patch.limit !== undefined) data.limit = patch.limit === null ? null : BigInt(patch.limit);
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    if (patch.description !== undefined) data.description = patch.description;

    const result = await writer.planFeature.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('PlanFeature', id, expectedVersion);
    }
    const reloaded = await writer.planFeature.findUnique({ where: { id } });
    if (reloaded === null) {
      throw new VersionConflictError('PlanFeature', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawPlanFeature);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.planFeature.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('PlanFeature', id, expectedVersion);
    }
  }

  /** Upsert by (planId, featureKey) — used by the seeder for idempotency. */
  public async upsertByKey(
    input: CreatePlanFeatureInput,
    tx?: PrismaTx,
  ): Promise<PlanFeatureRow> {
    const existing = await this.findActiveByKey(input.planId, input.featureKey, tx);
    if (existing === null) {
      return this.create(input, tx);
    }
    // Resync mode/limit/sort if the seeder values drifted from the row.
    if (
      existing.mode === input.mode &&
      existing.limit === (input.limit ?? null) &&
      existing.sortOrder === (input.sortOrder ?? 0)
    ) {
      return existing;
    }
    return this.update(
      existing.id,
      existing.version,
      {
        mode: input.mode,
        limit: input.limit ?? null,
        sortOrder: input.sortOrder ?? 0,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      tx,
    );
  }
}

interface RawPlanFeature {
  id: string;
  planId: string;
  featureKey: string;
  featureType: FeatureTypeValue;
  mode: FeatureModeValue;
  limit: bigint | null;
  sortOrder: number;
  description: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function mapRow(row: RawPlanFeature): PlanFeatureRow {
  return {
    id: row.id,
    planId: row.planId,
    featureKey: row.featureKey,
    featureType: row.featureType,
    mode: row.mode,
    // Narrow BIGINT to JS number at the boundary. Safe up to 2^53-1 (~9 PB
    // for storage_bytes); throws on overflow rather than silently corrupting.
    limit: row.limit === null ? null : safeBigIntToNumber(row.limit),
    sortOrder: row.sortOrder,
    description: row.description,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function safeBigIntToNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(
      `PlanFeature.limit value ${value.toString()} exceeds JS Number.MAX_SAFE_INTEGER.`,
    );
  }
  return Number(value);
}
