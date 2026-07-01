/**
 * ExamMarksRepository — persistence for `exam_marks`. One row per
 * (exam, student, subject). Optimistic-lock via `version`. Soft-delete.
 *
 * History rows are written by ExamMarksService (not here) — but in the
 * same transaction the caller supplies, so the ledger never drifts.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ExamMarksRow } from '../examination.types';

export interface CreateExamMarksInput {
  readonly examId: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly sectionId: string;
  readonly marksObtained: number | null;
  readonly isAbsent: boolean;
  readonly remarks: string | null;
  readonly enteredAt: Date;
  readonly enteredBy: string | null;
}

export interface UpdateExamMarksInput {
  readonly marksObtained?: number | null;
  readonly isAbsent?: boolean;
  readonly remarks?: string | null;
}

export interface ListExamMarksArgs {
  readonly examId: string;
  readonly sectionId?: string;
  readonly subjectId?: string;
  readonly studentId?: string;
}

@Injectable()
export class ExamMarksRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ExamMarksRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<ExamMarksRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.examMarks.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapMarks(row);
  }

  public async findActiveBySlot(
    examId: string,
    studentId: string,
    subjectId: string,
    tx?: PrismaTx,
  ): Promise<ExamMarksRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.examMarks.findFirst({
      where: {
        schoolId,
        examId,
        studentId,
        subjectId,
        deletedAt: null,
      },
    });
    return row === null ? null : mapMarks(row);
  }

  public async list(
    args: ListExamMarksArgs,
    tx?: PrismaTx,
  ): Promise<readonly ExamMarksRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      examId: args.examId,
      deletedAt: null,
    };
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.subjectId !== undefined) where.subjectId = args.subjectId;
    if (args.studentId !== undefined) where.studentId = args.studentId;
    const rows = await reader.examMarks.findMany({
      where,
      orderBy: [{ studentId: 'asc' }, { subjectId: 'asc' }],
    });
    return rows.map(mapMarks);
  }

  public async create(
    input: CreateExamMarksInput,
    tx?: PrismaTx,
  ): Promise<ExamMarksRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.examMarks.create({
      data: {
        schoolId,
        examId: input.examId,
        studentId: input.studentId,
        subjectId: input.subjectId,
        sectionId: input.sectionId,
        marksObtained: input.marksObtained,
        isAbsent: input.isAbsent,
        remarks: input.remarks,
        enteredAt: input.enteredAt,
        enteredBy: input.enteredBy,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapMarks(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateExamMarksInput,
    tx?: PrismaTx,
  ): Promise<ExamMarksRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.marksObtained !== undefined) data.marksObtained = input.marksObtained;
    if (input.isAbsent !== undefined) data.isAbsent = input.isAbsent;
    if (input.remarks !== undefined) data.remarks = input.remarks;
    const result = await writer.examMarks.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ExamMarks', id, expectedVersion);
    }
    const reloaded = await writer.examMarks.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ExamMarks', id, expectedVersion);
    }
    return mapMarks(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.examMarks.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ExamMarks', id, expectedVersion);
    }
  }
}

interface RawMarks {
  id: string;
  schoolId: string;
  examId: string;
  studentId: string;
  subjectId: string;
  sectionId: string;
  marksObtained: unknown | null;
  isAbsent: boolean;
  remarks: string | null;
  enteredAt: Date;
  enteredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapMarks(row: RawMarks): ExamMarksRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examId: row.examId,
    studentId: row.studentId,
    subjectId: row.subjectId,
    sectionId: row.sectionId,
    marksObtained: row.marksObtained === null ? null : toNumber(row.marksObtained),
    isAbsent: row.isAbsent,
    remarks: row.remarks,
    enteredAt: row.enteredAt,
    enteredBy: row.enteredBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

export const __test__ = { toNumber };
