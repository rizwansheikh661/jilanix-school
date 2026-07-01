/**
 * ClassTeacherService — manages the homeroom-teacher assignment per
 * (section, academicYear). Enforces "one active assignment per section per
 * year" via service-level pre-flight lookup since MySQL has no partial
 * unique index.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AcademicYearRepository } from '../../academic/repositories/academic-year.repository';
import { SectionRepository } from '../../academic/repositories/section.repository';
import { NotFoundError } from '../../errors/domain-error';
import {
  ClassTeacherRepository,
  type ListClassTeacherArgs,
} from '../repositories/class-teacher.repository';
import { StaffRepository } from '../repositories/staff.repository';
import {
  ClassTeacherAlreadyAssignedError,
  ClassTeacherAlreadyRevokedError,
} from '../staff.errors';
import type { ClassTeacherRow } from '../staff.types';

export interface AssignClassTeacherArgs {
  readonly staffId: string;
  readonly sectionId: string;
  readonly academicYearId: string;
  readonly assignedOn: Date;
}

@Injectable()
export class ClassTeacherService {
  private readonly logger = new Logger(ClassTeacherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ClassTeacherRepository,
    private readonly staffRepo: StaffRepository,
    private readonly sectionRepo: SectionRepository,
    private readonly yearRepo: AcademicYearRepository,
  ) {}

  public async list(args: ListClassTeacherArgs): Promise<readonly ClassTeacherRow[]> {
    return this.repo.findMany(args);
  }

  public async getById(id: string): Promise<ClassTeacherRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('ClassTeacher', id);
    return row;
  }

  public async assign(args: AssignClassTeacherArgs): Promise<ClassTeacherRow> {
    return this.prisma.transaction(async (tx) => {
      const staff = await this.staffRepo.findById(args.staffId, tx);
      if (staff === null) throw new NotFoundError('Staff', args.staffId);
      const section = await this.sectionRepo.findById(args.sectionId, tx);
      if (section === null) throw new NotFoundError('Section', args.sectionId);
      const year = await this.yearRepo.findById(args.academicYearId, tx);
      if (year === null) throw new NotFoundError('AcademicYear', args.academicYearId);

      const existing = await this.repo.findActiveForSection(
        args.sectionId,
        args.academicYearId,
        tx,
      );
      if (existing !== null) {
        throw new ClassTeacherAlreadyAssignedError({
          sectionId: args.sectionId,
          academicYearId: args.academicYearId,
          existingAssignmentId: existing.id,
          existingStaffId: existing.staffId,
        });
      }
      const row = await this.repo.create(
        {
          staffId: args.staffId,
          sectionId: args.sectionId,
          academicYearId: args.academicYearId,
          assignedOn: args.assignedOn,
        },
        tx,
      );
      this.logger.log(
        `Assigned class teacher ${args.staffId} to Section ${args.sectionId} (year ${args.academicYearId}).`,
      );
      return row;
    });
  }

  public async revoke(
    id: string,
    expectedVersion: number,
    revokedOn: Date,
  ): Promise<ClassTeacherRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (row === null) throw new NotFoundError('ClassTeacher', id);
      if (row.revokedOn !== null) {
        throw new ClassTeacherAlreadyRevokedError(id);
      }
      const updated = await this.repo.revoke(id, expectedVersion, revokedOn, tx);
      this.logger.log(`Revoked class teacher assignment ${id}.`);
      return updated;
    });
  }
}
