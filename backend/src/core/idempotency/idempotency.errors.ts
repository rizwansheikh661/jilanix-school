import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type IdempotencyErrorReason =
  | 'request_body_mismatch'
  | 'in_progress';

export class IdempotencyError extends DomainError {
  public override readonly name: string = 'IdempotencyError';
}

export class IdempotencyConflictError extends IdempotencyError {
  public override readonly name = 'IdempotencyConflictError';
  constructor(key: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Idempotency-Key "${key}" was reused with a different request body.`,
      details: { reason: 'request_body_mismatch' satisfies IdempotencyErrorReason, key },
    });
  }
}

export class IdempotencyInProgressError extends IdempotencyError {
  public override readonly name = 'IdempotencyInProgressError';
  constructor(key: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Idempotency-Key "${key}" request is still in progress.`,
      details: { reason: 'in_progress' satisfies IdempotencyErrorReason, key },
    });
  }
}
