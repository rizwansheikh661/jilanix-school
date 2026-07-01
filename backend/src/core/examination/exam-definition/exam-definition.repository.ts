/**
 * ExamDefinitionRepository — persistence for `exams`, `exam_class_maps`,
 * and `exam_section_maps`. The maps are managed by the parent Exam:
 * provided at create and replaced wholesale on update.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ExamStatusValue,
  ExamTypeValue,
} from '../examination.constants';
import type {
  ExamRow,
  ExamWithMaps,
} from '../examination.types';

export interface CreateExamInput {
  readonly branchId: string | null;
  readonly academicYearId: string;
  readonly academicTermId: string | null;
  readonly examSchemeId: string;
  readonly name: string;
  readonly type: ExamTypeValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly defaultMaxMarks: number;
  readonly defaultPassMarks: number;
  readonly description: string | null;
  readonly classIds: readonly string[];
  readonly sectionIds: readonly string[];
}

export interface UpdateExamHeaderInput {
  readonly branchId?: string | null;
  readonly academicTermId?: string | null;
  readonly examSchemeId?: string;
  readonly name?: string;
  readonly type?: ExamTypeValue;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly defaultMaxMarks?: number;
  readonly defaultPassMarks?: number;
  readonly description?: string | null;
}

export interface ListExamArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly academicYearId?: string;
  readonly academicTermId?: string;
  readonly type?: ExamTypeValue;
  readonly status?: ExamStatusValue;
}

@Injectable()
export class ExamDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ExamDefinitionRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<ExamWithMaps | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.exam.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (header === null) return null;
    const [classMaps, sectionMaps] = await Promise.all([
      reader.examClassMap.findMany({ where: { schoolId, examId: id } }),
      reader.examSectionMap.findMany({ where: { schoolId, examId: id } }),
    ]);
    return {
      ...mapHeader(header),
      classIds: classMaps.map((m: { classId: string }) => m.classId),
      sectionIds: sectionMaps.map((m: { sectionId: string }) => m.sectionId),
    };
  }

  public async findActiveByYearName(
    academicYearId: string,
    name: string,
    tx?: PrismaTx,
  ): Promise<ExamRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.exam.findFirst({
      where: { schoolId, academicYearId, name, deletedAt: null },
    });
    return row === null ? null : mapHeader(row);
  }

  public async list(
    args: ListExamArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ExamWithMaps[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.academicTermId !== undefined) where.academicTermId = args.academicTermId;
    if (args.type !== undefined) where.type = args.type;
    if (args.status !== undefined) where.status = args.status;
    const headers = await reader.exam.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      headers.length > args.limit ? (headers.pop()?.id ?? null) : null;
    if (headers.length === 0) return { rows: [], nextCursorId };
    const ids = headers.map((h) => h.id);
    const [classMaps, sectionMaps] = await Promise.all([
      reader.examClassMap.findMany({ where: { schoolId, examId: { in: ids } } }),
      reader.examSectionMap.findMany({ where: { schoolId, examId: { in: ids } } }),
    ]);
    const classByExam = new Map<string, string[]>();
    for (const m of classMaps) {
      const arr = classByExam.get(m.examId) ?? [];
      arr.push(m.classId);
      classByExam.set(m.examId, arr);
    }
    const sectionByExam = new Map<string, string[]>();
    for (const m of sectionMaps) {
      const arr = sectionByExam.get(m.examId) ?? [];
      arr.push(m.sectionId);
      sectionByExam.set(m.examId, arr);
    }
    const rows = headers.map((h) => ({
      ...mapHeader(h),
      classIds: classByExam.get(h.id) ?? [],
      sectionIds: sectionByExam.get(h.id) ?? [],
    }));
    return { rows, nextCursorId };
  }

  public async create(input: CreateExamInput, tx?: PrismaTx): Promise<ExamWithMaps> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const header = await writer.exam.create({
      data: {
        schoolId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        academicTermId: input.academicTermId,
        examSchemeId: input.examSchemeId,
        name: input.name,
        type: input.type,
        status: 'DRAFT',
        startDate: input.startDate,
        endDate: input.endDate,
        defaultMaxMarks: input.defaultMaxMarks,
        defaultPassMarks: input.defaultPassMarks,
        description: input.description,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    for (const classId of input.classIds) {
      await writer.examClassMap.create({
        data: {
          schoolId,
          examId: header.id,
          classId,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
    }
    for (const sectionId of input.sectionIds) {
      await writer.examSectionMap.create({
        data: {
          schoolId,
          examId: header.id,
          sectionId,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
    }
    return {
      ...mapHeader(header),
      classIds: [...input.classIds],
      sectionIds: [...input.sectionIds],
    };
  }

  public async updateHeader(
    id: string,
    expectedVersion: number,
    input: UpdateExamHeaderInput,
    tx?: PrismaTx,
  ): Promise<ExamRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.branchId !== undefined) data.branchId = input.branchId;
    if (input.academicTermId !== undefined) data.academicTermId = input.academicTermId;
    if (input.examSchemeId !== undefined) data.examSchemeId = input.examSchemeId;
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.defaultMaxMarks !== undefined) data.defaultMaxMarks = input.defaultMaxMarks;
    if (input.defaultPassMarks !== undefined) data.defaultPassMarks = input.defaultPassMarks;
    if (input.description !== undefined) data.description = input.description;
    const result = await writer.exam.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Exam', id, expectedVersion);
    }
    const reloaded = await writer.exam.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Exam', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  public async replaceClassMaps(
    examId: string,
    classIds: readonly string[],
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.examClassMap.deleteMany({ where: { schoolId, examId } });
    for (const classId of classIds) {
      await writer.examClassMap.create({
        data: {
          schoolId,
          examId,
          classId,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
    }
  }

  public async replaceSectionMaps(
    examId: string,
    sectionIds: readonly string[],
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.examSectionMap.deleteMany({ where: { schoolId, examId } });
    for (const sectionId of sectionIds) {
      await writer.examSectionMap.create({
        data: {
          schoolId,
          examId,
          sectionId,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
    }
  }

  public async setStatus(
    id: string,
    expectedVersion: number,
    status: ExamStatusValue,
    timestamps: { publishedAt?: Date; archivedAt?: Date },
    tx?: PrismaTx,
  ): Promise<ExamRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (timestamps.publishedAt !== undefined) data.publishedAt = timestamps.publishedAt;
    if (timestamps.archivedAt !== undefined) data.archivedAt = timestamps.archivedAt;
    const result = await writer.exam.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Exam', id, expectedVersion);
    }
    const reloaded = await writer.exam.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Exam', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.exam.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Exam', id, expectedVersion);
    }
  }

  /** Validate that the supplied sectionIds all belong to this tenant. */
  public async findSectionBranches(
    sectionIds: readonly string[],
    tx?: PrismaTx,
  ): Promise<readonly { id: string; branchId: string; classId: string }[]> {
    if (sectionIds.length === 0) return [];
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const sections = await reader.section.findMany({
      where: { schoolId, id: { in: [...sectionIds] }, deletedAt: null },
      select: { id: true, classId: true },
    });
    if (sections.length !== sectionIds.length) {
      // Caller decides whether to error; we return what we found.
      return sections.map((s) => ({ id: s.id, classId: s.classId, branchId: '' }));
    }
    const classIds = Array.from(new Set(sections.map((s) => s.classId)));
    // We don't currently have a branch_id column on Section in the schema —
    // branch derivation is via Class? No. Class also lacks branchId. So
    // we can't derive a section -> branch lookup here. Return null branchId.
    void classIds;
    return sections.map((s) => ({ id: s.id, classId: s.classId, branchId: '' }));
  }

  public async validateClassIds(
    classIds: readonly string[],
    tx?: PrismaTx,
  ): Promise<readonly string[]> {
    if (classIds.length === 0) return [];
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.class.findMany({
      where: { schoolId, id: { in: [...classIds] }, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  public async validateSectionIds(
    sectionIds: readonly string[],
    tx?: PrismaTx,
  ): Promise<readonly string[]> {
    if (sectionIds.length === 0) return [];
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.section.findMany({
      where: { schoolId, id: { in: [...sectionIds] }, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

interface RawExam {
  id: string;
  schoolId: string;
  branchId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  examSchemeId: string;
  name: string;
  type: ExamTypeValue;
  status: ExamStatusValue;
  startDate: Date;
  endDate: Date;
  defaultMaxMarks: unknown;
  defaultPassMarks: unknown;
  description: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
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

function mapHeader(row: RawExam): ExamRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    examSchemeId: row.examSchemeId,
    name: row.name,
    type: row.type,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    defaultMaxMarks: toNumber(row.defaultMaxMarks),
    defaultPassMarks: toNumber(row.defaultPassMarks),
    description: row.description,
    publishedAt: row.publishedAt,
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
