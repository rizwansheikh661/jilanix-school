/**
 * AcademicModule — composition root for the Academic Foundation domain.
 *
 * Sprint 2 shipped AcademicYear / Class / Section / Subject. Sprint 4 adds
 * four more resources that close out the curriculum surface:
 *   - AcademicTerm           — `/academic-years/:yearId/terms` + `/academic-terms/:id`
 *   - ClassSubject           — `/classes/:classId/subjects` (replace-set semantics)
 *   - SectionSubject         — `/sections/:sectionId/subject-overrides` + effective view
 *   - AcademicYearPromotion  — `/promotions` (schema-only this sprint, engine Sprint 9)
 *
 * PrismaModule and RbacModule are `@Global`, so we don't need to import them
 * explicitly to get `PrismaService` and `PermissionRepository` here.
 *
 * Nothing is re-exported: feature modules should not reach inside Academic
 * to call its services directly. The `index.ts` barrel exposes only the
 * module, the permission catalog, the typed error classes, and the public
 * `Row` types — see `BACKEND_ARCHITECTURE §3.2`.
 */
import { Module } from '@nestjs/common';

import { AcademicPermissionsSeeder } from './academic-permissions.seeder';
import { ClassController } from './class/class.controller';
import { ClassService } from './class/class.service';
import { ClassSubjectController } from './class-subject/class-subject.controller';
import { ClassSubjectService } from './class-subject/class-subject.service';
import { AcademicYearPromotionController } from './promotion/academic-year-promotion.controller';
import { AcademicYearPromotionService } from './promotion/academic-year-promotion.service';
import { AcademicTermRepository } from './repositories/academic-term.repository';
import { AcademicYearPromotionRepository } from './repositories/academic-year-promotion.repository';
import { AcademicYearRepository } from './repositories/academic-year.repository';
import { ClassRepository } from './repositories/class.repository';
import { ClassSubjectRepository } from './repositories/class-subject.repository';
import { SectionRepository } from './repositories/section.repository';
import { SectionSubjectRepository } from './repositories/section-subject.repository';
import { SubjectRepository } from './repositories/subject.repository';
import { SectionController } from './section/section.controller';
import { SectionService } from './section/section.service';
import { SectionSubjectController } from './section-subject/section-subject.controller';
import { SectionSubjectService } from './section-subject/section-subject.service';
import { SubjectController } from './subject/subject.controller';
import { SubjectService } from './subject/subject.service';
import {
  AcademicTermController,
  AcademicTermYearScopedController,
} from './term/academic-term.controller';
import { AcademicTermService } from './term/academic-term.service';
import { AcademicYearController } from './year/academic-year.controller';
import { AcademicYearService } from './year/academic-year.service';

@Module({
  controllers: [
    AcademicYearController,
    ClassController,
    SectionController,
    SubjectController,
    AcademicTermYearScopedController,
    AcademicTermController,
    ClassSubjectController,
    SectionSubjectController,
    AcademicYearPromotionController,
  ],
  providers: [
    AcademicYearRepository,
    ClassRepository,
    SectionRepository,
    SubjectRepository,
    AcademicTermRepository,
    ClassSubjectRepository,
    SectionSubjectRepository,
    AcademicYearPromotionRepository,
    AcademicYearService,
    ClassService,
    SectionService,
    SubjectService,
    AcademicTermService,
    ClassSubjectService,
    SectionSubjectService,
    AcademicYearPromotionService,
    AcademicPermissionsSeeder,
  ],
  exports: [
    AcademicYearRepository,
    ClassRepository,
    SectionRepository,
    SubjectRepository,
  ],
})
export class AcademicModule {}
