/**
 * ReportRunHandler — `report.run` job handler.
 *
 * Pipeline (one job invocation):
 *   1. Bind a system request context (schoolId from payload, no userId)
 *      so downstream services (Prisma tenant guard, audit, outbox)
 *      see the correct tenant.
 *   2. Load the run with `getByIdInternal` (bypasses the module flag
 *      gate so a toggled-off `module.reporting` doesn't strand
 *      in-flight workers).
 *   3. `markRunning` (status PENDING → RUNNING; outbox `report.run.started`).
 *   4. Resolve the engine for the run's kind, call `execute(params, ctx)`.
 *   5. Format the rowset to a binary buffer (CSV / Excel).
 *   6. Upload the buffer via FileAssetService (purpose=REPORT_EXPORT).
 *   7. `markSucceeded({ fileAssetId, rowCount })` (status RUNNING →
 *      SUCCEEDED; outbox `report.run.succeeded`).
 *   8. If `reporting.notify_on_completion` is enabled, dispatch the
 *      REPORT_READY notification event to the requesting user.
 *
 * Failure path: any thrown error → `markFailed(errorMessage)` + dispatch
 * REPORT_FAILED notification (when flag is on). The job-processor's own
 * retry policy is respected because we only swallow the engine error
 * after recording the FAILED transition.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { FileAssetService } from '../../file-storage';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { NotificationEventDispatcherService } from '../../notifications/notification-event-dispatcher/notification-event-dispatcher.service';
import { runWithSystemContext } from '../../request-context';
import { ExportFormatterService } from '../export/export-formatter.service';
import { ReportEngineService } from '../report-engine/report-engine.service';
import {
  FILE_PURPOSE_REPORT_EXPORT,
  REPORTING_JOB_HANDLERS,
  ReportingFeatureFlags,
  ReportingNotificationEventKeys,
} from '../reporting.constants';
import { ReportRunService } from './report.service';

interface ReportRunJobPayload {
  readonly reportRunId: string;
  readonly schoolId: string;
}

@Injectable()
export class ReportRunHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportRunHandler.name);

  constructor(
    private readonly jobRegistry: JobHandlerRegistry,
    private readonly service: ReportRunService,
    private readonly engines: ReportEngineService,
    private readonly formatter: ExportFormatterService,
    private readonly fileAssets: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly notifications: NotificationEventDispatcherService,
  ) {}

  public onApplicationBootstrap(): void {
    this.jobRegistry.register<ReportRunJobPayload>(
      REPORTING_JOB_HANDLERS.REPORT_RUN,
      (payload, ctx) => this.handle(payload, ctx),
    );
    this.logger.log(
      `Registered job handler "${REPORTING_JOB_HANDLERS.REPORT_RUN}".`,
    );
  }

  private async handle(
    payload: ReportRunJobPayload,
    ctx: JobHandlerContext,
  ): Promise<void> {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.reportRunId !== 'string' ||
      typeof payload.schoolId !== 'string'
    ) {
      throw new Error(
        `report.run payload malformed: ${JSON.stringify(payload)}`,
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

  private async process(payload: ReportRunJobPayload): Promise<void> {
    const { reportRunId, schoolId } = payload;
    const initial = await this.service.getByIdInternal(reportRunId);

    if (initial.status === 'CANCELLED') {
      this.logger.log(
        `report.run skipping cancelled run id=${reportRunId} code=${initial.code}.`,
      );
      return;
    }
    if (initial.status === 'SUCCEEDED' || initial.status === 'FAILED') {
      this.logger.log(
        `report.run skipping already-terminal run id=${reportRunId} status=${initial.status}.`,
      );
      return;
    }

    let running;
    try {
      running = await this.service.markRunning(reportRunId);
    } catch (err) {
      this.logger.error(
        `report.run failed to transition to RUNNING id=${reportRunId}: ${(err as Error).message}`,
      );
      throw err;
    }

    try {
      const rowSet = await this.engines.execute(running.kind, running.params, {
        schoolId,
        userId: running.requestedByUserId,
      });

      const formatted = await this.formatter.format(rowSet, running.format);

      const fileName = `${running.code}.${formatted.extension}`;
      const asset = await this.fileAssets.upload({
        purpose: FILE_PURPOSE_REPORT_EXPORT,
        fileName,
        mimeType: formatted.mimeType,
        body: formatted.buffer,
        isPublic: false,
      });

      const succeeded = await this.service.markSucceeded(reportRunId, {
        fileAssetId: asset.id,
        rowCount: rowSet.rows.length,
      });

      this.logger.log(
        `report.run succeeded id=${reportRunId} code=${succeeded.code} rows=${succeeded.rowCount} file=${asset.id}.`,
      );

      await this.maybeNotify({
        schoolId,
        eventKey: ReportingNotificationEventKeys.REPORT_READY,
        recipientUserId: succeeded.requestedByUserId,
        variables: {
          reportRunId: succeeded.id,
          code: succeeded.code,
          kind: succeeded.kind,
          format: succeeded.format,
          rowCount: succeeded.rowCount,
        },
        aggregateId: succeeded.id,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Report engine execution failed.';
      try {
        await this.service.markFailed(reportRunId, message);
      } catch (markErr) {
        this.logger.error(
          `report.run failed to record FAILED id=${reportRunId}: ${(markErr as Error).message}`,
        );
      }

      await this.maybeNotify({
        schoolId,
        eventKey: ReportingNotificationEventKeys.REPORT_FAILED,
        recipientUserId: running.requestedByUserId,
        variables: {
          reportRunId: running.id,
          code: running.code,
          kind: running.kind,
          format: running.format,
          errorMessage: message,
        },
        aggregateId: running.id,
      });

      this.logger.error(
        `report.run failed id=${reportRunId} code=${running.code}: ${message}`,
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
        `report.run notify flag lookup failed: ${(err as Error).message}`,
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
        aggregateType: 'ReportRun',
        aggregateId: args.aggregateId,
        dedupeKey: `report-run:${args.aggregateId}:${args.eventKey}`,
      });
    } catch (err) {
      // Notification dispatch failure must not roll back the report run
      // lifecycle — log and continue.
      this.logger.warn(
        `report.run notification dispatch failed event=${args.eventKey} id=${args.aggregateId}: ${(err as Error).message}`,
      );
    }
  }
}
