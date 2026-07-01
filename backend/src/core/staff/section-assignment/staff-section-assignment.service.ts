/**
 * StaffSectionAssignmentService — manages teacher ↔ section ↔ subject ↔
 * year rows. Verifies parent existence (staff/section/subject/year) and
 * rejects exact-tuple duplicates.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AcademicYearRepository } from '../../academic/repositories/academic-year.repository';
import { SectionRepository } from '../../academic/repositories/section.repository';
import { SubjectRepository } from '../../academic/repositories/subject.repository';
import { NotFoundError } from '../../errors/domain-error';
import { StaffRepository } from '../repositories/staff.repository';
import {
  StaffSectionAssignmentRepository,
  type CreateSectionAssignmentInput,
  type ListSectionAssignmentArgs,
} from '../repositories/staff-section-assignment.repository';
import { SectionAssignmentDuplicateError } from '../staff.errors';
import type { StaffSectionAssignmentRow } from '../staff.types';

export interface CreateSectionAssignmentArgs {
  readonly sectionId: string;
  readonly subjectId: string;
  readonly academicYearId: string;
  readonly periodsPerWeek?: number | null;
}

@Injectable()
export class StaffSectionAssignmentService {
  private readonly logger = new Logger(StaffSectionAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepo: StaffRepository,
    private readonly sectionRepo: SectionRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly yearRepo: AcademicYearRepository,
    private readonly repo: StaffSectionAssignmentRepository,
  ) {}

  public async list(
    args: ListSectionAssignmentArgs,
  ): Promise<readonly StaffSectionAssignmentRow[]> {
    if (args.staffId !== undefined) {
      const staff = await this.staffRepo.findById(args.staffId);
      if (staff === null) throw new NotFoundError('Staff', args.staffId);
    }
    return this.repo.findMany(args);
  }

  public async create(
    staffId: string,
    args: CreateSectionAssignmentArgs,
  ): Promise<StaffSectionAssignmentRow> {
    return this.prisma.transaction(async (tx) => {
      const staff = await this.staffRepo.findById(staffId, tx);
      if (staff === null) throw new NotFoundError('Staff', staffId);
      const section = await this.sectionRepo.findById(args.sectionId, tx);
      if (section === null) throw new NotFoundError('Section', args.sectionId);
      const subject = await this.subjectRepo.findById(args.subjectId, tx);
      if (subject === null) throw new NotFoundError('Subject', args.subjectId);
      const year = await this.yearRepo.findById(args.academicYearId, tx);
      if (year === null) throw new NotFoundError('AcademicYear', args.academicYearId);

      const input: CreateSectionAssignmentInput = {
        staffId,
        sectionId: args.sectionId,
        subjectId: args.subjectId,
        academicYearId: args.academicYearId,
        ...(args.periodsPerWeek !== undefined && args.periodsPerWeek !== null
          ? { periodsPerWeek: args.periodsPerWeek }
          : {}),
      };
      const existing = await this.repo.findDuplicate(input, tx);
      if (existing !== null) {
        throw new SectionAssignmentDuplicateError({
          staffId,
          sectionId: args.sectionId,
          subjectId: args.subjectId,
          academicYearId: args.academicYearId,
        });
      }
      const row = await this.repo.create(input, tx);
      this.logger.log(
        `Assigned Staff ${staffId} to Section ${args.sectionId} / Subject ${args.subjectId} (year ${args.academicYearId}).`,
      );
      return row;
    });
  }

  public async delete(staffId: string, assignmentId: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const row = await this.repo.findById(assignmentId, tx);
      if (row === null || row.staffId !== staffId) {
        throw new NotFoundError('StaffSectionAssignment', assignmentId);
      }
      await this.repo.delete(assignmentId, tx);
      this.logger.log(
        `Removed section assignment ${assignmentId} from Staff ${staffId}.`,
      );
    });
  }
}
