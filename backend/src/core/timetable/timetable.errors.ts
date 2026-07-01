/**
 * Timetable domain errors. All extend the shared `DomainError`, so the
 * global filter maps them to the canonical envelope. Conflict-detection
 * errors carry the offending entry/slot identifiers in `details` so the
 * client can highlight the row.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type {
  TimetableConflictTypeValue,
  TimetableVersionStatusValue,
} from './timetable.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class PeriodTemplateNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('PeriodTemplate', id);
  }
}

export class PeriodTemplatePeriodNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('PeriodTemplatePeriod', id);
  }
}

export class TimetableVersionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('TimetableVersion', id);
  }
}

export class TimetableEntryNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('TimetableEntry', id);
  }
}

export class TeacherAvailabilityNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('TeacherAvailability', id);
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class TimetableModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Timetable module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.timetable' },
    });
  }
}

// ---------------------------------------------------------------------------
// PeriodTemplate validation
// ---------------------------------------------------------------------------
export class PeriodTemplateDaysInvalidError extends ConflictError {
  constructor(reason: string) {
    super(`Period template days[] is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'DAYS_INVALID', detail: reason },
    });
  }
}

export class PeriodIndicesInvalidError extends ConflictError {
  constructor(reason: string) {
    super(`Period indices are invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'PERIOD_INDICES_INVALID', detail: reason },
    });
  }
}

export class PeriodTimesOverlapError extends ConflictError {
  constructor(indexA: number, indexB: number) {
    super(`Periods ${indexA} and ${indexB} overlap in time.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'PERIOD_TIME_OVERLAP', indexA, indexB },
    });
  }
}

export class PeriodTimeOrderError extends ConflictError {
  constructor(index: number) {
    super(`Period ${index} startTime must be before endTime.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'PERIOD_TIME_ORDER', index },
    });
  }
}

export class PeriodTemplateInUseError extends ConflictError {
  constructor(id: string, versionId: string) {
    super(`Period template is referenced by a non-archived timetable version.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'PERIOD_TEMPLATE_IN_USE', id, versionId },
    });
  }
}

export class DuplicatePeriodTemplateError extends ConflictError {
  constructor(name: string) {
    super(`A period template with this name already exists for the branch & year.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'PeriodTemplate', name },
    });
  }
}

// ---------------------------------------------------------------------------
// Version state machine
// ---------------------------------------------------------------------------
export class VersionStatusTransitionError extends ConflictError {
  constructor(from: TimetableVersionStatusValue, to: TimetableVersionStatusValue) {
    super(`Cannot transition timetable version from ${from} to ${to}.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'VERSION_STATUS_TRANSITION', from, to },
    });
  }
}

export class VersionNotDraftError extends ConflictError {
  constructor(versionId: string, status: TimetableVersionStatusValue) {
    super(`Entries may only be modified on a DRAFT version.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'VERSION_NOT_DRAFT', versionId, status },
    });
  }
}

export class VersionActiveCannotDeleteError extends ConflictError {
  constructor(versionId: string) {
    super(`Active timetable version cannot be deleted — archive it first.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'VERSION_ACTIVE_CANNOT_DELETE', versionId },
    });
  }
}

export class VersionDateRangeError extends ConflictError {
  constructor(reason: string) {
    super(`Timetable version date range is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'VERSION_DATE_RANGE', detail: reason },
    });
  }
}

export class ActiveVersionExistsError extends ConflictError {
  constructor(activeVersionId: string) {
    super(`An ACTIVE timetable version already exists for this branch & year.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { reason: 'ACTIVE_VERSION_EXISTS', activeVersionId },
    });
  }
}

// ---------------------------------------------------------------------------
// Entry conflicts (one class per detector outcome)
// ---------------------------------------------------------------------------
interface SlotDetails {
  readonly versionId: string;
  readonly dayOfWeek: number;
  readonly periodIndex: number;
}

export class SectionDoubleBookedError extends ConflictError {
  constructor(
    public readonly slot: SlotDetails & { readonly sectionId: string; readonly existingEntryId: string },
  ) {
    super(`Section already has a class scheduled for this slot.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { reason: 'SECTION_DOUBLE_BOOKED', ...slot },
    });
  }
}

export class TeacherDoubleBookedError extends ConflictError {
  constructor(
    public readonly slot: SlotDetails & { readonly staffId: string; readonly existingEntryId: string },
  ) {
    super(`Teacher is already booked for this slot.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { reason: 'TEACHER_DOUBLE_BOOKED', ...slot },
    });
  }
}

export class RoomDoubleBookedError extends ConflictError {
  constructor(
    public readonly slot: SlotDetails & { readonly roomId: string; readonly existingEntryId: string },
  ) {
    super(`Room is already booked for this slot.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { reason: 'ROOM_DOUBLE_BOOKED', ...slot },
    });
  }
}

export class TeacherNotQualifiedError extends ConflictError {
  constructor(staffId: string, subjectId: string) {
    super(`Teacher is not qualified to teach this subject.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'TEACHER_NOT_QUALIFIED', staffId, subjectId },
    });
  }
}

export class RoomDisallowedTypeError extends ConflictError {
  constructor(roomId: string, roomTypeId: string) {
    super(`Room\u2019s type does not allow timetable scheduling.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'ROOM_DISALLOWED_TYPE', roomId, roomTypeId },
    });
  }
}

export class PeriodOutOfTemplateError extends ConflictError {
  constructor(reason: string, ctx: { dayOfWeek: number; periodIndex: number; templateId: string }) {
    super(`Period slot does not match the version\u2019s period template: ${reason}.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'PERIOD_OUT_OF_TEMPLATE', detail: reason, ...ctx },
    });
  }
}

export class NonWorkingDayError extends ConflictError {
  constructor(dayOfWeek: number, branchId: string | null) {
    super(`Cannot schedule on a non-working day.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'NON_WORKING_DAY', dayOfWeek, branchId },
    });
  }
}

export class TeacherUnavailableError extends ConflictError {
  constructor(staffId: string, dayOfWeek: number, periodIndex: number) {
    super(`Teacher is marked unavailable for this slot.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'TEACHER_UNAVAILABLE', staffId, dayOfWeek, periodIndex },
    });
  }
}

export class BulkLimitExceededError extends ConflictError {
  constructor(limit: number, received: number) {
    super(`Bulk timetable entries exceed the per-request limit.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'BULK_LIMIT_EXCEEDED', limit, received },
    });
  }
}

export class CrossSchoolReferenceError extends ConflictError {
  constructor(resource: string, id: string) {
    super(`Referenced ${resource} does not belong to the current tenant.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'CROSS_SCHOOL_REFERENCE', resource, id },
    });
  }
}

export class AvailabilityWindowInvalidError extends ConflictError {
  constructor(reason: string) {
    super(`Teacher availability window is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'AVAILABILITY_WINDOW_INVALID', detail: reason },
    });
  }
}

/**
 * Convenience: maps a detector error to the `TimetableConflictType` enum
 * that the append-only ledger uses. Detector emits typed errors AND the
 * scanVersion pass writes ledger rows — same string here keeps them aligned.
 */
export function conflictTypeFromError(err: unknown): TimetableConflictTypeValue | null {
  if (err instanceof SectionDoubleBookedError) return 'SECTION_DOUBLE_BOOKED';
  if (err instanceof TeacherDoubleBookedError) return 'TEACHER_DOUBLE_BOOKED';
  if (err instanceof RoomDoubleBookedError) return 'ROOM_DOUBLE_BOOKED';
  if (err instanceof TeacherNotQualifiedError) return 'TEACHER_NOT_QUALIFIED';
  if (err instanceof RoomDisallowedTypeError) return 'ROOM_DISALLOWED_TYPE';
  if (err instanceof PeriodOutOfTemplateError) return 'PERIOD_OUT_OF_TEMPLATE';
  if (err instanceof NonWorkingDayError) return 'NON_WORKING_DAY';
  if (err instanceof TeacherUnavailableError) return 'TEACHER_UNAVAILABLE';
  return null;
}
