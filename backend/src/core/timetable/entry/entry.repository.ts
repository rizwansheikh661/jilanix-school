/**
 * TimetableEntryRepository — persistence for `timetable_entries`.
 *
 * Reads are tenant-scoped; lookups for the section/teacher/room conflict
 * guards filter by `deletedAt: null`.
 *
 * `bulkCreate` is sequential rather than `createMany`-batched so each
 * row hits the STORED `deleted_at_key` + `uq_tt_entry_section_slot`
 * unique index individually — the service path collects per-row errors
 * and returns a 207-style response.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { TimetableEntryRow } from '../timetable.types';

export interface CreateTimetableEntryInput {
  readonly timetableVersionId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly staffId: string;
  readonly roomId: string | null;
  readonly dayOfWeek: number;
  readonly periodIndex: number;
  readonly notes: string | null;
}

export interface UpdateTimetableEntryInput {
  readonly subjectId?: string;
  readonly staffId?: string;
  readonly roomId?: string | null;
  readonly dayOfWeek?: number;
  readonly periodIndex?: number;
  readonly notes?: string | null;
}

export interface ListTimetableEntryArgs {
  readonly timetableVersionId?: string;
  readonly sectionId?: string;
  readonly staffId?: string;
  readonly roomId?: string;
  readonly dayOfWeek?: number;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class TimetableEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TimetableEntryRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<TimetableEntryRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.timetableEntry.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async findActiveBySectionSlot(
    versionId: string,
    sectionId: string,
    dayOfWeek: number,
    periodIndex: number,
    tx?: PrismaTx,
  ): Promise<TimetableEntryRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.timetableEntry.findFirst({
      where: {
        schoolId,
        timetableVersionId: versionId,
        sectionId,
        dayOfWeek,
        periodIndex,
        deletedAt: null,
      },
    });
    return row === null ? null : map(row);
  }

  public async findActiveByStaffSlot(
    versionId: string,
    staffId: string,
    dayOfWeek: number,
    periodIndex: number,
    tx?: PrismaTx,
  ): Promise<TimetableEntryRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.timetableEntry.findFirst({
      where: {
        schoolId,
        timetableVersionId: versionId,
        staffId,
        dayOfWeek,
        periodIndex,
        deletedAt: null,
      },
    });
    return row === null ? null : map(row);
  }

  public async findActiveByRoomSlot(
    versionId: string,
    roomId: string,
    dayOfWeek: number,
    periodIndex: number,
    tx?: PrismaTx,
  ): Promise<TimetableEntryRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.timetableEntry.findFirst({
      where: {
        schoolId,
        timetableVersionId: versionId,
        roomId,
        dayOfWeek,
        periodIndex,
        deletedAt: null,
      },
    });
    return row === null ? null : map(row);
  }

  public async findActiveForStaff(
    versionId: string,
    staffId: string,
    tx?: PrismaTx,
  ): Promise<readonly TimetableEntryRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.timetableEntry.findMany({
      where: { schoolId, timetableVersionId: versionId, staffId, deletedAt: null },
      orderBy: [{ dayOfWeek: 'asc' }, { periodIndex: 'asc' }],
    });
    return rows.map(map);
  }

  public async findActiveForSection(
    versionId: string,
    sectionId: string,
    tx?: PrismaTx,
  ): Promise<readonly TimetableEntryRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.timetableEntry.findMany({
      where: { schoolId, timetableVersionId: versionId, sectionId, deletedAt: null },
      orderBy: [{ dayOfWeek: 'asc' }, { periodIndex: 'asc' }],
    });
    return rows.map(map);
  }

  public async findActiveForRoom(
    versionId: string,
    roomId: string,
    tx?: PrismaTx,
  ): Promise<readonly TimetableEntryRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.timetableEntry.findMany({
      where: { schoolId, timetableVersionId: versionId, roomId, deletedAt: null },
      orderBy: [{ dayOfWeek: 'asc' }, { periodIndex: 'asc' }],
    });
    return rows.map(map);
  }

  public async findActiveForVersion(
    versionId: string,
    tx?: PrismaTx,
  ): Promise<readonly TimetableEntryRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.timetableEntry.findMany({
      where: { schoolId, timetableVersionId: versionId, deletedAt: null },
      orderBy: [{ dayOfWeek: 'asc' }, { periodIndex: 'asc' }],
    });
    return rows.map(map);
  }

  public async list(
    args: ListTimetableEntryArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly TimetableEntryRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.timetableVersionId !== undefined) where.timetableVersionId = args.timetableVersionId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.staffId !== undefined) where.staffId = args.staffId;
    if (args.roomId !== undefined) where.roomId = args.roomId;
    if (args.dayOfWeek !== undefined) where.dayOfWeek = args.dayOfWeek;
    const rows = await reader.timetableEntry.findMany({
      where,
      orderBy: [{ dayOfWeek: 'asc' }, { periodIndex: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId = rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(map), nextCursorId };
  }

  public async create(
    input: CreateTimetableEntryInput,
    tx?: PrismaTx,
  ): Promise<TimetableEntryRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.timetableEntry.create({
      data: {
        schoolId,
        timetableVersionId: input.timetableVersionId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        staffId: input.staffId,
        roomId: input.roomId,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        notes: input.notes,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateTimetableEntryInput,
    tx?: PrismaTx,
  ): Promise<TimetableEntryRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.subjectId !== undefined) data.subjectId = input.subjectId;
    if (input.staffId !== undefined) data.staffId = input.staffId;
    if (input.roomId !== undefined) data.roomId = input.roomId;
    if (input.dayOfWeek !== undefined) data.dayOfWeek = input.dayOfWeek;
    if (input.periodIndex !== undefined) data.periodIndex = input.periodIndex;
    if (input.notes !== undefined) data.notes = input.notes;
    const result = await writer.timetableEntry.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('TimetableEntry', id, expectedVersion);
    }
    const reloaded = await writer.timetableEntry.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('TimetableEntry', id, expectedVersion);
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
    const result = await writer.timetableEntry.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('TimetableEntry', id, expectedVersion);
    }
  }
}

interface RawEntry {
  id: string;
  schoolId: string;
  timetableVersionId: string;
  sectionId: string;
  subjectId: string;
  staffId: string;
  roomId: string | null;
  dayOfWeek: number;
  periodIndex: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function map(row: RawEntry): TimetableEntryRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    timetableVersionId: row.timetableVersionId,
    sectionId: row.sectionId,
    subjectId: row.subjectId,
    staffId: row.staffId,
    roomId: row.roomId,
    dayOfWeek: row.dayOfWeek,
    periodIndex: row.periodIndex,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
