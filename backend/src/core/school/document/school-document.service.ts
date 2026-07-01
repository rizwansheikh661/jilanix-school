import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import {
  SchoolDocumentRepository,
  type CreateSchoolDocumentInput,
} from '../repositories/school.repositories';
import type { SchoolDocumentRow, SchoolDocumentTypeValue } from '../school.types';

@Injectable()
export class SchoolDocumentService {
  private readonly logger = new Logger(SchoolDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolDocumentRepository,
  ) {}

  public async list(filter: { documentType?: SchoolDocumentTypeValue }): Promise<readonly SchoolDocumentRow[]> {
    return this.repo.listAll(filter);
  }

  public async get(id: string): Promise<SchoolDocumentRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('SchoolDocument', id);
    return row;
  }

  public async create(input: CreateSchoolDocumentInput): Promise<SchoolDocumentRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      this.logger.log(`Attached SchoolDocument ${row.id} (${row.documentType}).`);
      return row;
    });
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('SchoolDocument', id);
      await this.repo.softDelete(id, tx);
      this.logger.log(`Deleted SchoolDocument ${id}.`);
    });
  }
}
