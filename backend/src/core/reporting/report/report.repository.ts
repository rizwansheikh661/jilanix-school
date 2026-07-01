/**
 * ReportRunRepository — persistence for `report_runs` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. updateStatus is a guarded
 * `updateMany` so cancel/lifecycle races short-circuit via VersionConflictError.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ReportFormatValue,
  ReportKindValue,
  ReportRunStatusValue,
} from '../reporting.constants';
import type { ReportRunRow } from '../reporting.types';

export interface CreateReportRunInput {
  readonly code: string;
  readonly kind: ReportKindValue;
  readonly format: ReportFormatValue;
  readonly params: Record<string, unknown>;
  readonly requestedByUserId: string;
}

export interface UpdateReportRunStatusInput {
  readonly status: ReportRunStatusValue;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
  readonly errorMessage?: string | null;
  readonly fileAssetId?: string | null;
  readonly rowCount?: number;
  readonly queuedJobId?: string | null;
}

export interface ListReportRunsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: ReportRunStatusValue;
  readonly kind?: ReportKindValue;
  readonly requestedByUserId?: string;
  readonly requestedFrom?: Date;
  readonly requestedTo?: Date;
}

@Injectable()
export class ReportRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ReportRunRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<ReportRunRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.reportRun.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawReportRun);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<ReportRunRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.reportRun.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawReportRun);
  }

  public async list(
    args: ListReportRunsArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ReportRunRow[];
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
    if (args.requestedFrom !== undefined || args.requestedTo !== undefined) {
      const range: Record<string, Date> = {};
      if (args.requestedFrom !== undefined) range.gte = args.requestedFrom;
      if (args.requestedTo !== undefined) range.lte = args.requestedTo;
      where.requestedAt = range;
    }
    const rows = await reader.reportRun.findMany({
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
      rows: rows.map((r) => mapRow(r as unknown as RawReportRun)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateReportRunInput,
    tx?: PrismaTx,
  ): Promise<ReportRunRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.reportRun.create({
      data: {
        schoolId,
        code: input.code,
        kind: input.kind,
        format: input.format,
        params: input.params as Prisma.InputJsonValue,
        requestedByUserId: input.requestedByUserId,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created as unknown as RawReportRun);
  }

  public async updateStatus(
    id: string,
    expectedVersion: number,
    patch: UpdateReportRunStatusInput,
    tx?: PrismaTx,
  ): Promise<ReportRunRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status: patch.status,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.endedAt !== undefined) data.endedAt = patch.endedAt;
    if (patch.errorMessage !== undefined) data.errorMessage = patch.errorMessage;
    if (patch.fileAssetId !== undefined) data.fileAssetId = patch.fileAssetId;
    if (patch.rowCount !== undefined) data.rowCount = patch.rowCount;
    if (patch.queuedJobId !== undefined) data.queuedJobId = patch.queuedJobId;
    const result = await writer.reportRun.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportRun', id, expectedVersion);
    }
    const reloaded = await writer.reportRun.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ReportRun', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawReportRun);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.reportRun.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportRun', id, expectedVersion);
    }
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
    await writer.reportRun.updateMany({
      where: { schoolId, id, deletedAt: null },
      data: { queuedJobId },
    });
  }
}

interface RawReportRun {
  id: string;
  schoolId: string;
  code: string;
  kind: string;
  format: string;
  status: string;
  requestedByUserId: string;
  requestedAt: Date;
  params: unknown;
  queuedJobId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  errorMessage: string | null;
  fileAssetId: string | null;
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawReportRun): ReportRunRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    kind: row.kind as ReportRunRow['kind'],
    format: row.format as ReportRunRow['format'],
    status: row.status as ReportRunRow['status'],
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt,
    params: (row.params ?? {}) as Record<string, unknown>,
    queuedJobId: row.queuedJobId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    errorMessage: row.errorMessage,
    fileAssetId: row.fileAssetId,
    rowCount: row.rowCount,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
