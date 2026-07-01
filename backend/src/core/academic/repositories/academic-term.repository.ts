/**
 * AcademicTermRepository — read/write access to `academic_terms`.
 *
 * Term rows are scoped to a parent AcademicYear; we always include
 * `academicYearId` on writes/reads. Soft-delete + composite-PK pattern
 * mirrors AcademicYearRepository.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AcademicTermRow } from '../academic.types';

export interface CreateAcademicTermInput {
  readonly academicYearId: string;
  readonly name: string;
  readonly sequence: number;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface UpdateAcademicTermInput {
  readonly name?: string;
  readonly sequence?: number;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

export interface ListAcademicTermsArgs {
  readonly academicYearId: string;
  readonly limit: number;
  readonly cursorId?: string;
}

type Reader = PrismaTx;

@Injectable()
export class AcademicTermRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<AcademicTermRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.academicTerm.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListAcademicTermsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly AcademicTermRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const rows = await reader.academicTerm.findMany({
      where: { schoolId, academicYearId: args.academicYearId },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      take,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? last.id : null;
    return { rows: trimmed.map(mapRow), nextCursorId };
  }

  /** Every non-deleted term for a year, ordered by sequence. */
  public async findAllForYear(
    academicYearId: string,
    tx?: PrismaTx,
  ): Promise<readonly AcademicTermRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.academicTerm.findMany({
      where: { schoolId, academicYearId },
      orderBy: [{ sequence: 'asc' }],
    });
    return rows.map(mapRow);
  }

  /**
   * Find any non-deleted term in the same year whose [start, end] window
   * overlaps the supplied range. Pass `excludeId` when updating so a term
   * doesn't overlap itself.
   */
  public async findOverlapping(
    args: {
      readonly academicYearId: string;
      readonly start: Date;
      readonly end: Date;
      readonly excludeId?: string;
    },
    tx?: PrismaTx,
  ): Promise<AcademicTermRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.academicTerm.findFirst({
      where: {
        schoolId,
        academicYearId: args.academicYearId,
        startDate: { lte: args.end },
        endDate: { gte: args.start },
        ...(args.excludeId !== undefined ? { NOT: { id: args.excludeId } } : {}),
      },
    });
    return row === null ? null : mapRow(row);
  }

  public async create(input: CreateAcademicTermInput, tx?: PrismaTx): Promise<AcademicTermRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.academicTerm.create({
      data: {
        schoolId,
        academicYearId: input.academicYearId,
        name: input.name,
        sequence: input.sequence,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAcademicTermInput,
    tx?: PrismaTx,
  ): Promise<AcademicTermRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.sequence !== undefined) data.sequence = patch.sequence;
    if (patch.startDate !== undefined) data.startDate = patch.startDate;
    if (patch.endDate !== undefined) data.endDate = patch.endDate;
    const result = await writer.academicTerm.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('AcademicTerm', id, expectedVersion);
    }
    const row = await writer.academicTerm.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('AcademicTerm', id, expectedVersion);
    }
    return mapRow(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.academicTerm.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('AcademicTerm', id, expectedVersion);
    }
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AcademicTermRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  sequence: number;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): AcademicTermRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    name: row.name,
    sequence: row.sequence,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
