import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';
import { NotFoundError } from '../errors/domain-error';
import {
  RoomRepository,
  type CreateRoomInput,
  type RoomListFilter,
  type UpdateRoomInput,
} from './repositories/room.repository';
import {
  RoomTypeRepository,
  type CreateRoomTypeInput,
  type UpdateRoomTypeInput,
} from './repositories/room-type.repository';
import type { RoomRow, RoomTypeRow } from './room.types';

@Injectable()
export class RoomTypeService {
  private readonly logger = new Logger(RoomTypeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RoomTypeRepository,
  ) {}

  public async list(): Promise<readonly RoomTypeRow[]> {
    return this.repo.listAll();
  }

  public async get(id: string): Promise<RoomTypeRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('RoomType', id);
    return row;
  }

  public async create(input: CreateRoomTypeInput): Promise<RoomTypeRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created RoomType ${row.id} (${row.code}).`);
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateRoomTypeInput,
  ): Promise<RoomTypeRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('RoomType', id);
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('RoomType', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RoomRepository,
    private readonly typeRepo: RoomTypeRepository,
  ) {}

  public async list(filter: RoomListFilter): Promise<readonly RoomRow[]> {
    return this.repo.listAll(filter);
  }

  public async get(id: string): Promise<RoomRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('Room', id);
    return row;
  }

  public async create(input: CreateRoomInput): Promise<RoomRow> {
    return this.prisma.transaction(async (tx) => {
      const type = await this.typeRepo.findById(input.roomTypeId, tx);
      if (type === null) throw new NotFoundError('RoomType', input.roomTypeId);
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created Room ${row.id} (${row.code}) in branch ${row.branchId}.`);
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateRoomInput,
  ): Promise<RoomRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Room', id);
      if (input.roomTypeId !== undefined && input.roomTypeId !== existing.roomTypeId) {
        const type = await this.typeRepo.findById(input.roomTypeId, tx);
        if (type === null) throw new NotFoundError('RoomType', input.roomTypeId);
      }
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Room', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }
}
