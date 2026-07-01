/**
 * TimetableVersionRepository — persistence for `timetable_versions`.
 *
 * Status lifecycle: DRAFT → ACTIVE → ARCHIVED. The DB enforces "only one
 * ACTIVE per (school, branch, year)" via a hand-added STORED
 * `status_active_key` + the `uq_tt_ver_active_per_year` partial unique
 * index; the service layer additionally archives the prior ACTIVE row in
 * the same tx so the transition is atomic.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { TimetableVersionStatusValue } from '../timetable.constants';
import type { TimetableVersionRow } from '../timetable.types';

export interface CreateTimetableVersionInput {
  readonly branchId: string;
  readonly academicYearId: string;
  readonly periodTemplateId: string;
  readonly name: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface UpdateTimetableVersionInput {
  readonly name?: string;
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
}

export interface ListTimetableVersionArgs {
  readonly branchId?: string;
  readonly academicYearId?: string;
  readonly status?: TimetableVersionStatusValue;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class TimetableVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TimetableVersionRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<TimetableVersionRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.timetableVersion.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async findActive(
    branchId: string,
    academicYearId: string,
    tx?: PrismaTx,
  ): Promise<TimetableVersionRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.timetableVersion.findFirst({
      where: {
        schoolId,
        branchId,
        academicYearId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    return row === null ? null : map(row);
  }

  public async list(
    args: ListTimetableVersionArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly TimetableVersionRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.branchId !== undefined) where.branchId = args.branchId;
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.timetableVersion.findMany({
      where,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId = rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(map), nextCursorId };
  }

  public async create(
    input: CreateTimetableVersionInput,
    tx?: PrismaTx,
  ): Promise<TimetableVersionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.timetableVersion.create({
      data: {
        schoolId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        periodTemplateId: input.periodTemplateId,
        name: input.name,
        status: 'DRAFT',
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateTimetableVersionInput,
    tx?: PrismaTx,
  ): Promise<TimetableVersionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.effectiveFrom !== undefined) data.effectiveFrom = input.effectiveFrom;
    if (input.effectiveTo !== undefined) data.effectiveTo = input.effectiveTo;
    const result = await writer.timetableVersion.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('TimetableVersion', id, expectedVersion);
    }
    const reloaded = await writer.timetableVersion.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('TimetableVersion', id, expectedVersion);
    }
    return map(reloaded);
  }

  /**
   * Set status to a new value, optimistic-locked. Used by activate()
   * and archive() service paths. `extra` carries the activatedAt /
   * archivedAt timestamps which the service computes.
   */
  public async setStatus(
    id: string,
    expectedVersion: number,
    nextStatus: TimetableVersionStatusValue,
    extra: { activatedAt?: Date | null; archivedAt?: Date | null },
    tx?: PrismaTx,
  ): Promise<TimetableVersionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status: nextStatus,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (extra.activatedAt !== undefined) data.activatedAt = extra.activatedAt;
    if (extra.archivedAt !== undefined) data.archivedAt = extra.archivedAt;
    const result = await writer.timetableVersion.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('TimetableVersion', id, expectedVersion);
    }
    const reloaded = await writer.timetableVersion.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('TimetableVersion', id, expectedVersion);
    }
    return map(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.timetableVersion.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('TimetableVersion', id, expectedVersion);
    }
  }
}

interface RawVersion {
  id: string;
  schoolId: string;
  branchId: string;
  academicYearId: string;
  periodTemplateId: string;
  name: string;
  status: TimetableVersionStatusValue;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function map(row: RawVersion): TimetableVersionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    academicYearId: row.academicYearId,
    periodTemplateId: row.periodTemplateId,
    name: row.name,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    activatedAt: row.activatedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
