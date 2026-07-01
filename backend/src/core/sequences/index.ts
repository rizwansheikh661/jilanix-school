/**
 * Sequences — public barrel.
 *
 * Re-exports the module, the service (consumed by Staff/Admission/Fees), the
 * canonical name constants, and the typed errors so callers can
 * `instanceof`-check.
 */
export { SequencesModule } from './sequences.module';
export { SequenceService } from './sequence/sequence.service';
export type { SequenceCallArgs } from './sequence/sequence.service';
export {
  ALL_SEQUENCE_NAMES,
  SEQ_NAMES,
  SEQUENCES_PERMISSION_DESCRIPTIONS,
  SEQUENCE_REQUIRES_FISCAL_YEAR,
  SequencesPermissions,
  type SequenceName,
  type SequencesPermission,
} from './sequences.constants';
export {
  SequenceError,
  SequenceExhaustedError,
  SequenceFiscalYearMalformedError,
  SequenceFiscalYearMismatchError,
  UnknownSequenceError,
  type SequenceErrorReason,
} from './sequences.errors';
export type { TenantSequenceRow } from './sequences.types';
