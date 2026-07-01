/**
 * Events module shared types — row shapes returned by repositories and
 * consumed by services / DTOs.
 */
import type {
  EventAttendanceMethodValue,
  EventAttendanceStatusValue,
  EventCategoryValue,
  EventDocumentTypeValue,
  EventFeeAssignmentStatusValue,
  EventParticipantAudienceValue,
  EventParticipantStatusValue,
  EventRegistrationTypeValue,
  EventResultPositionValue,
  EventStatusValue,
  EventTypeValue,
} from './events.constants';

export interface EventRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly eventType: EventTypeValue;
  readonly category: EventCategoryValue;
  readonly subType: string | null;
  readonly status: EventStatusValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly startTime: Date | null;
  readonly endTime: Date | null;
  readonly timezone: string;
  readonly branchId: string | null;
  readonly venue: string | null;
  readonly organizerStaffId: string | null;
  readonly registrationType: EventRegistrationTypeValue;
  readonly registrationOpen: boolean;
  readonly registrationOpenAt: Date | null;
  readonly registrationClosedAt: Date | null;
  readonly registrationCapacity: number | null;
  readonly isFree: boolean;
  readonly feeHeadId: string | null;
  readonly feeStructureId: string | null;
  readonly feeAmount: number | null;
  readonly estimatedCost: number | null;
  readonly actualCost: number | null;
  readonly sponsorshipAmount: number | null;
  readonly publishedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
  readonly registeredCount: number;
  readonly attendedCount: number;
  readonly absentCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface EventParticipantRow {
  readonly id: string;
  readonly schoolId: string;
  readonly eventId: string;
  readonly audience: EventParticipantAudienceValue;
  readonly userId: string;
  readonly studentId: string | null;
  readonly staffId: string | null;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly status: EventParticipantStatusValue;
  readonly registrationType: EventRegistrationTypeValue;
  readonly registeredAt: Date;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: Date | null;
  readonly rejectedBy: string | null;
  readonly rejectionReason: string | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
  readonly registrationSource: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface EventAttendanceRow {
  readonly id: string;
  readonly schoolId: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly status: EventAttendanceStatusValue;
  readonly method: EventAttendanceMethodValue;
  readonly occurredAt: Date;
  readonly markedBy: string | null;
  readonly deviceRef: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface EventDocumentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly eventId: string;
  readonly fileAssetId: string;
  readonly documentType: EventDocumentTypeValue;
  readonly title: string;
  readonly description: string | null;
  readonly isPublic: boolean;
  readonly uploadedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface EventFeeAssignmentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly studentId: string;
  readonly feeHeadId: string;
  readonly feeStructureId: string | null;
  readonly amount: number;
  readonly status: EventFeeAssignmentStatusValue;
  readonly feeInvoiceId: string | null;
  readonly invoicedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly voidedBy: string | null;
  readonly voidReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface EventResultRow {
  readonly id: string;
  readonly schoolId: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly rank: number | null;
  readonly position: EventResultPositionValue;
  readonly score: number | null;
  readonly remark: string | null;
  readonly awardedAt: Date | null;
  readonly awardedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}
