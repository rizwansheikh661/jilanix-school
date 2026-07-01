/**
 * Subscription module domain errors. All extend the shared DomainError
 * hierarchy so the global filter maps them to canonical ErrorCode rows.
 */
import { ERROR_CODES } from '../../contracts/api';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../errors/domain-error';

// ---------------------------------------------------------------------------
// PlanFeature errors
// ---------------------------------------------------------------------------
export class PlanFeatureNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('PlanFeature', id);
  }
}

export class PlanFeatureDuplicateError extends ConflictError {
  constructor(planId: string, featureKey: string) {
    super(
      `PlanFeature (planId=${planId}, featureKey="${featureKey}") already exists.`,
      { details: { resourceType: 'PlanFeature', planId, featureKey } },
    );
  }
}

export class PlanFeatureInvalidModeError extends ConflictError {
  constructor(featureType: string, mode: string) {
    super(
      `PlanFeature featureType=${featureType} does not permit mode=${mode}.`,
      { details: { resourceType: 'PlanFeature', featureType, mode } },
    );
  }
}

// ---------------------------------------------------------------------------
// Subscription lifecycle errors
// ---------------------------------------------------------------------------
export class SubscriptionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Subscription', id);
  }
}

export class SubscriptionInactiveError extends DomainError {
  public override readonly name = 'SubscriptionInactiveError';
  constructor(schoolId: string, reason: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `School ${schoolId} has no active subscription (reason=${reason}).`,
      details: { resourceType: 'Subscription', schoolId, reason },
    });
  }
}

export class InvalidSubscriptionTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`Subscription status transition ${from} -> ${to} is not allowed.`, {
      details: { resourceType: 'Subscription', from, to },
    });
  }
}

export class SubscriptionAlreadyCancelledError extends ConflictError {
  constructor(id: string) {
    super(`Subscription ${id} is CANCELLED (terminal) and cannot be mutated.`, {
      details: { resourceType: 'Subscription', id },
    });
  }
}

// ---------------------------------------------------------------------------
// Guard / usage errors
// ---------------------------------------------------------------------------
export class FeatureDisabledError extends DomainError {
  public override readonly name = 'FeatureDisabledError';
  constructor(schoolId: string, featureKey: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Feature "${featureKey}" is DISABLED on the current plan for school ${schoolId}.`,
      details: { resourceType: 'PlanFeature', schoolId, featureKey },
    });
  }
}

export class FeatureNotInPlanError extends DomainError {
  public override readonly name = 'FeatureNotInPlanError';
  constructor(schoolId: string, featureKey: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Feature "${featureKey}" is not configured for the current plan of school ${schoolId}.`,
      details: { resourceType: 'PlanFeature', schoolId, featureKey },
    });
  }
}

export class FeatureLimitExceededError extends ConflictError {
  constructor(
    schoolId: string,
    featureKey: string,
    used: number,
    limit: number,
  ) {
    super(
      `Feature "${featureKey}" limit exceeded for school ${schoolId}: used=${used.toString()} limit=${limit.toString()}.`,
      { details: { resourceType: 'PlanFeature', schoolId, featureKey, used, limit } },
    );
  }
}
