/**
 * SyllabusRepository — persistence for `syllabi` + their nodes.
 *
 * Active-uniqueness on `(schoolId, academicYearId, classId, subjectId)`
 * enforced via STORED `deleted_at_key` partial unique. `completionPercent`
 * is denormalized; SyllabusService recomputes it inside the same tx as
 * any node-status change.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  SyllabusNodeStatusValue,
  SyllabusNodeTypeValue,
  SyllabusStatusValue,
} from '../academic-content.constants';
import type {
  SyllabusNodeRow,
  SyllabusRow,
} from '../academic-content.types';

export interface CreateSyllabusInput {
  readonly academicYearId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly plannedCompletionDate?: Date | null;
  readonly ownedByStaffId?: string | null;
}

export interface UpdateSyllabusInput {
  readonly status?: SyllabusStatusValue;
  readonly plannedCompletionDate?: Date | null;
  readonly actualCompletionDate?: Date | null;
  readonly completionPercent?: number;
  readonly ownedByStaffId?: string | null;
}

export interface ListSyllabusArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly subjectId?: string;
  readonly status?: SyllabusStatusValue;
  readonly ownedByStaffId?: string;
}

export interface CreateSyllabusNodeInput {
  readonly syllabusId: string;
  readonly parentNodeId?: string | null;
  readonly nodeType: SyllabusNodeTypeValue;
  readonly name: string;
  readonly sequence: number;
  readonly plannedCompletionDate?: Date | null;
}

export interface UpdateSyllabusNodeInput {
  readonly name?: string;
  readonly sequence?: number;
  readonly plannedCompletionDate?: Date | null;
  readonly actualCompletionDate?: Date | null;
  readonly status?: SyllabusNodeStatusValue;
  readonly completedByStaffId?: string | null;
}

@Injectable()
export class SyllabusRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('SyllabusRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  // -------- Syllabus header --------

  public async findById(id: string, tx?: PrismaTx): Promise<SyllabusRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.syllabus.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapSyllabus(row as unknown as RawSyllabus);
  }

  public async findActive(
    academicYearId: string,
    classId: string,
    subjectId: string,
    tx?: PrismaTx,
  ): Promise<SyllabusRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.syllabus.findFirst({
      where: {
        schoolId,
        academicYearId,
        classId,
        subjectId,
        deletedAt: null,
      },
    });
    return row === null ? null : mapSyllabus(row as unknown as RawSyllabus);
  }

  public async list(
    args: ListSyllabusArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly SyllabusRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.classId !== undefined) where.classId = args.classId;
    if (args.subjectId !== undefined) where.subjectId = args.subjectId;
    if (args.status !== undefined) where.status = args.status;
    if (args.ownedByStaffId !== undefined) where.ownedByStaffId = args.ownedByStaffId;
    const rows = await reader.syllabus.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapSyllabus(r as unknown as RawSyllabus)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateSyllabusInput,
    tx?: PrismaTx,
  ): Promise<SyllabusRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.syllabus.create({
      data: {
        schoolId,
        academicYearId: input.academicYearId,
        classId: input.classId,
        subjectId: input.subjectId,
        plannedCompletionDate: input.plannedCompletionDate ?? null,
        ownedByStaffId: input.ownedByStaffId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapSyllabus(created as unknown as RawSyllabus);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateSyllabusInput,
    tx?: PrismaTx,
  ): Promise<SyllabusRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.status !== undefined) data.status = input.status;
    if (input.plannedCompletionDate !== undefined) {
      data.plannedCompletionDate = input.plannedCompletionDate;
    }
    if (input.actualCompletionDate !== undefined) {
      data.actualCompletionDate = input.actualCompletionDate;
    }
    if (input.completionPercent !== undefined) {
      data.completionPercent = input.completionPercent;
    }
    if (input.ownedByStaffId !== undefined) {
      data.ownedByStaffId = input.ownedByStaffId;
    }
    const result = await writer.syllabus.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Syllabus', id, expectedVersion);
    }
    const reloaded = await writer.syllabus.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Syllabus', id, expectedVersion);
    }
    return mapSyllabus(reloaded as unknown as RawSyllabus);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.syllabus.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Syllabus', id, expectedVersion);
    }
  }

  /**
   * Bypass-the-version internal counter recompute. Used by node-complete tx
   * to push the freshly-computed `completionPercent` (and possibly status)
   * onto the parent syllabus without forcing the caller to know the current
   * version. Increments version so any concurrent reader observes the change.
   */
  public async recomputeCompletion(
    id: string,
    completionPercent: number,
    status: SyllabusStatusValue,
    actualCompletionDate: Date | null,
    tx: PrismaTx,
  ): Promise<SyllabusRow | null> {
    const { schoolId, userId } = this.tenant();
    const result = await tx.syllabus.updateMany({
      where: { schoolId, id, deletedAt: null },
      data: {
        completionPercent,
        status,
        actualCompletionDate,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) return null;
    const reloaded = await tx.syllabus.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return reloaded === null
      ? null
      : mapSyllabus(reloaded as unknown as RawSyllabus);
  }

  // -------- Syllabus nodes --------

  public async findNodeById(
    id: string,
    tx?: PrismaTx,
  ): Promise<SyllabusNodeRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.syllabusNode.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapNode(row as unknown as RawNode);
  }

  public async listNodes(
    syllabusId: string,
    tx?: PrismaTx,
  ): Promise<readonly SyllabusNodeRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.syllabusNode.findMany({
      where: { schoolId, syllabusId, deletedAt: null },
      orderBy: [{ parentNodeId: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => mapNode(r as unknown as RawNode));
  }

  public async countTopics(
    syllabusId: string,
    tx?: PrismaTx,
  ): Promise<{ readonly total: number; readonly completed: number }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const [total, completed] = await Promise.all([
      reader.syllabusNode.count({
        where: { schoolId, syllabusId, nodeType: 'TOPIC', deletedAt: null },
      }),
      reader.syllabusNode.count({
        where: {
          schoolId,
          syllabusId,
          nodeType: 'TOPIC',
          status: 'COMPLETED',
          deletedAt: null,
        },
      }),
    ]);
    return { total, completed };
  }

  public async createNode(
    input: CreateSyllabusNodeInput,
    tx?: PrismaTx,
  ): Promise<SyllabusNodeRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.syllabusNode.create({
      data: {
        schoolId,
        syllabusId: input.syllabusId,
        parentNodeId: input.parentNodeId ?? null,
        nodeType: input.nodeType,
        name: input.name,
        sequence: input.sequence,
        plannedCompletionDate: input.plannedCompletionDate ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapNode(created as unknown as RawNode);
  }

  public async updateNode(
    id: string,
    expectedVersion: number,
    input: UpdateSyllabusNodeInput,
    tx?: PrismaTx,
  ): Promise<SyllabusNodeRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.sequence !== undefined) data.sequence = input.sequence;
    if (input.plannedCompletionDate !== undefined) {
      data.plannedCompletionDate = input.plannedCompletionDate;
    }
    if (input.actualCompletionDate !== undefined) {
      data.actualCompletionDate = input.actualCompletionDate;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.completedByStaffId !== undefined) {
      data.completedByStaffId = input.completedByStaffId;
    }
    const result = await writer.syllabusNode.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('SyllabusNode', id, expectedVersion);
    }
    const reloaded = await writer.syllabusNode.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('SyllabusNode', id, expectedVersion);
    }
    return mapNode(reloaded as unknown as RawNode);
  }

  public async softDeleteNode(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.syllabusNode.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('SyllabusNode', id, expectedVersion);
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------
interface RawSyllabus {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  status: string;
  plannedCompletionDate: Date | null;
  actualCompletionDate: Date | null;
  completionPercent: unknown;
  ownedByStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface RawNode {
  id: string;
  schoolId: string;
  syllabusId: string;
  parentNodeId: string | null;
  nodeType: string;
  name: string;
  sequence: number;
  plannedCompletionDate: Date | null;
  actualCompletionDate: Date | null;
  status: string;
  completedByStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function decimalToNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof (v as { toString?: () => string }).toString === 'function') {
    return Number((v as { toString: () => string }).toString());
  }
  return 0;
}

function mapSyllabus(row: RawSyllabus): SyllabusRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    classId: row.classId,
    subjectId: row.subjectId,
    status: row.status as SyllabusRow['status'],
    plannedCompletionDate: row.plannedCompletionDate,
    actualCompletionDate: row.actualCompletionDate,
    completionPercent: decimalToNumber(row.completionPercent),
    ownedByStaffId: row.ownedByStaffId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapNode(row: RawNode): SyllabusNodeRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    syllabusId: row.syllabusId,
    parentNodeId: row.parentNodeId,
    nodeType: row.nodeType as SyllabusNodeRow['nodeType'],
    name: row.name,
    sequence: row.sequence,
    plannedCompletionDate: row.plannedCompletionDate,
    actualCompletionDate: row.actualCompletionDate,
    status: row.status as SyllabusNodeRow['status'],
    completedByStaffId: row.completedByStaffId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
