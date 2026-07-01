import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type BranchErrorReason =
  | 'branch_has_active_dependents'
  | 'branch_invalid_status_transition'
  | 'branch_primary_required';

export class BranchError extends DomainError {
  public override readonly name: string = 'BranchError';
}

export class BranchHasActiveDependentsError extends BranchError {
  public override readonly name = 'BranchHasActiveDependentsError';
  constructor(args: { readonly branchId: string; readonly counts: Record<string, number> }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Branch ${args.branchId} has active dependents and cannot be deactivated/deleted`,
      details: {
        reason: 'branch_has_active_dependents' satisfies BranchErrorReason,
        branchId: args.branchId,
        counts: args.counts,
      },
    });
  }
}

export class BranchInvalidStatusTransitionError extends BranchError {
  public override readonly name = 'BranchInvalidStatusTransitionError';
  constructor(args: {
    readonly branchId: string;
    readonly currentStatus: string;
    readonly attemptedStatus: string;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Cannot move branch ${args.branchId} from ${args.currentStatus} to ${args.attemptedStatus}`,
      details: {
        reason: 'branch_invalid_status_transition' satisfies BranchErrorReason,
        ...args,
      },
    });
  }
}

export class BranchPrimaryRequiredError extends BranchError {
  public override readonly name = 'BranchPrimaryRequiredError';
  constructor(branchId: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Branch ${branchId} is the primary branch — cannot deactivate/delete without promoting another first`,
      details: {
        reason: 'branch_primary_required' satisfies BranchErrorReason,
        branchId,
      },
    });
  }
}
