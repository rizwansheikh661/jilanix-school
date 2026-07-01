/**
 * ClassRepository — read/write access to the `classes` table.
 *
 * Soft-delete via `softDeleteExt` (delete → update + auto-filter on reads).
 * Composite-PK selectors require `schoolId` explicitly even though the
 * tenantScopeExt auto-injects it on row reads.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ClassRow } from '../academic.types';

export interface CreateClassInput {
  readonly name: string;
  readonly gradeLevel: number;
  readonly displayOrder?: number;
}

export interface UpdateClassInput {
  readonly name?: string;
  readonly gradeLevel?: number;
  readonly displayOrder?: number;
}

export interface ListClassesArgs {
  readonly limit: number;
  readonly cursorId?: string;
}

type Reader = PrismaTx;

@Injectable()
export class ClassRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<ClassRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.class.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListClassesArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly ClassRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const rows = await reader.class.findMany({
      orderBy: [{ gradeLevel: 'asc' }, { displayOrder: 'asc' }, { id: 'asc' }],
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

  public async create(input: CreateClassInput, tx?: PrismaTx): Promise<ClassRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.class.create({
      data: {
        schoolId,
        name: input.name,
        gradeLevel: input.gradeLevel,
        displayOrder: input.displayOrder ?? 0,
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateClassInput,
    tx?: PrismaTx,
  ): Promise<ClassRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.gradeLevel !== undefined) data.gradeLevel = patch.gradeLevel;
    if (patch.displayOrder !== undefined) data.displayOrder = patch.displayOrder;
    const result = await writer.class.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Class', id, expectedVersion);
    }
    const row = await writer.class.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('Class', id, expectedVersion);
    }
    return mapRow(row);
  }

  /**
   * Soft-delete with optimistic-lock check. The softDeleteExt rewrites the
   * underlying call into `UPDATE classes SET deletedAt=... WHERE ...`, so
   * we still gate on `version` to avoid clobbering concurrent edits.
   */
  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.class.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Class', id, expectedVersion);
    }
  }

  /** Count non-deleted sections that reference this class. */
  public async countLiveSections(classId: string, tx?: PrismaTx): Promise<number> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    return reader.section.count({
      where: { schoolId, classId, deletedAt: null },
    });
  }

  private reader(tx?: PrismaTx): Reader {
    return (tx ?? (this.prisma.client as unknown as PrismaTx));
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ClassRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  name: string;
  gradeLevel: number;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): ClassRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    gradeLevel: row.gradeLevel,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
