import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type JobsErrorReason =
  | 'handler_not_registered'
  | 'invalid_cron'
  | 'job_not_replayable'
  | 'dead_letter_not_replayable'
  | 'duplicate_definition_name';

export class JobsError extends DomainError {
  public override readonly name: string = 'JobsError';
}

export class JobHandlerNotRegisteredError extends JobsError {
  public override readonly name = 'JobHandlerNotRegisteredError';
  constructor(handlerName: string) {
    super({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: `No job handler registered with name "${handlerName}".`,
      details: { reason: 'handler_not_registered' satisfies JobsErrorReason, handlerName },
    });
  }
}

export class InvalidCronExpressionError extends JobsError {
  public override readonly name = 'InvalidCronExpressionError';
  constructor(expression: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Invalid cron expression: "${expression}". Expected 5 fields.`,
      details: { reason: 'invalid_cron' satisfies JobsErrorReason, expression },
    });
  }
}

export class DuplicateJobDefinitionNameError extends JobsError {
  public override readonly name = 'DuplicateJobDefinitionNameError';
  constructor(schoolId: string | null, name: string) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `Job definition "${name}" already exists for school=${schoolId ?? 'platform'}.`,
      details: { reason: 'duplicate_definition_name' satisfies JobsErrorReason, schoolId, name },
    });
  }
}

export class DeadLetterNotReplayableError extends JobsError {
  public override readonly name = 'DeadLetterNotReplayableError';
  constructor(id: string, status: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Dead-letter ${id} cannot be replayed from status="${status}".`,
      details: { reason: 'dead_letter_not_replayable' satisfies JobsErrorReason, id, status },
    });
  }
}
