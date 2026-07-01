import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { BranchRow, BranchStatusValue } from '../branch.types';

export interface CreateBranchInput {
  readonly parentBranchId?: string | null;
  readonly code: string;
  readonly name: string;
  readonly isPrimary?: boolean;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly pincode?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly establishedDate?: Date | null;
  readonly managerStaffId?: string | null;
}

export interface UpdateBranchInput {
  readonly parentBranchId?: string | null;
  readonly code?: string;
  readonly name?: string;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly pincode?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly establishedDate?: Date | null;
  readonly managerStaffId?: string | null;
}

@Injectable()
export class BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('BranchRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<BranchRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.branch.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async findByCode(code: string, tx?: PrismaTx): Promise<BranchRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.branch.findUnique({
      where: { schoolId_code: { schoolId, code } },
    });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(
    filter: { status?: BranchStatusValue; parentBranchId?: string | null } = {},
    tx?: PrismaTx,
  ): Promise<readonly BranchRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.parentBranchId !== undefined) where.parentBranchId = filter.parentBranchId;
    const rows = await reader.branch.findMany({
      where,
      orderBy: [{ isPrimary: 'desc' }, { code: 'asc' }],
    });
    return rows.map(map);
  }

  public async findPrimary(tx?: PrismaTx): Promise<BranchRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.branch.findFirst({
      where: { schoolId, isPrimary: true, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async demoteAllPrimary(tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    await writer.branch.updateMany({
      where: { schoolId, isPrimary: true, deletedAt: null },
      data: { isPrimary: false, version: { increment: 1 } },
    });
  }

  public async create(input: CreateBranchInput, tx?: PrismaTx): Promise<BranchRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.branch.create({
      data: {
        schoolId,
        parentBranchId: input.parentBranchId ?? null,
        code: input.code,
        name: input.name,
        isPrimary: input.isPrimary ?? false,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        stateCode: input.stateCode ?? null,
        pincode: input.pincode ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        establishedDate: input.establishedDate ?? null,
        managerStaffId: input.managerStaffId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateBranchInput,
    tx?: PrismaTx,
  ): Promise<BranchRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateBranchInput> = [
      'parentBranchId', 'code', 'name', 'addressLine1', 'addressLine2', 'city', 'stateCode',
      'pincode', 'phone', 'email', 'establishedDate', 'managerStaffId',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.branch.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('Branch', id, expectedVersion);
    const row = await writer.branch.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Branch', id, expectedVersion);
    return map(row);
  }

  public async setStatus(
    id: string,
    expectedVersion: number,
    status: BranchStatusValue,
    tx?: PrismaTx,
  ): Promise<BranchRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.branch.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: { status, version: { increment: 1 }, updatedBy: userId ?? null },
    });
    if (result.count === 0) throw new VersionConflictError('Branch', id, expectedVersion);
    const row = await writer.branch.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Branch', id, expectedVersion);
    return map(row);
  }

  public async setPrimary(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<BranchRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.branch.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: { isPrimary: true, version: { increment: 1 }, updatedBy: userId ?? null },
    });
    if (result.count === 0) throw new VersionConflictError('Branch', id, expectedVersion);
    const row = await writer.branch.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Branch', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.branch.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('Branch', id, expectedVersion);
  }
}

interface RawBranch {
  id: string;
  schoolId: string;
  parentBranchId: string | null;
  code: string;
  name: string;
  isPrimary: boolean;
  status: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  establishedDate: Date | null;
  managerStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawBranch): BranchRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    parentBranchId: row.parentBranchId,
    code: row.code,
    name: row.name,
    isPrimary: row.isPrimary,
    status: row.status as BranchStatusValue,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateCode: row.stateCode,
    pincode: row.pincode,
    phone: row.phone,
    email: row.email,
    establishedDate: row.establishedDate,
    managerStaffId: row.managerStaffId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
