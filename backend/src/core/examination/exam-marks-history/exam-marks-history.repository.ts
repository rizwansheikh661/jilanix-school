/**
 * ExamMarksHistoryRepository — append-only ledger for `exam_marks_edit_history`.
 *
 * Writes only happen as part of an `ExamMarksService` mutation (same tx).
 * Reads are exposed via the read-only history controller.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ExamMarksChangeTypeValue } from '../examination.constants';
import type { ExamMarksHistoryRow } from '../examination.types';

export interface AppendHistoryInput {
  readonly examMarksId: string;
  readonly previousMarks: number | null;
  readonly newMarks: number | null;
  readonly previousIsAbsent: boolean;
  readonly newIsAbsent: boolean;
  readonly changeType: ExamMarksChangeTypeValue;
  readonly changedBy: string | null;
  readonly changedAt: Date;
  readonly reason: string | null;
}

@Injectable()
export class ExamMarksHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ExamMarksHistoryRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId };
  }

  public async append(
    input: AppendHistoryInput,
    tx?: PrismaTx,
  ): Promise<ExamMarksHistoryRow> {
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await writer.examMarksEditHistory.create({
      data: {
        schoolId,
        examMarksId: input.examMarksId,
        previousMarks: input.previousMarks,
        newMarks: input.newMarks,
        previousIsAbsent: input.previousIsAbsent,
        newIsAbsent: input.newIsAbsent,
        changeType: input.changeType,
        changedBy: input.changedBy,
        changedAt: input.changedAt,
        reason: input.reason,
      },
    });
    return mapHistory(row);
  }

  public async listForMarks(
    examMarksId: string,
    tx?: PrismaTx,
  ): Promise<readonly ExamMarksHistoryRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.examMarksEditHistory.findMany({
      where: { schoolId, examMarksId },
      orderBy: [{ changedAt: 'desc' }],
    });
    return rows.map(mapHistory);
  }
}

interface RawHistory {
  id: string;
  schoolId: string;
  examMarksId: string;
  previousMarks: unknown | null;
  newMarks: unknown | null;
  previousIsAbsent: boolean;
  newIsAbsent: boolean;
  changeType: ExamMarksChangeTypeValue;
  changedBy: string | null;
  changedAt: Date;
  reason: string | null;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapHistory(row: RawHistory): ExamMarksHistoryRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examMarksId: row.examMarksId,
    previousMarks: row.previousMarks === null ? null : toNumber(row.previousMarks),
    newMarks: row.newMarks === null ? null : toNumber(row.newMarks),
    previousIsAbsent: row.previousIsAbsent,
    newIsAbsent: row.newIsAbsent,
    changeType: row.changeType,
    changedBy: row.changedBy,
    changedAt: row.changedAt,
    reason: row.reason,
  };
}
