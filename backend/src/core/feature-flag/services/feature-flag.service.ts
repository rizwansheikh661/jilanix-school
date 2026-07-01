import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  FEATURE_FLAG_AUDIT_SCOPES,
  FEATURE_FLAG_CHANGED_TOPIC,
  type FeatureFlagAuditScope,
} from '../feature-flag.constants';
import {
  DuplicateFeatureFlagKeyError,
  InvalidRolloutPercentageError,
  RolloutListRequiredError,
  UnknownFeatureFlagError,
} from '../feature-flag.errors';
import type {
  FeatureFlagDefinitionRow,
  FeatureFlagEvaluation,
  FeatureFlagEvaluationContext,
  FeatureFlagKind,
  FeatureFlagLifecycle,
  FeatureFlagPlanMapRow,
  FeatureFlagRolloutRow,
  FeatureFlagTenantOverrideRow,
  RolloutStrategy,
} from '../feature-flag.types';
import { FeatureFlagAuditRepository } from '../repositories/feature-flag-audit.repository';
import { FeatureFlagDefinitionRepository } from '../repositories/feature-flag-definition.repository';
import { FeatureFlagPlanMapRepository } from '../repositories/feature-flag-plan-map.repository';
import { FeatureFlagRolloutRepository } from '../repositories/feature-flag-rollout.repository';
import { FeatureFlagTenantOverrideRepository } from '../repositories/feature-flag-tenant-override.repository';
import { FeatureFlagCacheService } from './feature-flag-cache.service';
import { FeatureFlagRegistry } from './feature-flag.registry';

export interface CreateDefinitionArgs {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: FeatureFlagKind;
  readonly owner: string | null;
  readonly defaultValue: boolean;
  readonly lifecycle: FeatureFlagLifecycle;
  readonly cleanupDueAt: Date | null;
}

export interface UpdateDefinitionArgs {
  readonly name?: string;
  readonly description?: string | null;
  readonly kind?: FeatureFlagKind;
  readonly owner?: string | null;
  readonly defaultValue?: boolean;
  readonly lifecycle?: FeatureFlagLifecycle;
  readonly cleanupDueAt?: Date | null;
  readonly reason?: string | null;
  readonly expectedVersion: number;
}

export interface UpsertTenantOverrideArgs {
  readonly schoolId: string;
  readonly flagKey: string;
  readonly value: boolean;
  readonly quotaInt: number | null;
  readonly reason: string | null;
  readonly expiresAt: Date | null;
}

export interface CreateRolloutArgs {
  readonly flagKey: string;
  readonly strategy: RolloutStrategy;
  readonly percentage: number | null;
  readonly tenantIds?: readonly string[];
  readonly planIds?: readonly string[];
  readonly regions?: readonly string[];
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

export interface UpdateRolloutArgs {
  readonly percentage?: number | null;
  readonly tenantIds?: readonly string[] | null;
  readonly planIds?: readonly string[] | null;
  readonly regions?: readonly string[] | null;
  readonly isActive?: boolean;
  readonly startsAt?: Date | null;
  readonly endsAt?: Date | null;
  readonly reason?: string | null;
  readonly expectedVersion: number;
}

interface ChangePayload {
  readonly flagId: string;
  readonly flagKey: string;
  readonly scope: FeatureFlagAuditScope;
  readonly schoolId: string | null;
  readonly beforeValue: Prisma.InputJsonValue | undefined;
  readonly afterValue: Prisma.InputJsonValue | undefined;
  readonly reason: string | null;
}

/**
 * Main feature-flag service. Responsibilities:
 *   - Evaluate a flag for a given context using the precedence
 *     `rollout > tenant override > plan map > definition default`.
 *   - Persist mutations and fan out an audit row + a `feature_flag.changed`
 *     outbox event in the same DB transaction.
 *   - Keep an in-memory TTL cache invalidated by that outbox event.
 */
@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly definitions: FeatureFlagDefinitionRepository,
    private readonly planMap: FeatureFlagPlanMapRepository,
    private readonly tenantOverrides: FeatureFlagTenantOverrideRepository,
    private readonly rollouts: FeatureFlagRolloutRepository,
    private readonly audits: FeatureFlagAuditRepository,
    private readonly cache: FeatureFlagCacheService,
    private readonly outbox: OutboxPublisherService,
    private readonly registry: FeatureFlagRegistry,
  ) {}

  // ---------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------

  public async isEnabled(key: string, ctx: FeatureFlagEvaluationContext): Promise<boolean> {
    const evaluation = await this.evaluate(key, ctx);
    return evaluation.value;
  }

  public async evaluate(
    key: string,
    ctx: FeatureFlagEvaluationContext,
  ): Promise<FeatureFlagEvaluation> {
    const cached = this.cache.get(ctx.schoolId, key);
    if (cached !== undefined) return cached;

    const definition = await this.definitions.findByKey(key);
    if (definition === null) {
      throw new UnknownFeatureFlagError(key);
    }

    const evaluation = await this.evaluateUncached(definition, ctx);
    this.cache.set(ctx.schoolId, key, evaluation);
    return evaluation;
  }

  private async evaluateUncached(
    definition: FeatureFlagDefinitionRow,
    ctx: FeatureFlagEvaluationContext,
  ): Promise<FeatureFlagEvaluation> {
    const now = new Date();

    const rollouts = await this.rollouts.listActiveForFlag(definition.id, now);
    for (const rollout of rollouts) {
      const match = matchRollout(rollout, ctx);
      if (match !== null) {
        return {
          key: definition.key,
          value: match,
          source: 'rollout',
        };
      }
    }

    if (ctx.schoolId !== null) {
      const override = await this.tenantOverrides.findActive(ctx.schoolId, definition.id, now);
      if (override !== null) {
        return {
          key: definition.key,
          value: override.value,
          source: 'tenant_override',
          quotaInt: override.quotaInt,
        };
      }
    }

    if (ctx.planId !== undefined && ctx.planId !== null) {
      const planEntry = await this.planMap.findByPlanAndFlag(ctx.planId, definition.id);
      if (planEntry !== null) {
        return {
          key: definition.key,
          value: planEntry.value,
          source: 'plan_map',
          quotaInt: planEntry.quotaInt,
        };
      }
    }

    return {
      key: definition.key,
      value: definition.defaultValue,
      source: 'default',
    };
  }

  // ---------------------------------------------------------------------
  // Definitions
  // ---------------------------------------------------------------------

  public async listDefinitions(query: {
    kind?: FeatureFlagKind;
    lifecycle?: FeatureFlagLifecycle;
    limit?: number;
  }): Promise<readonly FeatureFlagDefinitionRow[]> {
    return this.definitions.list({
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.lifecycle !== undefined ? { lifecycle: query.lifecycle } : {}),
      limit: Math.min(query.limit ?? 100, 500),
    });
  }

  public async getDefinitionByKey(key: string): Promise<FeatureFlagDefinitionRow> {
    const row = await this.definitions.findByKey(key);
    if (row === null) throw new UnknownFeatureFlagError(key);
    return row;
  }

  public async createDefinition(input: CreateDefinitionArgs): Promise<FeatureFlagDefinitionRow> {
    const ctx = RequestContextRegistry.require();
    const existing = await this.definitions.findByKey(input.key);
    if (existing !== null) {
      throw new DuplicateFeatureFlagKeyError(input.key);
    }
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const row = await this.definitions.create(
        {
          id: ulid(),
          key: input.key,
          name: input.name,
          description: input.description,
          kind: input.kind,
          owner: input.owner,
          defaultValue: input.defaultValue,
          lifecycle: input.lifecycle,
          cleanupDueAt: input.cleanupDueAt,
          createdBy: ctx.userId ?? null,
        },
        tx,
      );
      await this.recordChange(tx, {
        flagId: row.id,
        flagKey: row.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.DEFINITION,
        schoolId: null,
        beforeValue: undefined,
        afterValue: definitionToJson(row),
        reason: null,
      });
      return row;
    });
  }

  public async updateDefinition(
    key: string,
    input: UpdateDefinitionArgs,
  ): Promise<FeatureFlagDefinitionRow> {
    const ctx = RequestContextRegistry.require();
    const existing = await this.definitions.findByKey(key);
    if (existing === null) throw new UnknownFeatureFlagError(key);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.definitions.update(
        existing.id,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.owner !== undefined ? { owner: input.owner } : {}),
          ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
          ...(input.lifecycle !== undefined ? { lifecycle: input.lifecycle } : {}),
          ...(input.cleanupDueAt !== undefined ? { cleanupDueAt: input.cleanupDueAt } : {}),
          updatedBy: ctx.userId ?? null,
        },
        input.expectedVersion,
      );
      if (updated === null) {
        throw new VersionConflict('FeatureFlagDefinition', existing.id, input.expectedVersion);
      }
      await this.recordChange(tx, {
        flagId: updated.id,
        flagKey: updated.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.DEFINITION,
        schoolId: null,
        beforeValue: definitionToJson(existing),
        afterValue: definitionToJson(updated),
        reason: input.reason ?? null,
      });
      return updated;
    });
  }

  public async deleteDefinition(key: string): Promise<void> {
    const existing = await this.definitions.findByKey(key);
    if (existing === null) throw new UnknownFeatureFlagError(key);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const count = await this.definitions.delete(existing.id);
      if (count === 0) throw new NotFoundError('FeatureFlagDefinition', existing.id);
      await this.recordChange(tx, {
        flagId: existing.id,
        flagKey: existing.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.DEFINITION,
        schoolId: null,
        beforeValue: definitionToJson(existing),
        afterValue: undefined,
        reason: null,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Tenant overrides
  // ---------------------------------------------------------------------

  public async listTenantOverridesForSchool(
    schoolId: string,
  ): Promise<readonly FeatureFlagTenantOverrideRow[]> {
    return this.tenantOverrides.listForSchool(schoolId);
  }

  public async upsertTenantOverride(
    input: UpsertTenantOverrideArgs,
  ): Promise<FeatureFlagTenantOverrideRow> {
    const ctx = RequestContextRegistry.require();
    const definition = await this.definitions.findByKey(input.flagKey);
    if (definition === null) throw new UnknownFeatureFlagError(input.flagKey);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const previous = await this.tenantOverrides.findActive(
        input.schoolId,
        definition.id,
        new Date(),
      );
      await this.tenantOverrides.deleteForSchoolFlag(input.schoolId, definition.id);
      const row = await this.tenantOverrides.create(
        {
          id: ulid(),
          schoolId: input.schoolId,
          flagId: definition.id,
          value: input.value,
          quotaInt: input.quotaInt,
          reason: input.reason,
          setBy: ctx.userId ?? null,
          expiresAt: input.expiresAt,
        },
        tx,
      );
      await this.recordChange(tx, {
        flagId: definition.id,
        flagKey: definition.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.TENANT_OVERRIDE,
        schoolId: input.schoolId,
        beforeValue: previous === null ? undefined : tenantOverrideToJson(previous),
        afterValue: tenantOverrideToJson(row),
        reason: input.reason,
      });
      return row;
    });
  }

  public async deleteTenantOverride(schoolId: string, flagKey: string): Promise<void> {
    const definition = await this.definitions.findByKey(flagKey);
    if (definition === null) throw new UnknownFeatureFlagError(flagKey);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const previous = await this.tenantOverrides.findActive(
        schoolId,
        definition.id,
        new Date(),
      );
      const count = await this.tenantOverrides.deleteForSchoolFlag(schoolId, definition.id);
      if (count === 0) throw new NotFoundError('FeatureFlagTenantOverride');
      await this.recordChange(tx, {
        flagId: definition.id,
        flagKey: definition.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.TENANT_OVERRIDE,
        schoolId,
        beforeValue: previous === null ? undefined : tenantOverrideToJson(previous),
        afterValue: undefined,
        reason: null,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Rollouts
  // ---------------------------------------------------------------------

  public async listRollouts(query: {
    flagKey?: string;
    isActive?: boolean;
    limit?: number;
  }): Promise<readonly FeatureFlagRolloutRow[]> {
    let flagId: string | undefined;
    if (query.flagKey !== undefined) {
      const def = await this.definitions.findByKey(query.flagKey);
      if (def === null) throw new UnknownFeatureFlagError(query.flagKey);
      flagId = def.id;
    }
    return this.rollouts.list({
      ...(flagId !== undefined ? { flagId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      limit: Math.min(query.limit ?? 50, 200),
    });
  }

  public async createRollout(input: CreateRolloutArgs): Promise<FeatureFlagRolloutRow> {
    const ctx = RequestContextRegistry.require();
    const def = await this.definitions.findByKey(input.flagKey);
    if (def === null) throw new UnknownFeatureFlagError(input.flagKey);

    assertRolloutShape(input.strategy, input.percentage, input.tenantIds, input.planIds, input.regions);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const row = await this.rollouts.create(
        {
          id: ulid(),
          flagId: def.id,
          strategy: input.strategy,
          percentage: input.percentage,
          ...(input.tenantIds !== undefined
            ? { tenantIdsJson: input.tenantIds as unknown as Prisma.InputJsonValue }
            : {}),
          ...(input.planIds !== undefined
            ? { planIdsJson: input.planIds as unknown as Prisma.InputJsonValue }
            : {}),
          ...(input.regions !== undefined
            ? { regionsJson: input.regions as unknown as Prisma.InputJsonValue }
            : {}),
          isActive: input.isActive,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdBy: ctx.userId ?? null,
        },
        tx,
      );
      await this.recordChange(tx, {
        flagId: def.id,
        flagKey: def.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.ROLLOUT,
        schoolId: null,
        beforeValue: undefined,
        afterValue: rolloutToJson(row),
        reason: null,
      });
      return row;
    });
  }

  public async updateRollout(
    id: string,
    input: UpdateRolloutArgs,
  ): Promise<FeatureFlagRolloutRow> {
    const ctx = RequestContextRegistry.require();
    const existing = await this.rollouts.findById(id);
    if (existing === null) throw new NotFoundError('FeatureFlagRollout', id);
    const def = await this.definitions.findById(existing.flagId);
    if (def === null) throw new UnknownFeatureFlagError(existing.flagId);

    const nextStrategy = existing.strategy;
    if (input.percentage !== undefined) {
      assertRolloutShape(nextStrategy, input.percentage, undefined, undefined, undefined);
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.rollouts.update(
        id,
        {
          ...(input.percentage !== undefined ? { percentage: input.percentage } : {}),
          ...(input.tenantIds !== undefined
            ? {
                tenantIdsJson:
                  input.tenantIds === null
                    ? null
                    : (input.tenantIds as unknown as Prisma.InputJsonValue),
              }
            : {}),
          ...(input.planIds !== undefined
            ? {
                planIdsJson:
                  input.planIds === null
                    ? null
                    : (input.planIds as unknown as Prisma.InputJsonValue),
              }
            : {}),
          ...(input.regions !== undefined
            ? {
                regionsJson:
                  input.regions === null
                    ? null
                    : (input.regions as unknown as Prisma.InputJsonValue),
              }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
          updatedBy: ctx.userId ?? null,
        },
        input.expectedVersion,
      );
      if (updated === null) {
        throw new VersionConflict('FeatureFlagRollout', id, input.expectedVersion);
      }
      await this.recordChange(tx, {
        flagId: def.id,
        flagKey: def.key,
        scope: FEATURE_FLAG_AUDIT_SCOPES.ROLLOUT,
        schoolId: null,
        beforeValue: rolloutToJson(existing),
        afterValue: rolloutToJson(updated),
        reason: input.reason ?? null,
      });
      return updated;
    });
  }

  public async deleteRollout(id: string): Promise<void> {
    const existing = await this.rollouts.findById(id);
    if (existing === null) throw new NotFoundError('FeatureFlagRollout', id);
    const def = await this.definitions.findById(existing.flagId);

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const count = await this.rollouts.delete(id);
      if (count === 0) throw new NotFoundError('FeatureFlagRollout', id);
      await this.recordChange(tx, {
        flagId: existing.flagId,
        flagKey: def?.key ?? existing.flagId,
        scope: FEATURE_FLAG_AUDIT_SCOPES.ROLLOUT,
        schoolId: null,
        beforeValue: rolloutToJson(existing),
        afterValue: undefined,
        reason: null,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Plan map (read paths, write surface is platform/seeder-driven)
  // ---------------------------------------------------------------------

  public async listPlanMapForFlag(flagKey: string): Promise<readonly FeatureFlagPlanMapRow[]> {
    const def = await this.definitions.findByKey(flagKey);
    if (def === null) throw new UnknownFeatureFlagError(flagKey);
    return this.planMap.listForFlag(def.id);
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private async recordChange(tx: PrismaTx, change: ChangePayload): Promise<void> {
    const ctx = RequestContextRegistry.require();
    await this.audits.append(
      {
        schoolId: change.schoolId,
        flagId: change.flagId,
        scope: change.scope,
        ...(change.beforeValue !== undefined ? { beforeValue: change.beforeValue } : {}),
        ...(change.afterValue !== undefined ? { afterValue: change.afterValue } : {}),
        actorUserId: ctx.userId ?? null,
        reason: change.reason,
      },
      tx,
    );
    await this.outbox.publish(tx, {
      topic: FEATURE_FLAG_CHANGED_TOPIC,
      eventType: `feature_flag.${change.scope}.changed`,
      aggregateType: 'FeatureFlag',
      aggregateId: change.flagId,
      schoolId: change.schoolId,
      payload: {
        flagId: change.flagId,
        flagKey: change.flagKey,
        scope: change.scope,
        schoolId: change.schoolId,
      } satisfies Prisma.InputJsonValue,
    });
    // Local cache best-effort invalidation; outbox handler will also clear
    // (and remote replicas will clear via their own handler).
    this.cache.invalidate(change.flagKey);
  }

  /** Hook used by the outbox subscription to drop cached entries on changes. */
  public handleFlagChangedEvent(payload: { flagKey?: string } | null): void {
    if (payload === null) {
      this.cache.invalidateAll();
      return;
    }
    if (typeof payload.flagKey === 'string' && payload.flagKey.length > 0) {
      this.cache.invalidate(payload.flagKey);
    } else {
      this.cache.invalidateAll();
    }
  }

  /** Exposed for tests / health checks. */
  public knownKeys(): readonly string[] {
    return this.registry.list().map((entry) => entry.key);
  }
}

function matchRollout(
  rollout: FeatureFlagRolloutRow,
  ctx: FeatureFlagEvaluationContext,
): boolean | null {
  switch (rollout.strategy) {
    case 'PERCENTAGE': {
      if (rollout.percentage === null) return null;
      if (rollout.percentage <= 0) return false;
      if (rollout.percentage >= 100) return true;
      const bucketKey = ctx.schoolId ?? '__platform__';
      const bucket = hashBucket(`${rollout.id}:${bucketKey}`);
      return bucket < rollout.percentage ? true : false;
    }
    case 'TENANT_LIST': {
      if (ctx.schoolId === null) return null;
      const ids = readStringArray(rollout.tenantIdsJson);
      return ids.includes(ctx.schoolId) ? true : null;
    }
    case 'PLAN_LIST': {
      if (ctx.planId === undefined || ctx.planId === null) return null;
      const ids = readStringArray(rollout.planIdsJson);
      return ids.includes(ctx.planId) ? true : null;
    }
    case 'REGION_LIST': {
      if (ctx.region === undefined || ctx.region === null) return null;
      const regions = readStringArray(rollout.regionsJson);
      return regions.includes(ctx.region) ? true : null;
    }
    default:
      return null;
  }
}

function readStringArray(value: Prisma.JsonValue | null): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Deterministic 0..99 bucket from a string — small FNV-1a is sufficient. */
function hashBucket(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 100;
}

function assertRolloutShape(
  strategy: RolloutStrategy,
  percentage: number | null | undefined,
  tenantIds: readonly string[] | undefined,
  planIds: readonly string[] | undefined,
  regions: readonly string[] | undefined,
): void {
  if (strategy === 'PERCENTAGE') {
    if (
      percentage === null ||
      percentage === undefined ||
      !Number.isInteger(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      throw new InvalidRolloutPercentageError(percentage ?? null);
    }
  }
  if (strategy === 'TENANT_LIST' && (tenantIds === undefined || tenantIds.length === 0)) {
    throw new RolloutListRequiredError('TENANT_LIST');
  }
  if (strategy === 'PLAN_LIST' && (planIds === undefined || planIds.length === 0)) {
    throw new RolloutListRequiredError('PLAN_LIST');
  }
  if (strategy === 'REGION_LIST' && (regions === undefined || regions.length === 0)) {
    throw new RolloutListRequiredError('REGION_LIST');
  }
}

function definitionToJson(row: FeatureFlagDefinitionRow): Prisma.InputJsonValue {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    kind: row.kind,
    owner: row.owner,
    defaultValue: row.defaultValue,
    lifecycle: row.lifecycle,
    cleanupDueAt: row.cleanupDueAt?.toISOString() ?? null,
  };
}

function tenantOverrideToJson(row: FeatureFlagTenantOverrideRow): Prisma.InputJsonValue {
  return {
    value: row.value,
    quotaInt: row.quotaInt,
    reason: row.reason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function rolloutToJson(row: FeatureFlagRolloutRow): Prisma.InputJsonValue {
  return {
    strategy: row.strategy,
    percentage: row.percentage,
    tenantIdsJson: row.tenantIdsJson as Prisma.InputJsonValue,
    planIdsJson: row.planIdsJson as Prisma.InputJsonValue,
    regionsJson: row.regionsJson as Prisma.InputJsonValue,
    isActive: row.isActive,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}
