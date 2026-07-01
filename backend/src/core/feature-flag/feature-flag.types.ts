import type { Prisma } from '@prisma/client';

export type FeatureFlagKind = 'MODULE' | 'RELEASE' | 'EXPERIMENT' | 'KILL_SWITCH' | 'ENTITLEMENT';
export type FeatureFlagLifecycle = 'INTRODUCED' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
export type RolloutStrategy = 'PERCENTAGE' | 'TENANT_LIST' | 'PLAN_LIST' | 'REGION_LIST';

export interface FeatureFlagDefinitionRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: FeatureFlagKind;
  readonly owner: string | null;
  readonly defaultValue: boolean;
  readonly lifecycle: FeatureFlagLifecycle;
  readonly cleanupDueAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface FeatureFlagPlanMapRow {
  readonly id: string;
  readonly planId: string;
  readonly flagId: string;
  readonly value: boolean;
  readonly quotaInt: number | null;
  readonly quotaWindow: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface FeatureFlagTenantOverrideRow {
  readonly id: string;
  readonly schoolId: string;
  readonly flagId: string;
  readonly value: boolean;
  readonly quotaInt: number | null;
  readonly reason: string | null;
  readonly setBy: string | null;
  readonly setAt: Date;
  readonly expiresAt: Date | null;
  readonly version: number;
}

export interface FeatureFlagRolloutRow {
  readonly id: string;
  readonly flagId: string;
  readonly strategy: RolloutStrategy;
  readonly percentage: number | null;
  readonly tenantIdsJson: Prisma.JsonValue | null;
  readonly planIdsJson: Prisma.JsonValue | null;
  readonly regionsJson: Prisma.JsonValue | null;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface FeatureFlagAuditRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly flagId: string;
  readonly scope: string;
  readonly beforeValue: Prisma.JsonValue | null;
  readonly afterValue: Prisma.JsonValue | null;
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface FeatureFlagEvaluationContext {
  readonly schoolId: string | null;
  readonly planId?: string | null;
  readonly region?: string | null;
}

export interface FeatureFlagEvaluation {
  readonly key: string;
  readonly value: boolean;
  readonly source: 'rollout' | 'tenant_override' | 'plan_map' | 'default';
  readonly quotaInt?: number | null;
}

export interface CodeSideFlagRegistration {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: FeatureFlagKind;
  readonly defaultValue: boolean;
  readonly owner?: string;
}
