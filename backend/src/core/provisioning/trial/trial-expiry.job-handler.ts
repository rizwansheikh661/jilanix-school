/**
 * TrialExpiryJobHandler — registers the
 * `provisioning.trial.expiry-scan` handler with `JobHandlerRegistry`.
 *
 * Each invocation runs two passes (Sprint 14.1):
 *   1. Upcoming pass — loads up to `payload.batchSize` TRIAL rows whose
 *      `trial_end_date` falls in `(now, now + warningWindowDays]` and
 *      emits a `TRIAL_EXPIRY_WARNING` outbox event + `tenancy` audit per
 *      row so downstream notification handlers can dispatch
 *      `TRIAL_EXPIRING` to the school admin.
 *   2. Expired pass — loads up to `payload.batchSize` TRIAL rows whose
 *      `trial_end_date <= now`, opens a per-school transaction and calls
 *      `SchoolLifecycleService.expireTrial(row.id, tx)`. The lifecycle
 *      service publishes the `SCHOOL_TRIAL_EXPIRED` outbox topic (carries
 *      the `SCHOOL_EXPIRED` notification event semantics) and records a
 *      `tenancy` audit row in the same tx.
 *
 * Errors during a single school are isolated — the loop continues so a
 * single bad row never poisons the entire scan.
 *
 * Scheduling: see `TrialExpiryScheduleBootstrap` which upserts a
 * JobDefinition row at `0 2 * * *` (daily 02:00 server-local) so
 * `JobSchedulerService` enqueues a run each day. The handler itself stays
 * tx-aware and idempotent so manual fires (ops console / replay) are safe.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { runWithSystemContext } from '../../request-context';
import { SchoolLifecycleService } from '../lifecycle/school-lifecycle.service';
import {
  ProvisioningJobHandlers,
  ProvisioningNotificationEventKeys,
  ProvisioningOutboxTopics,
} from '../provisioning.constants';
import { TrialService } from './trial.service';

interface TrialExpiryScanPayload {
  readonly batchSize?: number;
  /** ISO-8601 string; defaults to "now". Useful for backfills / tests. */
  readonly asOf?: string;
  /** Days ahead of `asOf` to flag for TRIAL_EXPIRING warnings. Default 7. */
  readonly warningWindowDays?: number;
}

interface TrialExpiryScanOutput {
  readonly scanned: number;
  readonly expired: number;
  readonly errors: number;
  readonly errorIds: readonly string[];
  readonly upcomingScanned: number;
  readonly upcomingWarned: number;
}

@Injectable()
export class TrialExpiryJobHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TrialExpiryJobHandler.name);

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly prisma: PrismaService,
    private readonly trials: TrialService,
    private readonly lifecycle: SchoolLifecycleService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register<TrialExpiryScanPayload>(
      ProvisioningJobHandlers.TRIAL_EXPIRY_SCAN,
      async (payload, ctx) => {
        const result = await this.handle(payload, ctx);
        return result as unknown as Prisma.InputJsonValue;
      },
    );
    this.logger.log(
      `Registered job handler "${ProvisioningJobHandlers.TRIAL_EXPIRY_SCAN}".`,
    );
  }

  public async handle(
    payload: TrialExpiryScanPayload,
    _ctx: JobHandlerContext,
  ): Promise<TrialExpiryScanOutput> {
    // Job handlers run under the worker's bare context — we synthesise a
    // platform-actor RequestContext so audit + outbox writes have an actor
    // scope that the tenant-scope extension won't reject.
    return runWithSystemContext(
      { actorScope: 'global', requestId: `trial-expiry-${Date.now().toString()}` },
      async () => {
        const asOf =
          payload.asOf !== undefined && payload.asOf.length > 0
            ? new Date(payload.asOf)
            : new Date();
        const batchSize = payload.batchSize ?? 100;
        const warningWindowDays = payload.warningWindowDays ?? 7;

        // ---- Pass 1: upcoming warnings (TRIAL_EXPIRING) -----------------
        const upcoming = await this.trials.scanUpcoming({
          now: asOf,
          windowDays: warningWindowDays,
          limit: batchSize,
        });
        let upcomingWarned = 0;
        for (const row of upcoming) {
          try {
            await this.prisma.transaction(async (rawTx) => {
              const tx = rawTx as unknown as PrismaTx;
              const daysRemaining = computeDaysRemaining(row.trialEndDate, asOf);
              await this.outbox.publish(tx, {
                topic: ProvisioningOutboxTopics.TRIAL_EXPIRY_WARNING,
                eventType: ProvisioningNotificationEventKeys.TRIAL_EXPIRING,
                aggregateType: 'School',
                aggregateId: row.id,
                schoolId: row.id,
                payload: {
                  id: row.id,
                  trialEndDate: row.trialEndDate?.toISOString() ?? null,
                  daysRemaining,
                  warningWindowDays,
                },
              });
              await this.audit.record(
                {
                  action: 'provisioning.trial.expiry_warning',
                  category: 'tenancy',
                  resourceType: 'School',
                  resourceId: row.id,
                  schoolId: row.id,
                  after: {
                    trialEndDate: row.trialEndDate?.toISOString() ?? null,
                    daysRemaining,
                  },
                },
                { tx: tx as unknown as AuditTxLike },
              );
            });
            upcomingWarned += 1;
          } catch (err) {
            // A warning failure must NOT block the expiry pass — log and
            // move on. The next daily run will retry the warning.
            this.logger.error(
              `Trial expiry warning failed for school ${row.id}: ${(err as Error).message}`,
              (err as Error).stack,
            );
          }
        }

        // ---- Pass 2: actual expiry (SCHOOL_EXPIRED) ---------------------
        const expiring = await this.trials.scanExpiring({ now: asOf, limit: batchSize });
        let expired = 0;
        const errorIds: string[] = [];

        for (const row of expiring) {
          try {
            await this.prisma.transaction(async (rawTx) => {
              const tx = rawTx as unknown as PrismaTx;
              // expireTrial already publishes SCHOOL_TRIAL_EXPIRED outbox
              // (carrying SCHOOL_EXPIRED semantics) and audits the lifecycle
              // transition under category=tenancy.
              await this.lifecycle.expireTrial(row.id, tx);
            });
            expired += 1;
          } catch (err) {
            errorIds.push(row.id);
            this.logger.error(
              `Trial expiry failed for school ${row.id}: ${(err as Error).message}`,
              (err as Error).stack,
            );
          }
        }

        return {
          scanned: expiring.length,
          expired,
          errors: errorIds.length,
          errorIds,
          upcomingScanned: upcoming.length,
          upcomingWarned,
        };
      },
    ) as Promise<TrialExpiryScanOutput>;
  }
}

function computeDaysRemaining(end: Date | null, now: Date): number {
  if (end === null) return 0;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
