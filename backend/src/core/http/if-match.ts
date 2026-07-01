/**
 * If-Match HTTP-header parser used by every PATCH/POST mutation that runs
 * optimistic concurrency. Originally lived under `core/academic/` for
 * Sprint 2; promoted to `core/http/` in Sprint 3 because the same helper is
 * reused by Student / Parent / Admission controllers.
 *
 * Missing or malformed values surface as 422 `VALIDATION_FAILED` so they
 * land in the same client-side error bucket as DTO validation failures.
 */
import { ValidationFailedError } from '../errors/domain-error';

export class IfMatchRequiredError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'If-Match',
          code: 'IF_MATCH_REQUIRED',
          message: 'If-Match header is required for this mutation.',
        },
      ],
      'If-Match header is required',
    );
  }
}

export class IfMatchMalformedError extends ValidationFailedError {
  constructor(raw: string) {
    super(
      [
        {
          path: 'If-Match',
          code: 'IF_MATCH_MALFORMED',
          message: `If-Match header "${raw}" must be a positive integer (optionally quoted).`,
        },
      ],
      'If-Match header is malformed',
    );
  }
}

/** Parse `If-Match: "<version>"` into a positive integer or throw 422. */
export function parseIfMatch(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    throw new IfMatchRequiredError();
  }
  const stripped = raw.trim().replace(/^"|"$/g, '');
  if (!/^\d+$/.test(stripped)) {
    throw new IfMatchMalformedError(raw);
  }
  const parsed = Number.parseInt(stripped, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new IfMatchMalformedError(raw);
  }
  return parsed;
}
