/**
 * TrialExpiryScheduleBootstrap — Sprint 14.1 follow-up.
 *
 * Idempotently registers a cross-tenant JobDefinition for the
 * `provisioning.trial.expiry-scan` handler at `0 2 * * *` (daily, 02:00
 * server-local). `JobSchedulerService.tick` picks it up and enqueues a Job
 * row each day; `JobProcessorService` runs the registered handler which
 * fires `TRIAL_EXPIRING` warnings for upcoming trials and transitions
 * elapsed trials to EXPIRED (dispatching `SCHOOL_EXPIRED`).
 *
 * Why a boot-time upsert (vs a migration)?
 *   - Schedules live in code; deploys that change the cron take effect on
 *     restart with no follow-up DB step.
 *   - Idempotent: existing rows have their cron / payload refreshed but
 *     keep their primary id (so JobRun history stays attached).
 *   - Failure logs loudly but does not crash the app — without the
 *     scheduler row the handler is still callable via the ops console.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ulid } from 'ulid';

import { PrismaService } from '../../../infra/prisma';
import { JobDefinitionRepository } from '../../jobs/repositories/job-definition.repository';
import { ProvisioningJobHandlers } from '../provisioning.constants';

/** Cross-tenant scheduled job name; must be unique within `schoolId = NULL`. */
export const TRIAL_EXPIRY_JOB_DEFINITION_NAME = 'provisioning.trial.expiry-scan.daily';
/** Daily at 02:00 server-local. Quiet window — no tenant-facing traffic. */
export const TRIAL_EXPIRY_JOB_DEFAULT_CRON = '0 2 * * *';
/** Queue name reused from the existing provisioning workload. */
export const TRIAL_EXPIRY_JOB_QUEUE = 'provisioning';

@Injectable()
export class TrialExpiryScheduleBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(TrialExpiryScheduleBootstrap.name);

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
        `Trial-expiry schedule bootstrap failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const existing = await this.definitions.findByName(
      null,
      TRIAL_EXPIRY_JOB_DEFINITION_NAME,
    );

    if (existing === null) {
      await this.definitions.create({
        id: ulid(),
        schoolId: null,
        name: TRIAL_EXPIRY_JOB_DEFINITION_NAME,
        queue: TRIAL_EXPIRY_JOB_QUEUE,
        handlerName: ProvisioningJobHandlers.TRIAL_EXPIRY_SCAN,
        scheduleCron: TRIAL_EXPIRY_JOB_DEFAULT_CRON,
        payloadTemplate: { batchSize: 100, warningWindowDays: 7 },
        isActive: true,
        description:
          'Sprint 14.1 — daily scan that fires TRIAL_EXPIRING warnings ' +
          'and transitions elapsed TRIAL schools to EXPIRED.',
        createdBy: null,
      });
      this.logger.log(
        `Trial-expiry JobDefinition seeded (cron="${TRIAL_EXPIRY_JOB_DEFAULT_CRON}").`,
      );
      return;
    }

    // Refresh cron + payload + active flag so the seed stays authoritative
    // for the schedule, but preserve the row id (and its JobRun history).
    // We use updateMany so we don't have to round-trip the version.
    await this.prisma.client.jobDefinition.updateMany({
      where: { id: existing.id },
      data: {
        queue: TRIAL_EXPIRY_JOB_QUEUE,
        handlerName: ProvisioningJobHandlers.TRIAL_EXPIRY_SCAN,
        scheduleCron: TRIAL_EXPIRY_JOB_DEFAULT_CRON,
        payloadTemplate: { batchSize: 100, warningWindowDays: 7 },
        isActive: true,
      },
    });
    this.logger.log(
      `Trial-expiry JobDefinition refreshed (id=${existing.id}, cron="${TRIAL_EXPIRY_JOB_DEFAULT_CRON}").`,
    );
  }
}
