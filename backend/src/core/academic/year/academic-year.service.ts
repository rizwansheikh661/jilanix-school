/**
 * AcademicYearService — orchestrates the AcademicYear lifecycle (create,
 * update, activate). All writes run inside a Prisma transaction so the
 * "single current per school" invariant and the overlap pre-check stay
 * consistent under concurrent calls.
 *
 * Errors:
 *   - Domain rules throw typed errors from `academic.errors.ts` /
 *     `core/errors/domain-error.ts`.
 *   - Prisma-layer errors (duplicate-name P2002 against
 *     `uq_academic_years_school_name`, optimistic-lock P2025 etc.) bubble
 *     up; `GlobalExceptionFilter` runs `mapPrismaError` so callers see
 *     `DuplicateResourceError` / `VersionConflict` envelopes.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError, ValidationFailedError, VersionConflict } from '../../errors/domain-error';
import { AcademicYearOverlapError } from '../academic.errors';
import type { AcademicYearRow } from '../academic.types';
import { AcademicYearRepository } from '../repositories/academic-year.repository';

export interface CreateAcademicYearArgs {
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface UpdateAcademicYearArgs {
  readonly name?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

@Injectable()
export class AcademicYearService {
  private readonly logger = new Logger(AcademicYearService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AcademicYearRepository,
  ) {}

  public async list(args: {
    readonly limit: number;
    readonly cursorId?: string;
  }): Promise<{ readonly items: readonly AcademicYearRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AcademicYearRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('AcademicYear', id);
    }
    return row;
  }

  public async create(args: CreateAcademicYearArgs): Promise<AcademicYearRow> {
    this.assertValidRange(args.startDate, args.endDate);
    return this.prisma.transaction(async (tx) => {
      const conflict = await this.repo.findOverlapping(
        { start: args.startDate, end: args.endDate },
        tx,
      );
      if (conflict !== null) {
        throw new AcademicYearOverlapError({
          conflictingYearId: conflict.id,
          conflictingName: conflict.name,
          conflictingStart: conflict.startDate,
          conflictingEnd: conflict.endDate,
        });
      }
      return this.repo.create(
        { name: args.name, startDate: args.startDate, endDate: args.endDate },
        tx,
      );
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAcademicYearArgs,
  ): Promise<AcademicYearRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('AcademicYear', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('AcademicYear', id, expectedVersion);
      }
      const start = patch.startDate ?? current.startDate;
      const end = patch.endDate ?? current.endDate;
      this.assertValidRange(start, end);
      if (patch.startDate !== undefined || patch.endDate !== undefined) {
        const conflict = await this.repo.findOverlapping({ start, end, excludeId: id }, tx);
        if (conflict !== null) {
          throw new AcademicYearOverlapError({
            conflictingYearId: conflict.id,
            conflictingName: conflict.name,
            conflictingStart: conflict.startDate,
            conflictingEnd: conflict.endDate,
          });
        }
      }
      return this.repo.update(id, expectedVersion, patch, tx);
    });
  }

  /**
   * Promote `id` to `isCurrent=true` and demote any other current year in
   * the same school. Idempotent: if the target is already current, the
   * single-row updateMany still bumps version once.
   */
  public async activate(id: string, expectedVersion: number): Promise<AcademicYearRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('AcademicYear', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('AcademicYear', id, expectedVersion);
      }
      const updated = await this.repo.setCurrent(id, expectedVersion, tx);
      this.logger.log(`Activated AcademicYear ${id} for school ${updated.schoolId}.`);
      return updated;
    });
  }

  private assertValidRange(start: Date, end: Date): void {
    if (start.getTime() >= end.getTime()) {
      throw new ValidationFailedError(
        [
          {
            path: 'endDate',
            code: 'DATE_RANGE_INVALID',
            message: 'endDate must be strictly after startDate.',
          },
        ],
        'Academic year date range is invalid',
      );
    }
  }
}
