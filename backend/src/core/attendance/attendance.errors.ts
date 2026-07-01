/**
 * Attendance domain errors. All extend the shared `DomainError`, so the
 * global filter maps them to the canonical envelope.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type {
  AttendanceCorrectionStatusValue,
  AttendanceStatusValue,
} from './attendance.constants';

export class AttendanceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AttendanceDaily', id);
  }
}

export class StaffAttendanceNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('StaffAttendance', id);
  }
}

export class AttendanceLockNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AttendanceLockWindow', id);
  }
}

export class AttendanceCorrectionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AttendanceCorrection', id);
  }
}

export class AttendanceConfigNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AttendanceConfig', id);
  }
}

/** PATCH / DELETE attempted outside the configured edit window. */
export class EditWindowExpiredError extends ConflictError {
  constructor(markedAt: Date, editWindowHours: number) {
    super(
      `Edit window has expired — use the corrections endpoint instead.`,
      {
        code: ERROR_CODES.STATE_INVALID,
        details: {
          reason: 'EDIT_WINDOW_EXPIRED',
          markedAt: markedAt.toISOString(),
          editWindowHours,
        },
      },
    );
  }
}

/** Write/PATCH/DELETE attempted inside an active lock window. */
export class AttendanceLockedError extends ConflictError {
  constructor(date: Date, lockId: string) {
    super(`Attendance is locked for ${date.toISOString().slice(0, 10)}.`, {
      code: ERROR_CODES.LOCKED_RESOURCE,
      details: {
        reason: 'ATTENDANCE_LOCKED',
        date: date.toISOString().slice(0, 10),
        lockId,
      },
    });
  }
}

/** User supplied a non-HOLIDAY status on a date marked as holiday. */
export class HolidayStatusConflictError extends ConflictError {
  constructor(date: Date, requested: AttendanceStatusValue) {
    super(
      `Date ${date.toISOString().slice(0, 10)} is a holiday — status must be HOLIDAY.`,
      {
        code: ERROR_CODES.STATE_INVALID,
        details: {
          reason: 'HOLIDAY_STATUS_CONFLICT',
          date: date.toISOString().slice(0, 10),
          requested,
        },
      },
    );
  }
}

export class FutureDateNotAllowedError extends ConflictError {
  constructor(date: Date) {
    super(`Attendance cannot be marked for a future date.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'FUTURE_DATE', date: date.toISOString().slice(0, 10) },
    });
  }
}

export class DuplicateAttendanceError extends ConflictError {
  constructor(studentId: string, date: Date) {
    super(`An attendance row already exists for this student on this date.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: {
        resource: 'AttendanceDaily',
        studentId,
        date: date.toISOString().slice(0, 10),
      },
    });
  }
}

export class DuplicateStaffAttendanceError extends ConflictError {
  constructor(staffId: string, date: Date) {
    super(`An attendance row already exists for this staff member on this date.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: {
        resource: 'StaffAttendance',
        staffId,
        date: date.toISOString().slice(0, 10),
      },
    });
  }
}

export class CorrectionAlreadyDecidedError extends ConflictError {
  constructor(id: string, current: AttendanceCorrectionStatusValue) {
    super(`Correction is already ${current.toLowerCase()}.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { id, current },
    });
  }
}

export class BulkLimitExceededError extends ConflictError {
  constructor(limit: number, received: number) {
    super(`Bulk attendance entries exceed the per-request limit.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'BULK_LIMIT_EXCEEDED', limit, received },
    });
  }
}

export class LockScopeArgumentError extends ConflictError {
  constructor(message: string, scope: string) {
    super(message, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'LOCK_SCOPE_ARGS', scope },
    });
  }
}

export class AttendanceModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Attendance module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.attendance' },
    });
  }
}
