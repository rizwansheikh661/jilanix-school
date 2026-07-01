/**
 * Domain errors specific to the Parent domain, layered on top of the
 * generic DomainError hierarchy.
 *
 * `ParentLinkAlreadyExistsError` and `ParentLinkLimitExceededError`
 * are raised pre-flight before hitting the unique constraint
 * (`uq_pslink_parent_student_relation`); the DB-level unique still wins
 * on a race.
 *
 * Sprint 17 — adds the four `ParentRelationshipService` validation
 * errors (multiple-primary / max-links / no-pickup / no-emergency) plus
 * `ParentUserStateError` for illegal lifecycle FSM transitions.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ValidationFailedError } from '../errors/domain-error';
import { PARENT_LINKS_PER_STUDENT_LIMIT, type ParentRelationValue, type ParentUserStatusValue } from './parent.types';

export type ParentErrorReason =
  | 'parent_contact_required'
  | 'parent_link_already_exists'
  | 'parent_link_limit_exceeded'
  | 'primary_contact_conflict'
  | 'parent_has_active_links'
  | 'multiple_primary_contacts'
  | 'max_links_exceeded'
  | 'no_pickup_authorized'
  | 'no_emergency_contact'
  | 'parent_user_state_invalid';

export class ParentError extends DomainError {
  public override readonly name: string = 'ParentError';
}

/**
 * The Parent row would have no usable contact — at least one of
 * fatherPhone / motherPhone / guardianPhone must be non-empty.
 */
export class ParentContactRequiredError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'phone',
          code: 'PARENT_CONTACT_REQUIRED',
          message:
            'At least one of fatherPhone, motherPhone, or guardianPhone is required.',
        },
      ],
      'Parent must have at least one phone contact',
    );
  }
}

/**
 * Pre-flight detection of `(parentId, studentId, relation)` clashes
 * against `uq_pslink_parent_student_relation`.
 */
export class ParentLinkAlreadyExistsError extends ParentError {
  public override readonly name = 'ParentLinkAlreadyExistsError';
  constructor(args: {
    readonly parentId: string;
    readonly studentId: string;
    readonly relation: ParentRelationValue;
  }) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Parent ${args.parentId} is already linked as ${args.relation} to student ${args.studentId}`,
      details: {
        reason: 'parent_link_already_exists' satisfies ParentErrorReason,
        ...args,
      },
    });
  }
}

/** A student already has the maximum number of parents linked. */
export class ParentLinkLimitExceededError extends ParentError {
  public override readonly name = 'ParentLinkLimitExceededError';
  constructor(studentId: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Student ${studentId} already has ${PARENT_LINKS_PER_STUDENT_LIMIT} parent links`,
      details: {
        reason: 'parent_link_limit_exceeded' satisfies ParentErrorReason,
        studentId,
        limit: PARENT_LINKS_PER_STUDENT_LIMIT,
      },
    });
  }
}

/**
 * Raised when a link with `isPrimaryContact: true` is requested for a
 * student that already has a primary contact. The link-create path
 * returns this so callers can choose to demote-then-promote explicitly.
 */
export class PrimaryContactConflictError extends ParentError {
  public override readonly name = 'PrimaryContactConflictError';
  constructor(studentId: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Student ${studentId} already has a primary contact`,
      details: {
        reason: 'primary_contact_conflict' satisfies ParentErrorReason,
        studentId,
      },
    });
  }
}

/**
 * Soft-delete refused while at least one ParentStudentLink to a
 * non-deleted student still references this parent record. Caller must
 * unlink first.
 */
export class ParentHasActiveLinksError extends ParentError {
  public override readonly name = 'ParentHasActiveLinksError';
  constructor(args: { readonly parentId: string; readonly linkCount: number }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Parent still has ${args.linkCount} active student link(s); unlink them first`,
      details: {
        reason: 'parent_has_active_links' satisfies ParentErrorReason,
        ...args,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Sprint 17 — ParentRelationshipService validation errors.
//
// All four extend `ValidationFailedError` so the global error filter renders
// them as `VALIDATION_FAILED` (422). The field-issue `code` carries the
// stable application code for clients to switch on.
// ---------------------------------------------------------------------------

/**
 * A second link with `isPrimaryContact: true` was requested for a student
 * that already has a primary contact. Distinct from
 * `PrimaryContactConflictError` (Sprint 3): this is raised by the
 * pre-write `validateLink` path, before any demotion is attempted.
 */
export class MultiplePrimaryContactsError extends ValidationFailedError {
  constructor(studentId: string) {
    super(
      [
        {
          path: 'isPrimaryContact',
          code: 'MULTIPLE_PRIMARY_CONTACTS',
          message: `Student ${studentId} already has a primary contact. Demote the existing primary first.`,
        },
      ],
      'Multiple primary contacts',
    );
  }
}

/**
 * A student already has the maximum number of alive parent links
 * (default 3 per BUSINESS_RULES §634). Surfaced as 422 so DTO-level
 * validation and link-cap exhaustion land in the same client bucket.
 */
export class MaxLinksExceededError extends ValidationFailedError {
  constructor(studentId: string, limit: number = PARENT_LINKS_PER_STUDENT_LIMIT) {
    super(
      [
        {
          path: 'studentId',
          code: 'MAX_LINKS_EXCEEDED',
          message: `Student ${studentId} already has ${limit.toString()} parent links (the maximum).`,
        },
      ],
      'Max parent links exceeded',
    );
  }
}

/**
 * Unlink would leave the student with no pickup-authorized parent link.
 * At least one parent must keep `canPickup=true` at all times.
 */
export class NoPickupAuthorizedError extends ValidationFailedError {
  constructor(studentId: string) {
    super(
      [
        {
          path: 'canPickup',
          code: 'NO_PICKUP_AUTHORIZED',
          message: `Removing this link would leave student ${studentId} with no pickup-authorized parent.`,
        },
      ],
      'No pickup-authorized parent',
    );
  }
}

/**
 * Unlink would leave the student with no emergency-contact parent link
 * (currently: any link with `isPrimaryContact=true`). Mirrors the pickup
 * invariant for emergency-contact reachability.
 */
export class NoEmergencyContactError extends ValidationFailedError {
  constructor(studentId: string) {
    super(
      [
        {
          path: 'isPrimaryContact',
          code: 'NO_EMERGENCY_CONTACT',
          message: `Removing this link would leave student ${studentId} with no emergency contact.`,
        },
      ],
      'No emergency contact',
    );
  }
}

// ---------------------------------------------------------------------------
// Sprint 17 — ParentUserService FSM error.
// ---------------------------------------------------------------------------

/**
 * Illegal ParentUser FSM transition. Surfaces as
 * `STATE_INVALID` per the canonical taxonomy (`backend/src/contracts/api.ts`).
 */
export class ParentUserStateError extends DomainError {
  public override readonly name = 'ParentUserStateError';
  constructor(args: {
    readonly parentUserId?: string;
    readonly userId?: string;
    readonly from: ParentUserStatusValue;
    readonly to: ParentUserStatusValue;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Illegal ParentUser transition ${args.from} → ${args.to}`,
      details: {
        reason: 'parent_user_state_invalid' satisfies ParentErrorReason,
        ...args,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Sprint 17 — parent-portal access errors.
//
// All three surface as INSUFFICIENT_PERMISSIONS (403) so that misuse of the
// `/me/*` endpoints by non-parents (or while suspended/archived/feature-off)
// looks like an authorization rejection to the caller, not a 404 on the
// underlying notification preference row.
// ---------------------------------------------------------------------------

/**
 * The `parent_portal` feature flag is disabled for the calling tenant. Used
 * by both the admin endpoints and the `/me/*` surface.
 */
export class ParentPortalDisabledError extends DomainError {
  public override readonly name = 'ParentPortalDisabledError';
  constructor() {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message: 'Parent portal is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'parent_portal' },
    });
  }
}

/**
 * The calling user has no alive `ParentUser` row in the current tenant.
 * `/me/*` endpoints reject because the caller isn't a parent.
 */
export class NotAParentUserError extends DomainError {
  public override readonly name = 'NotAParentUserError';
  constructor() {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message: 'Caller is not a registered parent user.',
      details: { reason: 'NOT_A_PARENT_USER' },
    });
  }
}

/**
 * The caller has a `ParentUser` row but it is in a non-ACTIVE state.
 * The `details.reason` carries the precise status (`ACCOUNT_SUSPENDED`,
 * `ACCOUNT_ARCHIVED`, `ACCOUNT_PENDING_INVITE`) so the UI can render
 * the right empty state.
 */
export class ParentUserNotActiveError extends DomainError {
  public override readonly name = 'ParentUserNotActiveError';
  constructor(status: ParentUserStatusValue) {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message: `Parent user is ${status}; portal access denied.`,
      details: { reason: reasonForStatus(status), status },
    });
  }
}

function reasonForStatus(status: ParentUserStatusValue): string {
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
