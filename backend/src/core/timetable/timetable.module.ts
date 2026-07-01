/**
 * TimetableModule — composition root for Sprint 7 Timetable Foundation.
 *
 * Sub-domains:
 *   - period-template   — period templates + their child periods.
 *   - version           — DRAFT/ACTIVE/ARCHIVED state machine.
 *   - entry             — section × day × period assignment + bulk insert
 *                         + ConflictDetectorService + append-only ledger.
 *   - teacher-load      — derived per-(version, staff) load cache.
 *   - availability      — teacher availability / unavailability windows.
 *   - view              — derived weekly grids for section/teacher/room.
 *
 * Imports:
 *   - FeatureFlagModule — `module.timetable` gate consumed in every
 *     mutation.
 *   - OutboxModule — transactional outbox publishes `timetable.*` events.
 *   - CalendarModule — `WorkingDayResolutionService` used by the entry
 *     write pipeline to gate NON_WORKING_DAY.
 * AuditModule, RbacModule, PrismaModule are @Global, so they are not
 * imported explicitly.
 */
import { Module } from '@nestjs/common';

import { CalendarModule } from '../calendar';
import { FeatureFlagModule } from '../feature-flag';
import { OutboxModule } from '../outbox';
import { TeacherAvailabilityController } from './availability/availability.controller';
import { TeacherAvailabilityRepository } from './availability/availability.repository';
import { TeacherAvailabilityService } from './availability/availability.service';
import { TimetableConflictController } from './entry/conflict.controller';
import { TimetableConflictDetectorService } from './entry/conflict-detector.service';
import { TimetableConflictRepository } from './entry/conflict.repository';
import { TimetableEntryController } from './entry/entry.controller';
import { TimetableEntryRepository } from './entry/entry.repository';
import { TimetableEntryService } from './entry/entry.service';
import { PeriodTemplateController } from './period-template/period-template.controller';
import { PeriodTemplateRepository } from './period-template/period-template.repository';
import { PeriodTemplateService } from './period-template/period-template.service';
import { TeacherLoadController } from './teacher-load/teacher-load.controller';
import { TeacherLoadRecomputer } from './teacher-load/teacher-load.recomputer';
import { TeacherLoadRepository } from './teacher-load/teacher-load.repository';
import { TeacherLoadService } from './teacher-load/teacher-load.service';
import { TimetableFeatureFlagsBootstrap } from './timetable-feature-flags.bootstrap';
import { TimetablePermissionsSeeder } from './timetable-permissions.seeder';
import { TimetableVersionController } from './version/version.controller';
import { TimetableVersionRepository } from './version/version.repository';
import { TimetableVersionService } from './version/version.service';
import { TimetableViewController } from './view/view.controller';
import { TimetableViewService } from './view/view.service';

@Module({
  imports: [FeatureFlagModule, OutboxModule, CalendarModule],
  controllers: [
    PeriodTemplateController,
    TimetableVersionController,
    TimetableEntryController,
    TimetableConflictController,
    TeacherAvailabilityController,
    TeacherLoadController,
    TimetableViewController,
  ],
  providers: [
    PeriodTemplateRepository,
    TimetableVersionRepository,
    TimetableEntryRepository,
    TimetableConflictRepository,
    TeacherAvailabilityRepository,
    TeacherLoadRepository,
    PeriodTemplateService,
    TimetableVersionService,
    TimetableConflictDetectorService,
    TimetableEntryService,
    TeacherAvailabilityService,
    TeacherLoadRecomputer,
    TeacherLoadService,
    TimetableViewService,
    TimetablePermissionsSeeder,
    TimetableFeatureFlagsBootstrap,
  ],
  exports: [
    PeriodTemplateService,
    TimetableVersionService,
    TimetableEntryService,
    TeacherAvailabilityService,
    TeacherLoadService,
  ],
})
export class TimetableModule {}
