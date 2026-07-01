/**
 * AcademicContentModule — composition root for Sprint 12 Homework, Assignments
 * & Syllabus Foundation. Mirrors `EventsModule`.
 *
 * Imports:
 *   - FeatureFlagModule   — `module.academic-content` + 4 RELEASE flags.
 *   - OutboxModule        — 24 outbox topic publishers across homework /
 *                            assignment / submission / syllabus.
 *   - SequencesModule     — HW-<seq> / ASGN-<seq> auto-coding
 *                            (SEQ_NAMES.HOMEWORK / SEQ_NAMES.ASSIGNMENT).
 *   - FileStorageModule   — Homework/Assignment/Submission attachment uploads
 *                            via FileAssetService.
 *   - NotificationsModule — lifecycle dispatch via
 *                            NotificationEventDispatcherService + registry
 *                            extension (7 catalog keys).
 *
 * AuditModule, RbacModule, PrismaModule are @Global so not imported here.
 *
 * Sub-module providers are added in waves 4-9. This skeleton wave only
 * registers the bootstraps so `module.academic-content` + the 29 RBAC keys
 * + the 7 notification catalog entries are live at boot.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { FileStorageModule } from '../file-storage';
import { NotificationsModule } from '../notifications';
import { OutboxModule } from '../outbox';
import { SequencesModule } from '../sequences';
import { AcademicContentFeatureFlagsBootstrap } from './academic-content-feature-flags.bootstrap';
import { AcademicContentNotificationBootstrap } from './academic-content-notification-bootstrap';
import { AcademicContentPermissionsSeeder } from './academic-content-permissions.seeder';
import { AssignmentAttachmentController } from './assignment-attachment/assignment-attachment.controller';
import { AssignmentAttachmentRepository } from './assignment-attachment/assignment-attachment.repository';
import { AssignmentAttachmentService } from './assignment-attachment/assignment-attachment.service';
import { AssignmentSubmissionAttachmentRepository } from './assignment-submission/assignment-submission-attachment.repository';
import { AssignmentSubmissionAttachmentService } from './assignment-submission/assignment-submission-attachment.service';
import { AssignmentSubmissionController } from './assignment-submission/assignment-submission.controller';
import { AssignmentSubmissionRepository } from './assignment-submission/assignment-submission.repository';
import { AssignmentSubmissionService } from './assignment-submission/assignment-submission.service';
import { AssignmentController } from './assignment/assignment.controller';
import { AssignmentRepository } from './assignment/assignment.repository';
import { AssignmentService } from './assignment/assignment.service';
import { SyllabusController } from './syllabus/syllabus.controller';
import { SyllabusRepository } from './syllabus/syllabus.repository';
import { SyllabusService } from './syllabus/syllabus.service';
import { HomeworkAttachmentController } from './homework-attachment/homework-attachment.controller';
import { HomeworkAttachmentRepository } from './homework-attachment/homework-attachment.repository';
import { HomeworkAttachmentService } from './homework-attachment/homework-attachment.service';
import { HomeworkController } from './homework/homework.controller';
import { HomeworkRepository } from './homework/homework.repository';
import { HomeworkService } from './homework/homework.service';

@Module({
  imports: [
    FeatureFlagModule,
    OutboxModule,
    SequencesModule,
    FileStorageModule,
    NotificationsModule,
  ],
  controllers: [
    HomeworkController,
    HomeworkAttachmentController,
    AssignmentController,
    AssignmentAttachmentController,
    AssignmentSubmissionController,
    SyllabusController,
  ],
  providers: [
    AcademicContentPermissionsSeeder,
    AcademicContentFeatureFlagsBootstrap,
    AcademicContentNotificationBootstrap,
    HomeworkRepository,
    HomeworkService,
    HomeworkAttachmentRepository,
    HomeworkAttachmentService,
    AssignmentRepository,
    AssignmentService,
    AssignmentAttachmentRepository,
    AssignmentAttachmentService,
    AssignmentSubmissionRepository,
    AssignmentSubmissionService,
    AssignmentSubmissionAttachmentRepository,
    AssignmentSubmissionAttachmentService,
    SyllabusRepository,
    SyllabusService,
  ],
  exports: [
    HomeworkRepository,
    HomeworkService,
    HomeworkAttachmentRepository,
    HomeworkAttachmentService,
    AssignmentRepository,
    AssignmentService,
    AssignmentAttachmentRepository,
    AssignmentAttachmentService,
    AssignmentSubmissionRepository,
    AssignmentSubmissionService,
    AssignmentSubmissionAttachmentRepository,
    AssignmentSubmissionAttachmentService,
    SyllabusRepository,
    SyllabusService,
  ],
})
export class AcademicContentModule {}
