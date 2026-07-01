/**
 * SubscriptionExpiryScheduleBootstrap — Sprint 15 follow-up.
 *
 * Idempotently registers a cross-tenant JobDefinition for the
 * `subscription.expiry-scan` handler at `0 3 * * *` (daily, 03:00
 * server-local — staggered one hour after the Sprint 14.1 trial-expiry
 * scan to spread the early-morning workload). The JobSchedulerService
 * tick picks this row up and enqueues a Job each day; the registered
 * handler runs the two-pass scan (warning -> EXPIRING, expiry ->
 * EXPIRED) and dispatches the corresponding outbox events.
 *
 * Why a boot-time upsert (vs a migration)?
 *   - Schedules live in code; deploys that change cron or payload take
 *     effect on the next restart with no follow-up DB step.
 *   - Idempotent: existing rows have their cron / payload refreshed but
 *     keep their primary id (so JobRun history stays attached).
 *   - Failure logs loudly but does not crash the app — the handler is
 *     still callable on-demand via the ops console.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ulid } from 'ulid';

import { PrismaService } from '../../../infra/prisma';
import { JobDefinitionRepository } from '../../jobs/repositories/job-definition.repository';
import { SubscriptionJobHandlers } from '../subscription.constants';

/** Cross-tenant scheduled job name; must be unique within `schoolId = NULL`. */
export const SUBSCRIPTION_EXPIRY_JOB_DEFINITION_NAME =
  'subscription.expiry-scan.daily';
/** Daily at 03:00 server-local — staggered after the 02:00 trial-expiry scan. */
export const SUBSCRIPTION_EXPIRY_JOB_DEFAULT_CRON = '0 3 * * *';
/** Dedicated subscription queue. */
export const SUBSCRIPTION_EXPIRY_JOB_QUEUE = 'subscription';

@Injectable()
export class SubscriptionExpiryScheduleBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionExpiryScheduleBootstrap.name);

  constructor(
    private readonly definitions: JobDefinitionRepository,
    private readonly prisma: PrismaService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      // Never crash the app on a scheduler-row seed failure — the handler
      // is still registered and can be invoked on-demand.
      this.logger.error(
        `Subscription-expiry schedule bootstrap failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const existing = await this.definitions.findByName(
      null,
      SUBSCRIPTION_EXPIRY_JOB_DEFINITION_NAME,
    );

    if (existing === null) {
      await this.definitions.create({
        id: ulid(),
        schoolId: null,
        name: SUBSCRIPTION_EXPIRY_JOB_DEFINITION_NAME,
        queue: SUBSCRIPTION_EXPIRY_JOB_QUEUE,
        handlerName: SubscriptionJobHandlers.SUBSCRIPTION_EXPIRY_SCAN,
        scheduleCron: SUBSCRIPTION_EXPIRY_JOB_DEFAULT_CRON,
        payloadTemplate: { batchSize: 100, warningWindowDays: 7 },
        isActive: true,
        description:
          'Sprint 15 — daily scan that flags ACTIVE/TRIAL subscriptions ' +
          'within the warning window as EXPIRING and transitions elapsed ' +
          'subscriptions to EXPIRED.',
        createdBy: null,
      });
      this.logger.log(
        `Subscription-expiry JobDefinition seeded (cron="${SUBSCRIPTION_EXPIRY_JOB_DEFAULT_CRON}").`,
      );
      return;
    }

    // Refresh cron + payload + active flag so the seed stays authoritative
    // for the schedule, but preserve the row id (and its JobRun history).
    // We use updateMany so we don't have to round-trip the version.
    await this.prisma.client.jobDefinition.updateMany({
      where: { id: existing.id },
      data: {
        queue: SUBSCRIPTION_EXPIRY_JOB_QUEUE,
        handlerName: SubscriptionJobHandlers.SUBSCRIPTION_EXPIRY_SCAN,
        scheduleCron: SUBSCRIPTION_EXPIRY_JOB_DEFAULT_CRON,
        payloadTemplate: { batchSize: 100, warningWindowDays: 7 },
        isActive: true,
      },
    });
    this.logger.log(
      `Subscription-expiry JobDefinition refreshed (id=${existing.id}, cron="${SUBSCRIPTION_EXPIRY_JOB_DEFAULT_CRON}").`,
    );
  }
}
