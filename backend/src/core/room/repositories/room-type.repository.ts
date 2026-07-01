import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { RoomTypeRow } from '../room.types';

export interface CreateRoomTypeInput {
  readonly code: string;
  readonly name: string;
  readonly defaultCapacity?: number | null;
  readonly allowsExam?: boolean;
  readonly allowsTimetable?: boolean;
  readonly description?: string | null;
}

export interface UpdateRoomTypeInput {
  readonly code?: string;
  readonly name?: string;
  readonly defaultCapacity?: number | null;
  readonly allowsExam?: boolean;
  readonly allowsTimetable?: boolean;
  readonly description?: string | null;
}

@Injectable()
export class RoomTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('RoomTypeRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<RoomTypeRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.roomType.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(tx?: PrismaTx): Promise<readonly RoomTypeRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.roomType.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ code: 'asc' }],
    });
    return rows.map(map);
  }

  public async create(input: CreateRoomTypeInput, tx?: PrismaTx): Promise<RoomTypeRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.roomType.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        defaultCapacity: input.defaultCapacity ?? null,
        allowsExam: input.allowsExam ?? false,
        allowsTimetable: input.allowsTimetable ?? true,
        description: input.description ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateRoomTypeInput,
    tx?: PrismaTx,
  ): Promise<RoomTypeRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateRoomTypeInput> = [
      'code', 'name', 'defaultCapacity', 'allowsExam', 'allowsTimetable', 'description',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.roomType.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('RoomType', id, expectedVersion);
    const row = await writer.roomType.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('RoomType', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.roomType.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('RoomType', id, expectedVersion);
  }
}

interface RawRoomType {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  defaultCapacity: number | null;
  allowsExam: boolean;
  allowsTimetable: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawRoomType): RoomTypeRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    defaultCapacity: row.defaultCapacity,
    allowsExam: row.allowsExam,
    allowsTimetable: row.allowsTimetable,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
