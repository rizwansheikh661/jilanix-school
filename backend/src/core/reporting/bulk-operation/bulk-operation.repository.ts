/**
 * BulkOperationRepository — persistence for `bulk_operations` rows.
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
  BulkOperationKindValue,
  BulkOperationModeValue,
  BulkOperationStatusValue,
} from '../reporting.constants';
import type { BulkOperationRow } from '../reporting.types';

export interface CreateBulkOperationInput {
  readonly code: string;
  readonly kind: BulkOperationKindValue;
  readonly mode: BulkOperationModeValue;
  readonly status: BulkOperationStatusValue;
  readonly params: Record<string, unknown>;
  readonly targetCount?: number;
  readonly startedAt?: Date | null;
  readonly previewResult?: Record<string, unknown> | null;
  readonly validationResult?: Record<string, unknown> | null;
}

export interface UpdateBulkOperationStatusInput {
  readonly status?: BulkOperationStatusValue;
  readonly startedAt?: Date | null;
  readonly endedAt?: Date | null;
  readonly errorMessage?: string | null;
  readonly queuedJobId?: string | null;
  readonly targetCount?: number;
  readonly processedCount?: number;
  readonly succeededCount?: number;
  readonly failedCount?: number;
  readonly previewResult?: Record<string, unknown> | null;
  readonly validationResult?: Record<string, unknown> | null;
}

export interface ListBulkOperationsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: BulkOperationStatusValue;
  readonly kind?: BulkOperationKindValue;
  readonly requestedByUserId?: string;
}

@Injectable()
export class BulkOperationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('BulkOperationRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<BulkOperationRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.bulkOperation.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawBulkOperation);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<BulkOperationRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.bulkOperation.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawBulkOperation);
  }

  public async list(
    args: ListBulkOperationsArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly BulkOperationRow[];
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
    const rows = await reader.bulkOperation.findMany({
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
      rows: rows.map((r) => mapRow(r as unknown as RawBulkOperation)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateBulkOperationInput,
    tx?: PrismaTx,
  ): Promise<BulkOperationRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    if (userId === undefined) {
      throw new Error(
        'BulkOperationRepository.create requires an authenticated user.',
      );
    }
    const data: Record<string, unknown> = {
      schoolId,
      code: input.code,
      kind: input.kind,
      mode: input.mode,
      status: input.status,
      params: input.params as Prisma.InputJsonValue,
      requestedByUserId: userId,
      createdBy: userId,
      updatedBy: userId,
    };
    if (input.targetCount !== undefined) data.targetCount = input.targetCount;
    if (input.startedAt !== undefined && input.startedAt !== null) {
      data.startedAt = input.startedAt;
    }
    if (input.previewResult !== undefined && input.previewResult !== null) {
      data.previewResult = input.previewResult as Prisma.InputJsonValue;
    }
    if (input.validationResult !== undefined && input.validationResult !== null) {
      data.validationResult = input.validationResult as Prisma.InputJsonValue;
    }
    const created = await writer.bulkOperation.create({
      data: data as unknown as Prisma.BulkOperationUncheckedCreateInput,
    });
    return mapRow(created as unknown as RawBulkOperation);
  }

  public async updateStatus(
    id: string,
    expectedVersion: number,
    patch: UpdateBulkOperationStatusInput,
    tx?: PrismaTx,
  ): Promise<BulkOperationRow> {
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
    if (patch.targetCount !== undefined) data.targetCount = patch.targetCount;
    if (patch.processedCount !== undefined) {
      data.processedCount = patch.processedCount;
    }
    if (patch.succeededCount !== undefined) {
      data.succeededCount = patch.succeededCount;
    }
    if (patch.failedCount !== undefined) data.failedCount = patch.failedCount;
    if (patch.previewResult !== undefined) {
      data.previewResult =
        patch.previewResult === null
          ? null
          : (patch.previewResult as Prisma.InputJsonValue);
    }
    if (patch.validationResult !== undefined) {
      data.validationResult =
        patch.validationResult === null
          ? null
          : (patch.validationResult as Prisma.InputJsonValue);
    }

    const result = await writer.bulkOperation.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('BulkOperation', id, expectedVersion);
    }
    const reloaded = await writer.bulkOperation.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('BulkOperation', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawBulkOperation);
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
    await writer.bulkOperation.updateMany({
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
    const result = await writer.bulkOperation.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('BulkOperation', id, expectedVersion);
    }
  }
}

interface RawBulkOperation {
  id: string;
  schoolId: string;
  code: string;
  kind: string;
  mode: string;
  status: string;
  requestedByUserId: string;
  requestedAt: Date;
  params: unknown;
  queuedJobId: string | null;
  targetCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  previewResult: unknown;
  validationResult: unknown;
  startedAt: Date | null;
  endedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawBulkOperation): BulkOperationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    kind: row.kind as BulkOperationRow['kind'],
    mode: row.mode as BulkOperationRow['mode'],
    status: row.status as BulkOperationRow['status'],
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt,
    params: (row.params ?? {}) as Record<string, unknown>,
    queuedJobId: row.queuedJobId,
    targetCount: row.targetCount,
    processedCount: row.processedCount,
    succeededCount: row.succeededCount,
    failedCount: row.failedCount,
    previewResult:
      row.previewResult === null || row.previewResult === undefined
        ? null
        : (row.previewResult as Record<string, unknown>),
    validationResult:
      row.validationResult === null || row.validationResult === undefined
        ? null
        : (row.validationResult as Record<string, unknown>),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    errorMessage: row.errorMessage,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
