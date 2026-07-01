/**
 * Events module constants — permission keys, feature flag keys, outbox
 * topics, shared enum value tuples, and numeric/format guardrails.
 *
 * Sprint 11 ships the Events & Activities foundation:
 *   - Event header + 6-state lifecycle (DRAFT → SCHEDULED → PUBLISHED →
 *     ONGOING → COMPLETED; CANCELLED from any non-terminal).
 *   - Single EventParticipant table keyed by audience (STUDENT|STAFF|TEACHER).
 *   - Append-only EventAttendance ledger (MANUAL only; QR/RFID reserved).
 *   - EventFeeAssignment bridge to Sprint 9 FeeInvoice with manual batch
 *     invoice generation.
 *   - EventDocument as first real consumer of Sprint 5 FileAsset.
 *   - EventResult foundation (no certificate generation in v1).
 *   - 6 notification event-key catalog entries registered with Sprint 10.
 *   - 5 feature flags + 29 RBAC permission keys + 21 outbox topics.
 */

// ---------------------------------------------------------------------------
// Permissions — 29 keys.
// ---------------------------------------------------------------------------
export const EventsPermissions = {
  // Event header (11)
  EVENT_READ: 'event.read',
  EVENT_CREATE: 'event.create',
  EVENT_UPDATE: 'event.update',
  EVENT_DELETE: 'event.delete',
  EVENT_SCHEDULE: 'event.schedule',
  EVENT_PUBLISH: 'event.publish',
  EVENT_START: 'event.start',
  EVENT_COMPLETE: 'event.complete',
  EVENT_CANCEL: 'event.cancel',
  EVENT_OPEN_REGISTRATION: 'event.open-registration',
  EVENT_CLOSE_REGISTRATION: 'event.close-registration',
  // Participant (6)
  PARTICIPANT_READ: 'event-participant.read',
  PARTICIPANT_CREATE: 'event-participant.create',
  PARTICIPANT_BULK_REGISTER: 'event-participant.bulk-register',
  PARTICIPANT_APPROVE: 'event-participant.approve',
  PARTICIPANT_REJECT: 'event-participant.reject',
  PARTICIPANT_CANCEL: 'event-participant.cancel',
  // Attendance (3)
  ATTENDANCE_READ: 'event-attendance.read',
  ATTENDANCE_MARK: 'event-attendance.mark',
  ATTENDANCE_MARK_BULK: 'event-attendance.mark-bulk',
  // Fee assignment (3)
  FEE_ASSIGNMENT_READ: 'event-fee-assignment.read',
  FEE_ASSIGNMENT_GENERATE_INVOICES: 'event-fee-assignment.generate-invoices',
  FEE_ASSIGNMENT_VOID: 'event-fee-assignment.void',
  // Document (3)
  DOCUMENT_READ: 'event-document.read',
  DOCUMENT_CREATE: 'event-document.create',
  DOCUMENT_DELETE: 'event-document.delete',
  // Result (3)
  RESULT_READ: 'event-result.read',
  RESULT_CREATE: 'event-result.create',
  RESULT_UPDATE: 'event-result.update',
  RESULT_DELETE: 'event-result.delete',
} as const;

export type EventsPermission =
  (typeof EventsPermissions)[keyof typeof EventsPermissions];

export const EVENTS_PERMISSION_DESCRIPTIONS: Readonly<
  Record<EventsPermission, string>
> = Object.freeze({
  [EventsPermissions.EVENT_READ]: 'List or read events with header + counts.',
  [EventsPermissions.EVENT_CREATE]: 'Create a DRAFT event.',
  [EventsPermissions.EVENT_UPDATE]:
    'Update an event (free in DRAFT; schedule-shift only after publish).',
  [EventsPermissions.EVENT_DELETE]:
    'Soft-delete an event; refused once PUBLISHED/ONGOING (cancel first).',
  [EventsPermissions.EVENT_SCHEDULE]: 'Transition DRAFT → SCHEDULED.',
  [EventsPermissions.EVENT_PUBLISH]:
    'Transition SCHEDULED → PUBLISHED; dispatches EVENT_PUBLISHED notification.',
  [EventsPermissions.EVENT_START]: 'Transition PUBLISHED → ONGOING.',
  [EventsPermissions.EVENT_COMPLETE]: 'Transition ONGOING → COMPLETED.',
  [EventsPermissions.EVENT_CANCEL]:
    'Cancel from any non-terminal state; cancels participants + voids open fee assignments.',
  [EventsPermissions.EVENT_OPEN_REGISTRATION]:
    'Open registration window; dispatches EVENT_REGISTRATION_OPENED.',
  [EventsPermissions.EVENT_CLOSE_REGISTRATION]:
    'Close registration window; dispatches EVENT_REGISTRATION_CLOSED.',
  [EventsPermissions.PARTICIPANT_READ]: 'List or read event participants.',
  [EventsPermissions.PARTICIPANT_CREATE]: 'Register an individual participant.',
  [EventsPermissions.PARTICIPANT_BULK_REGISTER]:
    'Bulk-register a whole class or section (audience=STUDENT).',
  [EventsPermissions.PARTICIPANT_APPROVE]:
    'Approve a PENDING participant (APPROVAL_REQUIRED registrations).',
  [EventsPermissions.PARTICIPANT_REJECT]: 'Reject a PENDING participant.',
  [EventsPermissions.PARTICIPANT_CANCEL]:
    'Soft-delete / cancel a participant registration.',
  [EventsPermissions.ATTENDANCE_READ]:
    'List participant attendance summary (latest-row-wins per participant).',
  [EventsPermissions.ATTENDANCE_MARK]:
    'Append an EventAttendance ledger row for a single participant.',
  [EventsPermissions.ATTENDANCE_MARK_BULK]:
    'Append EventAttendance ledger rows for a batch of participants.',
  [EventsPermissions.FEE_ASSIGNMENT_READ]:
    'List EventFeeAssignment rows for an event.',
  [EventsPermissions.FEE_ASSIGNMENT_GENERATE_INVOICES]:
    'Batch-generate FeeInvoices for PENDING assignments (flag-gated).',
  [EventsPermissions.FEE_ASSIGNMENT_VOID]:
    'Void an EventFeeAssignment; does NOT cancel the underlying invoice.',
  [EventsPermissions.DOCUMENT_READ]: 'List or read event documents.',
  [EventsPermissions.DOCUMENT_CREATE]:
    'Upload a document (multipart) and attach via FileAsset.',
  [EventsPermissions.DOCUMENT_DELETE]:
    'Soft-delete an EventDocument and the underlying FileAsset.',
  [EventsPermissions.RESULT_READ]: 'List or read event results.',
  [EventsPermissions.RESULT_CREATE]: 'Record a result for a participant.',
  [EventsPermissions.RESULT_UPDATE]: 'Update a recorded result.',
  [EventsPermissions.RESULT_DELETE]: 'Soft-delete a result row.',
});

// ---------------------------------------------------------------------------
// Feature flags — 5 keys.
// ---------------------------------------------------------------------------
export const EventsFeatureFlags = {
  MODULE: 'module.events',
  ALLOW_PUBLISH: 'events.allow_publish',
  ALLOW_FEE_GENERATION: 'events.allow_fee_generation',
  ALLOW_BULK_REGISTRATION: 'events.allow_bulk_registration',
  NOTIFY_ON_LIFECYCLE: 'events.notify_on_lifecycle',
} as const;

export type EventsFeatureFlag =
  (typeof EventsFeatureFlags)[keyof typeof EventsFeatureFlags];

// ---------------------------------------------------------------------------
// Outbox topics — 21 keys.
// ---------------------------------------------------------------------------
export const EventsOutboxTopics = {
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_SCHEDULED: 'event.scheduled',
  EVENT_PUBLISHED: 'event.published',
  EVENT_STARTED: 'event.started',
  EVENT_COMPLETED: 'event.completed',
  EVENT_CANCELLED: 'event.cancelled',
  EVENT_DELETED: 'event.deleted',
  EVENT_REGISTRATION_OPENED: 'event.registration_opened',
  EVENT_REGISTRATION_CLOSED: 'event.registration_closed',

  PARTICIPANT_REGISTERED: 'event.participant.registered',
  PARTICIPANT_APPROVED: 'event.participant.approved',
  PARTICIPANT_REJECTED: 'event.participant.rejected',
  PARTICIPANT_CANCELLED: 'event.participant.cancelled',

  ATTENDANCE_MARKED: 'event.attendance.marked',

  FEE_ASSIGNMENT_CREATED: 'event.fee_assignment.created',
  FEE_ASSIGNMENT_INVOICED: 'event.fee_assignment.invoiced',
  FEE_ASSIGNMENT_VOIDED: 'event.fee_assignment.voided',

  DOCUMENT_UPLOADED: 'event.document.uploaded',
  DOCUMENT_DELETED: 'event.document.deleted',

  RESULT_RECORDED: 'event.result.recorded',
} as const;

export type EventsOutboxTopic =
  (typeof EventsOutboxTopics)[keyof typeof EventsOutboxTopics];

// ---------------------------------------------------------------------------
// Notification event keys — 6 (registered with NotificationEventRegistry at
// boot via EventsNotificationBootstrap).
// ---------------------------------------------------------------------------
export const EventsNotificationEventKeys = {
  EVENT_CREATED: 'EVENT_CREATED',
  EVENT_PUBLISHED: 'EVENT_PUBLISHED',
  EVENT_REGISTRATION_OPENED: 'EVENT_REGISTRATION_OPENED',
  EVENT_REGISTRATION_CLOSED: 'EVENT_REGISTRATION_CLOSED',
  EVENT_REMINDER: 'EVENT_REMINDER',
  EVENT_CANCELLED: 'EVENT_CANCELLED',
} as const;

export type EventsNotificationEventKey =
  (typeof EventsNotificationEventKeys)[keyof typeof EventsNotificationEventKeys];

// ---------------------------------------------------------------------------
// Enum value tuples — kept alongside DTOs for `@IsEnum` use.
// ---------------------------------------------------------------------------
export const EVENT_TYPE_VALUES = [
  'ACADEMIC',
  'CULTURAL',
  'SPORTS',
  'NATIONAL',
  'SCHOOL_FUNCTION',
  'WORKSHOP',
  'SEMINAR',
  'COMPETITION',
  'EDUCATIONAL_TOUR',
  'PICNIC',
  'CUSTOM',
] as const;
export type EventTypeValue = (typeof EVENT_TYPE_VALUES)[number];

export const EVENT_CATEGORY_VALUES = [
  'ACADEMIC',
  'CULTURAL',
  'SPORTS',
  'NATIONAL',
  'ADMINISTRATIVE',
  'EDUCATIONAL_TOUR',
  'COMPETITION',
  'WORKSHOP',
  'SEMINAR',
  'CUSTOM',
] as const;
export type EventCategoryValue = (typeof EVENT_CATEGORY_VALUES)[number];

export const EVENT_STATUS_VALUES = [
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type EventStatusValue = (typeof EVENT_STATUS_VALUES)[number];

export const EVENT_REGISTRATION_TYPE_VALUES = [
  'OPEN',
  'APPROVAL_REQUIRED',
  'INVITATION_ONLY',
] as const;
export type EventRegistrationTypeValue =
  (typeof EVENT_REGISTRATION_TYPE_VALUES)[number];

export const EVENT_PARTICIPANT_AUDIENCE_VALUES = [
  'STUDENT',
  'STAFF',
  'TEACHER',
] as const;
export type EventParticipantAudienceValue =
  (typeof EVENT_PARTICIPANT_AUDIENCE_VALUES)[number];

export const EVENT_PARTICIPANT_STATUS_VALUES = [
  'PENDING',
  'REGISTERED',
  'INVITED',
  'REJECTED',
  'CANCELLED',
] as const;
export type EventParticipantStatusValue =
  (typeof EVENT_PARTICIPANT_STATUS_VALUES)[number];

export const EVENT_ATTENDANCE_STATUS_VALUES = [
  'REGISTERED',
  'ATTENDED',
  'ABSENT',
  'CANCELLED',
] as const;
export type EventAttendanceStatusValue =
  (typeof EVENT_ATTENDANCE_STATUS_VALUES)[number];

export const EVENT_ATTENDANCE_METHOD_VALUES = ['MANUAL', 'QR', 'RFID'] as const;
export type EventAttendanceMethodValue =
  (typeof EVENT_ATTENDANCE_METHOD_VALUES)[number];

export const EVENT_DOCUMENT_TYPE_VALUES = [
  'CIRCULAR',
  'GUIDELINE',
  'PERMISSION_FORM',
  'IMAGE',
  'ATTACHMENT',
] as const;
export type EventDocumentTypeValue =
  (typeof EVENT_DOCUMENT_TYPE_VALUES)[number];

export const EVENT_FEE_ASSIGNMENT_STATUS_VALUES = [
  'PENDING',
  'INVOICED',
  'VOID',
] as const;
export type EventFeeAssignmentStatusValue =
  (typeof EVENT_FEE_ASSIGNMENT_STATUS_VALUES)[number];

export const EVENT_RESULT_POSITION_VALUES = [
  'WINNER',
  'RUNNER_UP',
  'THIRD',
  'PARTICIPANT',
] as const;
export type EventResultPositionValue =
  (typeof EVENT_RESULT_POSITION_VALUES)[number];

// ---------------------------------------------------------------------------
// Numeric / format guardrails.
// ---------------------------------------------------------------------------
/** Event code character set — uppercase, digits, underscores, dashes, dots. */
export const EVENT_CODE_PATTERN = /^[A-Z0-9_\-\.]{2,40}$/;

/** HH:MM 24-hour format for startTime / endTime. */
export const TIME_HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hard ceiling on registration capacity. */
export const MAX_REGISTRATION_CAPACITY = 100_000;

/** Hard ceiling on money fields (rupees). */
export const MAX_MONEY_AMOUNT = 99_999_999;

/** Cap on bulk-registration roster size (one transaction). */
export const BULK_REGISTRATION_MAX_STUDENTS = 1000;

/** Cap on bulk-attendance batch size (one transaction). */
export const BULK_ATTENDANCE_MAX = 1000;

/** Batch size for generate-invoices endpoint chunking. */
export const FEE_INVOICE_GENERATION_BATCH_SIZE = 100;

/** Default registration source label for participants created via API. */
export const REGISTRATION_SOURCE_INDIVIDUAL = 'INDIVIDUAL';
export const REGISTRATION_SOURCE_BULK_CLASS = 'BULK_CLASS';
export const REGISTRATION_SOURCE_BULK_SECTION = 'BULK_SECTION';
export const REGISTRATION_SOURCE_INVITATION = 'INVITATION';
