import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AttendanceSourceValue } from '../attendance.constants';
import type { AttendanceConfigRow } from '../attendance.types';

export interface UpsertAttendanceConfigInput {
  readonly branchId: string | null;
  readonly editWindowHours?: number;
  readonly lateThresholdMinutes?: number;
  readonly correctionsRequireApproval?: boolean;
  readonly allowedSources?: readonly AttendanceSourceValue[];
  readonly holidayAutoMark?: boolean;
}

@Injectable()
export class AttendanceConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AttendanceConfigRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findForBranch(
    branchId: string | null,
    tx?: PrismaTx,
  ): Promise<AttendanceConfigRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.attendanceConfig.findFirst({
      where: { schoolId, branchId, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  /**
   * Effective config for a branch — branch-specific row if present, falls
   * back to the school-wide (branchId=null) row. Returns null if neither
   * exists; callers fall back to module defaults.
   */
  public async findEffective(
    branchId: string | null,
    tx?: PrismaTx,
  ): Promise<AttendanceConfigRow | null> {
    if (branchId !== null) {
      const specific = await this.findForBranch(branchId, tx);
      if (specific !== null) return specific;
    }
    return this.findForBranch(null, tx);
  }

  public async listAll(tx?: PrismaTx): Promise<readonly AttendanceConfigRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.attendanceConfig.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ branchId: 'asc' }],
    });
    return rows.map(map);
  }

  public async upsert(
    input: UpsertAttendanceConfigInput,
    tx?: PrismaTx,
  ): Promise<AttendanceConfigRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const existing = await this.findForBranch(input.branchId, writer);
    if (existing === null) {
      const data: Record<string, unknown> = {
        schoolId,
        branchId: input.branchId,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      };
      if (input.editWindowHours !== undefined) data.editWindowHours = input.editWindowHours;
      if (input.lateThresholdMinutes !== undefined) data.lateThresholdMinutes = input.lateThresholdMinutes;
      if (input.correctionsRequireApproval !== undefined) {
        data.correctionsRequireApproval = input.correctionsRequireApproval;
      }
      if (input.allowedSources !== undefined) {
        data.allowedSources = Array.from(input.allowedSources);
      }
      if (input.holidayAutoMark !== undefined) data.holidayAutoMark = input.holidayAutoMark;
      const created = await writer.attendanceConfig.create({ data });
      return map(created);
    }
    const update: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.editWindowHours !== undefined) update.editWindowHours = input.editWindowHours;
    if (input.lateThresholdMinutes !== undefined) update.lateThresholdMinutes = input.lateThresholdMinutes;
    if (input.correctionsRequireApproval !== undefined) {
      update.correctionsRequireApproval = input.correctionsRequireApproval;
    }
    if (input.allowedSources !== undefined) {
      update.allowedSources = Array.from(input.allowedSources);
    }
    if (input.holidayAutoMark !== undefined) update.holidayAutoMark = input.holidayAutoMark;
    const result = await writer.attendanceConfig.updateMany({
      where: { schoolId, id: existing.id, version: existing.version, deletedAt: null },
      data: update,
    });
    if (result.count === 0) {
      throw new VersionConflictError('AttendanceConfig', existing.id, existing.version);
    }
    const reloaded = await writer.attendanceConfig.findUnique({
      where: { schoolId_id: { schoolId, id: existing.id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('AttendanceConfig', existing.id, existing.version);
    }
    return map(reloaded);
  }
}

interface RawConfig {
  id: string;
  schoolId: string;
  branchId: string | null;
  editWindowHours: number;
  lateThresholdMinutes: number;
  correctionsRequireApproval: boolean;
  allowedSources: unknown;
  holidayAutoMark: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawConfig): AttendanceConfigRow {
  const sources = Array.isArray(row.allowedSources)
    ? (row.allowedSources as AttendanceSourceValue[])
    : (['MANUAL'] as AttendanceSourceValue[]);
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    editWindowHours: row.editWindowHours,
    lateThresholdMinutes: row.lateThresholdMinutes,
    correctionsRequireApproval: row.correctionsRequireApproval,
    allowedSources: sources,
    holidayAutoMark: row.holidayAutoMark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
