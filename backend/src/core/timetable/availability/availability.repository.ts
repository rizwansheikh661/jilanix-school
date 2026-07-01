/**
 * TeacherAvailabilityRepository — persistence for `teacher_availability`.
 *
 * Rows are AVAILABLE or UNAVAILABLE windows for a teacher within an
 * academic year, optionally scoped to a single period of a day. Soft-
 * delete supported; lookups filter `deletedAt: null`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { TeacherAvailabilityKindValue } from '../timetable.constants';
import type { TeacherAvailabilityRow } from '../timetable.types';

export interface CreateTeacherAvailabilityInput {
  readonly staffId: string;
  readonly academicYearId: string;
  readonly kind: TeacherAvailabilityKindValue;
  readonly dayOfWeek: number;
  readonly periodIndex: number | null;
  readonly reason: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface UpdateTeacherAvailabilityInput {
  readonly kind?: TeacherAvailabilityKindValue;
  readonly dayOfWeek?: number;
  readonly periodIndex?: number | null;
  readonly reason?: string | null;
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
}

export interface ListTeacherAvailabilityArgs {
  readonly staffId?: string;
  readonly academicYearId?: string;
  readonly dayOfWeek?: number;
  readonly kind?: TeacherAvailabilityKindValue;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class TeacherAvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TeacherAvailabilityRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<TeacherAvailabilityRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.teacherAvailability.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async findActiveForStaffSlot(
    staffId: string,
    academicYearId: string,
    dayOfWeek: number,
    periodIndex: number,
    onDate: Date,
    tx?: PrismaTx,
  ): Promise<readonly TeacherAvailabilityRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.teacherAvailability.findMany({
      where: {
        schoolId,
        staffId,
        academicYearId,
        dayOfWeek,
        deletedAt: null,
        OR: [{ periodIndex: null }, { periodIndex }],
        effectiveFrom: { lte: onDate },
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }] }],
      },
    });
    return rows.map(map);
  }

  public async list(
    args: ListTeacherAvailabilityArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly TeacherAvailabilityRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.staffId !== undefined) where.staffId = args.staffId;
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.dayOfWeek !== undefined) where.dayOfWeek = args.dayOfWeek;
    if (args.kind !== undefined) where.kind = args.kind;
    const rows = await reader.teacherAvailability.findMany({
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
    input: CreateTeacherAvailabilityInput,
    tx?: PrismaTx,
  ): Promise<TeacherAvailabilityRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.teacherAvailability.create({
      data: {
        schoolId,
        staffId: input.staffId,
        academicYearId: input.academicYearId,
        kind: input.kind,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        reason: input.reason,
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
    input: UpdateTeacherAvailabilityInput,
    tx?: PrismaTx,
  ): Promise<TeacherAvailabilityRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.dayOfWeek !== undefined) data.dayOfWeek = input.dayOfWeek;
    if (input.periodIndex !== undefined) data.periodIndex = input.periodIndex;
    if (input.reason !== undefined) data.reason = input.reason;
    if (input.effectiveFrom !== undefined) data.effectiveFrom = input.effectiveFrom;
    if (input.effectiveTo !== undefined) data.effectiveTo = input.effectiveTo;
    const result = await writer.teacherAvailability.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('TeacherAvailability', id, expectedVersion);
    }
    const reloaded = await writer.teacherAvailability.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('TeacherAvailability', id, expectedVersion);
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
    const result = await writer.teacherAvailability.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('TeacherAvailability', id, expectedVersion);
    }
  }
}

interface RawAvailability {
  id: string;
  schoolId: string;
  staffId: string;
  academicYearId: string;
  kind: TeacherAvailabilityKindValue;
  dayOfWeek: number;
  periodIndex: number | null;
  reason: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function map(row: RawAvailability): TeacherAvailabilityRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    academicYearId: row.academicYearId,
    kind: row.kind,
    dayOfWeek: row.dayOfWeek,
    periodIndex: row.periodIndex,
    reason: row.reason,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
