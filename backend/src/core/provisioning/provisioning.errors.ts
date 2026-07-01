/**
 * Provisioning domain errors. All extend the shared DomainError hierarchy.
 *
 * Sprint 14 — covers plan CRUD, school lifecycle, trial extension, and
 * password-reset failure paths. New errors must round-trip via the global
 * filter into one of the canonical `ErrorCode` taxonomy codes so the
 * client SDK stays narrow.
 */
import { ERROR_CODES } from '../../contracts/api';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../errors/domain-error';

// ---------------------------------------------------------------------------
// Plan errors
// ---------------------------------------------------------------------------
export class PlanNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Plan', id);
  }
}

export class PlanCodeConflictError extends ConflictError {
  constructor(code: string) {
    super(`Plan code "${code}" is already in use.`, {
      details: { resourceType: 'Plan', conflictField: 'code', code },
    });
  }
}

export class PlanInUseError extends ConflictError {
  constructor(planId: string, schoolCount: number) {
    super(
      `Plan ${planId} cannot be retired — ${schoolCount.toString()} school(s) still reference it.`,
      { details: { resourceType: 'Plan', planId, schoolCount } },
    );
  }
}

// ---------------------------------------------------------------------------
// School lifecycle errors (Wave 4)
// ---------------------------------------------------------------------------

/**
 * Thrown when a caller requests a lifecycle transition that the state
 * matrix forbids (e.g. SUSPEND on an already-CANCELLED school).
 */
export class InvalidLifecycleTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`School lifecycle transition ${from} → ${to} is not allowed.`, {
      details: { resourceType: 'School', from, to },
    });
  }
}

/**
 * Thrown when activate() is requested on a school that has not yet had a
 * plan assigned. Activation requires a plan so the entitlements service
 * has caps to apply.
 */
export class PlanNotAssignedError extends ConflictError {
  constructor(schoolId: string) {
    super(`School ${schoolId} cannot be activated — no plan is assigned.`, {
      details: { resourceType: 'School', schoolId },
    });
  }
}

/**
 * Thrown when a mutator is invoked on a CANCELLED school. Cancellation is
 * terminal; reactivation requires the new-school orchestrator path.
 */
export class SchoolAlreadyCancelledError extends ConflictError {
  constructor(schoolId: string) {
    super(`School ${schoolId} has been cancelled and cannot be mutated.`, {
      details: { resourceType: 'School', schoolId },
    });
  }
}

// ---------------------------------------------------------------------------
// Trial errors (Wave 5)
// ---------------------------------------------------------------------------

/**
 * Thrown when the requested trial extension would exceed the hard cap of
 * `TRIAL_EXTENSION_MAX_COUNT` extensions per school.
 */
export class TrialExtensionLimitError extends ConflictError {
  constructor(schoolId: string, currentCount: number, maxCount: number) {
    super(
      `School ${schoolId} has already used ${currentCount.toString()} of ${maxCount.toString()} trial extensions.`,
      { details: { resourceType: 'School', schoolId, currentCount, maxCount } },
    );
  }
}

// ---------------------------------------------------------------------------
// Password reset errors (Wave 7)
// ---------------------------------------------------------------------------

/** Token not found, expired, or already consumed. */
export class PasswordResetTokenInvalidError extends DomainError {
  public override readonly name = 'PasswordResetTokenInvalidError';
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Password reset token is invalid or has expired.',
    });
  }
}

/** Reset request issued, but the target user no longer exists. */
export class PasswordResetUserNotFoundError extends NotFoundError {
  constructor(userId: string) {
    super('User', userId);
  }
}

/** A first-login change attempted when the user has no pending reset. */
export class PasswordResetNotRequiredError extends ConflictError {
  constructor(userId: string) {
    super(`User ${userId} does not have a pending password reset.`, {
      details: { resourceType: 'User', userId },
    });
  }
}
