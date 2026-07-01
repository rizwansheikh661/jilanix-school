import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';
import { NotFoundError } from '../errors/domain-error';
import {
  DepartmentRepository,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
} from './repositories/department.repository';
import {
  DesignationRepository,
  type CreateDesignationInput,
  type UpdateDesignationInput,
} from './repositories/designation.repository';
import type {
  DepartmentRow,
  DepartmentTypeValue,
  DesignationRow,
} from './organization.types';

@Injectable()
export class DepartmentService {
  private readonly logger = new Logger(DepartmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DepartmentRepository,
  ) {}

  public async list(filter: { branchId?: string; type?: DepartmentTypeValue }): Promise<readonly DepartmentRow[]> {
    return this.repo.listAll(filter);
  }

  public async get(id: string): Promise<DepartmentRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('Department', id);
    return row;
  }

  public async create(input: CreateDepartmentInput): Promise<DepartmentRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created Department ${row.id} (${row.code}).`);
      return row;
    });
  }

  public async update(id: string, expectedVersion: number, input: UpdateDepartmentInput): Promise<DepartmentRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Department', id);
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Department', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }
}

@Injectable()
export class DesignationService {
  private readonly logger = new Logger(DesignationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DesignationRepository,
  ) {}

  public async list(filter: { isTeaching?: boolean; isManagement?: boolean }): Promise<readonly DesignationRow[]> {
    return this.repo.listAll(filter);
  }

  public async get(id: string): Promise<DesignationRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('Designation', id);
    return row;
  }

  public async create(input: CreateDesignationInput): Promise<DesignationRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created Designation ${row.id} (${row.code}).`);
      return row;
    });
  }

  public async update(id: string, expectedVersion: number, input: UpdateDesignationInput): Promise<DesignationRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Designation', id);
      return this.repo.update(id, expectedVersion, input, tx);
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Designation', id);
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }
}
