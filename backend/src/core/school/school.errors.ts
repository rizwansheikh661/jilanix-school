import { DomainError, ValidationFailedError } from '../errors/domain-error';

export type SchoolErrorReason =
  | 'school_contact_primary_conflict'
  | 'school_document_too_large';

export class SchoolError extends DomainError {
  public override readonly name: string = 'SchoolError';
}

export class SchoolDocumentTooLargeError extends ValidationFailedError {
  constructor(maxBytes: number) {
    super(
      [{ path: 'sizeBytes', code: 'FILE_TOO_LARGE', message: `sizeBytes must be <= ${maxBytes}` }],
      'School document exceeds size limit',
    );
  }
}
