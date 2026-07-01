/**
 * ExamResultRepository — persistence for `exam_results` and the child
 * `exam_subject_results`. Compute is idempotent: replaceForExam() blows
 * away the active result+subject-result rows and writes a fresh set in
 * the same transaction.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ExamResultStatusValue,
} from '../examination.constants';
import type {
  ExamResultRow,
  ExamResultWithSubjects,
  ExamSubjectResultRow,
} from '../examination.types';

export interface ComputedSubjectInput {
  readonly subjectId: string;
  readonly marksObtained: number | null;
  readonly maxMarks: number;
  readonly percentage: number | null;
  readonly isAbsent: boolean;
  readonly isPassed: boolean;
  readonly gradeLetter: string | null;
  readonly gradePoint: number | null;
}

export interface ComputedResultInput {
  readonly studentId: string;
  readonly sectionId: string;
  readonly totalMarksObtained: number;
  readonly totalMaxMarks: number;
  readonly percentage: number;
  readonly gradeLetter: string | null;
  readonly gradePoint: number | null;
  readonly status: ExamResultStatusValue;
  readonly isPassed: boolean;
  readonly computedAt: Date;
  readonly computedBy: string | null;
  readonly subjects: readonly ComputedSubjectInput[];
}

@Injectable()
export class ExamResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ExamResultRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findByStudent(
    examId: string,
    studentId: string,
    tx?: PrismaTx,
  ): Promise<ExamResultWithSubjects | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.examResult.findFirst({
      where: { schoolId, examId, studentId, deletedAt: null },
    });
    if (header === null) return null;
    const subjects = await reader.examSubjectResult.findMany({
      where: { schoolId, examResultId: header.id, deletedAt: null },
      orderBy: [{ subjectId: 'asc' }],
    });
    return {
      ...mapResult(header),
      subjects: subjects.map(mapSubjectResult),
    };
  }

  public async listByExam(
    examId: string,
    args: { readonly sectionId?: string; readonly studentId?: string },
    tx?: PrismaTx,
  ): Promise<readonly ExamResultWithSubjects[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, examId, deletedAt: null };
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.studentId !== undefined) where.studentId = args.studentId;
    const headers = await reader.examResult.findMany({
      where,
      orderBy: [{ studentId: 'asc' }],
    });
    if (headers.length === 0) return [];
    const ids = headers.map((h) => h.id);
    const subjects = await reader.examSubjectResult.findMany({
      where: { schoolId, examResultId: { in: ids }, deletedAt: null },
      orderBy: [{ subjectId: 'asc' }],
    });
    const byResult = new Map<string, ExamSubjectResultRow[]>();
    for (const s of subjects) {
      const arr = byResult.get(s.examResultId) ?? [];
      arr.push(mapSubjectResult(s));
      byResult.set(s.examResultId, arr);
    }
    return headers.map((h) => ({
      ...mapResult(h),
      subjects: byResult.get(h.id) ?? [],
    }));
  }

  /**
   * Replace all results for an exam — drops active rows then writes fresh.
   * Soft-deletes (deletedAt set) rather than hard delete to preserve audit.
   */
  public async replaceForExam(
    examId: string,
    rows: readonly ComputedResultInput[],
    tx?: PrismaTx,
  ): Promise<readonly ExamResultWithSubjects[]> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const now = new Date();

    // Find existing result IDs to soft-delete (and their subject children).
    const existing = await writer.examResult.findMany({
      where: { schoolId, examId, deletedAt: null },
      select: { id: true },
    });
    if (existing.length > 0) {
      const ids = existing.map((r) => r.id);
      await writer.examSubjectResult.updateMany({
        where: { schoolId, examResultId: { in: ids }, deletedAt: null },
        data: {
          deletedAt: now,
          deletedBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      await writer.examResult.updateMany({
        where: { schoolId, id: { in: ids }, deletedAt: null },
        data: {
          deletedAt: now,
          deletedBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
    }

    const out: ExamResultWithSubjects[] = [];
    for (const r of rows) {
      const created = await writer.examResult.create({
        data: {
          schoolId,
          examId,
          studentId: r.studentId,
          sectionId: r.sectionId,
          totalMarksObtained: r.totalMarksObtained,
          totalMaxMarks: r.totalMaxMarks,
          percentage: r.percentage,
          gradeLetter: r.gradeLetter,
          gradePoint: r.gradePoint,
          status: r.status,
          isPassed: r.isPassed,
          computedAt: r.computedAt,
          computedBy: r.computedBy,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      const subjectRows: ExamSubjectResultRow[] = [];
      for (const s of r.subjects) {
        const child = await writer.examSubjectResult.create({
          data: {
            schoolId,
            examResultId: created.id,
            subjectId: s.subjectId,
            marksObtained: s.marksObtained,
            maxMarks: s.maxMarks,
            percentage: s.percentage,
            isAbsent: s.isAbsent,
            isPassed: s.isPassed,
            gradeLetter: s.gradeLetter,
            gradePoint: s.gradePoint,
            createdBy: userId ?? null,
            updatedBy: userId ?? null,
          },
        });
        subjectRows.push(mapSubjectResult(child));
      }
      out.push({ ...mapResult(created), subjects: subjectRows });
    }
    return out;
  }
}

interface RawResult {
  id: string;
  schoolId: string;
  examId: string;
  studentId: string;
  sectionId: string;
  totalMarksObtained: unknown;
  totalMaxMarks: unknown;
  percentage: unknown;
  gradeLetter: string | null;
  gradePoint: unknown | null;
  status: ExamResultStatusValue;
  isPassed: boolean;
  computedAt: Date;
  computedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface RawSubjectResult {
  id: string;
  schoolId: string;
  examResultId: string;
  subjectId: string;
  marksObtained: unknown | null;
  maxMarks: unknown;
  percentage: unknown | null;
  isAbsent: boolean;
  isPassed: boolean;
  gradeLetter: string | null;
  gradePoint: unknown | null;
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

function mapResult(row: RawResult): ExamResultRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examId: row.examId,
    studentId: row.studentId,
    sectionId: row.sectionId,
    totalMarksObtained: toNumber(row.totalMarksObtained),
    totalMaxMarks: toNumber(row.totalMaxMarks),
    percentage: toNumber(row.percentage),
    gradeLetter: row.gradeLetter,
    gradePoint: row.gradePoint === null ? null : toNumber(row.gradePoint),
    status: row.status,
    isPassed: row.isPassed,
    computedAt: row.computedAt,
    computedBy: row.computedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapSubjectResult(row: RawSubjectResult): ExamSubjectResultRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examResultId: row.examResultId,
    subjectId: row.subjectId,
    marksObtained: row.marksObtained === null ? null : toNumber(row.marksObtained),
    maxMarks: toNumber(row.maxMarks),
    percentage: row.percentage === null ? null : toNumber(row.percentage),
    isAbsent: row.isAbsent,
    isPassed: row.isPassed,
    gradeLetter: row.gradeLetter,
    gradePoint: row.gradePoint === null ? null : toNumber(row.gradePoint),
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
