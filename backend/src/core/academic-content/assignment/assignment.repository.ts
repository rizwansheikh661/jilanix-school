/**
 * AssignmentRepository — persistence for `assignment` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced via STORED
 * `deleted_at_key` partial unique. Counter fields (`submissionCount`,
 * `evaluatedCount`, `lateCount`) are maintained with `increment` updates inside
 * the calling tx so the submission service can keep them consistent without
 * an extra select.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ContentStatusValue } from '../academic-content.constants';
import type { AssignmentRow } from '../academic-content.types';

export interface CreateAssignmentInput {
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly academicYearId: string;
  readonly classId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly assignedByStaffId: string;
  readonly assignedDate: Date;
  readonly dueDate: Date;
  readonly maxMarks: number;
  readonly passingMarks: number;
}

export interface UpdateAssignmentInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly assignedDate?: Date;
  readonly dueDate?: Date;
  readonly maxMarks?: number;
  readonly passingMarks?: number;
}

export interface ListAssignmentArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: ContentStatusValue;
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly subjectId?: string;
  readonly assignedByStaffId?: string;
  readonly dueFrom?: Date;
  readonly dueTo?: Date;
}

@Injectable()
export class AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AssignmentRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<AssignmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.assignment.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawAssignment);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<AssignmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.assignment.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawAssignment);
  }

  public async list(
    args: ListAssignmentArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly AssignmentRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.status !== undefined) where.status = args.status;
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.classId !== undefined) where.classId = args.classId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.subjectId !== undefined) where.subjectId = args.subjectId;
    if (args.assignedByStaffId !== undefined) {
      where.assignedByStaffId = args.assignedByStaffId;
    }
    if (args.dueFrom !== undefined || args.dueTo !== undefined) {
      const range: Record<string, Date> = {};
      if (args.dueFrom !== undefined) range.gte = args.dueFrom;
      if (args.dueTo !== undefined) range.lte = args.dueTo;
      where.dueDate = range;
    }
    const rows = await reader.assignment.findMany({
      where,
      orderBy: [{ dueDate: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawAssignment)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateAssignmentInput,
    tx?: PrismaTx,
  ): Promise<AssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.assignment.create({
      data: {
        schoolId,
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        academicYearId: input.academicYearId,
        classId: input.classId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        assignedByStaffId: input.assignedByStaffId,
        assignedDate: input.assignedDate,
        dueDate: input.dueDate,
        maxMarks: input.maxMarks,
        passingMarks: input.passingMarks,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created as unknown as RawAssignment);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateAssignmentInput,
    tx?: PrismaTx,
  ): Promise<AssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.assignedDate !== undefined) data.assignedDate = input.assignedDate;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;
    if (input.maxMarks !== undefined) data.maxMarks = input.maxMarks;
    if (input.passingMarks !== undefined) data.passingMarks = input.passingMarks;
    const result = await writer.assignment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Assignment', id, expectedVersion);
    }
    const reloaded = await writer.assignment.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Assignment', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawAssignment);
  }

  public async patchStatus(
    id: string,
    expectedVersion: number,
    patch: {
      readonly status: ContentStatusValue;
      readonly publishedAt?: Date;
      readonly closedAt?: Date;
      readonly cancelledAt?: Date;
      readonly cancellationReason?: string | null;
    },
    tx?: PrismaTx,
  ): Promise<AssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status: patch.status,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.closedAt !== undefined) data.closedAt = patch.closedAt;
    if (patch.cancelledAt !== undefined) data.cancelledAt = patch.cancelledAt;
    if (patch.cancellationReason !== undefined) {
      data.cancellationReason = patch.cancellationReason;
    }
    const result = await writer.assignment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Assignment', id, expectedVersion);
    }
    const reloaded = await writer.assignment.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Assignment', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawAssignment);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.assignment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Assignment', id, expectedVersion);
    }
  }

  /**
   * Atomically bump submission / evaluated / late counters. Pass a positive
   * or negative delta. Returns the number of rows updated (1 = success).
   */
  public async bumpCounters(
    id: string,
    delta: {
      readonly submission?: number;
      readonly evaluated?: number;
      readonly late?: number;
    },
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    const data: Record<string, unknown> = {};
    if (delta.submission !== undefined && delta.submission !== 0) {
      data.submissionCount = { increment: delta.submission };
    }
    if (delta.evaluated !== undefined && delta.evaluated !== 0) {
      data.evaluatedCount = { increment: delta.evaluated };
    }
    if (delta.late !== undefined && delta.late !== 0) {
      data.lateCount = { increment: delta.late };
    }
    if (Object.keys(data).length === 0) return 0;
    const result = await writer.assignment.updateMany({
      where: { schoolId, id, deletedAt: null },
      data,
    });
    return result.count;
  }
}

interface RawAssignment {
  id: string;
  schoolId: string;
  code: string;
  title: string;
  description: string | null;
  academicYearId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  assignedByStaffId: string;
  assignedDate: Date;
  dueDate: Date;
  maxMarks: unknown;
  passingMarks: unknown;
  status: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  submissionCount: number;
  evaluatedCount: number;
  lateCount: number;
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

function mapRow(row: RawAssignment): AssignmentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    title: row.title,
    description: row.description,
    academicYearId: row.academicYearId,
    classId: row.classId,
    sectionId: row.sectionId,
    subjectId: row.subjectId,
    assignedByStaffId: row.assignedByStaffId,
    assignedDate: row.assignedDate,
    dueDate: row.dueDate,
    maxMarks: decimalToNumber(row.maxMarks),
    passingMarks: decimalToNumber(row.passingMarks),
    status: row.status as AssignmentRow['status'],
    publishedAt: row.publishedAt,
    closedAt: row.closedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    submissionCount: row.submissionCount,
    evaluatedCount: row.evaluatedCount,
    lateCount: row.lateCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
