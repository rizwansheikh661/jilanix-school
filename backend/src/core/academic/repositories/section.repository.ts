/**
 * SectionRepository — read/write access to the `sections` table.
 *
 * Composite uniques: `(schoolId, classId, name)` — clashes surface as
 * Prisma P2002 → DuplicateResourceError via the global mapper.
 *
 * Teacher validation lives here too (`findActiveTeacher`) so the service
 * layer can ask "is this user a valid teacher in my school?" without
 * needing to import the auth module's `UserRepository` (which is
 * not exported).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SectionRow } from '../academic.types';

export interface CreateSectionInput {
  readonly classId: string;
  readonly name: string;
  readonly capacity?: number | null;
  readonly classTeacherId?: string | null;
}

export interface UpdateSectionInput {
  readonly classId?: string;
  readonly name?: string;
  readonly capacity?: number | null;
}

export interface ListSectionsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly classId?: string;
}

type Reader = PrismaTx;

@Injectable()
export class SectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<SectionRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.section.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListSectionsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly SectionRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const rows = await reader.section.findMany({
      where: args.classId !== undefined ? { classId: args.classId } : {},
      orderBy: [{ classId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
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

  public async create(input: CreateSectionInput, tx?: PrismaTx): Promise<SectionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.section.create({
      data: {
        schoolId,
        classId: input.classId,
        name: input.name,
        capacity: input.capacity ?? null,
        classTeacherId: input.classTeacherId ?? null,
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateSectionInput,
    tx?: PrismaTx,
  ): Promise<SectionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.classId !== undefined) data.classId = patch.classId;
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.capacity !== undefined) data.capacity = patch.capacity;
    const result = await writer.section.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Section', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  /**
   * Assign or unassign the class teacher. Pass `teacherId: null` to clear.
   * Returns the freshly-updated row; throws `VersionConflictError` on stale
   * `expectedVersion`.
   */
  public async setClassTeacher(
    id: string,
    expectedVersion: number,
    teacherId: string | null,
    tx?: PrismaTx,
  ): Promise<SectionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.section.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: { classTeacherId: teacherId, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Section', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.section.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Section', id, expectedVersion);
    }
  }

  /** Returns true if a non-deleted class with this id exists in the tenant. */
  public async classExists(classId: string, tx?: PrismaTx): Promise<boolean> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.class.findFirst({
      where: { schoolId, id: classId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Confirm `userId` is an active User in the current tenant. Returns:
   *   - 'ok'        — exists and status='active'
   *   - 'inactive'  — exists but disabled/locked/invited
   *   - 'not_found' — no User row matches
   */
  public async classifyTeacher(
    userId: string,
    tx?: PrismaTx,
  ): Promise<'ok' | 'inactive' | 'not_found'> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const user = await reader.user.findFirst({
      where: { schoolId, id: userId },
      select: { status: true },
    });
    if (user === null) return 'not_found';
    return user.status === 'active' ? 'ok' : 'inactive';
  }

  private reader(tx?: PrismaTx): Reader {
    return (tx ?? (this.prisma.client as unknown as PrismaTx));
  }

  private async requireById(
    reader: Reader,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ): Promise<SectionRow> {
    const row = await reader.section.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('Section', id, expectedVersion);
    }
    return mapRow(row);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('SectionRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  capacity: number | null;
  classTeacherId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): SectionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    classId: row.classId,
    name: row.name,
    capacity: row.capacity,
    classTeacherId: row.classTeacherId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
