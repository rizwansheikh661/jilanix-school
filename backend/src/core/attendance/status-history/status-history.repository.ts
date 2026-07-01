/**
 * AttendanceStatusHistoryRepository — append-only ledger of status changes
 * for `AttendanceDaily` rows. Marked APPEND_ONLY in scope.ts so the global
 * Prisma extension refuses any update/delete attempts.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AttendanceHistoryChangeTypeValue,
  AttendanceStatusValue,
} from '../attendance.constants';
import type { AttendanceStatusHistoryRow } from '../attendance.types';

export interface AppendStatusHistoryInput {
  readonly attendanceDailyId: string;
  readonly previousStatus: AttendanceStatusValue | null;
  readonly newStatus: AttendanceStatusValue;
  readonly changeType: AttendanceHistoryChangeTypeValue;
  readonly reason: string | null;
  readonly correctionId: string | null;
}

@Injectable()
export class AttendanceStatusHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AttendanceStatusHistoryRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async append(
    input: AppendStatusHistoryInput,
    tx?: PrismaTx,
  ): Promise<AttendanceStatusHistoryRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.attendanceStatusHistory.create({
      data: {
        schoolId,
        attendanceDailyId: input.attendanceDailyId,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        changeType: input.changeType,
        changedBy: userId ?? null,
        changedAt: new Date(),
        reason: input.reason,
        correctionId: input.correctionId,
      },
    });
    return map(row);
  }

  public async listForAttendance(
    attendanceDailyId: string,
    tx?: PrismaTx,
  ): Promise<readonly AttendanceStatusHistoryRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.attendanceStatusHistory.findMany({
      where: { schoolId, attendanceDailyId },
      orderBy: [{ changedAt: 'desc' }],
    });
    return rows.map(map);
  }
}

interface RawHistory {
  id: string;
  schoolId: string;
  attendanceDailyId: string;
  previousStatus: AttendanceStatusValue | null;
  newStatus: AttendanceStatusValue;
  changeType: AttendanceHistoryChangeTypeValue;
  changedBy: string | null;
  changedAt: Date;
  reason: string | null;
  correctionId: string | null;
}

function map(row: RawHistory): AttendanceStatusHistoryRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    attendanceDailyId: row.attendanceDailyId,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    changeType: row.changeType,
    changedBy: row.changedBy,
    changedAt: row.changedAt,
    reason: row.reason,
    correctionId: row.correctionId,
  };
}
