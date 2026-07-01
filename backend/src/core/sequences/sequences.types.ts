import type { SequenceName } from './sequences.constants';

/**
 * Row shape returned by TenantSequenceRepository. `lastValue` is surfaced as
 * a JS `number` because every realistic sequence stays well below 2^53; the
 * service throws SequenceExhaustedError before that boundary is reached.
 */
export interface TenantSequenceRow {
  readonly id: string;
  readonly schoolId: string;
  readonly sequenceName: SequenceName;
  readonly fiscalYear: string | null;
  readonly lastValue: number;
  readonly updatedAt: Date;
}
