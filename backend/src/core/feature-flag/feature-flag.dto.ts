import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type {
  FeatureFlagAuditRow,
  FeatureFlagDefinitionRow,
  FeatureFlagEvaluation,
  FeatureFlagKind,
  FeatureFlagLifecycle,
  FeatureFlagRolloutRow,
  FeatureFlagTenantOverrideRow,
  RolloutStrategy,
} from './feature-flag.types';

const FLAG_KEY_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const FEATURE_FLAG_KINDS: readonly FeatureFlagKind[] = [
  'MODULE',
  'RELEASE',
  'EXPERIMENT',
  'KILL_SWITCH',
  'ENTITLEMENT',
];
const FEATURE_FLAG_LIFECYCLES: readonly FeatureFlagLifecycle[] = [
  'INTRODUCED',
  'ACTIVE',
  'DEPRECATED',
  'RETIRED',
];
const ROLLOUT_STRATEGIES: readonly RolloutStrategy[] = [
  'PERCENTAGE',
  'TENANT_LIST',
  'PLAN_LIST',
  'REGION_LIST',
];

// --- Definitions ----------------------------------------------------------

export class FeatureFlagDefinitionListQueryDto {
  @ApiPropertyOptional({ enum: FEATURE_FLAG_KINDS })
  @IsOptional() @IsEnum(FEATURE_FLAG_KINDS) public readonly kind?: FeatureFlagKind;

  @ApiPropertyOptional({ enum: FEATURE_FLAG_LIFECYCLES })
  @IsOptional() @IsEnum(FEATURE_FLAG_LIFECYCLES) public readonly lifecycle?: FeatureFlagLifecycle;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  public readonly limit?: number;
}

export class CreateFeatureFlagDefinitionDto {
  @ApiProperty({ example: 'module.fees' })
  @IsString() @MinLength(3) @MaxLength(100) @Matches(FLAG_KEY_REGEX)
  public readonly key!: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120)
  public readonly name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiProperty({ enum: FEATURE_FLAG_KINDS })
  @IsEnum(FEATURE_FLAG_KINDS)
  public readonly kind!: FeatureFlagKind;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  public readonly owner?: string | null;

  @ApiProperty({ default: false })
  @IsBoolean()
  public readonly defaultValue!: boolean;

  @ApiPropertyOptional({ enum: FEATURE_FLAG_LIFECYCLES, default: 'INTRODUCED' })
  @IsOptional() @IsEnum(FEATURE_FLAG_LIFECYCLES)
  public readonly lifecycle?: FeatureFlagLifecycle;

  @ApiPropertyOptional({ description: 'ISO-8601 timestamp.' })
  @IsOptional() @IsDateString()
  public readonly cleanupDueAt?: string | null;
}

export class UpdateFeatureFlagDefinitionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ enum: FEATURE_FLAG_KINDS })
  @IsOptional() @IsEnum(FEATURE_FLAG_KINDS)
  public readonly kind?: FeatureFlagKind;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  public readonly owner?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly defaultValue?: boolean;

  @ApiPropertyOptional({ enum: FEATURE_FLAG_LIFECYCLES })
  @IsOptional() @IsEnum(FEATURE_FLAG_LIFECYCLES)
  public readonly lifecycle?: FeatureFlagLifecycle;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  public readonly cleanupDueAt?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  public readonly reason?: string | null;
}

export class FeatureFlagDefinitionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly key!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ nullable: true }) public readonly description!: string | null;
  @ApiProperty({ enum: FEATURE_FLAG_KINDS }) public readonly kind!: FeatureFlagKind;
  @ApiProperty({ nullable: true }) public readonly owner!: string | null;
  @ApiProperty() public readonly defaultValue!: boolean;
  @ApiProperty({ enum: FEATURE_FLAG_LIFECYCLES }) public readonly lifecycle!: FeatureFlagLifecycle;
  @ApiProperty({ nullable: true }) public readonly cleanupDueAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: FeatureFlagDefinitionRow): FeatureFlagDefinitionResponseDto {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      kind: row.kind,
      owner: row.owner,
      defaultValue: row.defaultValue,
      lifecycle: row.lifecycle,
      cleanupDueAt: row.cleanupDueAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}

export class FeatureFlagDefinitionListResponseDto {
  @ApiProperty({ type: [FeatureFlagDefinitionResponseDto] })
  public readonly items!: readonly FeatureFlagDefinitionResponseDto[];
}

// --- Effective evaluation -------------------------------------------------

export class FeatureFlagEffectiveQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(36)
  public readonly planId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40)
  public readonly region?: string;
}

export class FeatureFlagEffectiveResponseDto {
  @ApiProperty() public readonly key!: string;
  @ApiProperty() public readonly value!: boolean;
  @ApiProperty({ enum: ['rollout', 'tenant_override', 'plan_map', 'default'] })
  public readonly source!: 'rollout' | 'tenant_override' | 'plan_map' | 'default';
  @ApiPropertyOptional({ nullable: true }) public readonly quotaInt?: number | null;

  public static from(evaluation: FeatureFlagEvaluation): FeatureFlagEffectiveResponseDto {
    return {
      key: evaluation.key,
      value: evaluation.value,
      source: evaluation.source,
      ...(evaluation.quotaInt !== undefined ? { quotaInt: evaluation.quotaInt } : {}),
    };
  }
}

// --- Tenant overrides -----------------------------------------------------

export class TenantOverrideListQueryDto {
  @ApiProperty() @IsString() @MaxLength(36)
  public readonly schoolId!: string;
}

export class UpsertTenantOverrideDto {
  @ApiProperty() @IsString() @MaxLength(36)
  public readonly schoolId!: string;

  @ApiProperty() @IsBoolean()
  public readonly value!: boolean;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0)
  public readonly quotaInt?: number | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(255)
  public readonly reason?: string | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString()
  public readonly expiresAt?: string | null;
}

export class DeleteTenantOverrideDto {
  @ApiProperty() @IsString() @MaxLength(36)
  public readonly schoolId!: string;
}

export class TenantOverrideResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly flagId!: string;
  @ApiProperty() public readonly value!: boolean;
  @ApiProperty({ nullable: true }) public readonly quotaInt!: number | null;
  @ApiProperty({ nullable: true }) public readonly reason!: string | null;
  @ApiProperty({ nullable: true }) public readonly setBy!: string | null;
  @ApiProperty() public readonly setAt!: string;
  @ApiProperty({ nullable: true }) public readonly expiresAt!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: FeatureFlagTenantOverrideRow): TenantOverrideResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      flagId: row.flagId,
      value: row.value,
      quotaInt: row.quotaInt,
      reason: row.reason,
      setBy: row.setBy,
      setAt: row.setAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      version: row.version,
    };
  }
}

export class TenantOverrideListResponseDto {
  @ApiProperty({ type: [TenantOverrideResponseDto] })
  public readonly items!: readonly TenantOverrideResponseDto[];
}

// --- Rollouts -------------------------------------------------------------

export class RolloutListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Matches(FLAG_KEY_REGEX)
  public readonly flagKey?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  public readonly limit?: number;
}

export class CreateRolloutDto {
  @ApiProperty() @IsString() @MaxLength(100) @Matches(FLAG_KEY_REGEX)
  public readonly flagKey!: string;

  @ApiProperty({ enum: ROLLOUT_STRATEGIES })
  @IsEnum(ROLLOUT_STRATEGIES)
  public readonly strategy!: RolloutStrategy;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  public readonly percentage?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  public readonly tenantIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  public readonly planIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  public readonly regions?: string[];

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString()
  public readonly startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString()
  public readonly endsAt?: string | null;
}

export class UpdateRolloutDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  public readonly percentage?: number | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  public readonly tenantIds?: string[] | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  public readonly planIds?: string[] | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  public readonly regions?: string[] | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString()
  public readonly startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString()
  public readonly endsAt?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  public readonly reason?: string | null;
}

export class RolloutResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly flagId!: string;
  @ApiProperty({ enum: ROLLOUT_STRATEGIES }) public readonly strategy!: RolloutStrategy;
  @ApiProperty({ nullable: true }) public readonly percentage!: number | null;
  @ApiProperty({ type: Object, nullable: true }) public readonly tenantIdsJson!: unknown;
  @ApiProperty({ type: Object, nullable: true }) public readonly planIdsJson!: unknown;
  @ApiProperty({ type: Object, nullable: true }) public readonly regionsJson!: unknown;
  @ApiProperty() public readonly isActive!: boolean;
  @ApiProperty({ nullable: true }) public readonly startsAt!: string | null;
  @ApiProperty({ nullable: true }) public readonly endsAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: FeatureFlagRolloutRow): RolloutResponseDto {
    return {
      id: row.id,
      flagId: row.flagId,
      strategy: row.strategy,
      percentage: row.percentage,
      tenantIdsJson: row.tenantIdsJson,
      planIdsJson: row.planIdsJson,
      regionsJson: row.regionsJson,
      isActive: row.isActive,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}

export class RolloutListResponseDto {
  @ApiProperty({ type: [RolloutResponseDto] })
  public readonly items!: readonly RolloutResponseDto[];
}

// --- Audit ----------------------------------------------------------------

export class AuditListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Matches(FLAG_KEY_REGEX)
  public readonly flagKey?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(36)
  public readonly schoolId?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  public readonly since?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  public readonly limit?: number;
}

export class AuditResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty({ nullable: true }) public readonly schoolId!: string | null;
  @ApiProperty() public readonly flagId!: string;
  @ApiProperty() public readonly scope!: string;
  @ApiProperty({ type: Object, nullable: true }) public readonly beforeValue!: unknown;
  @ApiProperty({ type: Object, nullable: true }) public readonly afterValue!: unknown;
  @ApiProperty({ nullable: true }) public readonly actorUserId!: string | null;
  @ApiProperty({ nullable: true }) public readonly reason!: string | null;
  @ApiProperty() public readonly createdAt!: string;

  public static from(row: FeatureFlagAuditRow): AuditResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      flagId: row.flagId,
      scope: row.scope,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      actorUserId: row.actorUserId,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export class AuditListResponseDto {
  @ApiProperty({ type: [AuditResponseDto] })
  public readonly items!: readonly AuditResponseDto[];
}
