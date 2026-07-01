/**
 * BulkOpExecuteHandler — `bulk-op.execute` job handler.
 *
 * Pipeline (one job invocation):
 *   1. Bind a system request context (schoolId from payload, no userId).
 *   2. Load the bulk-operation header. Skip if status != EXECUTING (race).
 *   3. Resolve the executor from BulkOperationExecutorRegistry; throw
 *      BulkOperationKindUnknownError if missing.
 *   4. Run executor.execute(params, ctx) — stub kinds throw
 *      BulkOperationKindNotImplementedError, which is caught below.
 *   5. markCompleted with the per-target counters; dispatch the
 *      BULK_OPERATION_COMPLETED notification (gated by
 *      `reporting.notify_on_completion`).
 *
 * Failure path: any thrown error → markFailed(message). The notification
 * catalog has no "failed" event for bulk-ops in this sprint; failure is
 * logged + reflected in the row status.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { NotificationEventDispatcherService } from '../../notifications/notification-event-dispatcher/notification-event-dispatcher.service';
import { runWithSystemContext } from '../../request-context';
import {
  REPORTING_JOB_HANDLERS,
  ReportingFeatureFlags,
  ReportingNotificationEventKeys,
} from '../reporting.constants';
import { BulkOperationKindUnknownError } from '../reporting.errors';
import { BulkOperationService } from './bulk-operation.service';
import { BulkOperationExecutorRegistry } from './executors/executor.registry';

interface BulkOpExecuteJobPayload {
  readonly bulkOperationId: string;
  readonly schoolId: string;
}

@Injectable()
export class BulkOpExecuteHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(BulkOpExecuteHandler.name);

  constructor(
    private readonly jobRegistry: JobHandlerRegistry,
    private readonly service: BulkOperationService,
    private readonly executors: BulkOperationExecutorRegistry,
    private readonly featureFlags: FeatureFlagService,
    private readonly notifications: NotificationEventDispatcherService,
  ) {}

  public onApplicationBootstrap(): void {
    this.jobRegistry.register<BulkOpExecuteJobPayload>(
      REPORTING_JOB_HANDLERS.BULK_OP_EXECUTE,
      (payload, ctx) => this.handle(payload, ctx),
    );
    this.logger.log(
      `Registered job handler "${REPORTING_JOB_HANDLERS.BULK_OP_EXECUTE}".`,
    );
  }

  private async handle(
    payload: BulkOpExecuteJobPayload,
    ctx: JobHandlerContext,
  ): Promise<void> {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.bulkOperationId !== 'string' ||
      typeof payload.schoolId !== 'string'
    ) {
      throw new Error(
        `bulk-op.execute payload malformed: ${JSON.stringify(payload)}`,
      );
    }

    await runWithSystemContext(
      {
        schoolId: payload.schoolId,
        actorScope: 'global',
        requestId: `job-${ctx.job.id}`,
      },
      () => this.process(payload),
    );
  }

  private async process(payload: BulkOpExecuteJobPayload): Promise<void> {
    const { bulkOperationId, schoolId } = payload;
    const op = await this.service.getByIdInternal(bulkOperationId);

    if (op.status !== 'EXECUTING') {
      this.logger.log(
        `bulk-op.execute skipping non-EXECUTING op id=${bulkOperationId} status=${op.status}.`,
      );
      return;
    }

    try {
      const executor = this.executors.get(op.kind);
      if (executor === undefined) {
        throw new BulkOperationKindUnknownError(op.kind);
      }

      const result = await executor.execute(op.params, {
        schoolId,
        userId: op.requestedByUserId,
        bulkOperationId: op.id,
      });

      const completed = await this.service.markCompleted(op.id, {
        processedCount: result.processedCount,
        succeededCount: result.succeededCount,
        failedCount: result.failedCount,
      });

      this.logger.log(
        `bulk-op.execute completed id=${bulkOperationId} code=${completed.code} kind=${completed.kind} processed=${result.processedCount} succeeded=${result.succeededCount} failed=${result.failedCount}.`,
      );

      await this.maybeNotify({
        schoolId,
        eventKey: ReportingNotificationEventKeys.BULK_OPERATION_COMPLETED,
        recipientUserId: completed.requestedByUserId,
        variables: {
          bulkOperationId: completed.id,
          bulkOpCode: completed.code,
          bulkOpKind: completed.kind,
          processedCount: result.processedCount,
          succeededCount: result.succeededCount,
          failedCount: result.failedCount,
        },
        aggregateId: completed.id,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Bulk operation execution failed.';
      try {
        await this.service.markFailed(bulkOperationId, message);
      } catch (markErr) {
        this.logger.error(
          `bulk-op.execute failed to record FAILED id=${bulkOperationId}: ${(markErr as Error).message}`,
        );
      }

      this.logger.error(
        `bulk-op.execute failed id=${bulkOperationId} code=${op.code} kind=${op.kind}: ${message}`,
      );
      throw err;
    }
  }

  private async maybeNotify(args: {
    readonly schoolId: string;
    readonly eventKey: string;
    readonly recipientUserId: string;
    readonly variables: Record<string, unknown>;
    readonly aggregateId: string;
  }): Promise<void> {
    let enabled = false;
    try {
      enabled = await this.featureFlags.isEnabled(
        ReportingFeatureFlags.NOTIFY_ON_COMPLETION,
        { schoolId: args.schoolId },
      );
    } catch (err) {
      this.logger.warn(
        `bulk-op.execute notify flag lookup failed: ${(err as Error).message}`,
      );
      return;
    }
    if (!enabled) return;

    try {
      await this.notifications.dispatch({
        eventKey: args.eventKey,
        schoolId: args.schoolId,
        recipients: [{ userId: args.recipientUserId }],
        variables: args.variables,
        aggregateType: 'BulkOperation',
        aggregateId: args.aggregateId,
        dedupeKey: `bulk-op:${args.aggregateId}:${args.eventKey}`,
      });
    } catch (err) {
      this.logger.warn(
        `bulk-op.execute notification dispatch failed event=${args.eventKey} id=${args.aggregateId}: ${(err as Error).message}`,
      );
    }
  }
}
