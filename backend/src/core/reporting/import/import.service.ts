/**
 * ImportJobService — orchestration for the ImportJob header + lifecycle.
 *
 * Pipeline (create):
 *   1. `module.reporting` gate.
 *   2. `reporting.allow_import` gate.
 *   3. Kind catalog validation via getImportKindEntry.
 *   4. Upload source file via FileAssetService (outside the tx — provider IO
 *      should not hold a DB transaction open).
 *   5. tx: sequence-allocate IMP-<seq> code, insert ImportJob row in PENDING,
 *      enqueue IMPORT_RUN job, bump queuedJobId, outbox IMPORT_REQUESTED,
 *      audit (category `pii` for STUDENT/STAFF, otherwise `general`).
 *   6. Worker callbacks (markValidating / markValidated / markCommitted /
 *      markFailed) drive the lifecycle outbox publishes from the
 *      import-run / import-commit handlers.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditCategory, AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { FileAssetService } from '../../file-storage';
import { JobEnqueueService } from '../../jobs/services/job-enqueue.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES, SequenceService } from '../../sequences';
import { getImportKindEntry } from '../import-kind-catalog';
import {
  FILE_PURPOSE_BULK_IMPORT,
  REPORTING_JOB_HANDLERS,
  ReportingFeatureFlags,
  ReportingOutboxTopics,
  type ImportKindValue,
} from '../reporting.constants';
import {
  ImportJobNotCancellableError,
  ImportJobNotCommittableError,
  ImportJobNotFoundError,
  ImportKindUnknownError,
  ReportingModuleDisabledError,
} from '../reporting.errors';
import type { ImportJobIssueRow, ImportJobRow } from '../reporting.types';
import {
  CANCELLABLE_IMPORT_JOB_STATUSES,
  COMMITTABLE_IMPORT_JOB_STATUSES,
  assertImportJobTransition,
} from '../state-machine';
import {
  ImportJobIssueRepository,
  type ListImportJobIssuesArgs,
} from './import-issue.repository';
import {
  ImportJobRepository,
  type ListImportJobsArgs,
} from './import.repository';

export interface CreateImportJobArgs {
  readonly kind: ImportKindValue;
  readonly sourceFile: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly body: Buffer;
  };
  readonly options?: Record<string, unknown>;
}

@Injectable()
export class ImportJobService {
  private readonly logger = new Logger(ImportJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ImportJobRepository,
    private readonly issueRepo: ImportJobIssueRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly jobEnqueue: JobEnqueueService,
    private readonly fileAssets: FileAssetService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  public async list(args: ListImportJobsArgs): Promise<{
    readonly items: readonly ImportJobRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ImportJobRow> {
    await this.assertModuleEnabled();
    return this.requireRow(id);
  }

  /** Worker-facing read: bypasses the module-enabled gate so the queue
   *  processor can finalise an in-flight job even if the flag is toggled
   *  off mid-flight. */
  public async getByIdInternal(id: string): Promise<ImportJobRow> {
    return this.requireRow(id);
  }

  public async listIssues(args: ListImportJobIssuesArgs): Promise<{
    readonly items: readonly ImportJobIssueRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    // Validate the parent exists + is in tenant scope before paging issues.
    await this.requireRow(args.importJobId);
    const { rows, nextCursorId } = await this.issueRepo.list(args);
    return { items: rows, nextCursorId };
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  public async create(args: CreateImportJobArgs): Promise<ImportJobRow> {
    await this.assertModuleEnabled();
    await this.assertImportAllowed();

    const entry = getImportKindEntry(args.kind);
    if (entry === undefined) {
      throw new ImportKindUnknownError(args.kind);
    }

    // Upload OUTSIDE the tx — provider IO (S3 PUT) must not hold a DB lock.
    const fileAsset = await this.fileAssets.upload({
      purpose: FILE_PURPOSE_BULK_IMPORT,
      fileName: args.sourceFile.fileName,
      mimeType: args.sourceFile.mimeType,
      body: args.sourceFile.body,
      isPublic: false,
    });

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const code = await this.allocateCode(tx);
      const created = await this.repo.create(
        {
          code,
          kind: entry.kind,
          sourceFileAssetId: fileAsset.id,
          options: args.options ?? {},
        },
        tx,
      );

      const job = await this.jobEnqueue.enqueue(
        {
          queue: entry.queue,
          handlerName: REPORTING_JOB_HANDLERS.IMPORT_RUN,
          payload: { importJobId: created.id, schoolId },
          schoolId,
        },
        tx,
      );

      await this.repo.bumpQueuedJobId(created.id, job.id, tx);
      const withJob: ImportJobRow = { ...created, queuedJobId: job.id };

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.IMPORT_REQUESTED,
        eventType: 'ImportRequested',
        aggregateType: 'ImportJob',
        aggregateId: withJob.id,
        payload: {
          id: withJob.id,
          code: withJob.code,
          kind: withJob.kind,
          sourceFileAssetId: withJob.sourceFileAssetId,
          requestedByUserId: withJob.requestedByUserId,
          queuedJobId: withJob.queuedJobId,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'import.create',
          category: entry.auditPii ? ('pii' as AuditCategory) : ('general' as AuditCategory),
          resourceType: 'ImportJob',
          resourceId: withJob.id,
          after: withJob,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Import job requested id=${withJob.id} code="${withJob.code}" kind=${withJob.kind}.`,
      );
      return withJob;
    });
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  public async cancel(id: string, expectedVersion: number): Promise<ImportJobRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      if (!CANCELLABLE_IMPORT_JOB_STATUSES.has(current.status)) {
        throw new ImportJobNotCancellableError(id, current.status);
      }
      assertImportJobTransition(id, current.status, 'CANCELLED');

      const updated = await this.repo.updateStatus(
        id,
        expectedVersion,
        { status: 'CANCELLED', endedAt: new Date() },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.IMPORT_CANCELLED,
        eventType: 'ImportCancelled',
        aggregateType: 'ImportJob',
        aggregateId: id,
        payload: { id, code: updated.code },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'import.cancel',
          category: 'general',
          resourceType: 'ImportJob',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Import job cancelled id=${id}.`);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Commit
  // -------------------------------------------------------------------------
  public async commit(id: string, expectedVersion: number): Promise<ImportJobRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      if (!COMMITTABLE_IMPORT_JOB_STATUSES.has(current.status)) {
        throw new ImportJobNotCommittableError(id, current.status);
      }
      assertImportJobTransition(id, current.status, 'COMMITTING');

      const entry = getImportKindEntry(current.kind);
      if (entry === undefined) throw new ImportKindUnknownError(current.kind);

      const updated = await this.repo.updateStatus(
        id,
        expectedVersion,
        { status: 'COMMITTING' },
        tx,
      );

      const job = await this.jobEnqueue.enqueue(
        {
          queue: entry.queue,
          handlerName: REPORTING_JOB_HANDLERS.IMPORT_COMMIT,
          payload: { importJobId: id, schoolId },
          schoolId,
        },
        tx,
      );

      await this.repo.bumpQueuedJobId(id, job.id, tx);
      const withJob: ImportJobRow = { ...updated, queuedJobId: job.id };

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.IMPORT_COMMITTING,
        eventType: 'ImportCommitting',
        aggregateType: 'ImportJob',
        aggregateId: id,
        payload: { id, code: withJob.code, queuedJobId: withJob.queuedJobId },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'import.commit',
          category: entry.auditPii ? ('pii' as AuditCategory) : ('general' as AuditCategory),
          resourceType: 'ImportJob',
          resourceId: id,
          before: current,
          after: withJob,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Import job promoted to COMMITTING id=${id}.`);
      return withJob;
    });
  }

  // -------------------------------------------------------------------------
  // Soft-delete (not exposed on the controller this sprint)
  // -------------------------------------------------------------------------
  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.audit.record(
        {
          action: 'import.delete',
          category: 'general',
          resourceType: 'ImportJob',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------------
  // Worker-only lifecycle helpers — called by ImportRunHandler / ImportCommitHandler.
  // -------------------------------------------------------------------------
  public async markValidating(id: string): Promise<ImportJobRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      assertImportJobTransition(id, current.status, 'VALIDATING');

      const updated = await this.repo.updateStatus(
        id,
        current.version,
        { status: 'VALIDATING', startedAt: new Date() },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.IMPORT_VALIDATING,
        eventType: 'ImportValidating',
        aggregateType: 'ImportJob',
        aggregateId: id,
        payload: { id, code: updated.code },
        schoolId,
      });
      return updated;
    });
  }

  public async markValidated(
    id: string,
    args: {
      readonly totalRows: number;
      readonly validRows: number;
      readonly errorRows: number;
    },
  ): Promise<ImportJobRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      assertImportJobTransition(id, current.status, 'VALIDATED');

      const updated = await this.repo.updateStatus(
        id,
        current.version,
        {
          status: 'VALIDATED',
          totalRows: args.totalRows,
          validRows: args.validRows,
          errorRows: args.errorRows,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.IMPORT_VALIDATED,
        eventType: 'ImportValidated',
        aggregateType: 'ImportJob',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          totalRows: args.totalRows,
          validRows: args.validRows,
          errorRows: args.errorRows,
        },
        schoolId,
      });
      return updated;
    });
  }

  public async markCommitted(
    id: string,
    args: { readonly committedRows: number },
  ): Promise<ImportJobRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      assertImportJobTransition(id, current.status, 'COMMITTED');

      const updated = await this.repo.updateStatus(
        id,
        current.version,
        {
          status: 'COMMITTED',
          endedAt: new Date(),
          committedRows: args.committedRows,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.IMPORT_COMMITTED,
        eventType: 'ImportCommitted',
        aggregateType: 'ImportJob',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          committedRows: args.committedRows,
        },
        schoolId,
      });
      return updated;
    });
  }

  public async markFailed(
    id: string,
    errorMessage: string,
  ): Promise<ImportJobRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ImportJobNotFoundError(id);
      assertImportJobTransition(id, current.status, 'FAILED');

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
        topic: ReportingOutboxTopics.IMPORT_FAILED,
        eventType: 'ImportFailed',
        aggregateType: 'ImportJob',
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
  private async requireRow(id: string): Promise<ImportJobRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new ImportJobNotFoundError(id);
    return row;
  }

  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.IMPORT_JOB, { tx });
    return `IMP-${seq.toString().padStart(6, '0')}`;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ImportJobService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ReportingFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ReportingModuleDisabledError();
  }

  private async assertImportAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ReportingFeatureFlags.ALLOW_IMPORT,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ReportingModuleDisabledError();
  }
}
