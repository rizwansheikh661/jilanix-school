/**
 * BulkOperationService — orchestration for BulkOperation lifecycle.
 *
 * Pipeline (create):
 *   1. `module.reporting` gate.
 *   2. `reporting.allow_bulk_operations` gate.
 *   3. Kind catalog validation (unknown kind → 422).
 *   4. PREVIEW/VALIDATE target cap check.
 *   5. PREVIEW / VALIDATE — synchronous. Executor runs inside the create
 *      tx; the resulting row lands in status PREVIEWED / VALIDATED.
 *   6. EXECUTE — async. Row lands in EXECUTING; bulk-op.execute job
 *      enqueued; the `bulk-op.execute` handler flips the row to
 *      COMPLETED / FAILED via markCompleted / markFailed.
 *
 * Cancel: only allowed in DRAFT / PREVIEWED / VALIDATED. EXECUTING /
 * terminal states reject (NotCancellable). Audit category is `general`
 * across the service header — kind-specific PII/finance auditing happens
 * inside each executor.
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
import { getBulkOperationKindEntry } from '../bulk-operation-kind-catalog';
import {
  MAX_BULK_OPERATION_PREVIEW_TARGETS,
  REPORTING_JOB_HANDLERS,
  REPORTING_QUEUES,
  ReportingFeatureFlags,
  ReportingOutboxTopics,
  type BulkOperationKindValue,
  type BulkOperationModeValue,
} from '../reporting.constants';
import {
  BulkOperationKindUnknownError,
  BulkOperationNotCancellableError,
  BulkOperationNotFoundError,
  BulkOperationTargetsExceededError,
  ReportingModuleDisabledError,
} from '../reporting.errors';
import type { BulkOperationRow } from '../reporting.types';
import {
  CANCELLABLE_BULK_OP_STATUSES,
  assertBulkOperationTransition,
} from '../state-machine';
import {
  BulkOperationRepository,
  type ListBulkOperationsArgs,
} from './bulk-operation.repository';
import { BulkOperationExecutorRegistry } from './executors/executor.registry';

export interface CreateBulkOperationArgs {
  readonly kind: BulkOperationKindValue;
  readonly mode: BulkOperationModeValue;
  readonly params: Record<string, unknown>;
}

export interface MarkCompletedArgs {
  readonly processedCount: number;
  readonly succeededCount: number;
  readonly failedCount: number;
}

@Injectable()
export class BulkOperationService {
  private readonly logger = new Logger(BulkOperationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BulkOperationRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly jobEnqueue: JobEnqueueService,
    private readonly executors: BulkOperationExecutorRegistry,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  public async list(args: ListBulkOperationsArgs): Promise<{
    readonly items: readonly BulkOperationRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<BulkOperationRow> {
    await this.assertModuleEnabled();
    return this.requireRow(id);
  }

  /** Worker-facing read: bypasses the module-enabled gate so the queue
   *  processor can finalise an in-flight bulk-op even if the flag is
   *  toggled off mid-flight. */
  public async getByIdInternal(id: string): Promise<BulkOperationRow> {
    return this.requireRow(id);
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  public async create(args: CreateBulkOperationArgs): Promise<BulkOperationRow> {
    await this.assertModuleEnabled();
    await this.assertBulkOperationsAllowed();

    const entry = getBulkOperationKindEntry(args.kind);
    if (entry === undefined) {
      throw new BulkOperationKindUnknownError(args.kind);
    }

    // Cap synchronous PREVIEW/VALIDATE on targetIds-bearing payloads.
    if (args.mode === 'PREVIEW' || args.mode === 'VALIDATE') {
      const targetCount = this.extractTargetCount(args.params);
      if (targetCount > MAX_BULK_OPERATION_PREVIEW_TARGETS) {
        throw new BulkOperationTargetsExceededError(
          targetCount,
          MAX_BULK_OPERATION_PREVIEW_TARGETS,
        );
      }
    }

    const executor = this.executors.get(args.kind);
    // Note: stub executors throw BulkOperationKindNotImplementedError
    // inside preview/validate/execute. They self-register at bootstrap, so
    // a missing executor here is genuinely an unknown kind misconfiguration.
    if (executor === undefined) {
      throw new BulkOperationKindUnknownError(args.kind);
    }

    if (args.mode === 'PREVIEW') {
      return this.createPreview(entry.kind, args.params, executor);
    }
    if (args.mode === 'VALIDATE') {
      return this.createValidate(entry.kind, args.params, executor);
    }
    return this.createExecute(entry.kind, args.params);
  }

  private async createPreview(
    kind: BulkOperationKindValue,
    params: Record<string, unknown>,
    executor: ReturnType<BulkOperationExecutorRegistry['get']> & object,
  ): Promise<BulkOperationRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const userId = this.requireUserId();

      const code = await this.allocateCode(tx);
      const previewResult = await executor.preview(params, {
        schoolId,
        userId,
        bulkOperationId: 'pending',
      });

      const created = await this.repo.create(
        {
          code,
          kind,
          mode: 'PREVIEW',
          status: 'PREVIEWED',
          params,
          targetCount: previewResult.targetCount,
          previewResult: {
            targetCount: previewResult.targetCount,
            summary: previewResult.summary,
          },
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.BULK_OP_PREVIEWED,
        eventType: 'BulkOpPreviewed',
        aggregateType: 'BulkOperation',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          kind: created.kind,
          targetCount: created.targetCount,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'bulk-op.preview',
          category: 'general',
          resourceType: 'BulkOperation',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Bulk operation PREVIEW id=${created.id} code="${created.code}" kind=${created.kind} targetCount=${created.targetCount}.`,
      );
      return created;
    });
  }

  private async createValidate(
    kind: BulkOperationKindValue,
    params: Record<string, unknown>,
    executor: ReturnType<BulkOperationExecutorRegistry['get']> & object,
  ): Promise<BulkOperationRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const userId = this.requireUserId();

      const code = await this.allocateCode(tx);
      const validationResult = await executor.validate(params, {
        schoolId,
        userId,
        bulkOperationId: 'pending',
      });

      const created = await this.repo.create(
        {
          code,
          kind,
          mode: 'VALIDATE',
          status: 'VALIDATED',
          params,
          targetCount: validationResult.targetCount,
          validationResult: {
            targetCount: validationResult.targetCount,
            issues: [...validationResult.issues],
          },
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.BULK_OP_VALIDATED,
        eventType: 'BulkOpValidated',
        aggregateType: 'BulkOperation',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          kind: created.kind,
          targetCount: created.targetCount,
          issueCount: validationResult.issues.length,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'bulk-op.validate',
          category: 'general',
          resourceType: 'BulkOperation',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Bulk operation VALIDATE id=${created.id} code="${created.code}" kind=${created.kind} issues=${validationResult.issues.length}.`,
      );
      return created;
    });
  }

  private async createExecute(
    kind: BulkOperationKindValue,
    params: Record<string, unknown>,
  ): Promise<BulkOperationRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const code = await this.allocateCode(tx);
      const targetCount = this.extractTargetCount(params);
      const created = await this.repo.create(
        {
          code,
          kind,
          mode: 'EXECUTE',
          status: 'EXECUTING',
          params,
          targetCount,
          startedAt: new Date(),
        },
        tx,
      );

      const job = await this.jobEnqueue.enqueue(
        {
          queue: REPORTING_QUEUES.BULK_OPS,
          handlerName: REPORTING_JOB_HANDLERS.BULK_OP_EXECUTE,
          payload: { bulkOperationId: created.id, schoolId },
          schoolId,
        },
        tx,
      );

      await this.repo.bumpQueuedJobId(created.id, job.id, tx);
      const withJob: BulkOperationRow = { ...created, queuedJobId: job.id };

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.BULK_OP_REQUESTED,
        eventType: 'BulkOpRequested',
        aggregateType: 'BulkOperation',
        aggregateId: withJob.id,
        payload: {
          id: withJob.id,
          code: withJob.code,
          kind: withJob.kind,
          targetCount: withJob.targetCount,
          queuedJobId: withJob.queuedJobId,
        },
        schoolId,
      });

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.BULK_OP_EXECUTING,
        eventType: 'BulkOpExecuting',
        aggregateType: 'BulkOperation',
        aggregateId: withJob.id,
        payload: { id: withJob.id, code: withJob.code, kind: withJob.kind },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'bulk-op.execute',
          category: 'general',
          resourceType: 'BulkOperation',
          resourceId: withJob.id,
          after: withJob,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Bulk operation EXECUTE id=${withJob.id} code="${withJob.code}" kind=${withJob.kind} targetCount=${withJob.targetCount}.`,
      );
      return withJob;
    });
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  public async cancel(
    id: string,
    expectedVersion: number,
  ): Promise<BulkOperationRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new BulkOperationNotFoundError(id);
      if (!CANCELLABLE_BULK_OP_STATUSES.has(current.status)) {
        throw new BulkOperationNotCancellableError(id, current.status);
      }
      assertBulkOperationTransition(id, current.status, 'CANCELLED');

      const updated = await this.repo.updateStatus(
        id,
        expectedVersion,
        { status: 'CANCELLED', endedAt: new Date() },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.BULK_OP_CANCELLED,
        eventType: 'BulkOpCancelled',
        aggregateType: 'BulkOperation',
        aggregateId: id,
        payload: { id, code: updated.code },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'bulk-op.cancel',
          category: 'general',
          resourceType: 'BulkOperation',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Bulk operation cancelled id=${id}.`);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Worker-only lifecycle helpers — called by BulkOpExecuteHandler.
  // -------------------------------------------------------------------------
  public async markCompleted(
    id: string,
    args: MarkCompletedArgs,
  ): Promise<BulkOperationRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new BulkOperationNotFoundError(id);
      assertBulkOperationTransition(id, current.status, 'COMPLETED');

      const updated = await this.repo.updateStatus(
        id,
        current.version,
        {
          status: 'COMPLETED',
          endedAt: new Date(),
          processedCount: args.processedCount,
          succeededCount: args.succeededCount,
          failedCount: args.failedCount,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.BULK_OP_COMPLETED,
        eventType: 'BulkOpCompleted',
        aggregateType: 'BulkOperation',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          kind: updated.kind,
          processedCount: args.processedCount,
          succeededCount: args.succeededCount,
          failedCount: args.failedCount,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'bulk-op.complete',
          category: 'general',
          resourceType: 'BulkOperation',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async markFailed(
    id: string,
    errorMessage: string,
  ): Promise<BulkOperationRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new BulkOperationNotFoundError(id);
      assertBulkOperationTransition(id, current.status, 'FAILED');

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
        topic: ReportingOutboxTopics.BULK_OP_FAILED,
        eventType: 'BulkOpFailed',
        aggregateType: 'BulkOperation',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          kind: updated.kind,
          errorMessage: truncated,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'bulk-op.fail',
          category: 'general',
          resourceType: 'BulkOperation',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  private async requireRow(id: string): Promise<BulkOperationRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new BulkOperationNotFoundError(id);
    return row;
  }

  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.BULK_OPERATION, { tx });
    return `BOP-${seq.toString().padStart(6, '0')}`;
  }

  private extractTargetCount(params: Record<string, unknown>): number {
    const targetIds = params['targetIds'];
    if (Array.isArray(targetIds)) return targetIds.length;
    const studentIds = params['studentIds'];
    if (Array.isArray(studentIds)) return studentIds.length;
    return 0;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('BulkOperationService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private requireUserId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new Error('BulkOperationService requires an authenticated user.');
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

  private async assertBulkOperationsAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ReportingFeatureFlags.ALLOW_BULK_OPERATIONS,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ReportingModuleDisabledError();
  }
}
