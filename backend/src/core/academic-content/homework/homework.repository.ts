/**
 * HomeworkRepository — persistence for `homework` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. The service pre-checks for
 * duplicates to surface a friendlier domain error before tripping the
 * constraint.
 *
 * `attachmentCount` is maintained with raw `increment` updates inside the
 * calling transaction so HomeworkAttachmentService can keep it consistent
 * without an extra select.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ContentStatusValue,
  HomeworkPriorityValue,
} from '../academic-content.constants';
import type { HomeworkRow } from '../academic-content.types';

export interface CreateHomeworkInput {
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly instructions?: string | null;
  readonly academicYearId: string;
  readonly classId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly assignedByStaffId: string;
  readonly assignedDate: Date;
  readonly dueDate: Date;
  readonly priority?: HomeworkPriorityValue;
}

export interface UpdateHomeworkInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly instructions?: string | null;
  readonly assignedDate?: Date;
  readonly dueDate?: Date;
  readonly priority?: HomeworkPriorityValue;
}

export interface ListHomeworkArgs {
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
export class HomeworkRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('HomeworkRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<HomeworkRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.homework.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawHomework);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<HomeworkRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.homework.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawHomework);
  }

  public async list(
    args: ListHomeworkArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly HomeworkRow[];
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
    const rows = await reader.homework.findMany({
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
      rows: rows.map((r) => mapRow(r as unknown as RawHomework)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateHomeworkInput,
    tx?: PrismaTx,
  ): Promise<HomeworkRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.homework.create({
      data: {
        schoolId,
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        academicYearId: input.academicYearId,
        classId: input.classId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        assignedByStaffId: input.assignedByStaffId,
        assignedDate: input.assignedDate,
        dueDate: input.dueDate,
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created as unknown as RawHomework);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateHomeworkInput,
    tx?: PrismaTx,
  ): Promise<HomeworkRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.instructions !== undefined) data.instructions = input.instructions;
    if (input.assignedDate !== undefined) data.assignedDate = input.assignedDate;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;
    if (input.priority !== undefined) data.priority = input.priority;
    const result = await writer.homework.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Homework', id, expectedVersion);
    }
    const reloaded = await writer.homework.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Homework', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawHomework);
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
  ): Promise<HomeworkRow> {
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
    const result = await writer.homework.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Homework', id, expectedVersion);
    }
    const reloaded = await writer.homework.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Homework', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawHomework);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.homework.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Homework', id, expectedVersion);
    }
  }

  /**
   * Atomically increment `attachmentCount`. Returns rows updated (1 = success).
   */
  public async bumpAttachmentCount(
    id: string,
    delta: number,
    tx?: PrismaTx,
  ): Promise<number> {
    if (delta === 0) return 0;
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    const result = await writer.homework.updateMany({
      where: { schoolId, id, deletedAt: null },
      data: { attachmentCount: { increment: delta } },
    });
    return result.count;
  }
}

interface RawHomework {
  id: string;
  schoolId: string;
  code: string;
  title: string;
  description: string | null;
  instructions: string | null;
  academicYearId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  assignedByStaffId: string;
  assignedDate: Date;
  dueDate: Date;
  priority: string;
  status: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  attachmentCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawHomework): HomeworkRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    academicYearId: row.academicYearId,
    classId: row.classId,
    sectionId: row.sectionId,
    subjectId: row.subjectId,
    assignedByStaffId: row.assignedByStaffId,
    assignedDate: row.assignedDate,
    dueDate: row.dueDate,
    priority: row.priority as HomeworkRow['priority'],
    status: row.status as HomeworkRow['status'],
    publishedAt: row.publishedAt,
    closedAt: row.closedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    attachmentCount: row.attachmentCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
