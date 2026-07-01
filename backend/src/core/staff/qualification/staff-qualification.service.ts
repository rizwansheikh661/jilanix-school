/**
 * StaffQualificationService — manages free-form degree / certification /
 * experience rows attached to a Staff record. Parent existence check on
 * every mutation; cascade-delete with parent.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { StaffRepository } from '../repositories/staff.repository';
import {
  StaffQualificationRepository,
  type CreateStaffQualificationInput,
} from '../repositories/staff-qualification.repository';
import type { StaffQualificationRow } from '../staff.types';

export interface CreateStaffQualificationArgs {
  readonly qualificationType: string;
  readonly name: string;
  readonly institution?: string | null;
  readonly yearAwarded?: number | null;
  readonly gradeOrScore?: string | null;
}

@Injectable()
export class StaffQualificationService {
  private readonly logger = new Logger(StaffQualificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepo: StaffRepository,
    private readonly repo: StaffQualificationRepository,
  ) {}

  public async list(staffId: string): Promise<readonly StaffQualificationRow[]> {
    await this.assertStaff(staffId);
    return this.repo.findByStaff(staffId);
  }

  public async create(
    staffId: string,
    args: CreateStaffQualificationArgs,
  ): Promise<StaffQualificationRow> {
    return this.prisma.transaction(async (tx) => {
      const staff = await this.staffRepo.findById(staffId, tx);
      if (staff === null) throw new NotFoundError('Staff', staffId);
      const input: CreateStaffQualificationInput = {
        staffId,
        qualificationType: args.qualificationType,
        name: args.name,
        institution: args.institution ?? null,
        yearAwarded: args.yearAwarded ?? null,
        gradeOrScore: args.gradeOrScore ?? null,
      };
      const row = await this.repo.create(input, tx);
      this.logger.log(`Added qualification ${row.id} to Staff ${staffId}.`);
      return row;
    });
  }

  public async delete(staffId: string, qualificationId: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const row = await this.repo.findById(qualificationId, tx);
      if (row === null || row.staffId !== staffId) {
        throw new NotFoundError('StaffQualification', qualificationId);
      }
      await this.repo.delete(qualificationId, tx);
      this.logger.log(`Removed qualification ${qualificationId} from Staff ${staffId}.`);
    });
  }

  private async assertStaff(staffId: string): Promise<void> {
    const staff = await this.staffRepo.findById(staffId);
    if (staff === null) throw new NotFoundError('Staff', staffId);
  }
}
