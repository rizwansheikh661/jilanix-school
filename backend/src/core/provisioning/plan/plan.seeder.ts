/**
 * PlanSeeder — boot-time idempotent upsert of the STARTER + GROWTH plan
 * catalog entries. The Sprint 14 migration ships an `INSERT IGNORE` for the
 * same two codes; this seeder is the safety net for later sprints that add
 * new fields to `Plan` (the upsert refreshes existing rows' columns).
 *
 * Runs under a synthesised system context so the audit + soft-delete
 * extensions don't blow up looking for a request-bound RequestContext.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { RequestContextRegistry } from '../../request-context';
import {
  PlanRepository,
  type CreatePlanInput,
} from './plan.repository';

const DEFAULT_PLAN_SEEDS: readonly CreatePlanInput[] = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'Entry-level plan with email + in-app notifications only.',
    defaultTrialDays: 30,
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: false,
    inAppEnabled: true,
    emailMonthlyLimit: 5_000,
    smsMonthlyLimit: 0,
    pushMonthlyLimit: 0,
    inAppMonthlyLimit: 50_000,
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    description: 'Full-feature plan with all communication channels enabled.',
    defaultTrialDays: 30,
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    emailMonthlyLimit: 50_000,
    smsMonthlyLimit: 10_000,
    pushMonthlyLimit: 100_000,
    inAppMonthlyLimit: 500_000,
  },
];

@Injectable()
export class PlanSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlanSeeder.name);

  constructor(private readonly repo: PlanRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `Plan seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const ctx = RequestContextRegistry.makeSystemContext({
      requestId: 'plan-seeder',
    });
    await RequestContextRegistry.run(ctx, async () => {
      for (const seed of DEFAULT_PLAN_SEEDS) {
        await this.repo.upsertByCode(seed);
      }
    });
    this.logger.log(
      `Plan seed complete: ${DEFAULT_PLAN_SEEDS.length.toString()} default plan(s) upserted.`,
    );
  }
}
