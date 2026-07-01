/**
 * SyllabusService — Syllabus header + SyllabusNode tree.
 *
 * Hierarchy rules (validated at service):
 *   - UNIT    → parentNodeId MUST be null
 *   - CHAPTER → parent MUST be UNIT
 *   - TOPIC   → parent MUST be CHAPTER
 *
 * Only TOPIC nodes are directly completable. When a TOPIC flips to COMPLETED,
 * the syllabus header is recomputed in the same tx:
 *   completionPercent = round((completedTopics / totalTopics) * 100, 2)
 *   status            = totalTopics === 0           ? NOT_STARTED
 *                       completed === 0             ? NOT_STARTED
 *                       completed === totalTopics   ? COMPLETED
 *                                                   : IN_PROGRESS
 *   actualCompletionDate = (status === COMPLETED) ? now : null
 *
 * Soft-delete header refused if any non-soft-deleted child node exists
 * (FK is RESTRICT). Callers must delete leaves first.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  AcademicContentFeatureFlags,
  AcademicContentOutboxTopics,
  type SyllabusNodeStatusValue,
  type SyllabusNodeTypeValue,
  type SyllabusStatusValue,
} from '../academic-content.constants';
import {
  AcademicContentModuleDisabledError,
  DuplicateSyllabusError,
  SyllabusNodeHierarchyInvalidError,
  SyllabusNodeNotCompletableError,
  SyllabusNodeNotFoundError,
  SyllabusNotFoundError,
} from '../academic-content.errors';
import type { SyllabusNodeRow, SyllabusRow } from '../academic-content.types';
import { assertTenantRefs } from '../tenant-refs';
import {
  SyllabusRepository,
  type CreateSyllabusInput,
  type ListSyllabusArgs,
  type UpdateSyllabusInput,
  type UpdateSyllabusNodeInput,
} from './syllabus.repository';

export type CreateSyllabusArgs = CreateSyllabusInput;
export type UpdateSyllabusArgs = UpdateSyllabusInput;

export interface UpsertSyllabusNodeArgs {
  readonly syllabusId: string;
  readonly parentNodeId?: string | null;
  readonly nodeType: SyllabusNodeTypeValue;
  readonly name: string;
  readonly sequence: number;
  readonly plannedCompletionDate?: Date | null;
}

export interface CompleteTopicArgs {
  readonly completedByStaffId: string;
  readonly actualCompletionDate?: Date | null;
}

@Injectable()
export class SyllabusService {
  private readonly logger = new Logger(SyllabusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SyllabusRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------- Header --------

  public async list(args: ListSyllabusArgs): Promise<{
    readonly items: readonly SyllabusRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<SyllabusRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new SyllabusNotFoundError(id);
    return row;
  }

  public async listNodes(syllabusId: string): Promise<readonly SyllabusNodeRow[]> {
    await this.assertModuleEnabled();
    const header = await this.repo.findById(syllabusId);
    if (header === null) throw new SyllabusNotFoundError(syllabusId);
    return this.repo.listNodes(syllabusId);
  }

  public async create(args: CreateSyllabusArgs): Promise<SyllabusRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      await assertTenantRefs(tx, schoolId, {
        academicYearIds: [args.academicYearId],
        classIds: [args.classId],
        subjectIds: [args.subjectId],
        ...(args.ownedByStaffId ? { staffIds: [args.ownedByStaffId] } : {}),
      });

      const dup = await this.repo.findActive(
        args.academicYearId,
        args.classId,
        args.subjectId,
        tx,
      );
      if (dup !== null) {
        throw new DuplicateSyllabusError(
          args.academicYearId,
          args.classId,
          args.subjectId,
        );
      }

      const created = await this.repo.create(args, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SYLLABUS_CREATED,
        eventType: 'SyllabusCreated',
        aggregateType: 'Syllabus',
        aggregateId: created.id,
        payload: {
          id: created.id,
          academicYearId: args.academicYearId,
          classId: args.classId,
          subjectId: args.subjectId,
        },
      });

      await this.audit.record(
        {
          action: 'syllabus.create',
          category: 'general',
          resourceType: 'Syllabus',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Syllabus created id=${created.id}.`);
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateSyllabusArgs,
  ): Promise<SyllabusRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new SyllabusNotFoundError(id);

      if (args.ownedByStaffId !== undefined && args.ownedByStaffId !== null) {
        await assertTenantRefs(tx, current.schoolId, {
          staffIds: [args.ownedByStaffId],
        });
      }

      const updated = await this.repo.update(id, expectedVersion, args, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SYLLABUS_UPDATED,
        eventType: 'SyllabusUpdated',
        aggregateType: 'Syllabus',
        aggregateId: id,
        payload: { id, status: updated.status },
      });

      await this.audit.record(
        {
          action: 'syllabus.update',
          category: 'general',
          resourceType: 'Syllabus',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new SyllabusNotFoundError(id);

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SYLLABUS_DELETED,
        eventType: 'SyllabusDeleted',
        aggregateType: 'Syllabus',
        aggregateId: id,
        payload: { id },
      });

      await this.audit.record(
        {
          action: 'syllabus.delete',
          category: 'general',
          resourceType: 'Syllabus',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------- Nodes --------

  public async upsertNode(args: UpsertSyllabusNodeArgs): Promise<SyllabusNodeRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const syllabus = await this.repo.findById(args.syllabusId, tx);
      if (syllabus === null) throw new SyllabusNotFoundError(args.syllabusId);

      await this.validateNodeHierarchy(
        args.nodeType,
        args.parentNodeId ?? null,
        args.syllabusId,
        tx,
      );

      const created = await this.repo.createNode(args, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SYLLABUS_NODE_UPSERTED,
        eventType: 'SyllabusNodeUpserted',
        aggregateType: 'SyllabusNode',
        aggregateId: created.id,
        payload: {
          id: created.id,
          syllabusId: args.syllabusId,
          parentNodeId: args.parentNodeId ?? null,
          nodeType: args.nodeType,
        },
      });

      await this.audit.record(
        {
          action: 'syllabus-node.create',
          category: 'general',
          resourceType: 'SyllabusNode',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `SyllabusNode created id=${created.id} type=${args.nodeType} parent=${args.parentNodeId ?? 'null'}.`,
      );
      return created;
    });
  }

  public async updateNode(
    id: string,
    expectedVersion: number,
    args: UpdateSyllabusNodeInput,
  ): Promise<SyllabusNodeRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findNodeById(id, tx);
      if (current === null) throw new SyllabusNodeNotFoundError(id);

      const updated = await this.repo.updateNode(id, expectedVersion, args, tx);

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SYLLABUS_NODE_UPSERTED,
        eventType: 'SyllabusNodeUpdated',
        aggregateType: 'SyllabusNode',
        aggregateId: id,
        payload: { id, syllabusId: current.syllabusId },
      });

      await this.audit.record(
        {
          action: 'syllabus-node.update',
          category: 'general',
          resourceType: 'SyllabusNode',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async deleteNode(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();

    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findNodeById(id, tx);
      if (current === null) throw new SyllabusNodeNotFoundError(id);

      await this.repo.softDeleteNode(id, expectedVersion, tx);

      // If a TOPIC was deleted and was COMPLETED, recompute syllabus.
      if (
        current.nodeType === 'TOPIC' &&
        current.status === 'COMPLETED'
      ) {
        await this.recomputeSyllabusCompletion(current.syllabusId, tx);
      }

      await this.audit.record(
        {
          action: 'syllabus-node.delete',
          category: 'general',
          resourceType: 'SyllabusNode',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  public async completeTopic(
    id: string,
    expectedVersion: number,
    args: CompleteTopicArgs,
  ): Promise<{
    readonly node: SyllabusNodeRow;
    readonly syllabus: SyllabusRow;
  }> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findNodeById(id, tx);
      if (current === null) throw new SyllabusNodeNotFoundError(id);

      if (current.nodeType !== 'TOPIC') {
        throw new SyllabusNodeNotCompletableError(id, current.nodeType);
      }

      await assertTenantRefs(tx, current.schoolId, {
        staffIds: [args.completedByStaffId],
      });

      const actualCompletionDate = args.actualCompletionDate ?? new Date();
      const updatedNode = await this.repo.updateNode(
        id,
        expectedVersion,
        {
          status: 'COMPLETED',
          completedByStaffId: args.completedByStaffId,
          actualCompletionDate,
        },
        tx,
      );

      const syllabus = await this.recomputeSyllabusCompletion(
        current.syllabusId,
        tx,
      );

      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SYLLABUS_NODE_COMPLETED,
        eventType: 'SyllabusNodeCompleted',
        aggregateType: 'SyllabusNode',
        aggregateId: id,
        payload: {
          id,
          syllabusId: current.syllabusId,
          completedByStaffId: args.completedByStaffId,
          completionPercent: syllabus?.completionPercent ?? 0,
        },
      });

      await this.audit.record(
        {
          action: 'syllabus-node.complete',
          category: 'general',
          resourceType: 'SyllabusNode',
          resourceId: id,
          before: current,
          after: updatedNode,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `SyllabusNode ${id} completed by staff=${args.completedByStaffId}; syllabus=${current.syllabusId} now at ${syllabus?.completionPercent ?? 0}%.`,
      );

      return { node: updatedNode, syllabus: syllabus ?? (await this.repo.findById(current.syllabusId, tx))! };
    });
  }

  // -------- Helpers --------

  private async validateNodeHierarchy(
    nodeType: SyllabusNodeTypeValue,
    parentNodeId: string | null,
    syllabusId: string,
    tx: PrismaTx,
  ): Promise<void> {
    if (nodeType === 'UNIT') {
      if (parentNodeId !== null) {
        throw new SyllabusNodeHierarchyInvalidError('UNIT', 'UNIT');
      }
      return;
    }

    if (parentNodeId === null) {
      throw new SyllabusNodeHierarchyInvalidError(nodeType, null);
    }

    const parent = await this.repo.findNodeById(parentNodeId, tx);
    if (parent === null) throw new SyllabusNodeNotFoundError(parentNodeId);

    if (parent.syllabusId !== syllabusId) {
      throw new SyllabusNodeHierarchyInvalidError(nodeType, parent.nodeType);
    }

    if (nodeType === 'CHAPTER' && parent.nodeType !== 'UNIT') {
      throw new SyllabusNodeHierarchyInvalidError('CHAPTER', parent.nodeType);
    }
    if (nodeType === 'TOPIC' && parent.nodeType !== 'CHAPTER') {
      throw new SyllabusNodeHierarchyInvalidError('TOPIC', parent.nodeType);
    }
  }

  private async recomputeSyllabusCompletion(
    syllabusId: string,
    tx: PrismaTx,
  ): Promise<SyllabusRow | null> {
    const { total, completed } = await this.repo.countTopics(syllabusId, tx);
    let percent = 0;
    if (total > 0) {
      percent = Math.round((completed / total) * 100 * 100) / 100;
    }

    let status: SyllabusStatusValue = 'NOT_STARTED';
    if (total > 0 && completed > 0) {
      status = completed === total ? 'COMPLETED' : 'IN_PROGRESS';
    }

    const actualCompletionDate = status === 'COMPLETED' ? new Date() : null;

    return this.repo.recomputeCompletion(
      syllabusId,
      percent,
      status,
      actualCompletionDate,
      tx,
    );
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('SyllabusService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new AcademicContentModuleDisabledError();
  }
}

export type {
  CreateSyllabusInput,
  ListSyllabusArgs,
  UpdateSyllabusInput,
  UpdateSyllabusNodeInput,
};
export type _SyllabusNodeStatusValue = SyllabusNodeStatusValue;
