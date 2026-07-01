/**
 * Communication Center domain errors. All extend the shared DomainError
 * hierarchy. The module-disabled error is raised when
 * `module.communication_center` is OFF for the calling tenant.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/domain-error';

export class CommunicationCenterDisabledError extends ForbiddenError {
  public override readonly name = 'CommunicationCenterDisabledError';
  constructor() {
    super('Communication Center is disabled for this tenant.', {
      flag: 'module.communication_center',
    });
  }
}

export class ScheduledCommunicationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('ScheduledCommunication', id);
  }
}

export class ScheduledCommunicationNotCancellableError extends ConflictError {
  constructor(id: string, status: string) {
    super(
      `Scheduled communication ${id} cannot be cancelled in status ${status}.`,
      { code: ERROR_CODES.STATE_INVALID, details: { id, status } },
    );
  }
}
