/**
 * ExamDefinitionService — orchestration for Exam CRUD + DRAFT/PUBLISHED/
 * ARCHIVED state machine.
 *
 * Rules:
 *   1. `module.examination` feature flag.
 *   2. `startDate <= endDate`.
 *   3. At least one class OR section must be referenced.
 *   4. ExamScheme must exist (active row in same tenant).
 *   5. Class/Section IDs must all belong to this tenant.
 *   6. State transitions: DRAFT → PUBLISHED (via /publish);
 *      PUBLISHED → ARCHIVED (via /archive). No other transitions allowed.
 *   7. Mutations (update/delete) refused on ARCHIVED. Soft-delete refused
 *      on PUBLISHED/ARCHIVED.
 *   8. PATCH replaces classIds/sectionIds wholesale when supplied.
 *   9. `branchId` is an optional client-supplied field. Sections lack a
 *      branchId column today, so derivation isn't possible — caller may
 *      supply branchId for filterable reads. We never silently override
 *      a client-supplied branchId.
 *
 * Every mutation publishes an outbox event + writes a general audit row
 * inside the same transaction.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  ExaminationFeatureFlags,
  ExaminationOutboxTopics,
  type ExamStatusValue,
  type ExamTypeValue,
} from '../examination.constants';
import {
  CrossSchoolReferenceError,
  DuplicateExamError,
  ExamArchivedError,
  ExamDateRangeError,
  ExamMapsEmptyError,
  ExamNotFoundError,
  ExamSchemeNotFoundError,
  ExamStatusTransitionError,
  ExaminationModuleDisabledError,
} from '../examination.errors';
import type { ExamRow, ExamWithMaps } from '../examination.types';
import { ExamSchemeRepository } from '../exam-scheme/exam-scheme.repository';
import {
  ExamDefinitionRepository,
  type ListExamArgs,
} from './exam-definition.repository';

export interface CreateExamArgs {
  readonly branchId?: string | null;
  readonly academicYearId: string;
  readonly academicTermId?: string | null;
  readonly examSchemeId: string;
  readonly name: string;
  readonly type: ExamTypeValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly defaultMaxMarks?: number;
  readonly defaultPassMarks?: number;
  readonly description?: string | null;
  readonly classIds: readonly string[];
  readonly sectionIds: readonly string[];
}

export interface UpdateExamArgs {
  readonly branchId?: string | null;
  readonly academicTermId?: string | null;
  readonly examSchemeId?: string;
  readonly name?: string;
  readonly type?: ExamTypeValue;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly defaultMaxMarks?: number;
  readonly defaultPassMarks?: number;
  readonly description?: string | null;
  readonly classIds?: readonly string[];
  readonly sectionIds?: readonly string[];
}

@Injectable()
export class ExamDefinitionService {
  private readonly logger = new Logger(ExamDefinitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ExamDefinitionRepository,
    private readonly schemeRepo: ExamSchemeRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListExamArgs): Promise<{
    readonly items: readonly ExamWithMaps[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ExamWithMaps> {
    const row = await this.repo.findById(id);
    if (row === null) throw new ExamNotFoundError(id);
    return row;
  }

  public async create(args: CreateExamArgs): Promise<ExamWithMaps> {
    await this.assertModuleEnabled();
    this.assertDateRange(args.startDate, args.endDate);
    this.assertMapsNonEmpty(args.classIds, args.sectionIds);

    return this.prisma.transaction(async (tx) => {
      const scheme = await this.schemeRepo.findById(args.examSchemeId, tx);
      if (scheme === null) throw new ExamSchemeNotFoundError(args.examSchemeId);

      const dup = await this.repo.findActiveByYearName(
        args.academicYearId,
        args.name,
        tx,
      );
      if (dup !== null) throw new DuplicateExamError(args.name);

      await this.assertClassIdsValid(args.classIds, tx);
      await this.assertSectionIdsValid(args.sectionIds, tx);

      const row = await this.repo.create(
        {
          branchId: args.branchId ?? null,
          academicYearId: args.academicYearId,
          academicTermId: args.academicTermId ?? null,
          examSchemeId: args.examSchemeId,
          name: args.name,
          type: args.type,
          startDate: args.startDate,
          endDate: args.endDate,
          defaultMaxMarks: args.defaultMaxMarks ?? 100,
          defaultPassMarks: args.defaultPassMarks ?? 33,
          description: args.description ?? null,
          classIds: args.classIds,
          sectionIds: args.sectionIds,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.EXAM_CREATED,
        eventType: 'ExamCreated',
        aggregateType: 'Exam',
        aggregateId: row.id,
        payload: {
          id: row.id,
          name: row.name,
          type: row.type,
          status: row.status,
          academicYearId: row.academicYearId,
          classCount: row.classIds.length,
          sectionCount: row.sectionIds.length,
        },
      });

      await this.audit.record(
        {
          action: 'exam.create',
          category: 'general',
          resourceType: 'Exam',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Exam created id=${row.id} name="${row.name}" classes=${row.classIds.length} sections=${row.sectionIds.length}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateExamArgs,
  ): Promise<ExamWithMaps> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamNotFoundError(id);
      if (current.status === 'ARCHIVED') throw new ExamArchivedError(id);

      const finalStart = args.startDate ?? current.startDate;
      const finalEnd = args.endDate ?? current.endDate;
      this.assertDateRange(finalStart, finalEnd);

      const finalClassIds = args.classIds ?? current.classIds;
      const finalSectionIds = args.sectionIds ?? current.sectionIds;
      this.assertMapsNonEmpty(finalClassIds, finalSectionIds);

      if (args.examSchemeId !== undefined && args.examSchemeId !== current.examSchemeId) {
        const scheme = await this.schemeRepo.findById(args.examSchemeId, tx);
        if (scheme === null) throw new ExamSchemeNotFoundError(args.examSchemeId);
      }

      if (args.name !== undefined && args.name !== current.name) {
        const dup = await this.repo.findActiveByYearName(
          current.academicYearId,
          args.name,
          tx,
        );
        if (dup !== null && dup.id !== id) {
          throw new DuplicateExamError(args.name);
        }
      }

      if (args.classIds !== undefined) {
        await this.assertClassIdsValid(args.classIds, tx);
      }
      if (args.sectionIds !== undefined) {
        await this.assertSectionIdsValid(args.sectionIds, tx);
      }

      const patch: Record<string, unknown> = {};
      if (args.branchId !== undefined) patch.branchId = args.branchId;
      if (args.academicTermId !== undefined) patch.academicTermId = args.academicTermId;
      if (args.examSchemeId !== undefined) patch.examSchemeId = args.examSchemeId;
      if (args.name !== undefined) patch.name = args.name;
      if (args.type !== undefined) patch.type = args.type;
      if (args.startDate !== undefined) patch.startDate = args.startDate;
      if (args.endDate !== undefined) patch.endDate = args.endDate;
      if (args.defaultMaxMarks !== undefined) patch.defaultMaxMarks = args.defaultMaxMarks;
      if (args.defaultPassMarks !== undefined) patch.defaultPassMarks = args.defaultPassMarks;
      if (args.description !== undefined) patch.description = args.description;

      await this.repo.updateHeader(id, expectedVersion, patch, tx);

      if (args.classIds !== undefined) {
        await this.repo.replaceClassMaps(id, args.classIds, tx);
      }
      if (args.sectionIds !== undefined) {
        await this.repo.replaceSectionMaps(id, args.sectionIds, tx);
      }

      const updated = await this.repo.findById(id, tx);
      if (updated === null) throw new ExamNotFoundError(id);

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.EXAM_UPDATED,
        eventType: 'ExamUpdated',
        aggregateType: 'Exam',
        aggregateId: id,
        payload: { id, name: updated.name, status: updated.status },
      });

      await this.audit.record(
        {
          action: 'exam.update',
          category: 'general',
          resourceType: 'Exam',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async publish(id: string, expectedVersion: number): Promise<ExamRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new ExamStatusTransitionError(current.status, 'PUBLISHED');
      }
      const now = new Date();
      const published = await this.repo.setStatus(
        id,
        expectedVersion,
        'PUBLISHED',
        { publishedAt: now },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.EXAM_PUBLISHED,
        eventType: 'ExamPublished',
        aggregateType: 'Exam',
        aggregateId: id,
        payload: { id, name: published.name, publishedAt: now.toISOString() },
      });
      await this.audit.record(
        {
          action: 'exam.publish',
          category: 'general',
          resourceType: 'Exam',
          resourceId: id,
          before: current,
          after: published,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`Exam published id=${id}.`);
      return published;
    });
  }

  public async archive(id: string, expectedVersion: number): Promise<ExamRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamNotFoundError(id);
      if (current.status !== 'PUBLISHED') {
        throw new ExamStatusTransitionError(current.status, 'ARCHIVED');
      }
      const now = new Date();
      const archived = await this.repo.setStatus(
        id,
        expectedVersion,
        'ARCHIVED',
        { archivedAt: now },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.EXAM_ARCHIVED,
        eventType: 'ExamArchived',
        aggregateType: 'Exam',
        aggregateId: id,
        payload: { id, name: archived.name, archivedAt: now.toISOString() },
      });
      await this.audit.record(
        {
          action: 'exam.archive',
          category: 'general',
          resourceType: 'Exam',
          resourceId: id,
          before: current,
          after: archived,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`Exam archived id=${id}.`);
      return archived;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new ExamStatusTransitionError(
          current.status,
          'DRAFT' as ExamStatusValue,
        );
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.EXAM_DELETED,
        eventType: 'ExamDeleted',
        aggregateType: 'Exam',
        aggregateId: id,
        payload: { id, name: current.name },
      });
      await this.audit.record(
        {
          action: 'exam.delete',
          category: 'general',
          resourceType: 'Exam',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`Exam soft-deleted id=${id}.`);
    });
  }

  // ---------------------------------------------------------------------
  // Validators
  // ---------------------------------------------------------------------

  private assertDateRange(start: Date, end: Date): void {
    if (start.getTime() > end.getTime()) {
      throw new ExamDateRangeError('startDate must be on or before endDate');
    }
  }

  private assertMapsNonEmpty(
    classIds: readonly string[],
    sectionIds: readonly string[],
  ): void {
    if (classIds.length === 0 && sectionIds.length === 0) {
      throw new ExamMapsEmptyError();
    }
  }

  private async assertClassIdsValid(
    classIds: readonly string[],
    tx: import('../../../infra/prisma/types').PrismaTx,
  ): Promise<void> {
    if (classIds.length === 0) return;
    const dedup = Array.from(new Set(classIds));
    const found = await this.repo.validateClassIds(dedup, tx);
    if (found.length !== dedup.length) {
      const missing = dedup.filter((id) => !found.includes(id));
      throw new CrossSchoolReferenceError('Class', missing[0] ?? 'unknown');
    }
  }

  private async assertSectionIdsValid(
    sectionIds: readonly string[],
    tx: import('../../../infra/prisma/types').PrismaTx,
  ): Promise<void> {
    if (sectionIds.length === 0) return;
    const dedup = Array.from(new Set(sectionIds));
    const found = await this.repo.validateSectionIds(dedup, tx);
    if (found.length !== dedup.length) {
      const missing = dedup.filter((id) => !found.includes(id));
      throw new CrossSchoolReferenceError('Section', missing[0] ?? 'unknown');
    }
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ExaminationFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ExaminationModuleDisabledError();
  }
}
