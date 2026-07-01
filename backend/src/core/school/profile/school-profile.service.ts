import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { SchoolProfileRepository, type UpsertSchoolProfileInput } from '../repositories/school.repositories';
import type { SchoolProfileRow } from '../school.types';

export type UpdateSchoolProfileArgs = UpsertSchoolProfileInput;

@Injectable()
export class SchoolProfileService {
  private readonly logger = new Logger(SchoolProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolProfileRepository,
  ) {}

  public async get(): Promise<SchoolProfileRow> {
    const row = await this.repo.find();
    if (row === null) throw new NotFoundError('SchoolProfile', '(current school)');
    return row;
  }

  public async findOrNull(): Promise<SchoolProfileRow | null> {
    return this.repo.find();
  }

  public async update(
    expectedVersion: number | null,
    args: UpdateSchoolProfileArgs,
  ): Promise<SchoolProfileRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.upsert(expectedVersion, args, tx);
      this.logger.log(`Updated SchoolProfile ${row.id} → v${row.version}.`);
      return row;
    });
  }
}
