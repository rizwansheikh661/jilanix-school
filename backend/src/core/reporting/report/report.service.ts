/**
 * ReportRunService — orchestration for the ReportRun header + lifecycle.
 *
 * Pipeline:
 *   1. `module.reporting` gate on every entrypoint.
 *   2. `reporting.allow_report_run` gate on create.
 *   3. Kind/format catalog validation via getReportKindEntry.
 *   4. Sequence-allocated RPT-<seq> code (non-FY).
 *   5. Insert + outbox + audit + audit + job enqueue all in one tx.
 *   6. Worker callbacks (markRunning / markSucceeded / markFailed) drive
 *      the lifecycle outboxes from the report-run handler.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { JobEnqueueService } from '../../jobs/services/job-enqueue.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES, SequenceService } from '../../sequences';
import {
  REPORTING_JOB_HANDLERS,
  ReportingFeatureFlags,
  ReportingOutboxTopics,
  type ReportFormatValue,
  type ReportKindValue,
} from '../reporting.constants';
import {
  ReportFormatNotImplementedError,
  ReportFormatNotSupportedError,
  ReportingModuleDisabledError,
  ReportKindUnknownError,
  ReportRunNotCancellableError,
  ReportRunNotDownloadableError,
  ReportRunNotFoundError,
} from '../reporting.errors';
import { getReportKindEntry } from '../report-kind-catalog';
import type { ReportRunRow } from '../reporting.types';
import {
  CANCELLABLE_REPORT_RUN_STATUSES,
  assertReportRunTransition,
} from '../state-machine';
import {
  ReportRunRepository,
  type ListReportRunsArgs,
} from './report.repository';

export interface CreateReportRunArgs {
  readonly kind: ReportKindValue;
  readonly format?: ReportFormatValue;
  readonly params: Record<string, unknown>;
}

@Injectable()
export class ReportRunService {
  private readonly logger = new Logger(ReportRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ReportRunRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly jobEnqueue: JobEnqueueService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  public async list(args: ListReportRunsArgs): Promise<{
    readonly items: readonly ReportRunRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ReportRunRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new ReportRunNotFoundError(id);
    return row;
  }

  /** Worker-facing read: bypasses the `module.reporting` gate so the queue
   *  processor can finalise an in-flight run even if the flag is toggled
   *  off mid-flight. */
  public async getByIdInternal(id: string): Promise<ReportRunRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new ReportRunNotFoundError(id);
    return row;
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  public async create(args: CreateReportRunArgs): Promise<ReportRunRow> {
    await this.assertModuleEnabled();
    await this.assertReportRunAllowed();

    const entry = getReportKindEntry(args.kind);
    if (entry === undefined) {
      throw new ReportKindUnknownError(args.kind);
    }

    const format: ReportFormatValue = args.format ?? entry.defaultFormat;
    if (!entry.supportedFormats.includes(format)) {
      throw new ReportFormatNotSupportedError(entry.kind, format);
    }
    if (format === 'PDF') {
      throw new ReportFormatNotImplementedError(format);
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const userId = this.requireUserId();

      const code = await this.allocateCode(tx);

      const created = await this.repo.create(
        {
          code,
          kind: entry.kind,
          format,
          params: args.params,
          requestedByUserId: userId,
        },
        tx,
      );

      const job = await this.jobEnqueue.enqueue(
        {
          queue: entry.queue,
          handlerName: REPORTING_JOB_HANDLERS.REPORT_RUN,
          payload: { reportRunId: created.id, schoolId },
          schoolId,
        },
        tx,
      );

      await this.repo.bumpQueuedJobId(created.id, job.id, tx);
      const withJob: ReportRunRow = { ...created, queuedJobId: job.id };

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.REPORT_RUN_REQUESTED,
        eventType: 'ReportRunRequested',
        aggregateType: 'ReportRun',
        aggregateId: withJob.id,
        payload: {
          id: withJob.id,
          code: withJob.code,
          kind: withJob.kind,
          format: withJob.format,
          requestedByUserId: withJob.requestedByUserId,
          queuedJobId: withJob.queuedJobId,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report.run.create',
          category: 'general',
          resourceType: 'ReportRun',
          resourceId: withJob.id,
          after: withJob,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Report run requested id=${withJob.id} code="${withJob.code}" kind=${withJob.kind} format=${withJob.format}.`,
      );
      return withJob;
    });
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  public async cancel(id: string, expectedVersion: number): Promise<ReportRunRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportRunNotFoundError(id);
      if (!CANCELLABLE_REPORT_RUN_STATUSES.has(current.status)) {
        throw new ReportRunNotCancellableError(id, current.status);
      }
      assertReportRunTransition(id, current.status, 'CANCELLED');

      const updated = await this.repo.updateStatus(
        id,
        expectedVersion,
        { status: 'CANCELLED', endedAt: new Date() },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.REPORT_RUN_CANCELLED,
        eventType: 'ReportRunCancelled',
        aggregateType: 'ReportRun',
        aggregateId: id,
        payload: { id, code: updated.code },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report.run.cancel',
          category: 'general',
          resourceType: 'ReportRun',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Report run cancelled id=${id}.`);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Download (controller resolves URL / stream from FileAssetService)
  // -------------------------------------------------------------------------
  public async getDownload(
    id: string,
  ): Promise<{ row: ReportRunRow; fileAssetId: string }> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new ReportRunNotFoundError(id);
    if (row.status !== 'SUCCEEDED' || row.fileAssetId === null) {
      throw new ReportRunNotDownloadableError(id, row.status);
    }
    return { row, fileAssetId: row.fileAssetId };
  }

  // -------------------------------------------------------------------------
  // Soft-delete
  // -------------------------------------------------------------------------
  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportRunNotFoundError(id);

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.REPORT_RUN_DELETED,
        eventType: 'ReportRunDeleted',
        aggregateType: 'ReportRun',
        aggregateId: id,
        payload: { id, code: current.code, fileAssetId: current.fileAssetId },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report.run.delete',
          category: 'general',
          resourceType: 'ReportRun',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      // TODO(Wave 9): cascade FileAsset purge when soft-deleting a SUCCEEDED
      // ReportRun row with a fileAssetId. For now the asset is retained.
    });
  }

  // -------------------------------------------------------------------------
  // Worker-only lifecycle helpers — called by ReportRunHandler.
  // -------------------------------------------------------------------------
  public async markRunning(id: string): Promise<ReportRunRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportRunNotFoundError(id);
      assertReportRunTransition(id, current.status, 'RUNNING');

      const updated = await this.repo.updateStatus(
        id,
        current.version,
        { status: 'RUNNING', startedAt: new Date() },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.REPORT_RUN_STARTED,
        eventType: 'ReportRunStarted',
        aggregateType: 'ReportRun',
        aggregateId: id,
        payload: { id, code: updated.code },
        schoolId,
      });
      return updated;
    });
  }

  public async markSucceeded(
    id: string,
    args: { readonly fileAssetId: string; readonly rowCount: number },
  ): Promise<ReportRunRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportRunNotFoundError(id);
      assertReportRunTransition(id, current.status, 'SUCCEEDED');

      const updated = await this.repo.updateStatus(
        id,
        current.version,
        {
          status: 'SUCCEEDED',
          endedAt: new Date(),
          fileAssetId: args.fileAssetId,
          rowCount: args.rowCount,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.REPORT_RUN_SUCCEEDED,
        eventType: 'ReportRunSucceeded',
        aggregateType: 'ReportRun',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          fileAssetId: args.fileAssetId,
          rowCount: args.rowCount,
        },
        schoolId,
      });
      return updated;
    });
  }

  public async markFailed(id: string, errorMessage: string): Promise<ReportRunRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportRunNotFoundError(id);
      assertReportRunTransition(id, current.status, 'FAILED');

      const truncated = errorMessage.slice(0, 2000);
      const updated = await this.repo.updateStatus(
        id,
        current.version,
        {
          status: 'FAILED',
          endedAt: new Date(),
          errorMessage: truncated,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.REPORT_RUN_FAILED,
        eventType: 'ReportRunFailed',
        aggregateType: 'ReportRun',
        aggregateId: id,
        payload: { id, code: updated.code, errorMessage: truncated },
        schoolId,
      });
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.REPORT_RUN, { tx });
    return `RPT-${seq.toString().padStart(6, '0')}`;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ReportRunService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private requireUserId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new Error('ReportRunService requires an authenticated user.');
    }
    return ctx.userId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ReportingFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ReportingModuleDisabledError();
  }

  private async assertReportRunAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ReportingFeatureFlags.ALLOW_REPORT_RUN,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ReportingModuleDisabledError();
  }
}
