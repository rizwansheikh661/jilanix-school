import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import {
  SchoolContactRepository,
  type CreateSchoolContactInput,
  type UpdateSchoolContactInput,
} from '../repositories/school.repositories';
import type { SchoolContactRow } from '../school.types';

@Injectable()
export class SchoolContactService {
  private readonly logger = new Logger(SchoolContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolContactRepository,
  ) {}

  public async list(): Promise<readonly SchoolContactRow[]> {
    return this.repo.listAll();
  }

  public async create(input: CreateSchoolContactInput): Promise<SchoolContactRow> {
    return this.prisma.transaction(async (tx) => {
      if (input.isPrimary === true) {
        await this.repo.demotePrimaryFor(input.contactType, tx);
      }
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created SchoolContact ${row.id} (${row.contactType}).`);
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateSchoolContactInput,
  ): Promise<SchoolContactRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('SchoolContact', id);
      const newType = input.contactType ?? existing.contactType;
      if (input.isPrimary === true) {
        await this.repo.demotePrimaryFor(newType, tx);
      }
      const row = await this.repo.update(id, expectedVersion, input, tx);
      this.logger.log(`Updated SchoolContact ${id} → v${row.version}.`);
      return row;
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('SchoolContact', id);
      await this.repo.softDelete(id, expectedVersion, tx);
      this.logger.log(`Deleted SchoolContact ${id}.`);
    });
  }
}
