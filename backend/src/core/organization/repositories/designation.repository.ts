import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { DesignationRow } from '../organization.types';

export interface CreateDesignationInput {
  readonly code: string;
  readonly name: string;
  readonly rank: number;
  readonly isTeaching?: boolean;
  readonly isManagement?: boolean;
  readonly description?: string | null;
  readonly reportsToDesignationId?: string | null;
}

export interface UpdateDesignationInput {
  readonly code?: string;
  readonly name?: string;
  readonly rank?: number;
  readonly isTeaching?: boolean;
  readonly isManagement?: boolean;
  readonly description?: string | null;
  readonly reportsToDesignationId?: string | null;
}

@Injectable()
export class DesignationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('DesignationRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<DesignationRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.designation.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(
    filter: { isTeaching?: boolean; isManagement?: boolean } = {},
    tx?: PrismaTx,
  ): Promise<readonly DesignationRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.isTeaching !== undefined) where.isTeaching = filter.isTeaching;
    if (filter.isManagement !== undefined) where.isManagement = filter.isManagement;
    const rows = await reader.designation.findMany({ where, orderBy: { rank: 'asc' } });
    return rows.map(map);
  }

  public async create(input: CreateDesignationInput, tx?: PrismaTx): Promise<DesignationRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.designation.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        rank: input.rank,
        isTeaching: input.isTeaching ?? false,
        isManagement: input.isManagement ?? false,
        description: input.description ?? null,
        reportsToDesignationId: input.reportsToDesignationId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateDesignationInput,
    tx?: PrismaTx,
  ): Promise<DesignationRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateDesignationInput> = [
      'code', 'name', 'rank', 'isTeaching', 'isManagement', 'description', 'reportsToDesignationId',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.designation.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('Designation', id, expectedVersion);
    const row = await writer.designation.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Designation', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.designation.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('Designation', id, expectedVersion);
  }
}

interface RawDesignation {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  rank: number;
  isTeaching: boolean;
  isManagement: boolean;
  description: string | null;
  reportsToDesignationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawDesignation): DesignationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    rank: row.rank,
    isTeaching: row.isTeaching,
    isManagement: row.isManagement,
    description: row.description,
    reportsToDesignationId: row.reportsToDesignationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
