/**
 * EventDocumentRepository — persistence for `event_documents`.
 *
 * Soft-delete; no active-uniqueness index (multiple documents per event are
 * allowed). Composite FK to FileAsset via (schoolId, fileAssetId) handled at
 * the DB layer.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { EventDocumentTypeValue } from '../events.constants';
import type { EventDocumentRow } from '../events.types';

export interface CreateEventDocumentInput {
  readonly eventId: string;
  readonly fileAssetId: string;
  readonly documentType: EventDocumentTypeValue;
  readonly title: string;
  readonly description?: string | null;
  readonly isPublic?: boolean;
  readonly uploadedBy?: string | null;
}

export interface ListEventDocumentArgs {
  readonly eventId: string;
  readonly limit: number;
  readonly cursorId?: string;
  readonly documentType?: EventDocumentTypeValue;
}

@Injectable()
export class EventDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventDocumentRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<EventDocumentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.eventDocument.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListEventDocumentArgs, tx?: PrismaTx): Promise<{
    readonly rows: readonly EventDocumentRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      eventId: args.eventId,
      deletedAt: null,
    };
    if (args.documentType !== undefined) where.documentType = args.documentType;
    const rows = await reader.eventDocument.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(
    input: CreateEventDocumentInput,
    tx?: PrismaTx,
  ): Promise<EventDocumentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.eventDocument.create({
      data: {
        schoolId,
        eventId: input.eventId,
        fileAssetId: input.fileAssetId,
        documentType: input.documentType,
        title: input.title,
        description: input.description ?? null,
        isPublic: input.isPublic ?? false,
        uploadedBy: input.uploadedBy ?? userId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventDocument.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventDocument', id, expectedVersion);
    }
  }
}

interface RawEventDocument {
  id: string;
  schoolId: string;
  eventId: string;
  fileAssetId: string;
  documentType: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawEventDocument): EventDocumentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    eventId: row.eventId,
    fileAssetId: row.fileAssetId,
    documentType: row.documentType as EventDocumentRow['documentType'],
    title: row.title,
    description: row.description,
    isPublic: row.isPublic,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
