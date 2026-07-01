/**
 * ImportRunHandler — `import.run` job handler.
 *
 * Pipeline (one job invocation):
 *   1. Bind a system request context (schoolId from payload, no userId).
 *   2. Load job header via `getByIdInternal`; skip if already terminal.
 *   3. `markValidating` (PENDING → VALIDATING; outbox import.validating).
 *   4. Stream the source FileAsset → Buffer → parser.parse → rows[].
 *   5. Validate each row with the kind's RowValidator; collect issues.
 *   6. Insert issues + `markValidated({totalRows, validRows, errorRows})`
 *      (VALIDATING → VALIDATED; outbox import.validated).
 *   7. If `options.commitOnSuccess === true` AND there are zero issues,
 *      enqueue an IMPORT_COMMIT job for the same row.
 *
 * Failure path: any thrown error → `markFailed(message)` + dispatch
 * IMPORT_FAILED notification (best-effort, gated by reporting.notify_on_completion).
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { FileAssetService } from '../../file-storage';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { NotificationEventDispatcherService } from '../../notifications/notification-event-dispatcher/notification-event-dispatcher.service';
import { runWithSystemContext } from '../../request-context';
import { getImportKindEntry } from '../import-kind-catalog';
import {
  REPORTING_JOB_HANDLERS,
  ReportingFeatureFlags,
  ReportingNotificationEventKeys,
} from '../reporting.constants';
import {
  ImportKindUnknownError,
} from '../reporting.errors';
import type { RowValidationIssue } from '../reporting.types';
import { TERMINAL_IMPORT_JOB_STATUSES } from '../state-machine';
import { ValidatorRegistry } from '../validation/validator.registry';
import { ImportParserRegistry } from './parsers/parser.registry';
import { ImportJobIssueRepository } from './import-issue.repository';
import { ImportJobService } from './import.service';

interface ImportRunJobPayload {
  readonly importJobId: string;
  readonly schoolId: string;
}

@Injectable()
export class ImportRunHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportRunHandler.name);

  constructor(
    private readonly jobRegistry: JobHandlerRegistry,
    private readonly service: ImportJobService,
    private readonly issueRepo: ImportJobIssueRepository,
    private readonly parsers: ImportParserRegistry,
    private readonly validators: ValidatorRegistry,
    private readonly fileAssets: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly notifications: NotificationEventDispatcherService,
  ) {}

  public onApplicationBootstrap(): void {
    this.jobRegistry.register<ImportRunJobPayload>(
      REPORTING_JOB_HANDLERS.IMPORT_RUN,
      (payload, ctx) => this.handle(payload, ctx),
    );
    this.logger.log(
      `Registered job handler "${REPORTING_JOB_HANDLERS.IMPORT_RUN}".`,
    );
  }

  private async handle(
    payload: ImportRunJobPayload,
    ctx: JobHandlerContext,
  ): Promise<void> {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.importJobId !== 'string' ||
      typeof payload.schoolId !== 'string'
    ) {
      throw new Error(
        `import.run payload malformed: ${JSON.stringify(payload)}`,
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

  private async process(payload: ImportRunJobPayload): Promise<void> {
    const { importJobId, schoolId } = payload;
    const initial = await this.service.getByIdInternal(importJobId);

    if (TERMINAL_IMPORT_JOB_STATUSES.has(initial.status)) {
      this.logger.log(
        `import.run skipping terminal job id=${importJobId} status=${initial.status}.`,
      );
      return;
    }
    if (initial.status !== 'PENDING') {
      this.logger.log(
        `import.run skipping non-PENDING job id=${importJobId} status=${initial.status}.`,
      );
      return;
    }

    let validating;
    try {
      validating = await this.service.markValidating(importJobId);
    } catch (err) {
      this.logger.error(
        `import.run failed to transition to VALIDATING id=${importJobId}: ${(err as Error).message}`,
      );
      throw err;
    }

    try {
      const asset = await this.fileAssets.getById(validating.sourceFileAssetId);
      const { stream } = await this.fileAssets.streamForDownload(
        validating.sourceFileAssetId,
      );
      const buffer = await collectStream(stream);

      const parser = this.parsers.get(validating.kind);
      if (parser === undefined) {
        throw new ImportKindUnknownError(validating.kind);
      }
      const rows = await parser.parse({ buffer, mimeType: asset.mimeType });

      const validator = this.validators.get(validating.kind);
      if (validator === undefined) {
        throw new Error(
          `No row validator registered for kind=${validating.kind}.`,
        );
      }

      const issues: RowValidationIssue[] = [];
      let validRows = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const rowNumber = i + 1;
        const annotated: Record<string, unknown> = {
          ...rows[i],
          __rowNumber: rowNumber,
        };
        const result = await validator.validate(annotated, {
          schoolId,
          userId: validating.requestedByUserId,
          importJobId,
          options: validating.options,
        });
        if (result.ok) {
          validRows += 1;
        } else {
          for (const iss of result.issues) {
            issues.push({
              ...iss,
              rowNumber: iss.rowNumber !== 0 ? iss.rowNumber : rowNumber,
            });
          }
        }
      }

      if (issues.length > 0) {
        await this.issueRepo.createMany(importJobId, issues);
      }

      const validated = await this.service.markValidated(importJobId, {
        totalRows: rows.length,
        validRows,
        errorRows: rows.length - validRows,
      });

      this.logger.log(
        `import.run validated id=${importJobId} code=${validated.code} rows=${rows.length} valid=${validRows} issues=${issues.length}.`,
      );

      const commitOnSuccess =
        validating.options['commitOnSuccess'] === true && issues.length === 0;
      if (commitOnSuccess) {
        const entry = getImportKindEntry(validating.kind);
        if (entry !== undefined) {
          try {
            // Drive through the service so state transitions + outbox happen.
            await this.service.commit(importJobId, validated.version);
          } catch (err) {
            this.logger.warn(
              `import.run auto-commit failed id=${importJobId}: ${(err as Error).message}`,
            );
          }
        }
      }
    } catch (err) {
      const message = (err as Error).message ?? 'Import validation failed.';
      try {
        await this.service.markFailed(importJobId, message);
      } catch (markErr) {
        this.logger.error(
          `import.run failed to record FAILED id=${importJobId}: ${(markErr as Error).message}`,
        );
      }

      await this.maybeNotify({
        schoolId,
        eventKey: ReportingNotificationEventKeys.IMPORT_FAILED,
        recipientUserId: validating.requestedByUserId,
        variables: {
          importJobId: validating.id,
          code: validating.code,
          kind: validating.kind,
          errorMessage: message,
        },
        aggregateId: validating.id,
      });

      this.logger.error(
        `import.run failed id=${importJobId} code=${validating.code}: ${message}`,
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
        `import.run notify flag lookup failed: ${(err as Error).message}`,
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
        `import.run notification dispatch failed event=${args.eventKey} id=${args.aggregateId}: ${(err as Error).message}`,
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
