/**
 * TeacherLoadRepository — persistence for the derived `teacher_load`
 * cache. One active row per (timetableVersionId, staffId); recompute
 * upserts via `findActive` → update-or-insert.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { TeacherLoadRow } from '../timetable.types';

export interface UpsertTeacherLoadInput {
  readonly timetableVersionId: string;
  readonly staffId: string;
  readonly periodsPerWeek: number;
  readonly maxConsecutive: number;
  readonly dailyCounts: Readonly<Record<string, number>>;
  readonly subjectMix: Readonly<Record<string, number>>;
  readonly computedAt: Date;
}

@Injectable()
export class TeacherLoadRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TeacherLoadRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findActive(
    versionId: string,
    staffId: string,
    tx?: PrismaTx,
  ): Promise<TeacherLoadRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.teacherLoad.findFirst({
      where: { schoolId, timetableVersionId: versionId, staffId, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async findAllForVersion(
    versionId: string,
    tx?: PrismaTx,
  ): Promise<readonly TeacherLoadRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.teacherLoad.findMany({
      where: { schoolId, timetableVersionId: versionId, deletedAt: null },
      orderBy: { staffId: 'asc' },
    });
    return rows.map(map);
  }

  public async upsert(input: UpsertTeacherLoadInput, tx?: PrismaTx): Promise<TeacherLoadRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const existing = await writer.teacherLoad.findFirst({
      where: {
        schoolId,
        timetableVersionId: input.timetableVersionId,
        staffId: input.staffId,
        deletedAt: null,
      },
    });
    if (existing === null) {
      const created = await writer.teacherLoad.create({
        data: {
          schoolId,
          timetableVersionId: input.timetableVersionId,
          staffId: input.staffId,
          periodsPerWeek: input.periodsPerWeek,
          maxConsecutive: input.maxConsecutive,
          dailyCountsJson: input.dailyCounts as object,
          subjectMixJson: input.subjectMix as object,
          computedAt: input.computedAt,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      return map(created);
    }
    const updated = await writer.teacherLoad.update({
      where: { schoolId_id: { schoolId, id: existing.id } },
      data: {
        periodsPerWeek: input.periodsPerWeek,
        maxConsecutive: input.maxConsecutive,
        dailyCountsJson: input.dailyCounts as object,
        subjectMixJson: input.subjectMix as object,
        computedAt: input.computedAt,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    return map(updated);
  }
}

interface RawLoad {
  id: string;
  schoolId: string;
  timetableVersionId: string;
  staffId: string;
  periodsPerWeek: number;
  maxConsecutive: number;
  dailyCountsJson: unknown;
  subjectMixJson: unknown;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function map(row: RawLoad): TeacherLoadRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    timetableVersionId: row.timetableVersionId,
    staffId: row.staffId,
    periodsPerWeek: row.periodsPerWeek,
    maxConsecutive: row.maxConsecutive,
    dailyCounts: (row.dailyCountsJson as Record<string, number>) ?? {},
    subjectMix: (row.subjectMixJson as Record<string, number>) ?? {},
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
