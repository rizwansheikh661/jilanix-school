/**
 * StaffDocumentService — metadata-only file records attached to a Staff
 * row. Mirrors AdmissionDocumentService. Real upload pipeline is a future
 * sprint; for now the controller accepts an opaque storage URL.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { StaffRepository } from '../repositories/staff.repository';
import {
  StaffDocumentRepository,
  type CreateStaffDocumentInput,
} from '../repositories/staff-document.repository';
import type { StaffDocumentRow } from '../staff.types';

export interface CreateStaffDocumentArgs {
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
}

@Injectable()
export class StaffDocumentService {
  private readonly logger = new Logger(StaffDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepo: StaffRepository,
    private readonly repo: StaffDocumentRepository,
  ) {}

  public async list(staffId: string): Promise<readonly StaffDocumentRow[]> {
    await this.assertStaff(staffId);
    return this.repo.findByStaff(staffId);
  }

  public async create(
    staffId: string,
    args: CreateStaffDocumentArgs,
  ): Promise<StaffDocumentRow> {
    return this.prisma.transaction(async (tx) => {
      const staff = await this.staffRepo.findById(staffId, tx);
      if (staff === null) throw new NotFoundError('Staff', staffId);
      const input: CreateStaffDocumentInput = { staffId, ...args };
      const row = await this.repo.create(input, tx);
      this.logger.log(`Attached document ${row.id} to Staff ${staffId}.`);
      return row;
    });
  }

  public async delete(staffId: string, docId: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const row = await this.repo.findById(docId, tx);
      if (row === null || row.staffId !== staffId) {
        throw new NotFoundError('StaffDocument', docId);
      }
      await this.repo.delete(docId, tx);
      this.logger.log(`Removed document ${docId} from Staff ${staffId}.`);
    });
  }

  private async assertStaff(staffId: string): Promise<void> {
    const staff = await this.staffRepo.findById(staffId);
    if (staff === null) throw new NotFoundError('Staff', staffId);
  }
}
