/**
 * ExaminationModule — composition root for Sprint 8 Examination Foundation.
 *
 * Sub-domains (added incrementally as each sub-module lands):
 *   - exam-scheme       — grading scheme + bands.
 *   - exam-definition   — DRAFT/PUBLISHED/ARCHIVED state machine + maps.
 *   - exam-schedule     — per-(exam, subject, section) slot rows + bulk.
 *   - exam-marks        — marks entry with edit-window + optimistic-lock.
 *   - exam-marks-history — append-only ledger reads.
 *   - exam-result       — idempotent compute + read endpoints.
 *
 * Imports:
 *   - FeatureFlagModule — `module.examination` gate consumed in every mutation.
 *   - OutboxModule      — transactional outbox publishes `examination.*` events.
 * AuditModule, RbacModule, PrismaModule are @Global so not imported explicitly.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { OutboxModule } from '../outbox';
import { ExaminationFeatureFlagsBootstrap } from './examination-feature-flags.bootstrap';
import { ExaminationPermissionsSeeder } from './examination-permissions.seeder';
import { ExamDefinitionController } from './exam-definition/exam-definition.controller';
import { ExamDefinitionRepository } from './exam-definition/exam-definition.repository';
import { ExamDefinitionService } from './exam-definition/exam-definition.service';
import { ExamMarksController } from './exam-marks/exam-marks.controller';
import { ExamMarksRepository } from './exam-marks/exam-marks.repository';
import { ExamMarksService } from './exam-marks/exam-marks.service';
import { ExamMarksHistoryController } from './exam-marks-history/exam-marks-history.controller';
import { ExamMarksHistoryRepository } from './exam-marks-history/exam-marks-history.repository';
import { ExamMarksHistoryService } from './exam-marks-history/exam-marks-history.service';
import { ExamResultController } from './exam-result/exam-result.controller';
import { ExamResultRepository } from './exam-result/exam-result.repository';
import { ExamResultService } from './exam-result/exam-result.service';
import { ExamScheduleController } from './exam-schedule/exam-schedule.controller';
import { ExamScheduleRepository } from './exam-schedule/exam-schedule.repository';
import { ExamScheduleService } from './exam-schedule/exam-schedule.service';
import { ExamSchemeController } from './exam-scheme/exam-scheme.controller';
import { ExamSchemeRepository } from './exam-scheme/exam-scheme.repository';
import { ExamSchemeService } from './exam-scheme/exam-scheme.service';

@Module({
  imports: [FeatureFlagModule, OutboxModule],
  controllers: [
    ExamSchemeController,
    ExamDefinitionController,
    ExamScheduleController,
    ExamMarksController,
    ExamMarksHistoryController,
    ExamResultController,
  ],
  providers: [
    ExamSchemeRepository,
    ExamDefinitionRepository,
    ExamScheduleRepository,
    ExamMarksRepository,
    ExamMarksHistoryRepository,
    ExamResultRepository,
    ExamSchemeService,
    ExamDefinitionService,
    ExamScheduleService,
    ExamMarksService,
    ExamMarksHistoryService,
    ExamResultService,
    ExaminationPermissionsSeeder,
    ExaminationFeatureFlagsBootstrap,
  ],
  exports: [
    ExamSchemeService,
    ExamDefinitionService,
    ExamScheduleService,
    ExamMarksService,
    ExamMarksHistoryService,
    ExamResultService,
  ],
})
export class ExaminationModule {}
