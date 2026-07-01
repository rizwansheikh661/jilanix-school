/**
 * Examination domain errors. All extend the shared `DomainError`, so the
 * global filter maps them to the canonical envelope.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type { ExamStatusValue } from './examination.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class ExamSchemeNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ExamScheme', id);
  }
}

export class ExamNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Exam', id);
  }
}

export class ExamScheduleNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ExamSchedule', id);
  }
}

export class ExamMarksNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ExamMarks', id);
  }
}

export class ExamResultNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ExamResult', id);
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class ExaminationModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Examination module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.examination' },
    });
  }
}

// ---------------------------------------------------------------------------
// ExamScheme validation
// ---------------------------------------------------------------------------
export class ExamSchemeBandsInvalidError extends ConflictError {
  constructor(reason: string) {
    super(`Exam scheme bands are invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_SCHEME_BANDS_INVALID', detail: reason },
    });
  }
}

export class ExamSchemeInUseError extends ConflictError {
  constructor(id: string, examId: string) {
    super(`Exam scheme is referenced by a non-archived exam.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'EXAM_SCHEME_IN_USE', id, examId },
    });
  }
}

export class DuplicateExamSchemeError extends ConflictError {
  constructor(name: string) {
    super(`An exam scheme with this name already exists.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'ExamScheme', name },
    });
  }
}

// ---------------------------------------------------------------------------
// Exam definition / state machine
// ---------------------------------------------------------------------------
export class ExamStatusTransitionError extends ConflictError {
  constructor(from: ExamStatusValue, to: ExamStatusValue) {
    super(`Cannot transition exam from ${from} to ${to}.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'EXAM_STATUS_TRANSITION', from, to },
    });
  }
}

export class ExamArchivedError extends ConflictError {
  constructor(examId: string) {
    super(`Exam is archived; mutations are not allowed.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: { reason: 'EXAM_ARCHIVED', examId },
    });
  }
}

export class ExamDateRangeError extends ConflictError {
  constructor(reason: string) {
    super(`Exam date range is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_DATE_RANGE', detail: reason },
    });
  }
}

export class DuplicateExamError extends ConflictError {
  constructor(name: string) {
    super(`An exam with this name already exists for the year.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'Exam', name },
    });
  }
}

export class ExamMapsEmptyError extends ConflictError {
  constructor() {
    super(`Exam must reference at least one class or section.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_MAPS_EMPTY' },
    });
  }
}

// ---------------------------------------------------------------------------
// Schedule validation
// ---------------------------------------------------------------------------
export class ExamScheduleDateRangeError extends ConflictError {
  constructor(reason: string) {
    super(`Exam schedule date is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_SCHEDULE_DATE_RANGE', detail: reason },
    });
  }
}

export class ExamScheduleTimeOrderError extends ConflictError {
  constructor() {
    super(`Exam schedule startTime must be before endTime.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_SCHEDULE_TIME_ORDER' },
    });
  }
}

export class DuplicateExamScheduleError extends ConflictError {
  constructor(examId: string, subjectId: string, sectionId: string) {
    super(`An exam schedule row already exists for (subject, section).`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'ExamSchedule', examId, subjectId, sectionId },
    });
  }
}

export class ExamScheduleMarksConfigError extends ConflictError {
  constructor(reason: string) {
    super(`Exam schedule marks configuration is invalid: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_SCHEDULE_MARKS_CONFIG', detail: reason },
    });
  }
}

// ---------------------------------------------------------------------------
// Marks validation
// ---------------------------------------------------------------------------
export class ExamMarksOutOfRangeError extends ConflictError {
  constructor(reason: string) {
    super(`Marks value is out of range: ${reason}.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_MARKS_OUT_OF_RANGE', detail: reason },
    });
  }
}

export class ExamMarksAbsentInvariantError extends ConflictError {
  constructor() {
    super(`When isAbsent=true, marksObtained MUST be null.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'EXAM_MARKS_ABSENT_INVARIANT' },
    });
  }
}

export class ExamMarksEditWindowExpiredError extends ConflictError {
  constructor(enteredAt: Date, windowDays: number) {
    super(`Edit window expired; marks may no longer be edited.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: {
        reason: 'EDIT_WINDOW_EXPIRED',
        enteredAt: enteredAt.toISOString(),
        windowDays,
      },
    });
  }
}

export class ExamMarksVersionConflictError extends ConflictError {
  constructor(examId: string, sectionId: string, subjectId: string) {
    super(`Marks have been modified since this version was read.`, {
      code: ERROR_CODES.STATE_INVALID,
      details: {
        reason: 'VERSION_CONFLICT',
        examId,
        sectionId,
        subjectId,
      },
    });
  }
}

export class StudentNotInSectionError extends ConflictError {
  constructor(studentId: string, sectionId: string) {
    super(`Student is not enrolled in the supplied section.`, {
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { reason: 'STUDENT_NOT_IN_SECTION', studentId, sectionId },
    });
  }
}

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------
export class BulkLimitExceededError extends ConflictError {
  constructor(limit: number, received: number) {
    super(`Bulk request exceeds the per-call limit.`, {
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
