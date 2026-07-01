/**
 * PlanFeatureSeeder — boot-time idempotent upsert of the 14 canonical
 * feature keys (7 LIMIT + 7 TOGGLE) across the three seeded plan codes
 * (STARTER, GROWTH, ENTERPRISE).
 *
 * The Sprint 15 migration ships an equivalent `INSERT IGNORE` for the
 * same 42 rows; this seeder is the safety net for later sprints that
 * tweak per-plan limits or modes (upsert refreshes mode/limit/sortOrder).
 *
 * Runs under a synthesised system context so the audit + soft-delete
 * extensions don't blow up looking for a request-bound RequestContext.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { RequestContextRegistry } from '../../request-context';
import type {
  FeatureModeValue,
  FeatureTypeValue,
} from '../subscription.types';
import {
  BUILT_IN_FEATURE_KEYS_LIMIT,
  BUILT_IN_FEATURE_KEYS_TOGGLE,
  type BuiltInFeatureKey,
  type BuiltInLimitFeatureKey,
  type BuiltInToggleFeatureKey,
} from './feature-keys';
import { PlanFeatureRepository } from './plan-feature.repository';

type PlanCode = 'STARTER' | 'GROWTH' | 'ENTERPRISE';

interface LimitSeed {
  readonly mode: Extract<FeatureModeValue, 'LIMITED' | 'UNLIMITED' | 'DISABLED'>;
  readonly limit: number | null;
}

interface ToggleSeed {
  readonly mode: Extract<FeatureModeValue, 'ENABLED' | 'DISABLED'>;
}

const GB = 1024 * 1024 * 1024;

const LIMIT_MATRIX: Readonly<
  Record<BuiltInLimitFeatureKey, Readonly<Record<PlanCode, LimitSeed>>>
> = Object.freeze({
  student_count: {
    STARTER: { mode: 'LIMITED', limit: 500 },
    GROWTH: { mode: 'LIMITED', limit: 2_500 },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
  staff_count: {
    STARTER: { mode: 'LIMITED', limit: 50 },
    GROWTH: { mode: 'LIMITED', limit: 250 },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
  branch_count: {
    STARTER: { mode: 'LIMITED', limit: 1 },
    GROWTH: { mode: 'LIMITED', limit: 5 },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
  email_monthly: {
    STARTER: { mode: 'LIMITED', limit: 5_000 },
    GROWTH: { mode: 'LIMITED', limit: 50_000 },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
  sms_monthly: {
    STARTER: { mode: 'DISABLED', limit: 0 },
    GROWTH: { mode: 'LIMITED', limit: 10_000 },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
  whatsapp_monthly: {
    STARTER: { mode: 'DISABLED', limit: 0 },
    GROWTH: { mode: 'LIMITED', limit: 5_000 },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
  storage_bytes: {
    STARTER: { mode: 'LIMITED', limit: 10 * GB },
    GROWTH: { mode: 'LIMITED', limit: 100 * GB },
    ENTERPRISE: { mode: 'UNLIMITED', limit: null },
  },
});

const TOGGLE_MATRIX: Readonly<
  Record<BuiltInToggleFeatureKey, Readonly<Record<PlanCode, ToggleSeed>>>
> = Object.freeze({
  parent_portal: {
    STARTER: { mode: 'ENABLED' },
    GROWTH: { mode: 'ENABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
  student_portal: {
    STARTER: { mode: 'ENABLED' },
    GROWTH: { mode: 'ENABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
  payroll: {
    STARTER: { mode: 'DISABLED' },
    GROWTH: { mode: 'ENABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
  accounting: {
    STARTER: { mode: 'DISABLED' },
    GROWTH: { mode: 'ENABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
  advanced_reporting: {
    STARTER: { mode: 'DISABLED' },
    GROWTH: { mode: 'DISABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
  multi_branch: {
    STARTER: { mode: 'DISABLED' },
    GROWTH: { mode: 'ENABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
  event_management: {
    STARTER: { mode: 'ENABLED' },
    GROWTH: { mode: 'ENABLED' },
    ENTERPRISE: { mode: 'ENABLED' },
  },
});

const PLAN_CODES: readonly PlanCode[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];

const SORT_ORDER: Readonly<Record<BuiltInFeatureKey, number>> = Object.freeze(
  Object.fromEntries(
    [...BUILT_IN_FEATURE_KEYS_LIMIT, ...BUILT_IN_FEATURE_KEYS_TOGGLE].map(
      (key, idx) => [key, idx * 10],
    ),
  ) as Record<BuiltInFeatureKey, number>,
);

@Injectable()
export class PlanFeatureSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlanFeatureSeeder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PlanFeatureRepository,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `PlanFeature seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const ctx = RequestContextRegistry.makeSystemContext({
      requestId: 'plan-feature-seeder',
    });
    await RequestContextRegistry.run(ctx, async () => {
      let upsertedCount = 0;
      let missingPlanCount = 0;

      for (const code of PLAN_CODES) {
        const plan = (await this.prisma.client.plan.findFirst({
          where: { code, deletedAt: null },
          select: { id: true } as never,
        })) as { id: string } | null;
        if (plan === null) {
          missingPlanCount += 1;
          this.logger.warn(
            `PlanFeature seed: plan code=${code} not present, skipping.`,
          );
          continue;
        }

        for (const key of BUILT_IN_FEATURE_KEYS_LIMIT) {
          const seed = LIMIT_MATRIX[key][code];
          await this.repo.upsertByKey({
            planId: plan.id,
            featureKey: key,
            featureType: 'LIMIT' satisfies FeatureTypeValue,
            mode: seed.mode,
            limit: seed.limit,
            sortOrder: SORT_ORDER[key],
          });
          upsertedCount += 1;
        }

        for (const key of BUILT_IN_FEATURE_KEYS_TOGGLE) {
          const seed = TOGGLE_MATRIX[key][code];
          await this.repo.upsertByKey({
            planId: plan.id,
            featureKey: key,
            featureType: 'TOGGLE' satisfies FeatureTypeValue,
            mode: seed.mode,
            limit: null,
            sortOrder: SORT_ORDER[key],
          });
          upsertedCount += 1;
        }
      }

      this.logger.log(
        `PlanFeature seed complete: upserted=${upsertedCount.toString()} skipped(plan missing)=${missingPlanCount.toString()}.`,
      );
    });
  }
}
