/**
 * ReportTemplateRepository — persistence for `report_templates` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. update is a guarded
 * `updateMany` so concurrent mutations short-circuit via VersionConflictError.
 *
 * Visibility is controlled at the service layer: `listOwn` returns only
 * `ownedByUserId === ctx.userId`; `listOwnOrShared` returns the union of
 * (owned by ctx user) ∪ (`isShared = true`).
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ReportKindValue } from '../reporting.constants';
import type { ReportTemplateRow } from '../reporting.types';

export interface CreateReportTemplateInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly reportKind: ReportKindValue;
  readonly params: Record<string, unknown>;
  readonly isShared?: boolean;
  readonly ownedByUserId: string;
}

export interface UpdateReportTemplateInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly reportKind?: ReportKindValue;
  readonly params?: Record<string, unknown>;
  readonly isShared?: boolean;
}

export interface ListReportTemplatesArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly reportKind?: ReportKindValue;
  readonly isShared?: boolean;
  readonly ownedByUserId?: string;
}

@Injectable()
export class ReportTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ReportTemplateRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<ReportTemplateRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.reportTemplate.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawReportTemplate);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<ReportTemplateRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.reportTemplate.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawReportTemplate);
  }

  public async listOwn(
    args: ListReportTemplatesArgs,
    userId: string,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ReportTemplateRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
      ownedByUserId: userId,
    };
    if (args.reportKind !== undefined) where.reportKind = args.reportKind;
    if (args.isShared !== undefined) where.isShared = args.isShared;
    return this.fetchPaged(reader, where, args, schoolId);
  }

  public async listOwnOrShared(
    args: ListReportTemplatesArgs,
    userId: string,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ReportTemplateRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const baseWhere: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.reportKind !== undefined) baseWhere.reportKind = args.reportKind;
    if (args.isShared !== undefined) baseWhere.isShared = args.isShared;
    const where: Record<string, unknown> = {
      ...baseWhere,
      OR: [{ ownedByUserId: userId }, { isShared: true }],
    };
    return this.fetchPaged(reader, where, args, schoolId);
  }

  private async fetchPaged(
    reader: PrismaTx,
    where: Record<string, unknown>,
    args: ListReportTemplatesArgs,
    schoolId: string,
  ): Promise<{
    readonly rows: readonly ReportTemplateRow[];
    readonly nextCursorId: string | null;
  }> {
    const rows = await reader.reportTemplate.findMany({
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
      rows: rows.map((r) => mapRow(r as unknown as RawReportTemplate)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateReportTemplateInput,
    tx?: PrismaTx,
  ): Promise<ReportTemplateRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      schoolId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      reportKind: input.reportKind,
      params: input.params as Prisma.InputJsonValue,
      isShared: input.isShared ?? false,
      ownedByUserId: input.ownedByUserId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    };
    const created = await writer.reportTemplate.create({
      data: data as never,
    });
    return mapRow(created as unknown as RawReportTemplate);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateReportTemplateInput,
    tx?: PrismaTx,
  ): Promise<ReportTemplateRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.reportKind !== undefined) data.reportKind = patch.reportKind;
    if (patch.params !== undefined) {
      data.params = patch.params as Prisma.InputJsonValue;
    }
    if (patch.isShared !== undefined) data.isShared = patch.isShared;
    const result = await writer.reportTemplate.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportTemplate', id, expectedVersion);
    }
    const reloaded = await writer.reportTemplate.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ReportTemplate', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawReportTemplate);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.reportTemplate.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportTemplate', id, expectedVersion);
    }
  }
}

interface RawReportTemplate {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  description: string | null;
  reportKind: string;
  params: unknown;
  isShared: boolean;
  ownedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawReportTemplate): ReportTemplateRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    description: row.description,
    reportKind: row.reportKind as ReportTemplateRow['reportKind'],
    params: (row.params ?? {}) as Record<string, unknown>,
    isShared: row.isShared,
    ownedByUserId: row.ownedByUserId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
