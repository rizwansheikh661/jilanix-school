/**
 * ImportCommitHandler — `import.commit` job handler.
 *
 * Pipeline (one job invocation):
 *   1. Bind a system request context (schoolId from payload, no userId).
 *   2. Load job header via `getByIdInternal`; skip if not in COMMITTING.
 *   3. Re-stream + re-parse + re-validate the source FileAsset. Only valid
 *      rows from THIS pass are committed — race-safe vs concurrent edits
 *      to the source file.
 *   4. Resolve the kind's RowCommitter and call `commit(validRows, ctx, tx)`
 *      inside a single transaction.
 *   5. `markCommitted({committedRows})` (COMMITTING → COMMITTED; outbox
 *      import.committed).
 *
 * Failure path: any thrown error → `markFailed(message)` + dispatch
 * IMPORT_FAILED notification (best-effort, gated by reporting.notify_on_completion).
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { FileAssetService } from '../../file-storage';
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
import {
  ImportKindUnknownError,
} from '../reporting.errors';
import { ValidatorRegistry } from '../validation/validator.registry';
import { RowCommitterRegistry } from './committers/committer.registry';
import { ImportParserRegistry } from './parsers/parser.registry';
import { ImportJobIssueRepository } from './import-issue.repository';
import { ImportJobService } from './import.service';
import type { RowValidationIssue } from '../reporting.types';

interface ImportCommitJobPayload {
  readonly importJobId: string;
  readonly schoolId: string;
}

@Injectable()
export class ImportCommitHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportCommitHandler.name);

  constructor(
    private readonly jobRegistry: JobHandlerRegistry,
    private readonly prisma: PrismaService,
    private readonly service: ImportJobService,
    private readonly parsers: ImportParserRegistry,
    private readonly validators: ValidatorRegistry,
    private readonly committers: RowCommitterRegistry,
    private readonly fileAssets: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly notifications: NotificationEventDispatcherService,
    private readonly issueRepo: ImportJobIssueRepository,
  ) {}

  public onApplicationBootstrap(): void {
    this.jobRegistry.register<ImportCommitJobPayload>(
      REPORTING_JOB_HANDLERS.IMPORT_COMMIT,
      (payload, ctx) => this.handle(payload, ctx),
    );
    this.logger.log(
      `Registered job handler "${REPORTING_JOB_HANDLERS.IMPORT_COMMIT}".`,
    );
  }

  private async handle(
    payload: ImportCommitJobPayload,
    ctx: JobHandlerContext,
  ): Promise<void> {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.importJobId !== 'string' ||
      typeof payload.schoolId !== 'string'
    ) {
      throw new Error(
        `import.commit payload malformed: ${JSON.stringify(payload)}`,
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

  private async process(payload: ImportCommitJobPayload): Promise<void> {
    const { importJobId, schoolId } = payload;
    const job = await this.service.getByIdInternal(importJobId);
    if (job.status !== 'COMMITTING') {
      this.logger.log(
        `import.commit skipping job id=${importJobId} status=${job.status} (expected COMMITTING).`,
      );
      return;
    }

    try {
      const asset = await this.fileAssets.getById(job.sourceFileAssetId);
      const { stream } = await this.fileAssets.streamForDownload(
        job.sourceFileAssetId,
      );
      const buffer = await collectStream(stream);

      const parser = this.parsers.get(job.kind);
      if (parser === undefined) throw new ImportKindUnknownError(job.kind);
      const rows = await parser.parse({ buffer, mimeType: asset.mimeType });

      const validator = this.validators.get(job.kind);
      if (validator === undefined) {
        throw new Error(`No row validator registered for kind=${job.kind}.`);
      }

      const validRows: unknown[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const rowNumber = i + 1;
        const annotated: Record<string, unknown> = {
          ...rows[i],
          __rowNumber: rowNumber,
        };
        const result = await validator.validate(annotated, {
          schoolId,
          userId: job.requestedByUserId,
          importJobId,
          options: job.options,
        });
        if (result.ok) validRows.push(result.output);
      }

      const committer = this.committers.get(job.kind);
      if (committer === undefined) {
        throw new Error(`No row committer registered for kind=${job.kind}.`);
      }

      const result = await this.prisma.transaction(async (rawTx) => {
        const tx = rawTx as unknown as PrismaTx;
        return committer.commit(
          validRows,
          {
            schoolId,
            userId: job.requestedByUserId,
            importJobId,
            options: job.options,
          },
          tx,
        );
      });

      // Patch C1 — persist commit-time per-row failures as ImportJobIssue
      // rows (severity=WARNING) so they ride the same error-CSV / issues
      // listing path as validation ERRORs. The row payload is captured in
      // rowSnapshot keyed by the failure's rowNumber.
      if (result.failed.length > 0 && this.issueRepo !== undefined) {
        const warnings: RowValidationIssue[] = result.failed.map((f) => {
          const snapshot = (validRows.find(
            (r) => (r as { rowNumber?: number }).rowNumber === f.rowNumber,
          ) ?? null) as Record<string, unknown> | null;
          return {
            rowNumber: f.rowNumber,
            severity: 'WARNING',
            code: 'COMMIT_FAILED',
            message: f.message.slice(0, 1000),
            providedValue: null,
            ...(snapshot !== null ? { rowSnapshot: snapshot } : {}),
          };
        });
        try {
          await this.issueRepo.createMany(importJobId, warnings);
        } catch (persistErr) {
          this.logger.warn(
            `import.commit failed to persist commit-time WARNINGs id=${importJobId}: ${(persistErr as Error).message}`,
          );
        }
      }

      const committed = await this.service.markCommitted(importJobId, {
        committedRows: result.committed,
      });

      this.logger.log(
        `import.commit committed id=${importJobId} code=${committed.code} rows=${result.committed} failed=${result.failed.length}.`,
      );

      await this.maybeNotify({
        schoolId,
        eventKey: ReportingNotificationEventKeys.IMPORT_COMPLETED,
        recipientUserId: committed.requestedByUserId,
        variables: {
          importJobId: committed.id,
          code: committed.code,
          kind: committed.kind,
          committedRows: result.committed,
          failedRows: result.failed.length,
          totalRows: committed.totalRows,
        },
        aggregateId: committed.id,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Import commit failed.';
      try {
        await this.service.markFailed(importJobId, message);
      } catch (markErr) {
        this.logger.error(
          `import.commit failed to record FAILED id=${importJobId}: ${(markErr as Error).message}`,
        );
      }

      await this.maybeNotify({
        schoolId,
        eventKey: ReportingNotificationEventKeys.IMPORT_FAILED,
        recipientUserId: job.requestedByUserId,
        variables: {
          importJobId: job.id,
          code: job.code,
          kind: job.kind,
          errorMessage: message,
        },
        aggregateId: job.id,
      });

      this.logger.error(
        `import.commit failed id=${importJobId} code=${job.code}: ${message}`,
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
        `import.commit notify flag lookup failed: ${(err as Error).message}`,
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
        aggregateType: 'ImportJob',
        aggregateId: args.aggregateId,
        dedupeKey: `import-job:${args.aggregateId}:${args.eventKey}`,
      });
    } catch (err) {
      this.logger.warn(
        `import.commit notification dispatch failed event=${args.eventKey} id=${args.aggregateId}: ${(err as Error).message}`,
      );
    }
  }
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}
