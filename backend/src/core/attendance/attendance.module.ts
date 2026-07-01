/**
 * AttendanceModule — composition root for Sprint 6 Attendance Foundation.
 *
 * Wires 7 sub-domains (config, lock-window, student-attendance,
 * status-history, correction, staff-attendance, report) plus the
 * holiday-lookup helper, permissions seeder, and feature-flag bootstrap.
 *
 * Imports:
 *   - FeatureFlagModule — `module.attendance` gate consumed in every
 *     mutation.
 *   - OutboxModule — transactional outbox publishes `attendance.*` events.
 * AuditModule, RbacModule, PrismaModule are @Global, so they are not
 * imported explicitly.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { OutboxModule } from '../outbox';
import { AttendanceConfigController } from './config/config.controller';
import { AttendanceConfigRepository } from './config/config.repository';
import { AttendanceConfigService } from './config/config.service';
import { AttendanceCorrectionController } from './correction/correction.controller';
import { AttendanceCorrectionRepository } from './correction/correction.repository';
import { AttendanceCorrectionService } from './correction/correction.service';
import { HolidayLookupService } from './holiday-lookup.service';
import { AttendanceLockWindowController } from './lock-window/lock-window.controller';
import { AttendanceLockWindowRepository } from './lock-window/lock-window.repository';
import { AttendanceLockWindowService } from './lock-window/lock-window.service';
import { AttendanceReportController } from './report/report.controller';
import { AttendanceReportService } from './report/report.service';
import { StaffAttendanceController } from './staff-attendance/staff-attendance.controller';
import { StaffAttendanceRepository } from './staff-attendance/staff-attendance.repository';
import { StaffAttendanceService } from './staff-attendance/staff-attendance.service';
import { AttendanceStatusHistoryController } from './status-history/status-history.controller';
import { AttendanceStatusHistoryRepository } from './status-history/status-history.repository';
import { AttendanceStatusHistoryService } from './status-history/status-history.service';
import { AttendanceDailyRepository } from './student-attendance/attendance-daily.repository';
import { StudentAttendanceController } from './student-attendance/student-attendance.controller';
import { StudentAttendanceService } from './student-attendance/student-attendance.service';
import { AttendanceFeatureFlagsBootstrap } from './attendance-feature-flags.bootstrap';
import { AttendancePermissionsSeeder } from './attendance-permissions.seeder';

@Module({
  imports: [FeatureFlagModule, OutboxModule],
  controllers: [
    AttendanceConfigController,
    AttendanceLockWindowController,
    StudentAttendanceController,
    AttendanceStatusHistoryController,
    AttendanceCorrectionController,
    StaffAttendanceController,
    AttendanceReportController,
  ],
  providers: [
    AttendanceConfigRepository,
    AttendanceLockWindowRepository,
    AttendanceDailyRepository,
    AttendanceStatusHistoryRepository,
    AttendanceCorrectionRepository,
    StaffAttendanceRepository,
    AttendanceConfigService,
    AttendanceLockWindowService,
    StudentAttendanceService,
    AttendanceStatusHistoryService,
    AttendanceCorrectionService,
    StaffAttendanceService,
    AttendanceReportService,
    HolidayLookupService,
    AttendancePermissionsSeeder,
    AttendanceFeatureFlagsBootstrap,
  ],
  exports: [
    StudentAttendanceService,
    StaffAttendanceService,
    AttendanceConfigService,
    AttendanceLockWindowService,
    AttendanceReportService,
  ],
})
export class AttendanceModule {}
