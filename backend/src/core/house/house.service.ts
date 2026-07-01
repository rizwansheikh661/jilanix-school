import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';
import { NotFoundError } from '../errors/domain-error';
import { HouseAssignmentAlreadyActiveError } from './house.errors';
import type { HouseAssignmentRow, HouseRow } from './house.types';
import {
  HouseAssignmentRepository,
  HouseRepository,
  type CreateHouseAssignmentInput,
  type CreateHouseInput,
  type UpdateHouseInput,
} from './repositories/house.repositories';

@Injectable()
export class HouseService {
  private readonly logger = new Logger(HouseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HouseRepository,
  ) {}

  public async list(): Promise<readonly HouseRow[]> {
    return this.repo.listAll();
  }

  public async get(id: string): Promise<HouseRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('House', id);
    return row;
  }

  public async create(input: CreateHouseInput): Promise<HouseRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created House ${row.id} (${row.code}).`);
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateHouseInput,
  ): Promise<HouseRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('House', id);
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('House', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }
}

@Injectable()
export class HouseAssignmentService {
  private readonly logger = new Logger(HouseAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HouseAssignmentRepository,
    private readonly houseRepo: HouseRepository,
  ) {}

  public async listForHouse(
    args: { houseId: string; academicYearId?: string },
  ): Promise<readonly HouseAssignmentRow[]> {
    return this.repo.listForHouse(args);
  }

  public async listForStudent(studentId: string): Promise<readonly HouseAssignmentRow[]> {
    return this.repo.listForStudent(studentId);
  }

  public async assign(input: CreateHouseAssignmentInput): Promise<HouseAssignmentRow> {
    return this.prisma.transaction(async (tx) => {
      const house = await this.houseRepo.findById(input.houseId, tx);
      if (house === null) throw new NotFoundError('House', input.houseId);

      const prior = await this.repo.findActiveForStudentYear(
        { studentId: input.studentId, academicYearId: input.academicYearId },
        tx,
      );
      if (prior !== null) {
        if (prior.houseId === input.houseId) {
          throw new HouseAssignmentAlreadyActiveError({
            studentId: input.studentId,
            academicYearId: input.academicYearId,
            existingHouseId: prior.houseId,
          });
        }
        await this.repo.closeAssignment({ id: prior.id, endedOn: input.assignedOn }, tx);
      }

      const row = await this.repo.create(input, tx);
      await this.repo.updateStudentDenormHouse(
        { studentId: input.studentId, houseId: input.houseId },
        tx,
      );
      this.logger.log(
        `Assigned student ${input.studentId} to house ${input.houseId} (year ${input.academicYearId}).`,
      );
      return row;
    });
  }

  public async endAssignment(id: string, endedOn: Date): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('HouseAssignment', id);
      if (existing.endedOn !== null) return;
      await this.repo.closeAssignment({ id, endedOn }, tx);

      const stillActive = await this.repo.findActiveForStudentYear(
        { studentId: existing.studentId, academicYearId: existing.academicYearId },
        tx,
      );
      if (stillActive === null) {
        await this.repo.updateStudentDenormHouse(
          { studentId: existing.studentId, houseId: null },
          tx,
        );
      }
    });
  }
}
