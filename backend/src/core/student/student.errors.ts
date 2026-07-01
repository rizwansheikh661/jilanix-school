/**
 * Domain errors specific to the Student domain. Sit on top of the
 * generic DomainError hierarchy (`core/errors/domain-error.ts`); the
 * global filter consults `ERROR_CODE_HTTP_STATUS` to render the HTTP
 * status, so each subclass just picks the right code + structured details.
 *
 * The base `StudentError` exists so a future interceptor can branch on
 * the domain without parsing the message — mirrors `auth.errors.ts:24`,
 * `rbac.errors.ts`, and `academic.errors.ts`.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ValidationFailedError } from '../errors/domain-error';
import type { StudentUserStatusValue } from './student.types';

export type StudentErrorReason =
  | 'admission_no_taken'
  | 'roll_no_taken'
  | 'student_inactive'
  | 'student_already_active'
  | 'placement_invalid'
  | 'student_user_state_invalid';

export class StudentError extends DomainError {
  public override readonly name: string = 'StudentError';
}

/**
 * Admission number already used by another non-deleted student in the
 * same school. The DB unique index also surfaces this via
 * `prisma-error.mapper`; we throw this typed variant pre-flight.
 *
 * Sprint 3 keeps admission numbers immutable across re-admission —
 * `BUSINESS_RULES.md:28-29` requires a fresh number on re-admit.
 */
export class AdmissionNumberTakenError extends StudentError {
  public override readonly name = 'AdmissionNumberTakenError';
  constructor(admissionNo: string) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Admission number "${admissionNo}" is already in use`,
      details: {
        reason: 'admission_no_taken' satisfies StudentErrorReason,
        admissionNo,
      },
    });
  }
}

/**
 * Roll number already taken inside the same `(section, academicYear)`.
 * MySQL has no partial unique index; we enforce uniqueness in the
 * service layer and throw this when a clash is detected.
 */
export class RollNumberTakenError extends StudentError {
  public override readonly name = 'RollNumberTakenError';
  constructor(args: {
    readonly rollNo: string;
    readonly sectionId: string;
    readonly academicYearId: string;
  }) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Roll number "${args.rollNo}" is already in use in this section/year`,
      details: {
        reason: 'roll_no_taken' satisfies StudentErrorReason,
        rollNo: args.rollNo,
        sectionId: args.sectionId,
        academicYearId: args.academicYearId,
      },
    });
  }
}

/**
 * Lifecycle transition refused. Raised when a deactivate/reactivate
 * call is incompatible with the current status (e.g. reactivating an
 * already-active student, or trying to mutate a graduated/expelled
 * record via the deactivate endpoint).
 */
export class StudentInactiveError extends StudentError {
  public override readonly name = 'StudentInactiveError';
  constructor(args: {
    readonly studentId: string;
    readonly currentStatus: string;
    readonly attempted: 'deactivate' | 'reactivate' | 'update';
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Student status "${args.currentStatus}" does not allow ${args.attempted}`,
      details: {
        reason:
          args.attempted === 'reactivate'
            ? ('student_already_active' satisfies StudentErrorReason)
            : ('student_inactive' satisfies StudentErrorReason),
        studentId: args.studentId,
        currentStatus: args.currentStatus,
        attempted: args.attempted,
      },
    });
  }
}

/**
 * The supplied `(academicYearId, classId, sectionId)` triple does not
 * resolve to a coherent placement — the year/class/section either
 * doesn't exist in this tenant, is soft-deleted, or the section does
 * not belong to the class. Mapped to 422 (validation) rather than 404
 * because the parent resource (the Student / Admission) exists; only
 * the input is wrong.
 */
export class PlacementInvalidError extends ValidationFailedError {
  constructor(args: {
    readonly field: 'academicYearId' | 'classId' | 'sectionId';
    readonly reason: 'not_found' | 'mismatch';
    readonly value: string;
  }) {
    super(
      [
        {
          path: args.field,
          code: args.reason === 'not_found' ? 'PLACEMENT_NOT_FOUND' : 'PLACEMENT_MISMATCH',
          message:
            args.reason === 'not_found'
              ? `${args.field} ${args.value} not found in this school.`
              : `${args.field} ${args.value} does not belong to its parent.`,
        },
      ],
      'Placement is not valid',
    );
  }
}

// ---------------------------------------------------------------------------
// Sprint 18 — StudentUserService FSM error.
// ---------------------------------------------------------------------------

/**
 * Illegal StudentUser FSM transition. Surfaces as
 * `STATE_INVALID` per the canonical taxonomy (`backend/src/contracts/api.ts`).
 */
export class StudentUserStateError extends DomainError {
  public override readonly name = 'StudentUserStateError';
  constructor(args: {
    readonly studentUserId?: string;
    readonly userId?: string;
    readonly from: StudentUserStatusValue;
    readonly to: StudentUserStatusValue;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Illegal StudentUser transition ${args.from} → ${args.to}`,
      details: {
        reason: 'student_user_state_invalid' satisfies StudentErrorReason,
        ...args,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Sprint 18 — student-portal access errors.
//
// All three surface as INSUFFICIENT_PERMISSIONS (403) so that misuse of the
// `/me/*` endpoints by non-students (or while suspended/archived/feature-off)
// looks like an authorization rejection to the caller.
// ---------------------------------------------------------------------------

/**
 * The `student_portal` feature flag is disabled for the calling tenant.
 * Used by both the admin endpoints and the `/me/*` surface.
 */
export class StudentPortalDisabledError extends DomainError {
  public override readonly name = 'StudentPortalDisabledError';
  constructor() {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message: 'Student portal is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'student_portal' },
    });
  }
}

/**
 * The calling user has no alive `StudentUser` row in the current tenant.
 * `/me/*` endpoints reject because the caller isn't a student.
 */
export class NotAStudentUserError extends DomainError {
  public override readonly name = 'NotAStudentUserError';
  constructor() {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message: 'Caller is not a registered student user.',
      details: { reason: 'NOT_A_STUDENT_USER' },
    });
  }
}

/**
 * The caller has a `StudentUser` row but it is in a non-ACTIVE state.
 * The `details.reason` carries the precise status (`ACCOUNT_SUSPENDED`,
 * `ACCOUNT_ARCHIVED`, `ACCOUNT_PENDING_INVITE`) so the UI can render
 * the right empty state.
 */
export class StudentUserNotActiveError extends DomainError {
  public override readonly name = 'StudentUserNotActiveError';
  constructor(status: StudentUserStatusValue) {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message: `Student user is ${status}; portal access denied.`,
      details: { reason: reasonForStudentStatus(status), status },
    });
  }
}

function reasonForStudentStatus(status: StudentUserStatusValue): string {
  switch (status) {
    case 'SUSPENDED':
      return 'ACCOUNT_SUSPENDED';
    case 'ARCHIVED':
      return 'ACCOUNT_ARCHIVED';
    case 'PENDING_INVITE':
      return 'ACCOUNT_PENDING_INVITE';
    default:
      return 'ACCOUNT_NOT_ACTIVE';
  }
}
