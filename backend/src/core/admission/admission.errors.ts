/**
 * Domain errors specific to the Admission workflow.
 *
 * The state machine lives in `AdmissionService`; these errors fire
 * when a requested transition is incompatible with the current row
 * state, or when an APPROVE attempt is missing required snapshot
 * fields (e.g. `admissionNo`).
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ValidationFailedError } from '../errors/domain-error';
import type { AdmissionStatusValue } from './admission.types';

export type AdmissionErrorReason =
  | 'invalid_transition'
  | 'already_decided'
  | 'not_approvable'
  | 'document_not_found'
  | 'admission_not_deletable';

export class AdmissionError extends DomainError {
  public override readonly name: string = 'AdmissionError';
}

/**
 * Requested transition is not allowed from the current status (e.g.
 * APPROVE from DRAFT, REJECT from APPROVED).
 */
export class InvalidAdmissionTransitionError extends AdmissionError {
  public override readonly name = 'InvalidAdmissionTransitionError';
  constructor(args: {
    readonly admissionId: string;
    readonly from: AdmissionStatusValue;
    readonly attempted: 'submit' | 'approve' | 'reject' | 'withdraw' | 'update';
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Cannot ${args.attempted} admission in status ${args.from}`,
      details: {
        reason: 'invalid_transition' satisfies AdmissionErrorReason,
        admissionId: args.admissionId,
        from: args.from,
        attempted: args.attempted,
      },
    });
  }
}

/**
 * Admission is in a terminal state and may not be transitioned further.
 * Separate from `InvalidAdmissionTransitionError` so callers can
 * distinguish "wrong order" from "already done".
 */
export class AdmissionAlreadyDecidedError extends AdmissionError {
  public override readonly name = 'AdmissionAlreadyDecidedError';
  constructor(args: { readonly admissionId: string; readonly status: AdmissionStatusValue }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Admission ${args.admissionId} is already ${args.status}`,
      details: {
        reason: 'already_decided' satisfies AdmissionErrorReason,
        ...args,
      },
    });
  }
}

/**
 * Approve refused because the snapshot is incomplete — typically an
 * absent `admissionNo`. We surface the missing fields so the client UI
 * can highlight them.
 */
export class AdmissionNotApprovableError extends ValidationFailedError {
  constructor(missingFields: readonly string[]) {
    super(
      missingFields.map((path) => ({
        path,
        code: 'ADMISSION_NOT_APPROVABLE',
        message: `${path} is required before approval.`,
      })),
      'Admission is missing fields required for approval',
    );
  }
}

/**
 * Delete refused because the admission is in a status that should
 * stay durable for audit (APPROVED or SUBMITTED).
 */
export class AdmissionNotDeletableError extends AdmissionError {
  public override readonly name = 'AdmissionNotDeletableError';
  constructor(args: { readonly admissionId: string; readonly status: AdmissionStatusValue }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Admission ${args.admissionId} cannot be deleted in status ${args.status}`,
      details: {
        reason: 'admission_not_deletable' satisfies AdmissionErrorReason,
        ...args,
      },
    });
  }
}

/** Admission document lookup miss (separate from generic 404). */
export class AdmissionDocumentNotFoundError extends AdmissionError {
  public override readonly name = 'AdmissionDocumentNotFoundError';
  constructor(documentId: string) {
    super({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `AdmissionDocument ${documentId} not found`,
      details: {
        reason: 'document_not_found' satisfies AdmissionErrorReason,
        documentId,
      },
    });
  }
}
