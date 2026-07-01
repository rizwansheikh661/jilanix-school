/**
 * StaffSubjectQualificationService — manages the M:N link between Staff and
 * Subject. Replace-set semantics: PUT submits the full desired set, the
 * service wipes existing rows and recreates from input.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { SubjectRepository } from '../../academic/repositories/subject.repository';
import { NotFoundError } from '../../errors/domain-error';
import { StaffRepository } from '../repositories/staff.repository';
import {
  StaffSubjectQualificationRepository,
  type SubjectQualificationInput,
} from '../repositories/staff-subject-qualification.repository';
import {
  SubjectQualificationDuplicateError,
  SubjectQualificationSubjectNotFoundError,
} from '../staff.errors';
import type { StaffSubjectQualificationRow } from '../staff.types';

@Injectable()
export class StaffSubjectQualificationService {
  private readonly logger = new Logger(StaffSubjectQualificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepo: StaffRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly repo: StaffSubjectQualificationRepository,
  ) {}

  public async list(staffId: string): Promise<readonly StaffSubjectQualificationRow[]> {
    await this.assertStaff(staffId);
    return this.repo.findByStaff(staffId);
  }

  public async replace(
    staffId: string,
    inputs: readonly SubjectQualificationInput[],
  ): Promise<readonly StaffSubjectQualificationRow[]> {
    this.assertNoDuplicates(inputs);
    return this.prisma.transaction(async (tx) => {
      const staff = await this.staffRepo.findById(staffId, tx);
      if (staff === null) throw new NotFoundError('Staff', staffId);
      await this.assertSubjectsExist(inputs, tx);
      const rows = await this.repo.replaceForStaff(staffId, inputs, tx);
      this.logger.log(
        `Replaced subject qualifications for Staff ${staffId} (${rows.length} subjects).`,
      );
      return rows;
    });
  }

  private async assertStaff(staffId: string): Promise<void> {
    const staff = await this.staffRepo.findById(staffId);
    if (staff === null) throw new NotFoundError('Staff', staffId);
  }

  private assertNoDuplicates(inputs: readonly SubjectQualificationInput[]): void {
    const seen = new Set<string>();
    for (const i of inputs) {
      if (seen.has(i.subjectId)) {
        throw new SubjectQualificationDuplicateError(i.subjectId);
      }
      seen.add(i.subjectId);
    }
  }

  private async assertSubjectsExist(
    inputs: readonly SubjectQualificationInput[],
    tx: Parameters<Parameters<PrismaService['transaction']>[0]>[0],
  ): Promise<void> {
    if (inputs.length === 0) return;
    const missing: string[] = [];
    for (const i of inputs) {
      const subject = await this.subjectRepo.findById(i.subjectId, tx);
      if (subject === null) missing.push(i.subjectId);
    }
    if (missing.length > 0) {
      throw new SubjectQualificationSubjectNotFoundError(missing);
    }
  }
}
