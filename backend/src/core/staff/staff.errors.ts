/**
 * Domain errors specific to the Staff cluster. Sits on top of the generic
 * `DomainError` hierarchy (`core/errors/domain-error.ts`); the global filter
 * maps each `code` to an HTTP status via `ERROR_CODE_HTTP_STATUS`.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ValidationFailedError } from '../errors/domain-error';

export type StaffErrorReason =
  | 'staff_status_invalid_transition'
  | 'leave_invalid_state_transition'
  | 'leave_dates_invalid'
  | 'leave_days_invalid'
  | 'class_teacher_already_assigned'
  | 'class_teacher_revoked'
  | 'section_assignment_duplicate'
  | 'subject_qualification_subject_not_found';

export class StaffError extends DomainError {
  public override readonly name: string = 'StaffError';
}

export class StaffStatusInvalidTransitionError extends StaffError {
  public override readonly name = 'StaffStatusInvalidTransitionError';
  constructor(args: {
    readonly staffId: string;
    readonly currentStatus: string;
    readonly attemptedStatus: string;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Cannot move Staff ${args.staffId} from ${args.currentStatus} to ${args.attemptedStatus}`,
      details: {
        reason: 'staff_status_invalid_transition' satisfies StaffErrorReason,
        staffId: args.staffId,
        currentStatus: args.currentStatus,
        attemptedStatus: args.attemptedStatus,
      },
    });
  }
}

export class LeaveInvalidStateTransitionError extends StaffError {
  public override readonly name = 'LeaveInvalidStateTransitionError';
  constructor(args: {
    readonly leaveId: string;
    readonly currentStatus: string;
    readonly attemptedAction: string;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Cannot ${args.attemptedAction} leave ${args.leaveId} in status ${args.currentStatus}`,
      details: {
        reason: 'leave_invalid_state_transition' satisfies StaffErrorReason,
        leaveId: args.leaveId,
        currentStatus: args.currentStatus,
        attemptedAction: args.attemptedAction,
      },
    });
  }
}

export class LeaveDatesInvalidError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'endDate',
          code: 'LEAVE_DATES_INVALID',
          message: 'endDate must be on or after startDate.',
        },
      ],
      'Leave date range is invalid',
    );
  }
}

export class LeaveDaysInvalidError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'days',
          code: 'LEAVE_DAYS_INVALID',
          message: 'days must be > 0 and ≤ 366.',
        },
      ],
      'Leave days value is invalid',
    );
  }
}

export class ClassTeacherAlreadyAssignedError extends StaffError {
  public override readonly name = 'ClassTeacherAlreadyAssignedError';
  constructor(args: {
    readonly sectionId: string;
    readonly academicYearId: string;
    readonly existingAssignmentId: string;
    readonly existingStaffId: string;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Section ${args.sectionId} already has a class teacher for academic year ${args.academicYearId}`,
      details: {
        reason: 'class_teacher_already_assigned' satisfies StaffErrorReason,
        sectionId: args.sectionId,
        academicYearId: args.academicYearId,
        existingAssignmentId: args.existingAssignmentId,
        existingStaffId: args.existingStaffId,
      },
    });
  }
}

export class ClassTeacherAlreadyRevokedError extends StaffError {
  public override readonly name = 'ClassTeacherAlreadyRevokedError';
  constructor(id: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Class teacher assignment ${id} is already revoked`,
      details: {
        reason: 'class_teacher_revoked' satisfies StaffErrorReason,
        id,
      },
    });
  }
}

export class SubjectQualificationSubjectNotFoundError extends ValidationFailedError {
  constructor(missingIds: readonly string[]) {
    super(
      missingIds.map((id) => ({
        path: 'subjectId',
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject ${id} not found`,
      })),
      'One or more subjects do not exist',
    );
  }
}

export class SubjectQualificationDuplicateError extends ValidationFailedError {
  constructor(duplicateId: string) {
    super(
      [
        {
          path: 'subjectId',
          code: 'DUPLICATE_SUBJECT',
          message: `Subject ${duplicateId} appears more than once in the input`,
        },
      ],
      'Duplicate subject in input set',
    );
  }
}

export class SectionAssignmentDuplicateError extends StaffError {
  public override readonly name = 'SectionAssignmentDuplicateError';
  constructor(args: {
    readonly staffId: string;
    readonly sectionId: string;
    readonly subjectId: string;
    readonly academicYearId: string;
  }) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Staff ${args.staffId} is already assigned to subject ${args.subjectId} in section ${args.sectionId} for year ${args.academicYearId}`,
      details: {
        reason: 'section_assignment_duplicate' satisfies StaffErrorReason,
        ...args,
      },
    });
  }
}
