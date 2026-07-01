/**
 * ReportingModule — composition root for Sprint 13 Reporting, Import/Export
 * & Bulk Operations Foundation. Mirrors `AcademicContentModule`.
 *
 * Imports:
 *   - FeatureFlagModule    — `module.reporting` + 5 RELEASE flags.
 *   - OutboxModule         — 30 outbox topic publishers across report-run /
 *                             import / bulk-op / dashboard / schedule /
 *                             template.
 *   - SequencesModule      — RPT-<seq> / IMP-<seq> / BOP-<seq> / DSH-<seq>
 *                             / SCHED-<seq> / TPL-<seq> auto-coding.
 *   - FileStorageModule    — Report-export + bulk-import asset uploads via
 *                             FileAssetService.
 *   - NotificationsModule  — REPORT_READY / IMPORT_COMPLETED /
 *                             BULK_OPERATION_COMPLETED dispatch via
 *                             NotificationEventDispatcherService + registry
 *                             extension (5 catalog keys).
 *   - JobsModule           — JobEnqueueService + JobHandlerRegistry for
 *                             report.run / import.run / import.commit /
 *                             bulk-op.execute handlers.
 *   - StudentModule        — StudentService — read-side for STUDENT_LIST,
 *                             FEE_OUTSTANDING, FEE_COLLECTION_SUMMARY
 *                             engines + write-side for STUDENT import
 *                             committer.
 *   - AttendanceModule     — AttendanceReportService for the student +
 *                             staff attendance-summary engines.
 *   - FeesModule           — FeeLedgerService for the fee report engines.
 *
 * AuditModule, RbacModule, PrismaModule are @Global so not imported here.
 *
 * Sprint 13 Wave 5 wires the ReportRun sub-module end-to-end. Wave 6 wires
 * the ImportJob sub-module (controller + service + repositories +
 * parsers/validators/committers + import.run / import.commit job handlers).
 */
import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module';
import { FeatureFlagModule } from '../feature-flag';
import { FeesModule } from '../fees/fees.module';
import { FileStorageModule } from '../file-storage';
import { JobsModule } from '../jobs';
import { NotificationsModule } from '../notifications';
import { OutboxModule } from '../outbox';
import { SequencesModule } from '../sequences';
import { StudentModule } from '../student/student.module';
import { BulkOpExecuteHandler } from './bulk-operation/bulk-op-execute.handler';
import { BulkOperationController } from './bulk-operation/bulk-operation.controller';
import { BulkOperationRepository } from './bulk-operation/bulk-operation.repository';
import { BulkOperationService } from './bulk-operation/bulk-operation.service';
import { BulkOperationExecutorRegistry } from './bulk-operation/executors/executor.registry';
import { StudentPromoteExecutor } from './bulk-operation/executors/student-promote.executor';
import {
  AssignmentCloseExecutor,
  FeeWaiveExecutor,
  HomeworkCloseExecutor,
  StaffDeactivateExecutor,
  StudentDeactivateExecutor,
  StudentTransferSectionExecutor,
} from './bulk-operation/executors/stub.executors';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardWidgetRepository } from './dashboard/dashboard-widget.repository';
import { DashboardRepository } from './dashboard/dashboard.repository';
import { DashboardService } from './dashboard/dashboard.service';
import { ExportFormatterService } from './export/export-formatter.service';
import { AttendanceCommitter, ExamMarksCommitter, FeePaymentCommitter, StaffCommitter } from './import/committers/stub-committers';
import { RowCommitterRegistry } from './import/committers/committer.registry';
import { StudentCommitter } from './import/committers/student.committer';
import { ImportErrorExportService } from './import/error-export/error-export.service';
import { ImportCommitHandler } from './import/import-commit.handler';
import { ImportRunHandler } from './import/import-run.handler';
import { ImportJobIssueRepository } from './import/import-issue.repository';
import { ImportController } from './import/import.controller';
import { ImportJobRepository } from './import/import.repository';
import { ImportJobService } from './import/import.service';
import { ImportParserRegistry } from './import/parsers/parser.registry';
import { StudentParser } from './import/parsers/student.parser';
import {
  AttendanceParser,
  ExamMarksParser,
  FeePaymentParser,
  StaffParser,
} from './import/parsers/stub-parsers';
import { ImportPreviewService } from './import/preview/preview.service';
import { ImportTemplateBootstrap } from './import/templates/template.bootstrap';
import { ImportTemplateRegistry } from './import/templates/template.registry';
import { ImportTemplateService } from './import/templates/template.service';
import {
  FeeCollectionSummaryEngine,
} from './report-engine/fee-collection-summary.engine';
import { FeeOutstandingEngine } from './report-engine/fee-outstanding.engine';
import { ReportEngineRegistry } from './report-engine/report-engine.registry';
import { ReportEngineService } from './report-engine/report-engine.service';
import {
  ExamMarksSheetEngine,
  ExamResultSummaryEngine,
  HomeworkComplianceEngine,
  SyllabusProgressEngine,
} from './report-engine/scaffold.engines';
import { StaffAttendanceSummaryEngine } from './report-engine/staff-attendance-summary.engine';
import { StudentAttendanceSummaryEngine } from './report-engine/student-attendance-summary.engine';
import { StudentListEngine } from './report-engine/student-list.engine';
import { ReportController } from './report/report.controller';
import { ReportRunRepository } from './report/report.repository';
import { ReportRunService } from './report/report.service';
import { ReportRunHandler } from './report/report-run.handler';
import { ReportScheduleController } from './report-schedule/report-schedule.controller';
import { ReportScheduleRepository } from './report-schedule/report-schedule.repository';
import { ReportScheduleService } from './report-schedule/report-schedule.service';
import { ReportTemplateController } from './report-template/report-template.controller';
import { ReportTemplateRepository } from './report-template/report-template.repository';
import { ReportTemplateService } from './report-template/report-template.service';
import { ReportingFeatureFlagsBootstrap } from './reporting-feature-flags.bootstrap';
import { ReportingNotificationBootstrap } from './reporting-notification-bootstrap';
import { ReportingPermissionsSeeder } from './reporting-permissions.seeder';
import { StudentImportRowValidator } from './validation/student-import-row.validator';
import {
  AttendanceImportRowValidator,
  ExamMarksImportRowValidator,
  FeePaymentImportRowValidator,
  StaffImportRowValidator,
} from './validation/stub-validators';
import { ValidatorBootstrap } from './validation/validator.bootstrap';
import { ValidatorRegistry } from './validation/validator.registry';

@Module({
  imports: [
    FeatureFlagModule,
    OutboxModule,
    SequencesModule,
    FileStorageModule,
    NotificationsModule,
    JobsModule,
    StudentModule,
    AttendanceModule,
    FeesModule,
  ],
  controllers: [
    ReportController,
    ImportController,
    BulkOperationController,
    DashboardController,
    ReportScheduleController,
    ReportTemplateController,
  ],
  providers: [
    ReportingPermissionsSeeder,
    ReportingFeatureFlagsBootstrap,
    ReportingNotificationBootstrap,
    // Report-run sub-module
    ReportRunRepository,
    ReportRunService,
    ReportRunHandler,
    // Engines
    ReportEngineRegistry,
    ReportEngineService,
    StudentListEngine,
    StudentAttendanceSummaryEngine,
    StaffAttendanceSummaryEngine,
    FeeOutstandingEngine,
    FeeCollectionSummaryEngine,
    ExamMarksSheetEngine,
    ExamResultSummaryEngine,
    HomeworkComplianceEngine,
    SyllabusProgressEngine,
    // Export formatter
    ExportFormatterService,
    // Import sub-module
    ImportJobRepository,
    ImportJobIssueRepository,
    ImportJobService,
    ImportRunHandler,
    ImportCommitHandler,
    // Templates (Patch A)
    ImportTemplateRegistry,
    ImportTemplateService,
    ImportTemplateBootstrap,
    // Preview (Patch B)
    ImportPreviewService,
    // Error export (Patch C3)
    ImportErrorExportService,
    // Parsers
    ImportParserRegistry,
    StudentParser,
    StaffParser,
    ExamMarksParser,
    AttendanceParser,
    FeePaymentParser,
    // Committers
    RowCommitterRegistry,
    StudentCommitter,
    StaffCommitter,
    ExamMarksCommitter,
    AttendanceCommitter,
    FeePaymentCommitter,
    // Validators
    ValidatorRegistry,
    StudentImportRowValidator,
    StaffImportRowValidator,
    ExamMarksImportRowValidator,
    AttendanceImportRowValidator,
    FeePaymentImportRowValidator,
    ValidatorBootstrap,
    // Bulk-operation sub-module
    BulkOperationRepository,
    BulkOperationService,
    BulkOpExecuteHandler,
    BulkOperationExecutorRegistry,
    StudentPromoteExecutor,
    StudentTransferSectionExecutor,
    StudentDeactivateExecutor,
    StaffDeactivateExecutor,
    FeeWaiveExecutor,
    HomeworkCloseExecutor,
    AssignmentCloseExecutor,
    // Dashboard sub-module
    DashboardRepository,
    DashboardWidgetRepository,
    DashboardService,
    // Report-schedule sub-module
    ReportScheduleRepository,
    ReportScheduleService,
    // Report-template sub-module
    ReportTemplateRepository,
    ReportTemplateService,
  ],
  exports: [
    ReportRunService,
    ReportRunRepository,
    ReportEngineService,
    ReportEngineRegistry,
    ExportFormatterService,
    ImportJobService,
    ImportJobRepository,
    BulkOperationService,
    BulkOperationRepository,
    BulkOperationExecutorRegistry,
    DashboardService,
    DashboardRepository,
    ReportScheduleService,
    ReportScheduleRepository,
    ReportTemplateService,
    ReportTemplateRepository,
  ],
})
export class ReportingModule {}
