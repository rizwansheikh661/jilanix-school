/**
 * Sequence-domain errors. Mirrors academic.errors.ts shape.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ValidationFailedError } from '../errors/domain-error';

export type SequenceErrorReason =
  | 'sequence_unknown'
  | 'sequence_exhausted'
  | 'fiscal_year_required'
  | 'fiscal_year_unexpected'
  | 'fiscal_year_malformed';

export class SequenceError extends DomainError {
  public override readonly name: string = 'SequenceError';
}

/**
 * The caller asked for a sequence name that is not in SEQ_NAMES.
 * Surfaced as 422 — the resource (TenantSequence) exists; the input value
 * is invalid.
 */
export class UnknownSequenceError extends ValidationFailedError {
  constructor(name: string) {
    super(
      [
        {
          path: 'sequenceName',
          code: 'SEQUENCE_UNKNOWN',
          message: `Unknown sequence "${name}". Use a SEQ_NAMES value.`,
        },
      ],
      'Unknown sequence name',
    );
  }
}

/**
 * Last-value would exceed JS safe-integer bound. Practically unreachable
 * (BIGINT > 2^53 implies > 9 quadrillion allocations), but the guard keeps
 * `Number(lastValue)` from silently losing precision.
 */
export class SequenceExhaustedError extends SequenceError {
  public override readonly name = 'SequenceExhaustedError';
  constructor(args: {
    readonly sequenceName: string;
    readonly fiscalYear: string | null;
    readonly lastValue: bigint;
  }) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Sequence "${args.sequenceName}" has exhausted its safe integer range`,
      details: {
        reason: 'sequence_exhausted' satisfies SequenceErrorReason,
        sequenceName: args.sequenceName,
        fiscalYear: args.fiscalYear,
        lastValue: String(args.lastValue),
      },
    });
  }
}

/**
 * Fiscal-year was required but not provided (e.g. `invoice`), or supplied
 * for an evergreen sequence (e.g. `employee`). 422 — clarifies the misuse
 * pre-flight rather than persisting garbage.
 */
export class SequenceFiscalYearMismatchError extends ValidationFailedError {
  constructor(args: {
    readonly sequenceName: string;
    readonly reason: 'required' | 'unexpected';
  }) {
    super(
      [
        {
          path: 'fiscalYear',
          code: args.reason === 'required' ? 'FISCAL_YEAR_REQUIRED' : 'FISCAL_YEAR_UNEXPECTED',
          message:
            args.reason === 'required'
              ? `Sequence "${args.sequenceName}" requires a fiscalYear (YYYY-YY).`
              : `Sequence "${args.sequenceName}" does not accept a fiscalYear.`,
        },
      ],
      'Fiscal-year argument is inconsistent with sequence type',
    );
  }
}

/**
 * Fiscal-year string did not match the YYYY-YY shape (e.g. "2026-27").
 */
export class SequenceFiscalYearMalformedError extends ValidationFailedError {
  constructor(value: string) {
    super(
      [
        {
          path: 'fiscalYear',
          code: 'FISCAL_YEAR_MALFORMED',
          message: `fiscalYear "${value}" must match YYYY-YY (e.g. "2026-27").`,
        },
      ],
      'Malformed fiscalYear',
    );
  }
}
