/**
 * ImportJobRepository — persistence for `import_jobs` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. updateStatus is a guarded
 * `updateMany` so cancel/lifecycle races short-circuit via
 * VersionConflictError.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ImportJobStatusValue,
  ImportKindValue,
} from '../reporting.constants';
import type { ImportJobRow } from '../reporting.types';

export interface CreateImportJobInput {
  readonly code: string;
  readonly kind: ImportKindValue;
  readonly sourceFileAssetId: string;
  readonly options: Record<string, unknown>;
}

export interface UpdateImportJobStatusInput {
  readonly status?: ImportJobStatusValue;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
  readonly errorMessage?: string | null;
  readonly queuedJobId?: string | null;
  readonly totalRows?: number;
  readonly validRows?: number;
  readonly errorRows?: number;
  readonly committedRows?: number;
}

export interface ListImportJobsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: ImportJobStatusValue;
  readonly kind?: ImportKindValue;
  readonly requestedByUserId?: string;
}

@Injectable()
export class ImportJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ImportJobRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<ImportJobRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.importJob.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawImportJob);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<ImportJobRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.importJob.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawImportJob);
  }

  public async list(
    args: ListImportJobsArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ImportJobRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.status !== undefined) where.status = args.status;
    if (args.kind !== undefined) where.kind = args.kind;
    if (args.requestedByUserId !== undefined) {
      where.requestedByUserId = args.requestedByUserId;
    }
    const rows = await reader.importJob.findMany({
      where,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawImportJob)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateImportJobInput,
    tx?: PrismaTx,
  ): Promise<ImportJobRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    if (userId === undefined) {
      throw new Error('ImportJobRepository.create requires an authenticated user.');
    }
    const created = await writer.importJob.create({
      data: {
        schoolId,
        code: input.code,
        kind: input.kind,
        sourceFileAssetId: input.sourceFileAssetId,
        options: input.options as Prisma.InputJsonValue,
        requestedByUserId: userId,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return mapRow(created as unknown as RawImportJob);
  }

  public async updateStatus(
    id: string,
    expectedVersion: number,
    patch: UpdateImportJobStatusInput,
    tx?: PrismaTx,
  ): Promise<ImportJobRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.endedAt !== undefined) data.endedAt = patch.endedAt;
    if (patch.errorMessage !== undefined) data.errorMessage = patch.errorMessage;
    if (patch.queuedJobId !== undefined) data.queuedJobId = patch.queuedJobId;
    if (patch.totalRows !== undefined) data.totalRows = patch.totalRows;
    if (patch.validRows !== undefined) data.validRows = patch.validRows;
    if (patch.errorRows !== undefined) data.errorRows = patch.errorRows;
    if (patch.committedRows !== undefined) data.committedRows = patch.committedRows;

    const result = await writer.importJob.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ImportJob', id, expectedVersion);
    }
    const reloaded = await writer.importJob.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ImportJob', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawImportJob);
  }

  /** Stamps queuedJobId on a freshly created row WITHOUT bumping version,
   *  so the caller can hand the as-created version back to the client. */
  public async bumpQueuedJobId(
    id: string,
    queuedJobId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    await writer.importJob.updateMany({
      where: { schoolId, id, deletedAt: null },
      data: { queuedJobId },
    });
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.importJob.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ImportJob', id, expectedVersion);
    }
  }
}

interface RawImportJob {
  id: string;
  schoolId: string;
  code: string;
  kind: string;
  status: string;
  requestedByUserId: string;
  requestedAt: Date;
  sourceFileAssetId: string;
  options: unknown;
  queuedJobId: string | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  committedRows: number;
  startedAt: Date | null;
  endedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawImportJob): ImportJobRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    kind: row.kind as ImportJobRow['kind'],
    status: row.status as ImportJobRow['status'],
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt,
    sourceFileAssetId: row.sourceFileAssetId,
    options: (row.options ?? {}) as Record<string, unknown>,
    queuedJobId: row.queuedJobId,
    totalRows: row.totalRows,
    validRows: row.validRows,
    errorRows: row.errorRows,
    committedRows: row.committedRows,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    errorMessage: row.errorMessage,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
