/**
 * AssignmentAttachmentRepository — persistence for `assignment_attachments` rows.
 *
 * Soft-delete; no active-uniqueness index (multiple attachments per assignment
 * are allowed). Composite FK to FileAsset is single-column per files.prisma
 * convention (FileAsset is TENANT_SHARED_PLATFORM).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AttachmentTypeValue } from '../academic-content.constants';
import type { AssignmentAttachmentRow } from '../academic-content.types';

export interface CreateAssignmentAttachmentInput {
  readonly assignmentId: string;
  readonly fileAssetId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId?: string | null;
}

export interface ListAssignmentAttachmentArgs {
  readonly assignmentId: string;
  readonly limit: number;
  readonly cursorId?: string;
  readonly attachmentType?: AttachmentTypeValue;
}

@Injectable()
export class AssignmentAttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AssignmentAttachmentRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<AssignmentAttachmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.assignmentAttachment.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null
      ? null
      : mapRow(row as unknown as RawAssignmentAttachment);
  }

  public async list(
    args: ListAssignmentAttachmentArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly AssignmentAttachmentRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      assignmentId: args.assignmentId,
      deletedAt: null,
    };
    if (args.attachmentType !== undefined) where.attachmentType = args.attachmentType;
    const rows = await reader.assignmentAttachment.findMany({
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
      rows: rows.map((r) => mapRow(r as unknown as RawAssignmentAttachment)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateAssignmentAttachmentInput,
    tx?: PrismaTx,
  ): Promise<AssignmentAttachmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.assignmentAttachment.create({
      data: {
        schoolId,
        assignmentId: input.assignmentId,
        fileAssetId: input.fileAssetId,
        attachmentType: input.attachmentType,
        title: input.title,
        uploadedByStaffId: input.uploadedByStaffId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created as unknown as RawAssignmentAttachment);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.assignmentAttachment.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('AssignmentAttachment', id, expectedVersion);
    }
  }
}

interface RawAssignmentAttachment {
  id: string;
  schoolId: string;
  assignmentId: string;
  fileAssetId: string;
  attachmentType: string;
  title: string;
  uploadedByStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawAssignmentAttachment): AssignmentAttachmentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    assignmentId: row.assignmentId,
    fileAssetId: row.fileAssetId,
    attachmentType: row.attachmentType as AssignmentAttachmentRow['attachmentType'],
    title: row.title,
    uploadedByStaffId: row.uploadedByStaffId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
