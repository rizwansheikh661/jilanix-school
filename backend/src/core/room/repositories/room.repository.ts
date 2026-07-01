import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { RoomStatusValue } from '../room.constants';
import type { RoomRow } from '../room.types';

export interface CreateRoomInput {
  readonly branchId: string;
  readonly roomTypeId: string;
  readonly code: string;
  readonly name: string;
  readonly capacity: number;
  readonly floor?: string | null;
  readonly block?: string | null;
  readonly status?: RoomStatusValue;
  readonly notes?: string | null;
}

export interface UpdateRoomInput {
  readonly roomTypeId?: string;
  readonly code?: string;
  readonly name?: string;
  readonly capacity?: number;
  readonly floor?: string | null;
  readonly block?: string | null;
  readonly status?: RoomStatusValue;
  readonly notes?: string | null;
}

export interface RoomListFilter {
  readonly branchId?: string;
  readonly roomTypeId?: string;
  readonly status?: RoomStatusValue;
}

@Injectable()
export class RoomRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('RoomRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<RoomRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.room.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(filter: RoomListFilter, tx?: PrismaTx): Promise<readonly RoomRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.branchId !== undefined) where.branchId = filter.branchId;
    if (filter.roomTypeId !== undefined) where.roomTypeId = filter.roomTypeId;
    if (filter.status !== undefined) where.status = filter.status;
    const rows = await reader.room.findMany({
      where,
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
    });
    return rows.map(map);
  }

  public async create(input: CreateRoomInput, tx?: PrismaTx): Promise<RoomRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.room.create({
      data: {
        schoolId,
        branchId: input.branchId,
        roomTypeId: input.roomTypeId,
        code: input.code,
        name: input.name,
        capacity: input.capacity,
        floor: input.floor ?? null,
        block: input.block ?? null,
        status: input.status ?? 'ACTIVE',
        notes: input.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateRoomInput,
    tx?: PrismaTx,
  ): Promise<RoomRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateRoomInput> = [
      'roomTypeId', 'code', 'name', 'capacity', 'floor', 'block', 'status', 'notes',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.room.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('Room', id, expectedVersion);
    const row = await writer.room.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('Room', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.room.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('Room', id, expectedVersion);
  }
}

interface RawRoom {
  id: string;
  schoolId: string;
  branchId: string;
  roomTypeId: string;
  code: string;
  name: string;
  capacity: number;
  floor: string | null;
  block: string | null;
  status: RoomStatusValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawRoom): RoomRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    roomTypeId: row.roomTypeId,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    floor: row.floor,
    block: row.block,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
