/**
 * Events domain errors. All extend the shared `DomainError` hierarchy so the
 * global filter maps them to the canonical envelope via `ERROR_CODES`.
 *
 * Note: `VersionConflictError`, `NotFoundError`, and `ConflictError` are
 * reused from `core/errors` / `infra/prisma/errors` where appropriate.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type {
  EventFeeAssignmentStatusValue,
  EventParticipantStatusValue,
  EventStatusValue,
} from './events.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class EventNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Event', id);
  }
}

export class EventParticipantNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('EventParticipant', id);
  }
}

export class EventDocumentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('EventDocument', id);
  }
}

export class EventFeeAssignmentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('EventFeeAssignment', id);
  }
}

export class EventResultNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('EventResult', id);
  }
}

// ---------------------------------------------------------------------------
// Conflict (duplicate code / participant — STORED deleted_at_key partial unique)
// ---------------------------------------------------------------------------
export class DuplicateEventCodeError extends ConflictError {
  constructor(code: string) {
    super('An event with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'Event', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateEventParticipantError extends ConflictError {
  constructor(eventId: string, userId: string) {
    super('User is already registered for this event.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'EventParticipant', eventId, userId },
    });
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class EventsModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Events module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.events' },
    });
  }
}

export class EventFeeGenerationDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        'Event fee-invoice generation is disabled. Enable the events.allow_fee_generation flag.',
      details: { flag: 'events.allow_fee_generation' },
    });
  }
}

export class EventBulkRegistrationDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        'Bulk registration is disabled. Enable the events.allow_bulk_registration flag.',
      details: { flag: 'events.allow_bulk_registration' },
    });
  }
}

// ---------------------------------------------------------------------------
// State / lifecycle
// ---------------------------------------------------------------------------
export class EventInvalidStateTransitionError extends DomainError {
  constructor(id: string, from: EventStatusValue, to: EventStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Event cannot transition from ${from} to ${to}.`,
      details: { reason: 'INVALID_STATE_TRANSITION', id, from, to },
    });
  }
}

export class EventNotEditableError extends DomainError {
  constructor(id: string, status: EventStatusValue, field: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Field "${field}" is not editable once the event status is ${status}.`,
      details: { reason: 'NOT_EDITABLE', id, status, field },
    });
  }
}

export class EventDateRangeInvalidError extends DomainError {
  constructor(startDate: string, endDate: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Event endDate (${endDate}) must be on or after startDate (${startDate}).`,
      details: { reason: 'INVALID_DATE_RANGE', startDate, endDate },
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export class EventRegistrationClosedError extends DomainError {
  constructor(id: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Registration is closed for this event.',
      details: { reason: 'REGISTRATION_CLOSED', id },
    });
  }
}

export class EventCapacityExceededError extends DomainError {
  constructor(id: string, capacity: number, registered: number) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Event registration capacity (${capacity}) reached.`,
      details: { reason: 'CAPACITY_EXCEEDED', id, capacity, registered },
    });
  }
}

export class EventParticipantNotApprovableError extends DomainError {
  constructor(id: string, status: EventParticipantStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Participant is not in a state that can be approved/rejected (current=${status}).`,
      details: { reason: 'NOT_APPROVABLE', id, status },
    });
  }
}

export class EventInvitationOnlyError extends DomainError {
  constructor(id: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        'This event is INVITATION_ONLY; admins must invite participants explicitly.',
      details: { reason: 'INVITATION_ONLY', id },
    });
  }
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------
export class EventNotPaidError extends DomainError {
  constructor(id: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Operation requires a paid event (isFree=false).',
      details: { reason: 'EVENT_NOT_PAID', id },
    });
  }
}

export class EventFeeHeadMissingError extends DomainError {
  constructor(id: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message:
        'Paid event requires feeHeadId (and optionally feeStructureId + feeAmount).',
      details: { reason: 'FEE_HEAD_MISSING', id },
    });
  }
}

export class EventFeeAssignmentNotVoidableError extends DomainError {
  constructor(id: string, status: EventFeeAssignmentStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Fee assignment cannot be voided in current status (${status}).`,
      details: { reason: 'NOT_VOIDABLE', id, status },
    });
  }
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export class EventAttendanceMethodUnsupportedError extends DomainError {
  constructor(method: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Attendance method "${method}" is not supported in this release. Only MANUAL is writeable.`,
      details: { reason: 'METHOD_NOT_SUPPORTED', method },
    });
  }
}
