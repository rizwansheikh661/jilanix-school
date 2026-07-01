/**
 * FeeStructureService — orchestration for FeeStructure CRUD + the
 * DRAFT → PUBLISHED → ARCHIVED state machine, plus clone-from.
 *
 * Rules:
 *   1. `module.fees` feature flag.
 *   2. Lines length in [1..FEE_STRUCTURE_LINES_MAX].
 *   3. Cross-tenant FK validation for academicYear/class/section/student/
 *      branch + every feeHeadId + every lateFinePolicyId on lines.
 *   4. Update/delete refused unless status === 'DRAFT'.
 *   5. Status transitions: DRAFT → PUBLISHED (via /publish);
 *      ANY non-ARCHIVED → ARCHIVED (via /archive).
 *   6. PATCH replaces lines wholesale when supplied.
 *   7. `branchId` is caller-supplied (we do not auto-derive from class/
 *      section this sprint — there is no branch column on Class/Section).
 *
 * Every mutation publishes a `fees.structure.*` outbox event + writes a
 * finance-category audit row inside the same transaction.
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
  FEE_DEFAULT_CURRENCY,
  FEE_STRUCTURE_LINES_MAX,
  FeesFeatureFlags,
  FeesOutboxTopics,
  type FeeFrequencyValue,
  type FeeStructureAppliesToValue,
} from '../fees.constants';
import {
  DuplicateFeeStructureNameError,
  FeeStructureNotEditableError,
  FeeStructureNotFoundError,
  FeeStructureStatusTransitionError,
  FeesBulkLimitExceededError,
  FeesCrossTenantReferenceError,
  FeesModuleDisabledError,
} from '../fees.errors';
import type { FeeStructureWithLines } from '../fees.types';
import {
  FeeStructureRepository,
  type CreateFeeStructureLineInput,
  type ListFeeStructureArgs,
} from './fee-structure.repository';

export interface CreateFeeStructureLineArgs {
  readonly feeHeadId: string;
  readonly lateFinePolicyId?: string | null;
  readonly amount: number;
  readonly frequency: FeeFrequencyValue;
  readonly dueDay?: number | null;
  readonly ordering: number;
}

export interface CreateFeeStructureArgs {
  readonly academicYearId: string;
  readonly branchId?: string | null;
  readonly name: string;
  readonly appliesTo: FeeStructureAppliesToValue;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly studentId?: string | null;
  readonly currency?: string;
  readonly description?: string | null;
  readonly lines: readonly CreateFeeStructureLineArgs[];
}

export interface UpdateFeeStructureArgs {
  readonly branchId?: string | null;
  readonly name?: string;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly studentId?: string | null;
  readonly currency?: string;
  readonly description?: string | null;
  readonly lines?: readonly CreateFeeStructureLineArgs[];
}

export interface CloneFeeStructureArgs {
  readonly name: string;
  readonly academicYearId?: string;
}

interface TenantRefs {
  readonly academicYearIds?: readonly string[];
  readonly classIds?: readonly string[];
  readonly sectionIds?: readonly string[];
  readonly studentIds?: readonly string[];
  readonly branchIds?: readonly string[];
  readonly feeHeadIds?: readonly string[];
  readonly lateFinePolicyIds?: readonly string[];
}

@Injectable()
export class FeeStructureService {
  private readonly logger = new Logger(FeeStructureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeStructureRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListFeeStructureArgs): Promise<{
    readonly items: readonly FeeStructureWithLines[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<FeeStructureWithLines> {
    const row = await this.repo.findById(id);
    if (row === null) throw new FeeStructureNotFoundError(id);
    return row;
  }

  public async create(args: CreateFeeStructureArgs): Promise<FeeStructureWithLines> {
    await this.assertModuleEnabled();
    this.assertLineCount(args.lines.length);

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findActiveByName(args.academicYearId, args.name, tx);
      if (dup !== null) throw new DuplicateFeeStructureNameError(args.name);

      await this.assertTenantRefs(tx, {
        academicYearIds: [args.academicYearId],
        ...(args.classId !== undefined && args.classId !== null
          ? { classIds: [args.classId] }
          : {}),
        ...(args.sectionId !== undefined && args.sectionId !== null
          ? { sectionIds: [args.sectionId] }
          : {}),
        ...(args.studentId !== undefined && args.studentId !== null
          ? { studentIds: [args.studentId] }
          : {}),
        ...(args.branchId !== undefined && args.branchId !== null
          ? { branchIds: [args.branchId] }
          : {}),
        feeHeadIds: args.lines.map((l) => l.feeHeadId),
        lateFinePolicyIds: args.lines
          .map((l) => l.lateFinePolicyId)
          .filter((v): v is string => typeof v === 'string'),
      });

      const row = await this.repo.create(
        {
          academicYearId: args.academicYearId,
          branchId: args.branchId ?? null,
          name: args.name,
          appliesTo: args.appliesTo,
          classId: args.classId ?? null,
          sectionId: args.sectionId ?? null,
          studentId: args.studentId ?? null,
          currency: args.currency ?? FEE_DEFAULT_CURRENCY,
          description: args.description ?? null,
          lines: args.lines.map(toLineInput),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STRUCTURE_CREATED,
        eventType: 'FeeStructureCreated',
        aggregateType: 'FeeStructure',
        aggregateId: row.id,
        payload: {
          id: row.id,
          name: row.name,
          status: row.status,
          academicYearId: row.academicYearId,
          appliesTo: row.appliesTo,
          lineCount: row.lines.length,
        },
      });

      await this.audit.record(
        {
          action: 'fee_structure.create',
          category: 'finance',
          resourceType: 'FeeStructure',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeStructure created id=${row.id} name="${row.name}" lines=${row.lines.length}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateFeeStructureArgs,
  ): Promise<FeeStructureWithLines> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeStructureNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new FeeStructureNotEditableError(id, current.status);
      }

      if (args.name !== undefined && args.name !== current.name) {
        const dup = await this.repo.findActiveByName(
          current.academicYearId,
          args.name,
          tx,
        );
        if (dup !== null && dup.id !== id) {
          throw new DuplicateFeeStructureNameError(args.name);
        }
      }

      if (args.lines !== undefined) {
        this.assertLineCount(args.lines.length);
        await this.assertTenantRefs(tx, {
          feeHeadIds: args.lines.map((l) => l.feeHeadId),
          lateFinePolicyIds: args.lines
            .map((l) => l.lateFinePolicyId)
            .filter((v): v is string => typeof v === 'string'),
        });
      }

      if (args.classId !== undefined && args.classId !== null) {
        await this.assertTenantRefs(tx, { classIds: [args.classId] });
      }
      if (args.sectionId !== undefined && args.sectionId !== null) {
        await this.assertTenantRefs(tx, { sectionIds: [args.sectionId] });
      }
      if (args.studentId !== undefined && args.studentId !== null) {
        await this.assertTenantRefs(tx, { studentIds: [args.studentId] });
      }
      if (args.branchId !== undefined && args.branchId !== null) {
        await this.assertTenantRefs(tx, { branchIds: [args.branchId] });
      }

      const patch: Record<string, unknown> = {};
      if (args.branchId !== undefined) patch.branchId = args.branchId;
      if (args.name !== undefined) patch.name = args.name;
      if (args.classId !== undefined) patch.classId = args.classId;
      if (args.sectionId !== undefined) patch.sectionId = args.sectionId;
      if (args.studentId !== undefined) patch.studentId = args.studentId;
      if (args.currency !== undefined) patch.currency = args.currency;
      if (args.description !== undefined) patch.description = args.description;

      await this.repo.updateHeader(id, expectedVersion, patch, tx);

      if (args.lines !== undefined) {
        await this.repo.replaceLines(id, args.lines.map(toLineInput), tx);
      }

      const updated = await this.repo.findById(id, tx);
      if (updated === null) throw new FeeStructureNotFoundError(id);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STRUCTURE_UPDATED,
        eventType: 'FeeStructureUpdated',
        aggregateType: 'FeeStructure',
        aggregateId: id,
        payload: {
          id,
          name: updated.name,
          status: updated.status,
          lineCount: updated.lines.length,
        },
      });

      await this.audit.record(
        {
          action: 'fee_structure.update',
          category: 'finance',
          resourceType: 'FeeStructure',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async publish(
    id: string,
    expectedVersion: number,
  ): Promise<FeeStructureWithLines> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeStructureNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new FeeStructureStatusTransitionError(current.status, 'PUBLISHED');
      }
      if (current.lines.length < 1) {
        throw new FeesBulkLimitExceededError(1, 0);
      }
      const now = new Date();
      await this.repo.setStatus(id, expectedVersion, 'PUBLISHED', { publishedAt: now }, tx);
      const updated = await this.repo.findById(id, tx);
      if (updated === null) throw new FeeStructureNotFoundError(id);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STRUCTURE_PUBLISHED,
        eventType: 'FeeStructurePublished',
        aggregateType: 'FeeStructure',
        aggregateId: id,
        payload: { id, name: updated.name, publishedAt: now.toISOString() },
      });

      await this.audit.record(
        {
          action: 'fee_structure.publish',
          category: 'finance',
          resourceType: 'FeeStructure',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`FeeStructure published id=${id}.`);
      return updated;
    });
  }

  public async archive(
    id: string,
    expectedVersion: number,
  ): Promise<FeeStructureWithLines> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeStructureNotFoundError(id);
      if (current.status === 'ARCHIVED') {
        throw new FeeStructureStatusTransitionError(current.status, 'ARCHIVED');
      }
      const now = new Date();
      await this.repo.setStatus(id, expectedVersion, 'ARCHIVED', { archivedAt: now }, tx);
      const updated = await this.repo.findById(id, tx);
      if (updated === null) throw new FeeStructureNotFoundError(id);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STRUCTURE_ARCHIVED,
        eventType: 'FeeStructureArchived',
        aggregateType: 'FeeStructure',
        aggregateId: id,
        payload: { id, name: updated.name, archivedAt: now.toISOString() },
      });

      await this.audit.record(
        {
          action: 'fee_structure.archive',
          category: 'finance',
          resourceType: 'FeeStructure',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`FeeStructure archived id=${id}.`);
      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeStructureNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new FeeStructureNotEditableError(id, current.status);
      }
      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STRUCTURE_DELETED,
        eventType: 'FeeStructureDeleted',
        aggregateType: 'FeeStructure',
        aggregateId: id,
        payload: { id, name: current.name },
      });

      await this.audit.record(
        {
          action: 'fee_structure.delete',
          category: 'finance',
          resourceType: 'FeeStructure',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`FeeStructure soft-deleted id=${id}.`);
    });
  }

  public async cloneFrom(
    sourceId: string,
    args: CloneFeeStructureArgs,
  ): Promise<FeeStructureWithLines> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const source = await this.repo.findById(sourceId, tx);
      if (source === null) throw new FeeStructureNotFoundError(sourceId);

      const targetYearId = args.academicYearId ?? source.academicYearId;

      const dup = await this.repo.findActiveByName(targetYearId, args.name, tx);
      if (dup !== null) throw new DuplicateFeeStructureNameError(args.name);

      if (args.academicYearId !== undefined && args.academicYearId !== source.academicYearId) {
        await this.assertTenantRefs(tx, { academicYearIds: [args.academicYearId] });
      }

      const created = await this.repo.create(
        {
          academicYearId: targetYearId,
          branchId: source.branchId,
          name: args.name,
          appliesTo: source.appliesTo,
          classId: source.classId,
          sectionId: source.sectionId,
          studentId: source.studentId,
          currency: source.currency,
          description: source.description,
          lines: source.lines.map((l) => ({
            feeHeadId: l.feeHeadId,
            lateFinePolicyId: l.lateFinePolicyId,
            amount: l.amount,
            frequency: l.frequency,
            dueDay: l.dueDay,
            ordering: l.ordering,
          })),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STRUCTURE_CLONED,
        eventType: 'FeeStructureCloned',
        aggregateType: 'FeeStructure',
        aggregateId: created.id,
        payload: { sourceId, newId: created.id, name: created.name },
      });

      await this.audit.record(
        {
          action: 'fee_structure.clone',
          category: 'finance',
          resourceType: 'FeeStructure',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeStructure cloned id=${created.id} from sourceId=${sourceId}.`,
      );
      return created;
    });
  }

  // -------------------------------------------------------------------------
  // Validators
  // -------------------------------------------------------------------------

  private assertLineCount(count: number): void {
    if (count < 1 || count > FEE_STRUCTURE_LINES_MAX) {
      throw new FeesBulkLimitExceededError(FEE_STRUCTURE_LINES_MAX, count);
    }
  }

  private async assertTenantRefs(tx: PrismaTx, refs: TenantRefs): Promise<void> {
    const schoolId = this.requireSchoolId();
    for (const id of dedupe(refs.academicYearIds)) {
      const found = await tx.academicYear.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('AcademicYear', id);
    }
    for (const id of dedupe(refs.branchIds)) {
      const found = await tx.branch.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Branch', id);
    }
    for (const id of dedupe(refs.classIds)) {
      const found = await tx.class.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Class', id);
    }
    for (const id of dedupe(refs.sectionIds)) {
      const found = await tx.section.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Section', id);
    }
    for (const id of dedupe(refs.studentIds)) {
      const found = await tx.student.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Student', id);
    }
    for (const id of dedupe(refs.feeHeadIds)) {
      const found = await tx.feeHead.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('FeeHead', id);
    }
    for (const id of dedupe(refs.lateFinePolicyIds)) {
      const found = await tx.feeLateFinePolicy.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) {
        throw new FeesCrossTenantReferenceError('FeeLateFinePolicy', id);
      }
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeStructureService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(FeesFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new FeesModuleDisabledError();
  }
}

function toLineInput(l: CreateFeeStructureLineArgs): CreateFeeStructureLineInput {
  return {
    feeHeadId: l.feeHeadId,
    lateFinePolicyId: l.lateFinePolicyId ?? null,
    amount: l.amount,
    frequency: l.frequency,
    dueDay: l.dueDay ?? null,
    ordering: l.ordering,
  };
}

function dedupe(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined || values.length === 0) return [];
  return Array.from(new Set(values));
}
