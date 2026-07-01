/**
 * StaffModule — composition root for the Staff domain.
 *
 * Imports AcademicModule (for Subject/Section/AcademicYear repositories used
 * by SubjectQualification / SectionAssignment / ClassTeacher services) and
 * SequencesModule (for atomic employee-code allocation).
 *
 * PrismaModule, RbacModule, and CryptoModule are `@Global`, so we don't need
 * to import them explicitly to get `PrismaService` / `PermissionRepository` /
 * `CryptoService` here.
 */
import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic';
import { SequencesModule } from '../sequences';
import { SubscriptionModule } from '../subscription';
import { ClassTeacherController } from './class-teacher/class-teacher.controller';
import { ClassTeacherService } from './class-teacher/class-teacher.service';
import { StaffDocumentController } from './document/staff-document.controller';
import { StaffDocumentService } from './document/staff-document.service';
import { StaffEmploymentHistoryController } from './employment-history/staff-employment-history.controller';
import { StaffLeaveController } from './leave/staff-leave.controller';
import { StaffLeaveService } from './leave/staff-leave.service';
import { StaffQualificationController } from './qualification/staff-qualification.controller';
import { StaffQualificationService } from './qualification/staff-qualification.service';
import { ClassTeacherRepository } from './repositories/class-teacher.repository';
import { StaffRepository } from './repositories/staff.repository';
import { StaffDocumentRepository } from './repositories/staff-document.repository';
import { StaffEmploymentHistoryRepository } from './repositories/staff-employment-history.repository';
import { StaffLeaveRepository } from './repositories/staff-leave.repository';
import { StaffQualificationRepository } from './repositories/staff-qualification.repository';
import { StaffSectionAssignmentRepository } from './repositories/staff-section-assignment.repository';
import { StaffSubjectQualificationRepository } from './repositories/staff-subject-qualification.repository';
import { StaffSectionAssignmentController } from './section-assignment/staff-section-assignment.controller';
import { StaffSectionAssignmentService } from './section-assignment/staff-section-assignment.service';
import { StaffController } from './staff/staff.controller';
import { StaffService } from './staff/staff.service';
import { StaffPermissionsSeeder } from './staff-permissions.seeder';
import { StaffSubjectQualificationController } from './subject-qualification/staff-subject-qualification.controller';
import { StaffSubjectQualificationService } from './subject-qualification/staff-subject-qualification.service';

@Module({
  imports: [AcademicModule, SequencesModule, SubscriptionModule],
  controllers: [
    StaffController,
    StaffQualificationController,
    StaffSubjectQualificationController,
    StaffSectionAssignmentController,
    StaffLeaveController,
    StaffDocumentController,
    StaffEmploymentHistoryController,
    ClassTeacherController,
  ],
  providers: [
    StaffRepository,
    StaffEmploymentHistoryRepository,
    StaffQualificationRepository,
    StaffSubjectQualificationRepository,
    StaffSectionAssignmentRepository,
    ClassTeacherRepository,
    StaffLeaveRepository,
    StaffDocumentRepository,
    StaffService,
    StaffQualificationService,
    StaffSubjectQualificationService,
    StaffSectionAssignmentService,
    ClassTeacherService,
    StaffLeaveService,
    StaffDocumentService,
    StaffPermissionsSeeder,
  ],
  exports: [StaffService],
})
export class StaffModule {}
