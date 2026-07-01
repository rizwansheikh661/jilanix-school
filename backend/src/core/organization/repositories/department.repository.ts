import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { DepartmentRow, DepartmentTypeValue } from '../organization.types';

export interface CreateDepartmentInput {
  readonly branchId?: string | null;
  readonly parentDepartmentId?: string | null;
  readonly code: string;
  readonly name: string;
  readonly type: DepartmentTypeValue;
  readonly description?: string | null;
  readonly headStaffId?: string | null;
}

export interface UpdateDepartmentInput {
  readonly branchId?: string | null;
  readonly parentDepartmentId?: string | null;
  readonly code?: string;
  readonly name?: string;
  readonly type?: DepartmentTypeValue;
  readonly description?: string | null;
  readonly headStaffId?: string | null;
}

@Injectable()
export class DepartmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('DepartmentRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<DepartmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.department.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(
    filter: { branchId?: string | null; type?: DepartmentTypeValue } = {},
    tx?: PrismaTx,
  ): Promise<readonly DepartmentRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.branchId !== undefined) where.branchId = filter.branchId;
    if (filter.type !== undefined) where.type = filter.type;
    const rows = await reader.department.findMany({ where, orderBy: { code: 'asc' } });
    return rows.map(map);
  }

  public async create(input: CreateDepartmentInput, tx?: PrismaTx): Promise<DepartmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.department.create({
      data: {
        schoolId,
        branchId: input.branchId ?? null,
        parentDepartmentId: input.parentDepartmentId ?? null,
        code: input.code,
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        headStaffId: input.headStaffId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateDepartmentInput,
    tx?: PrismaTx,
  ): Promise<DepartmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateDepartmentInput> = [
      'branchId', 'parentDepartmentId', 'code', 'name', 'type', 'description', 'headStaffId',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.department.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('Department', id, expectedVersion);
    const row = await writer.department.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Department', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.department.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('Department', id, expectedVersion);
  }
}

interface RawDepartment {
  id: string;
  schoolId: string;
  branchId: string | null;
  parentDepartmentId: string | null;
  code: string;
  name: string;
  type: string;
  description: string | null;
  headStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawDepartment): DepartmentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    parentDepartmentId: row.parentDepartmentId,
    code: row.code,
    name: row.name,
    type: row.type as DepartmentTypeValue,
    description: row.description,
    headStaffId: row.headStaffId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
