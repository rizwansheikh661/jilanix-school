/**
 * AcademicTermService — CRUD for `AcademicTerm` with three invariants:
 *   1. `startDate < endDate`.
 *   2. The term window must lie entirely inside its parent AcademicYear's
 *      window.
 *   3. Terms within the same year may not overlap each other; sequence
 *      numbers must form a contiguous 1..N run with no gaps on create.
 *
 * All writes run inside a Prisma transaction so the overlap pre-check and
 * the subsequent insert/update commit atomically.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import {
  TermDateRangeInvalidError,
  TermOutsideYearError,
  TermOverlapError,
  TermSequenceGapError,
} from '../academic.errors';
import type { AcademicTermRow } from '../academic.types';
import { AcademicTermRepository } from '../repositories/academic-term.repository';
import { AcademicYearRepository } from '../repositories/academic-year.repository';

export interface CreateAcademicTermArgs {
  readonly academicYearId: string;
  readonly name: string;
  readonly sequence?: number;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface UpdateAcademicTermArgs {
  readonly name?: string;
  readonly sequence?: number;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

@Injectable()
export class AcademicTermService {
  private readonly logger = new Logger(AcademicTermService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AcademicTermRepository,
    private readonly yearRepo: AcademicYearRepository,
  ) {}

  public async list(args: {
    readonly academicYearId: string;
    readonly limit: number;
    readonly cursorId?: string;
  }): Promise<{ readonly items: readonly AcademicTermRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AcademicTermRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('AcademicTerm', id);
    }
    return row;
  }

  public async create(args: CreateAcademicTermArgs): Promise<AcademicTermRow> {
    this.assertValidRange(args.startDate, args.endDate);
    return this.prisma.transaction(async (tx) => {
      const year = await this.yearRepo.findById(args.academicYearId, tx);
      if (year === null) {
        throw new NotFoundError('AcademicYear', args.academicYearId);
      }
      this.assertWithinYear(year.startDate, year.endDate, args.startDate, args.endDate);
      const overlap = await this.repo.findOverlapping(
        { academicYearId: args.academicYearId, start: args.startDate, end: args.endDate },
        tx,
      );
      if (overlap !== null) {
        throw new TermOverlapError({
          conflictingTermId: overlap.id,
          conflictingName: overlap.name,
          conflictingStart: overlap.startDate,
          conflictingEnd: overlap.endDate,
        });
      }
      const sequence = await this.resolveSequence(args.academicYearId, args.sequence, tx);
      return this.repo.create(
        {
          academicYearId: args.academicYearId,
          name: args.name,
          sequence,
          startDate: args.startDate,
          endDate: args.endDate,
        },
        tx,
      );
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAcademicTermArgs,
  ): Promise<AcademicTermRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('AcademicTerm', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('AcademicTerm', id, expectedVersion);
      }
      const start = patch.startDate ?? current.startDate;
      const end = patch.endDate ?? current.endDate;
      this.assertValidRange(start, end);

      if (patch.startDate !== undefined || patch.endDate !== undefined) {
        const year = await this.yearRepo.findById(current.academicYearId, tx);
        if (year === null) {
          throw new NotFoundError('AcademicYear', current.academicYearId);
        }
        this.assertWithinYear(year.startDate, year.endDate, start, end);
        const overlap = await this.repo.findOverlapping(
          {
            academicYearId: current.academicYearId,
            start,
            end,
            excludeId: id,
          },
          tx,
        );
        if (overlap !== null) {
          throw new TermOverlapError({
            conflictingTermId: overlap.id,
            conflictingName: overlap.name,
            conflictingStart: overlap.startDate,
            conflictingEnd: overlap.endDate,
          });
        }
      }
      return this.repo.update(id, expectedVersion, patch, tx);
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('AcademicTerm', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('AcademicTerm', id, expectedVersion);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      this.logger.log(`Soft-deleted AcademicTerm ${id}.`);
    });
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private assertValidRange(start: Date, end: Date): void {
    if (start.getTime() >= end.getTime()) {
      throw new TermDateRangeInvalidError();
    }
  }

  private assertWithinYear(
    yearStart: Date,
    yearEnd: Date,
    termStart: Date,
    termEnd: Date,
  ): void {
    if (termStart.getTime() < yearStart.getTime() || termEnd.getTime() > yearEnd.getTime()) {
      throw new TermOutsideYearError({ yearStart, yearEnd });
    }
  }

  /**
   * If the caller didn't supply `sequence`, append `maxSeq + 1`. If they did,
   * accept only `maxSeq + 1` so the run stays contiguous (no gaps, no
   * duplicates — duplicates are also caught by the DB unique key, but the
   * service-level error gives a clearer reason envelope).
   */
  private async resolveSequence(
    academicYearId: string,
    requested: number | undefined,
    tx: import('../../../infra/prisma/types').PrismaTx,
  ): Promise<number> {
    const existing = await this.repo.findAllForYear(academicYearId, tx);
    const nextExpected = existing.length === 0 ? 1 : Math.max(...existing.map((t) => t.sequence)) + 1;
    if (requested === undefined) {
      return nextExpected;
    }
    if (requested !== nextExpected) {
      throw new TermSequenceGapError({ expected: nextExpected, received: requested });
    }
    return requested;
  }
}
