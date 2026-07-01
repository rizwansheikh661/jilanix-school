/**
 * ExamSchemeService — orchestration for grading-scheme CRUD.
 *
 * Validation gates:
 *   1. `module.examination` feature flag.
 *   2. Duplicate-name guard (active rows only).
 *   3. Bands non-empty, monotonic ordering, range [0..100], non-overlapping,
 *      strictly increasing — gap-free recommended but not enforced this
 *      sprint (a gap means student in that range gets no band).
 *   4. Delete refused if a non-archived Exam references the scheme.
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
  EXAM_SCHEME_MAX_BANDS,
  ExaminationFeatureFlags,
  ExaminationOutboxTopics,
} from '../examination.constants';
import {
  DuplicateExamSchemeError,
  ExamSchemeBandsInvalidError,
  ExamSchemeInUseError,
  ExamSchemeNotFoundError,
  ExaminationModuleDisabledError,
} from '../examination.errors';
import type {
  ExamSchemeRow,
  ExamSchemeWithBands,
} from '../examination.types';
import {
  ExamSchemeRepository,
  type CreateExamSchemeBandInput,
  type ListExamSchemeArgs,
} from './exam-scheme.repository';

export interface ExamSchemeBandArgs {
  readonly gradeLetter: string;
  readonly gradePoint?: number | null;
  readonly minPct: number;
  readonly maxPct: number;
  readonly ordering: number;
}

export interface CreateExamSchemeArgs {
  readonly name: string;
  readonly boardType?: string | null;
  readonly passingPct: number;
  readonly marksEditWindowDays: number;
  readonly description?: string | null;
  readonly bands: readonly ExamSchemeBandArgs[];
}

export interface UpdateExamSchemeArgs {
  readonly name?: string;
  readonly boardType?: string | null;
  readonly passingPct?: number;
  readonly marksEditWindowDays?: number;
  readonly description?: string | null;
  readonly bands?: readonly ExamSchemeBandArgs[];
}

@Injectable()
export class ExamSchemeService {
  private readonly logger = new Logger(ExamSchemeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ExamSchemeRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListExamSchemeArgs): Promise<{
    readonly items: readonly ExamSchemeWithBands[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ExamSchemeWithBands> {
    const row = await this.repo.findById(id);
    if (row === null) throw new ExamSchemeNotFoundError(id);
    return row;
  }

  public async create(args: CreateExamSchemeArgs): Promise<ExamSchemeWithBands> {
    await this.assertModuleEnabled();
    this.validatePassingPct(args.passingPct);
    this.validateEditWindow(args.marksEditWindowDays);
    this.validateBands(args.bands);

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findActiveByName(args.name, tx);
      if (dup !== null) throw new DuplicateExamSchemeError(args.name);

      const row = await this.repo.create(
        {
          name: args.name,
          boardType: args.boardType ?? null,
          passingPct: args.passingPct,
          marksEditWindowDays: args.marksEditWindowDays,
          description: args.description ?? null,
          bands: args.bands.map(toRepoBand),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.SCHEME_CREATED,
        eventType: 'ExamSchemeCreated',
        aggregateType: 'ExamScheme',
        aggregateId: row.id,
        payload: {
          id: row.id,
          name: row.name,
          bandCount: row.bands.length,
          passingPct: row.passingPct,
          marksEditWindowDays: row.marksEditWindowDays,
        },
      });

      await this.audit.record(
        {
          action: 'exam_scheme.create',
          category: 'general',
          resourceType: 'ExamScheme',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `ExamScheme created id=${row.id} name="${row.name}" bands=${row.bands.length}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateExamSchemeArgs,
  ): Promise<ExamSchemeWithBands> {
    await this.assertModuleEnabled();
    if (args.passingPct !== undefined) this.validatePassingPct(args.passingPct);
    if (args.marksEditWindowDays !== undefined) {
      this.validateEditWindow(args.marksEditWindowDays);
    }
    if (args.bands !== undefined) this.validateBands(args.bands);

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamSchemeNotFoundError(id);

      if (args.name !== undefined && args.name !== current.name) {
        const dup = await this.repo.findActiveByName(args.name, tx);
        if (dup !== null && dup.id !== id) {
          throw new DuplicateExamSchemeError(args.name);
        }
      }

      const headerPatch: Record<string, unknown> = {};
      if (args.name !== undefined) headerPatch.name = args.name;
      if (args.boardType !== undefined) headerPatch.boardType = args.boardType;
      if (args.passingPct !== undefined) headerPatch.passingPct = args.passingPct;
      if (args.marksEditWindowDays !== undefined) {
        headerPatch.marksEditWindowDays = args.marksEditWindowDays;
      }
      if (args.description !== undefined) headerPatch.description = args.description;
      await this.repo.update(id, expectedVersion, headerPatch, tx);

      if (args.bands !== undefined) {
        await this.repo.replaceBands(id, args.bands.map(toRepoBand), tx);
      }

      const updated = await this.repo.findById(id, tx);
      if (updated === null) throw new ExamSchemeNotFoundError(id);

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.SCHEME_UPDATED,
        eventType: 'ExamSchemeUpdated',
        aggregateType: 'ExamScheme',
        aggregateId: id,
        payload: {
          id,
          name: updated.name,
          bandCount: updated.bands.length,
        },
      });

      await this.audit.record(
        {
          action: 'exam_scheme.update',
          category: 'general',
          resourceType: 'ExamScheme',
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
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ExamSchemeNotFoundError(id);
      const ref = await this.repo.findReferencingExam(id, tx);
      if (ref !== null) {
        throw new ExamSchemeInUseError(id, ref.id);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.SCHEME_DELETED,
        eventType: 'ExamSchemeDeleted',
        aggregateType: 'ExamScheme',
        aggregateId: id,
        payload: { id, name: current.name },
      });
      await this.audit.record(
        {
          action: 'exam_scheme.delete',
          category: 'general',
          resourceType: 'ExamScheme',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`ExamScheme soft-deleted id=${id}.`);
    });
  }

  // ---------------------------------------------------------------------
  // Internal validators
  // ---------------------------------------------------------------------

  private validatePassingPct(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ExamSchemeBandsInvalidError(
        `passingPct must be between 0 and 100; got ${value}`,
      );
    }
  }

  private validateEditWindow(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 365) {
      throw new ExamSchemeBandsInvalidError(
        `marksEditWindowDays must be an integer in [0..365]; got ${value}`,
      );
    }
  }

  private validateBands(bands: readonly ExamSchemeBandArgs[]): void {
    if (bands.length === 0) {
      throw new ExamSchemeBandsInvalidError('at least one band required');
    }
    if (bands.length > EXAM_SCHEME_MAX_BANDS) {
      throw new ExamSchemeBandsInvalidError(
        `band count ${bands.length} exceeds max ${EXAM_SCHEME_MAX_BANDS}`,
      );
    }

    const sorted = [...bands].sort((a, b) => a.ordering - b.ordering);
    const seenOrder = new Set<number>();
    const seenLetter = new Set<string>();
    for (let i = 0; i < sorted.length; i += 1) {
      const b = sorted[i];
      if (b === undefined) continue;
      if (seenOrder.has(b.ordering)) {
        throw new ExamSchemeBandsInvalidError(
          `duplicate ordering ${b.ordering}`,
        );
      }
      seenOrder.add(b.ordering);
      if (seenLetter.has(b.gradeLetter)) {
        throw new ExamSchemeBandsInvalidError(
          `duplicate gradeLetter "${b.gradeLetter}"`,
        );
      }
      seenLetter.add(b.gradeLetter);
      if (b.minPct < 0 || b.maxPct > 100 || b.minPct > b.maxPct) {
        throw new ExamSchemeBandsInvalidError(
          `band "${b.gradeLetter}" range invalid: [${b.minPct}..${b.maxPct}]`,
        );
      }
      if (b.gradePoint !== null && b.gradePoint !== undefined) {
        if (!Number.isFinite(b.gradePoint) || b.gradePoint < 0) {
          throw new ExamSchemeBandsInvalidError(
            `band "${b.gradeLetter}" gradePoint must be >= 0`,
          );
        }
      }
    }
    // Overlap check on min-sorted bands.
    const byMin = [...sorted].sort((a, b) => a.minPct - b.minPct);
    for (let i = 1; i < byMin.length; i += 1) {
      const prev = byMin[i - 1];
      const cur = byMin[i];
      if (prev === undefined || cur === undefined) continue;
      if (cur.minPct <= prev.maxPct) {
        throw new ExamSchemeBandsInvalidError(
          `bands "${prev.gradeLetter}" and "${cur.gradeLetter}" overlap on [${prev.maxPct}..${cur.minPct}]`,
        );
      }
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

function toRepoBand(b: ExamSchemeBandArgs): CreateExamSchemeBandInput {
  return {
    gradeLetter: b.gradeLetter,
    ...(b.gradePoint !== undefined ? { gradePoint: b.gradePoint } : {}),
    minPct: b.minPct,
    maxPct: b.maxPct,
    ordering: b.ordering,
  };
}

export type { ExamSchemeRow };
