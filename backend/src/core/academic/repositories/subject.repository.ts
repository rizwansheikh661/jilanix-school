/**
 * SubjectRepository — read/write access to the `subjects` table.
 *
 * `(schoolId, code)` is the canonical unique. Duplicate codes surface as
 * Prisma P2002 → DuplicateResourceError via the global mapper; callers
 * that want a pre-flight check can use `findByCode`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SubjectRow, SubjectTypeValue } from '../academic.types';

export interface CreateSubjectInput {
  readonly name: string;
  readonly code: string;
  readonly type: SubjectTypeValue;
}

export interface UpdateSubjectInput {
  readonly name?: string;
  readonly code?: string;
  readonly type?: SubjectTypeValue;
}

export interface ListSubjectsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly type?: SubjectTypeValue;
}

type Reader = PrismaTx;

@Injectable()
export class SubjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<SubjectRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.subject.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByCode(code: string, tx?: PrismaTx): Promise<SubjectRow | null> {
    const reader = this.reader(tx);
    const row = await reader.subject.findFirst({ where: { code } });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListSubjectsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly SubjectRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const rows = await reader.subject.findMany({
      where: args.type !== undefined ? { type: args.type } : {},
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
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

  public async create(input: CreateSubjectInput, tx?: PrismaTx): Promise<SubjectRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.subject.create({
      data: { schoolId, name: input.name, code: input.code, type: input.type },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateSubjectInput,
    tx?: PrismaTx,
  ): Promise<SubjectRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.code !== undefined) data.code = patch.code;
    if (patch.type !== undefined) data.type = patch.type;
    const result = await writer.subject.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Subject', id, expectedVersion);
    }
    const row = await writer.subject.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('Subject', id, expectedVersion);
    }
    return mapRow(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.subject.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Subject', id, expectedVersion);
    }
  }

  private reader(tx?: PrismaTx): Reader {
    return (tx ?? (this.prisma.client as unknown as PrismaTx));
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('SubjectRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): SubjectRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    code: row.code,
    type: row.type as SubjectTypeValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
