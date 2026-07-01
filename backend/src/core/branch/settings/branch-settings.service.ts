import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import {
  BranchSettingsRepository,
  type UpsertBranchSettingsInput,
} from '../repositories/branch-settings.repository';
import { BranchRepository } from '../repositories/branch.repository';
import type { BranchSettingsRow } from '../branch.types';

@Injectable()
export class BranchSettingsService {
  private readonly logger = new Logger(BranchSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchRepo: BranchRepository,
    private readonly repo: BranchSettingsRepository,
  ) {}

  public async findOrNull(branchId: string): Promise<BranchSettingsRow | null> {
    return this.repo.findByBranch(branchId);
  }

  public async upsert(
    branchId: string,
    expectedVersion: number | null,
    input: UpsertBranchSettingsInput,
  ): Promise<BranchSettingsRow> {
    return this.prisma.transaction(async (tx) => {
      const branch = await this.branchRepo.findById(branchId, tx);
      if (branch === null) throw new NotFoundError('Branch', branchId);
      const row = await this.repo.upsert(branchId, expectedVersion, input, tx);
      this.logger.log(`Updated BranchSettings for branch ${branchId} → v${row.version}.`);
      return row;
    });
  }
}
