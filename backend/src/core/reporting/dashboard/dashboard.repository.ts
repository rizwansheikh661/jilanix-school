/**
 * DashboardRepository — persistence for `dashboards` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. update is a guarded
 * `updateMany` so concurrent mutations short-circuit via VersionConflictError.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { DashboardRow } from '../reporting.types';

export interface CreateDashboardInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly isDefault?: boolean;
  readonly ownedByUserId: string;
}

export interface UpdateDashboardInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly isDefault?: boolean;
}

export interface ListDashboardsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly ownedByUserId?: string;
  readonly isDefault?: boolean;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('DashboardRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<DashboardRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.dashboard.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawDashboard);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<DashboardRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.dashboard.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawDashboard);
  }

  public async list(
    args: ListDashboardsArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly DashboardRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.ownedByUserId !== undefined) {
      where.ownedByUserId = args.ownedByUserId;
    }
    if (args.isDefault !== undefined) where.isDefault = args.isDefault;
    const rows = await reader.dashboard.findMany({
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
      rows: rows.map((r) => mapRow(r as unknown as RawDashboard)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateDashboardInput,
    tx?: PrismaTx,
  ): Promise<DashboardRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      schoolId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      isDefault: input.isDefault ?? false,
      ownedByUserId: input.ownedByUserId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    };
    const created = await writer.dashboard.create({
      data: data as never,
    });
    return mapRow(created as unknown as RawDashboard);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateDashboardInput,
    tx?: PrismaTx,
  ): Promise<DashboardRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
    const result = await writer.dashboard.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Dashboard', id, expectedVersion);
    }
    const reloaded = await writer.dashboard.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Dashboard', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawDashboard);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.dashboard.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Dashboard', id, expectedVersion);
    }
  }
}

interface RawDashboard {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  ownedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawDashboard): DashboardRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    ownedByUserId: row.ownedByUserId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
