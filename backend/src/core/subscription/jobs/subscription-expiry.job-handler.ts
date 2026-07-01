/**
 * SubscriptionExpiryJobHandler — registers the
 * `subscription.expiry-scan` handler with `JobHandlerRegistry`.
 *
 * Two-pass run:
 *   1. Warning pass — loads ACTIVE/TRIAL rows whose `expiryDate` falls in
 *      `(now, now + warningWindowDays]` and advances them to `EXPIRING`.
 *      `SubscriptionService.markExpiring` publishes
 *      `SUBSCRIPTION_EXPIRING` so downstream notification handlers can
 *      dispatch `SUBSCRIPTION_EXPIRING` (warning band).
 *   2. Expiry pass — loads rows whose `expiryDate <= now` and advances
 *      them to `EXPIRED`. `SubscriptionService.markExpired` publishes
 *      `SUBSCRIPTION_EXPIRED`.
 *
 * Errors during a single row are isolated — the loop continues so one
 * bad row never poisons the entire scan.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { runWithSystemContext } from '../../request-context';
import { SubscriptionJobHandlers } from '../subscription.constants';
import { SubscriptionRepository } from '../subscription/subscription.repository';
import { SubscriptionService } from '../subscription/subscription.service';

interface SubscriptionExpiryScanPayload {
  readonly batchSize?: number;
  /** ISO-8601 string; defaults to "now". Useful for backfills / tests. */
  readonly asOf?: string;
  /** Days ahead of `asOf` to flag for SUBSCRIPTION_EXPIRING warnings. Default 7. */
  readonly warningWindowDays?: number;
}

interface SubscriptionExpiryScanOutput {
  readonly upcomingScanned: number;
  readonly markedExpiring: number;
  readonly scanned: number;
  readonly markedExpired: number;
  readonly errors: number;
  readonly errorIds: readonly string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionExpiryJobHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionExpiryJobHandler.name);

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionRepository,
    private readonly service: SubscriptionService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register<SubscriptionExpiryScanPayload>(
      SubscriptionJobHandlers.SUBSCRIPTION_EXPIRY_SCAN,
      async (payload, ctx) => {
        const result = await this.handle(payload, ctx);
        return result as unknown as Prisma.InputJsonValue;
      },
    );
    this.logger.log(
      `Registered job handler "${SubscriptionJobHandlers.SUBSCRIPTION_EXPIRY_SCAN}".`,
    );
  }

  public async handle(
    payload: SubscriptionExpiryScanPayload,
    _ctx: JobHandlerContext,
  ): Promise<SubscriptionExpiryScanOutput> {
    return runWithSystemContext(
      { actorScope: 'global', requestId: `subscription-expiry-${Date.now().toString()}` },
      async () => {
        const asOf =
          payload.asOf !== undefined && payload.asOf.length > 0
            ? new Date(payload.asOf)
            : new Date();
        const batchSize = payload.batchSize ?? 100;
        const warningWindowDays = payload.warningWindowDays ?? 7;
        const warningHorizon = new Date(asOf.getTime() + warningWindowDays * MS_PER_DAY);

        // ---- Pass 1: warning (ACTIVE/TRIAL -> EXPIRING) ------------------
        const upcoming = await this.subs.listExpiring({
          horizon: warningHorizon,
          limit: batchSize,
        });
        const upcomingWarn = upcoming.filter(
          (r) =>
            (r.status === 'ACTIVE' || r.status === 'TRIAL') &&
            r.expiryDate !== null &&
            r.expiryDate > asOf,
        );
        let markedExpiring = 0;
        for (const row of upcomingWarn) {
          try {
            await this.prisma.transaction(async (rawTx) => {
              const tx = rawTx as unknown as PrismaTx;
              await this.service.markExpiring(row, tx);
            });
            markedExpiring += 1;
          } catch (err) {
            this.logger.error(
              `markExpiring failed sub=${row.id} school=${row.schoolId}: ${(err as Error).message}`,
              (err as Error).stack,
            );
          }
        }

        // ---- Pass 2: expire (any -> EXPIRED) ---------------------------
        const expired = await this.subs.listExpiring({
          horizon: asOf,
          limit: batchSize,
        });
        const elapsed = expired.filter(
          (r) =>
            r.expiryDate !== null &&
            r.expiryDate <= asOf &&
            r.status !== 'EXPIRED' &&
            r.status !== 'CANCELLED',
        );
        let markedExpired = 0;
        const errorIds: string[] = [];
        for (const row of elapsed) {
          try {
            await this.prisma.transaction(async (rawTx) => {
              const tx = rawTx as unknown as PrismaTx;
              await this.service.markExpired(row, tx);
            });
            markedExpired += 1;
          } catch (err) {
            errorIds.push(row.id);
            this.logger.error(
              `markExpired failed sub=${row.id} school=${row.schoolId}: ${(err as Error).message}`,
              (err as Error).stack,
            );
          }
        }

        return {
          upcomingScanned: upcomingWarn.length,
          markedExpiring,
          scanned: elapsed.length,
          markedExpired,
          errors: errorIds.length,
          errorIds,
        };
      },
    ) as Promise<SubscriptionExpiryScanOutput>;
  }
}
