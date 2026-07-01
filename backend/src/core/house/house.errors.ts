import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type HouseErrorReason = 'house_assignment_already_active';

export class HouseError extends DomainError {
  public override readonly name: string = 'HouseError';
}

export class HouseAssignmentAlreadyActiveError extends HouseError {
  public override readonly name = 'HouseAssignmentAlreadyActiveError';
  constructor(args: { studentId: string; academicYearId: string; existingHouseId: string }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Student ${args.studentId} already has an active house assignment in academic year ${args.academicYearId}`,
      details: {
        reason: 'house_assignment_already_active' satisfies HouseErrorReason,
        ...args,
      },
    });
  }
}
