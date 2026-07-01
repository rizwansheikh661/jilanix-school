/**
 * EventsModule — composition root for Sprint 11 Events & Activities
 * Foundation. Mirrors `NotificationsModule`.
 *
 * Imports:
 *   - FeatureFlagModule   — `module.events` + 4 RELEASE flags.
 *   - OutboxModule        — 21 `event.*` topic publishers.
 *   - SequencesModule     — EVT-<seq> auto-coding (SEQ_NAMES.EVENT).
 *   - FileStorageModule   — EventDocument uploads via FileAssetService.
 *   - NotificationsModule — lifecycle dispatch via
 *                            NotificationEventDispatcherService + registry
 *                            extension.
 *   - FeesModule          — manual batch invoice generation via
 *                            FeeInvoiceService.
 *
 * AuditModule, RbacModule, PrismaModule are @Global so not imported here.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { FeesModule } from '../fees';
import { FileStorageModule } from '../file-storage';
import { NotificationsModule } from '../notifications';
import { OutboxModule } from '../outbox';
import { SequencesModule } from '../sequences';
import { EventAttendanceController } from './event-attendance/event-attendance.controller';
import { EventAttendanceRepository } from './event-attendance/event-attendance.repository';
import { EventAttendanceService } from './event-attendance/event-attendance.service';
import { EventDocumentController } from './event-document/event-document.controller';
import { EventDocumentRepository } from './event-document/event-document.repository';
import { EventDocumentService } from './event-document/event-document.service';
import { EventFeeAssignmentController } from './event-fee-assignment/event-fee-assignment.controller';
import { EventFeeAssignmentRepository } from './event-fee-assignment/event-fee-assignment.repository';
import { EventFeeAssignmentService } from './event-fee-assignment/event-fee-assignment.service';
import { EventParticipantController } from './event-participant/event-participant.controller';
import { EventParticipantRepository } from './event-participant/event-participant.repository';
import { EventParticipantService } from './event-participant/event-participant.service';
import { EventResultController } from './event-result/event-result.controller';
import { EventResultRepository } from './event-result/event-result.repository';
import { EventResultService } from './event-result/event-result.service';
import { EventController } from './event/event.controller';
import { EventRepository } from './event/event.repository';
import { EventService } from './event/event.service';
import { EventsFeatureFlagsBootstrap } from './events-feature-flags.bootstrap';
import { EventsNotificationBootstrap } from './events-notification-bootstrap';
import { EventsPermissionsSeeder } from './events-permissions.seeder';

@Module({
  imports: [
    FeatureFlagModule,
    OutboxModule,
    SequencesModule,
    FileStorageModule,
    NotificationsModule,
    FeesModule,
  ],
  controllers: [
    EventController,
    EventParticipantController,
    EventAttendanceController,
    EventFeeAssignmentController,
    EventDocumentController,
    EventResultController,
  ],
  providers: [
    EventRepository,
    EventService,
    EventParticipantRepository,
    EventParticipantService,
    EventAttendanceRepository,
    EventAttendanceService,
    EventFeeAssignmentRepository,
    EventFeeAssignmentService,
    EventDocumentRepository,
    EventDocumentService,
    EventResultRepository,
    EventResultService,
    EventsPermissionsSeeder,
    EventsFeatureFlagsBootstrap,
    EventsNotificationBootstrap,
  ],
  exports: [
    EventService,
    EventParticipantService,
    EventAttendanceService,
    EventFeeAssignmentService,
    EventDocumentService,
    EventResultService,
  ],
})
export class EventsModule {}
