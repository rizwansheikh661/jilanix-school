import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { SubscriptionGuardService } from '../../subscription';
import {
  BranchHasActiveDependentsError,
  BranchPrimaryRequiredError,
} from '../branch.errors';
import {
  BranchRepository,
  type CreateBranchInput,
  type UpdateBranchInput,
} from '../repositories/branch.repository';
import type { BranchRow, BranchStatusValue } from '../branch.types';

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BranchRepository,
    private readonly guard: SubscriptionGuardService,
  ) {}

  public async list(filter: { status?: BranchStatusValue; parentBranchId?: string }): Promise<readonly BranchRow[]> {
    return this.repo.listAll({ status: filter.status, parentBranchId: filter.parentBranchId });
  }

  public async get(id: string): Promise<BranchRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('Branch', id);
    return row;
  }

  public async create(input: CreateBranchInput): Promise<BranchRow> {
    return this.prisma.transaction(async (tx) => {
      if (input.isPrimary === true) {
        await this.repo.demoteAllPrimary(tx);
      } else {
        const existing = await this.repo.findPrimary(tx);
        if (existing === null) {
          input = { ...input, isPrimary: true };
        }
      }
      const row = await this.repo.create(input, tx);
      const schoolId = RequestContextRegistry.peek()?.schoolId;
      if (schoolId !== undefined) {
        await this.guard.assertAndConsume(schoolId, 'branch_count', 1, `branch:${row.id}`, tx);
      }
      this.logger.log(`Created Branch ${row.id} (${row.code}, primary=${row.isPrimary}).`);
      return row;
    });
  }

  public async update(id: string, expectedVersion: number, input: UpdateBranchInput): Promise<BranchRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Branch', id);
      const row = await this.repo.update(id, expectedVersion, input, tx);
      return row;
    });
  }

  public async setPrimary(id: string, expectedVersion: number): Promise<BranchRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Branch', id);
      if (existing.isPrimary) return existing;
      await this.repo.demoteAllPrimary(tx);
      const row = await this.repo.setPrimary(id, expectedVersion, tx);
      this.logger.log(`Promoted Branch ${id} to primary.`);
      return row;
    });
  }

  public async activate(id: string, expectedVersion: number): Promise<BranchRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Branch', id);
      const row = await this.repo.setStatus(id, expectedVersion, 'ACTIVE', tx);
      return row;
    });
  }

  public async deactivate(id: string, expectedVersion: number): Promise<BranchRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Branch', id);
      if (existing.isPrimary) throw new BranchPrimaryRequiredError(id);
      await this.assertNoActiveDependents(id);
      const row = await this.repo.setStatus(id, expectedVersion, 'INACTIVE', tx);
      this.logger.log(`Deactivated Branch ${id}.`);
      return row;
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new NotFoundError('Branch', id);
      if (existing.isPrimary) throw new BranchPrimaryRequiredError(id);
      await this.assertNoActiveDependents(id);
      await this.repo.softDelete(id, expectedVersion, tx);
      const schoolId = RequestContextRegistry.peek()?.schoolId;
      if (schoolId !== undefined) {
        await this.guard.releaseUsage(schoolId, 'branch_count', 1, `branch:${id}`, tx);
      }
      this.logger.log(`Deleted Branch ${id}.`);
    });
  }

  /** Stub. Sprint 5 will count Students/Staff/Sections referencing branchId. */
  private async assertNoActiveDependents(branchId: string): Promise<void> {
    const counts: Record<string, number> = {};
    if (Object.keys(counts).length > 0) {
      throw new BranchHasActiveDependentsError({ branchId, counts });
    }
  }
}
