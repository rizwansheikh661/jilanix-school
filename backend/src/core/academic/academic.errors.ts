/**
 * Domain errors specific to the Academic Foundation. Sit on top of the
 * generic DomainError hierarchy (`core/errors/domain-error.ts`); the
 * global filter consults `ERROR_CODE_HTTP_STATUS` to render the HTTP
 * status, so each subclass just picks the right code + structured details.
 *
 * The base `AcademicError` exists so a future interceptor can branch on
 * the domain without parsing the message — mirrors the pattern in
 * `auth.errors.ts:24` and `rbac.errors.ts`.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ValidationFailedError } from '../errors/domain-error';

export type AcademicErrorReason =
  | 'academic_year_overlap'
  | 'academic_year_not_activatable'
  | 'academic_year_date_range_invalid'
  | 'class_has_sections'
  | 'section_teacher_not_eligible'
  | 'subject_code_taken'
  | 'if_match_required'
  | 'if_match_malformed'
  | 'term_overlap'
  | 'term_outside_year'
  | 'term_sequence_gap'
  | 'class_subject_subject_not_found'
  | 'section_subject_replaces_required'
  | 'section_subject_replaces_unexpected'
  | 'section_subject_replaces_not_in_class'
  | 'promotion_invalid_state_transition'
  | 'promotion_same_year';

export class AcademicError extends DomainError {
  public override readonly name: string = 'AcademicError';
}

/**
 * The new/updated academic year's [startDate, endDate] window overlaps
 * with an existing non-deleted year in the same school. Surfaces as 409
 * `STATE_INVALID` so clients distinguish it from `DUPLICATE_RESOURCE`
 * (which is reserved for unique-key collisions).
 */
export class AcademicYearOverlapError extends AcademicError {
  public override readonly name = 'AcademicYearOverlapError';
  constructor(args: {
    readonly conflictingYearId: string;
    readonly conflictingName: string;
    readonly conflictingStart: Date;
    readonly conflictingEnd: Date;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Date range overlaps with academic year "${args.conflictingName}"`,
      details: {
        reason: 'academic_year_overlap' satisfies AcademicErrorReason,
        conflictingYearId: args.conflictingYearId,
        conflictingName: args.conflictingName,
        conflictingStart: args.conflictingStart.toISOString().slice(0, 10),
        conflictingEnd: args.conflictingEnd.toISOString().slice(0, 10),
      },
    });
  }
}

/**
 * Activation refused because the target year is soft-deleted. Other
 * "can't activate" reasons may be added later; we keep the reason string
 * stable so clients can branch on it.
 */
export class AcademicYearNotActivatableError extends AcademicError {
  public override readonly name = 'AcademicYearNotActivatableError';
  constructor(yearId: string, reason: 'deleted' | 'already_current' = 'deleted') {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        reason === 'deleted'
          ? 'Cannot activate a soft-deleted academic year'
          : 'Academic year is already current',
      details: {
        reason: 'academic_year_not_activatable' satisfies AcademicErrorReason,
        yearId,
        subReason: reason,
      },
    });
  }
}

/**
 * Deleting a class is refused while one or more non-deleted sections
 * still reference it — clients must remove the sections first.
 */
export class ClassHasSectionsError extends AcademicError {
  public override readonly name = 'ClassHasSectionsError';
  constructor(args: { readonly classId: string; readonly sectionCount: number }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Class still has ${args.sectionCount} section(s); remove them first`,
      details: {
        reason: 'class_has_sections' satisfies AcademicErrorReason,
        classId: args.classId,
        sectionCount: args.sectionCount,
      },
    });
  }
}

/**
 * The supplied teacher cannot be assigned as a class teacher — either the
 * user does not exist within this tenant, or their status is not `active`.
 * Mapped to 422 (validation) rather than 404 (resource) because the parent
 * resource (the Section) exists; only the input value is bad.
 */
export class SectionTeacherNotEligibleError extends ValidationFailedError {
  constructor(args: { readonly teacherId: string; readonly reason: 'not_found' | 'inactive' }) {
    super(
      [
        {
          path: 'teacherId',
          code: args.reason === 'not_found' ? 'USER_NOT_FOUND' : 'USER_INACTIVE',
          message:
            args.reason === 'not_found'
              ? `User ${args.teacherId} not found in this school.`
              : `User ${args.teacherId} is not active.`,
        },
      ],
      'Teacher is not eligible to be assigned as a class teacher',
    );
  }
}

/**
 * Subject code already taken within the school. The unique index also
 * surfaces this via `prisma-error.mapper`; we throw this typed variant
 * pre-flight when we want to short-circuit before hitting the DB.
 */
export class SubjectCodeTakenError extends AcademicError {
  public override readonly name = 'SubjectCodeTakenError';
  constructor(code: string) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Subject code "${code}" is already in use`,
      details: {
        reason: 'subject_code_taken' satisfies AcademicErrorReason,
        code,
      },
    });
  }
}

/**
 * Convenience helpers for `If-Match` parsing in controllers — every PATCH
 * and POST-activate endpoint demands the header so the service can apply
 * optimistic concurrency. Implementation lives in `core/http/if-match.ts`
 * (Sprint 3 promotion); we re-export here so existing imports keep working.
 */
export { parseIfMatch, IfMatchRequiredError, IfMatchMalformedError } from '../http/if-match';

/**
 * Wrap a Prisma `P2025` (record-to-update not found) raised by an
 * optimistic-concurrency `update` so the service-level `VersionConflict`
 * still wins. We re-export here for tests; production callers should use
 * `VersionConflict` from `core/errors`.
 */
export { VersionConflict } from '../errors/domain-error';

// ---------------------------------------------------------------------------
// Sprint 4 — AcademicTerm errors
// ---------------------------------------------------------------------------

export class TermDateRangeInvalidError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'endDate',
          code: 'DATE_RANGE_INVALID',
          message: 'endDate must be strictly after startDate.',
        },
      ],
      'Academic term date range is invalid',
    );
  }
}

export class TermOutsideYearError extends ValidationFailedError {
  constructor(args: { readonly yearStart: Date; readonly yearEnd: Date }) {
    super(
      [
        {
          path: 'startDate',
          code: 'TERM_OUTSIDE_YEAR',
          message: `Term dates must fall within the parent academic year (${iso(args.yearStart)}..${iso(args.yearEnd)}).`,
        },
      ],
      'Academic term dates lie outside the parent year window',
    );
  }
}

export class TermOverlapError extends AcademicError {
  public override readonly name = 'TermOverlapError';
  constructor(args: {
    readonly conflictingTermId: string;
    readonly conflictingName: string;
    readonly conflictingStart: Date;
    readonly conflictingEnd: Date;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Date range overlaps with term "${args.conflictingName}"`,
      details: {
        reason: 'term_overlap' satisfies AcademicErrorReason,
        conflictingTermId: args.conflictingTermId,
        conflictingName: args.conflictingName,
        conflictingStart: iso(args.conflictingStart),
        conflictingEnd: iso(args.conflictingEnd),
      },
    });
  }
}

export class TermSequenceGapError extends ValidationFailedError {
  constructor(args: { readonly expected: number; readonly received: number }) {
    super(
      [
        {
          path: 'sequence',
          code: 'TERM_SEQUENCE_GAP',
          message: `Next sequence must be ${args.expected}, received ${args.received}.`,
        },
      ],
      'Academic term sequence must be contiguous',
    );
  }
}

// ---------------------------------------------------------------------------
// Sprint 4 — SectionSubject errors
// ---------------------------------------------------------------------------

export class SectionSubjectReplacesRequiredError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'replacesSubjectId',
          code: 'REPLACES_REQUIRED',
          message: 'replacesSubjectId is required when mode = REPLACE.',
        },
      ],
      'Section subject override is missing replacesSubjectId',
    );
  }
}

export class SectionSubjectReplacesUnexpectedError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'replacesSubjectId',
          code: 'REPLACES_UNEXPECTED',
          message: 'replacesSubjectId is only allowed when mode = REPLACE.',
        },
      ],
      'Section subject override has unexpected replacesSubjectId',
    );
  }
}

export class SectionSubjectReplacesNotInClassError extends ValidationFailedError {
  constructor(subjectId: string) {
    super(
      [
        {
          path: 'replacesSubjectId',
          code: 'REPLACES_NOT_IN_CLASS',
          message: `Subject ${subjectId} is not a default subject of the parent class.`,
        },
      ],
      'replacesSubjectId must reference a class-default subject',
    );
  }
}

// ---------------------------------------------------------------------------
// Sprint 4 — AcademicYearPromotion errors
// ---------------------------------------------------------------------------

export class PromotionSameYearError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'targetAcademicYearId',
          code: 'PROMOTION_SAME_YEAR',
          message: 'targetAcademicYearId must differ from sourceAcademicYearId.',
        },
      ],
      'Promotion source and target years must differ',
    );
  }
}

export class PromotionInvalidStateTransitionError extends AcademicError {
  public override readonly name = 'PromotionInvalidStateTransitionError';
  constructor(args: {
    readonly promotionId: string;
    readonly currentStatus: string;
    readonly attemptedAction: string;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Cannot ${args.attemptedAction} promotion ${args.promotionId} in status ${args.currentStatus}`,
      details: {
        reason: 'promotion_invalid_state_transition' satisfies AcademicErrorReason,
        promotionId: args.promotionId,
        currentStatus: args.currentStatus,
        attemptedAction: args.attemptedAction,
      },
    });
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
