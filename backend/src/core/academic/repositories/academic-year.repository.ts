/**
 * AcademicYearRepository — read/write access to the `academic_years` table.
 *
 * Tenancy: the tenantScopeExt auto-injects `schoolId` on reads/writes for
 * TENANT_OWNED models, but composite-PK selectors (`schoolId_id`) still need
 * the field set explicitly. We always read schoolId from
 * `RequestContextRegistry.require().schoolId` rather than accepting it as a
 * parameter so a misuse cannot let a tenant query another tenant's rows.
 *
 * Soft delete: softDeleteExt rewrites `.delete()` → `.update({ deletedAt })`
 * and filters `deletedAt: null` on every read. AcademicYear has no DELETE
 * endpoint this sprint, so the rewrite path is unused for this model.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AcademicYearRow } from '../academic.types';

export interface CreateAcademicYearInput {
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface UpdateAcademicYearInput {
  readonly name?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

export interface ListAcademicYearsArgs {
  readonly limit: number;
  readonly cursorId?: string;
}

type Reader = PrismaTx;

@Injectable()
export class AcademicYearRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<AcademicYearRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.academicYear.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  /**
   * Cursor pagination keyed by `(createdAt desc, id desc)`. We over-fetch
   * by one so the next-cursor decision is a single comparison; the extra
   * row is dropped before mapping.
   */
  public async findMany(
    args: ListAcademicYearsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly AcademicYearRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const rows = await reader.academicYear.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  public async create(input: CreateAcademicYearInput, tx?: PrismaTx): Promise<AcademicYearRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.academicYear.create({
      data: {
        schoolId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        isCurrent: false,
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAcademicYearInput,
    tx?: PrismaTx,
  ): Promise<AcademicYearRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.startDate !== undefined) data.startDate = patch.startDate;
    if (patch.endDate !== undefined) data.endDate = patch.endDate;
    const result = await writer.academicYear.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('AcademicYear', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  /**
   * Atomically demote every other current year for this school and promote
   * the target. Caller MUST be inside a transaction so both writes commit
   * together. Returns the freshly-promoted row.
   */
  public async setCurrent(
    id: string,
    expectedVersion: number,
    tx: PrismaTx,
  ): Promise<AcademicYearRow> {
    const { schoolId } = this.tenantContext();
    await tx.academicYear.updateMany({
      where: { schoolId, isCurrent: true, NOT: { id } },
      data: { isCurrent: false, version: { increment: 1 } },
    });
    const promoted = await tx.academicYear.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: { isCurrent: true, version: { increment: 1 } },
    });
    if (promoted.count === 0) {
      throw new VersionConflictError('AcademicYear', id, expectedVersion);
    }
    return this.requireById(tx, schoolId, id, expectedVersion);
  }

  /**
   * Find any non-deleted year in the same school whose [startDate, endDate]
   * window overlaps [start, end]. Pass `excludeId` when updating so the
   * year doesn't overlap itself.
   */
  public async findOverlapping(
    args: { readonly start: Date; readonly end: Date; readonly excludeId?: string },
    tx?: PrismaTx,
  ): Promise<AcademicYearRow | null> {
    const reader = this.reader(tx);
    const row = await reader.academicYear.findFirst({
      where: {
        startDate: { lte: args.end },
        endDate: { gte: args.start },
        ...(args.excludeId !== undefined ? { NOT: { id: args.excludeId } } : {}),
      },
    });
    return row === null ? null : mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return (tx ?? (this.prisma.client as unknown as PrismaTx));
  }

  private async requireById(
    reader: Reader,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ): Promise<AcademicYearRow> {
    const row = await reader.academicYear.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('AcademicYear', id, expectedVersion);
    }
    return mapRow(row);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AcademicYearRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): AcademicYearRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
