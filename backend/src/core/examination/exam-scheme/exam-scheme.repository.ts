/**
 * ExamSchemeRepository — persistence for `exam_schemes` and child
 * `exam_scheme_bands` rows.
 *
 * Header is soft-deleted; bands cascade and are replaced wholesale on
 * scheme update (no soft-delete on band rows — they're managed by the
 * parent scheme update).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ExamSchemeBandRow,
  ExamSchemeRow,
  ExamSchemeWithBands,
} from '../examination.types';

export interface CreateExamSchemeBandInput {
  readonly gradeLetter: string;
  readonly gradePoint?: number | null;
  readonly minPct: number;
  readonly maxPct: number;
  readonly ordering: number;
}

export interface CreateExamSchemeInput {
  readonly name: string;
  readonly boardType?: string | null;
  readonly passingPct: number;
  readonly marksEditWindowDays: number;
  readonly description?: string | null;
  readonly bands: readonly CreateExamSchemeBandInput[];
}

export interface UpdateExamSchemeInput {
  readonly name?: string;
  readonly boardType?: string | null;
  readonly passingPct?: number;
  readonly marksEditWindowDays?: number;
  readonly description?: string | null;
}

export interface ListExamSchemeArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly nameContains?: string;
}

@Injectable()
export class ExamSchemeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ExamSchemeRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<ExamSchemeWithBands | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.examScheme.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (header === null) return null;
    const bands = await reader.examSchemeBand.findMany({
      where: { schoolId, examSchemeId: id },
      orderBy: [{ ordering: 'asc' }],
    });
    return {
      ...mapHeader(header),
      bands: bands.map(mapBand),
    };
  }

  public async findActiveByName(
    name: string,
    tx?: PrismaTx,
  ): Promise<ExamSchemeRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.examScheme.findFirst({
      where: { schoolId, name, deletedAt: null },
    });
    return row === null ? null : mapHeader(row);
  }

  public async list(
    args: ListExamSchemeArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ExamSchemeWithBands[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.nameContains !== undefined && args.nameContains.length > 0) {
      where.name = { contains: args.nameContains };
    }
    const headers = await reader.examScheme.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      headers.length > args.limit ? (headers.pop()?.id ?? null) : null;
    if (headers.length === 0) return { rows: [], nextCursorId };
    const ids = headers.map((h) => h.id);
    const bands = await reader.examSchemeBand.findMany({
      where: { schoolId, examSchemeId: { in: ids } },
      orderBy: [{ ordering: 'asc' }],
    });
    const byScheme = new Map<string, ExamSchemeBandRow[]>();
    for (const b of bands) {
      const arr = byScheme.get(b.examSchemeId) ?? [];
      arr.push(mapBand(b));
      byScheme.set(b.examSchemeId, arr);
    }
    const rows = headers.map((h) => ({
      ...mapHeader(h),
      bands: byScheme.get(h.id) ?? [],
    }));
    return { rows, nextCursorId };
  }

  public async create(
    input: CreateExamSchemeInput,
    tx?: PrismaTx,
  ): Promise<ExamSchemeWithBands> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const header = await writer.examScheme.create({
      data: {
        schoolId,
        name: input.name,
        boardType: input.boardType ?? null,
        passingPct: input.passingPct,
        marksEditWindowDays: input.marksEditWindowDays,
        description: input.description ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    const bandRows: ExamSchemeBandRow[] = [];
    for (const b of input.bands) {
      const created = await writer.examSchemeBand.create({
        data: {
          schoolId,
          examSchemeId: header.id,
          gradeLetter: b.gradeLetter,
          gradePoint: b.gradePoint ?? null,
          minPct: b.minPct,
          maxPct: b.maxPct,
          ordering: b.ordering,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      bandRows.push(mapBand(created));
    }
    return { ...mapHeader(header), bands: bandRows };
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateExamSchemeInput,
    tx?: PrismaTx,
  ): Promise<ExamSchemeRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.boardType !== undefined) data.boardType = input.boardType;
    if (input.passingPct !== undefined) data.passingPct = input.passingPct;
    if (input.marksEditWindowDays !== undefined) {
      data.marksEditWindowDays = input.marksEditWindowDays;
    }
    if (input.description !== undefined) data.description = input.description;
    const result = await writer.examScheme.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ExamScheme', id, expectedVersion);
    }
    const reloaded = await writer.examScheme.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ExamScheme', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  public async replaceBands(
    schemeId: string,
    bands: readonly CreateExamSchemeBandInput[],
    tx?: PrismaTx,
  ): Promise<readonly ExamSchemeBandRow[]> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.examSchemeBand.deleteMany({
      where: { schoolId, examSchemeId: schemeId },
    });
    const out: ExamSchemeBandRow[] = [];
    for (const b of bands) {
      const created = await writer.examSchemeBand.create({
        data: {
          schoolId,
          examSchemeId: schemeId,
          gradeLetter: b.gradeLetter,
          gradePoint: b.gradePoint ?? null,
          minPct: b.minPct,
          maxPct: b.maxPct,
          ordering: b.ordering,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      out.push(mapBand(created));
    }
    return out;
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.examScheme.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ExamScheme', id, expectedVersion);
    }
  }

  /** First exam (non-archived) referencing this scheme, or null. */
  public async findReferencingExam(
    schemeId: string,
    tx?: PrismaTx,
  ): Promise<{ id: string } | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.exam.findFirst({
      where: {
        schoolId,
        examSchemeId: schemeId,
        deletedAt: null,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
    return row === null ? null : { id: row.id };
  }
}

interface RawScheme {
  id: string;
  schoolId: string;
  name: string;
  boardType: string | null;
  passingPct: unknown;
  marksEditWindowDays: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface RawBand {
  id: string;
  schoolId: string;
  examSchemeId: string;
  gradeLetter: string;
  gradePoint: unknown | null;
  minPct: unknown;
  maxPct: unknown;
  ordering: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
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

function mapHeader(row: RawScheme): ExamSchemeRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    boardType: row.boardType,
    passingPct: toNumber(row.passingPct),
    marksEditWindowDays: row.marksEditWindowDays,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapBand(row: RawBand): ExamSchemeBandRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examSchemeId: row.examSchemeId,
    gradeLetter: row.gradeLetter,
    gradePoint: row.gradePoint === null ? null : toNumber(row.gradePoint),
    minPct: toNumber(row.minPct),
    maxPct: toNumber(row.maxPct),
    ordering: row.ordering,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

export const __test__ = { toNumber };
