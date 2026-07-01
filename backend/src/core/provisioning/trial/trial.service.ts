/**
 * TrialService — trial-extension surface for the super-admin and the
 * batch scan used by the trial-expiry job.
 *
 * Sprint 14 (Wave 5):
 *   - extend(schoolId, version, additionalDays, reason?)
 *       Adds `additionalDays` to `trial_end_date`. Hard-capped at
 *       `TRIAL_EXTENSION_MAX_COUNT` extensions. Only valid while the
 *       school is still in TRIAL.
 *   - scanExpiring({ now, limit })
 *       Returns a window of TRIAL schools whose trial_end_date <= now.
 *       Read-only; the actual transition runs via
 *       SchoolLifecycleService.expireTrial inside the job loop.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { NotFoundError } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { SchoolRootRepository } from '../../school/school/school.repository';
import type { SchoolRootRow } from '../../school/school/school.types';
import {
  ProvisioningOutboxTopics,
  TRIAL_EXTENSION_MAX_COUNT,
} from '../provisioning.constants';
import {
  InvalidLifecycleTransitionError,
  TrialExtensionLimitError,
} from '../provisioning.errors';

export interface ExtendTrialArgs {
  readonly schoolId: string;
  readonly expectedVersion: number;
  readonly additionalDays: number;
  readonly reason?: string;
}

@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolRootRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async extend(args: ExtendTrialArgs): Promise<SchoolRootRow> {
    if (!Number.isInteger(args.additionalDays) || args.additionalDays <= 0) {
      throw new Error('TrialService.extend: additionalDays must be a positive integer.');
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current = await this.schools.findById(args.schoolId, tx);
      if (current === null) throw new NotFoundError('School', args.schoolId);

      // Only TRIAL schools accept extensions. EXPIRED uses the new-plan
      // path which lives in the lifecycle service.
      if (current.lifecycleStatus !== 'TRIAL') {
        throw new InvalidLifecycleTransitionError(current.lifecycleStatus, 'TRIAL');
      }
      if (current.trialExtendedCount >= TRIAL_EXTENSION_MAX_COUNT) {
        throw new TrialExtensionLimitError(
          args.schoolId,
          current.trialExtendedCount,
          TRIAL_EXTENSION_MAX_COUNT,
        );
      }

      const base = current.trialEndDate ?? new Date();
      const newEnd = new Date(base.getTime() + args.additionalDays * 24 * 60 * 60 * 1000);

      const updated = await this.schools.updateTrial(
        args.schoolId,
        args.expectedVersion,
        {
          trialEndDate: newEnd,
          trialExtendedCount: current.trialExtendedCount + 1,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.TRIAL_EXTENDED,
        eventType: 'TrialExtended',
        aggregateType: 'School',
        aggregateId: args.schoolId,
        schoolId: args.schoolId,
        payload: {
          id: args.schoolId,
          additionalDays: args.additionalDays,
          previousEndDate: current.trialEndDate?.toISOString() ?? null,
          newEndDate: newEnd.toISOString(),
          extensionNumber: updated.trialExtendedCount,
          reason: args.reason ?? null,
        },
      });

      await this.audit.record(
        {
          action: 'provisioning.trial.extend',
          category: 'tenancy',
          resourceType: 'School',
          resourceId: args.schoolId,
          schoolId: args.schoolId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Trial extended for school=${args.schoolId} by ${args.additionalDays.toString()}d ` +
          `(extension #${updated.trialExtendedCount.toString()}, newEnd=${newEnd.toISOString()}).`,
      );
      return updated;
    });
  }

  /**
   * Read a page of TRIAL schools whose trial has elapsed. The job handler
   * calls this and iterates each row through `SchoolLifecycleService`.
   */
  public async scanExpiring(args: {
    readonly now?: Date;
    readonly limit?: number;
  }): Promise<readonly SchoolRootRow[]> {
    const now = args.now ?? new Date();
    const limit = args.limit ?? 100;
    return this.schools.findExpiringTrials({ now, limit });
  }

  /**
   * Sprint 14.1 — read a page of TRIAL schools whose trial_end_date falls
   * within `(now, now + windowDays]`. Used by the trial-expiry job to dispatch
   * `TRIAL_EXPIRING` warnings before the actual expiry transition.
   */
  public async scanUpcoming(args: {
    readonly now?: Date;
    readonly windowDays?: number;
    readonly limit?: number;
  }): Promise<readonly SchoolRootRow[]> {
    const now = args.now ?? new Date();
    const windowDays = args.windowDays ?? 7;
    const until = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const limit = args.limit ?? 100;
    return this.schools.findUpcomingTrialExpirations({ now, until, limit });
  }
}
