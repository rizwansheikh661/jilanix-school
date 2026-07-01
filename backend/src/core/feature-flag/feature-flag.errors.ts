import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type FeatureFlagErrorReason =
  | 'unknown_flag'
  | 'duplicate_flag_key'
  | 'invalid_rollout_strategy'
  | 'invalid_percentage'
  | 'rollout_lists_required';

export class FeatureFlagError extends DomainError {
  public override readonly name: string = 'FeatureFlagError';
}

export class UnknownFeatureFlagError extends FeatureFlagError {
  public override readonly name = 'UnknownFeatureFlagError';
  constructor(key: string) {
    super({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `Feature flag "${key}" is not defined.`,
      details: { reason: 'unknown_flag' satisfies FeatureFlagErrorReason, key },
    });
  }
}

export class DuplicateFeatureFlagKeyError extends FeatureFlagError {
  public override readonly name = 'DuplicateFeatureFlagKeyError';
  constructor(key: string) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Feature flag "${key}" already exists.`,
      details: { reason: 'duplicate_flag_key' satisfies FeatureFlagErrorReason, key },
    });
  }
}

export class InvalidRolloutPercentageError extends FeatureFlagError {
  public override readonly name = 'InvalidRolloutPercentageError';
  constructor(value: number | null | undefined) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Rollout percentage must be an integer 0..100; got ${String(value)}.`,
      details: { reason: 'invalid_percentage' satisfies FeatureFlagErrorReason, value },
    });
  }
}

export class RolloutListRequiredError extends FeatureFlagError {
  public override readonly name = 'RolloutListRequiredError';
  constructor(strategy: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Rollout strategy "${strategy}" requires a non-empty list.`,
      details: { reason: 'rollout_lists_required' satisfies FeatureFlagErrorReason, strategy },
    });
  }
}
