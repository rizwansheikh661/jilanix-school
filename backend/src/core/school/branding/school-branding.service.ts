import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { SchoolBrandingRepository, type UpsertSchoolBrandingInput } from '../repositories/school.repositories';
import type { SchoolBrandingRow } from '../school.types';
import { SchoolBrandingResolverService } from './school-branding-resolver.service';

@Injectable()
export class SchoolBrandingService {
  private readonly logger = new Logger(SchoolBrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolBrandingRepository,
    private readonly resolver: SchoolBrandingResolverService,
  ) {}

  public async findOrNull(): Promise<SchoolBrandingRow | null> {
    return this.repo.find();
  }

  public async get(): Promise<SchoolBrandingRow> {
    const row = await this.repo.find();
    if (row === null) throw new NotFoundError('SchoolBranding', '(current school)');
    return row;
  }

  public async update(
    expectedVersion: number | null,
    args: UpsertSchoolBrandingInput,
  ): Promise<SchoolBrandingRow> {
    const row = await this.prisma.transaction(async (tx) => {
      const persisted = await this.repo.upsert(expectedVersion, args, tx);
      this.logger.log(`Updated SchoolBranding ${persisted.id} → v${persisted.version}.`);
      return persisted;
    });
    this.resolver.invalidate(row.schoolId);
    return row;
  }
}
