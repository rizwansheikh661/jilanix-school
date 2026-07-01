/**
 * RowCommitter — per-kind committer contract. Implementations write the
 * valid output rows produced by the matching validator inside an externally
 * provided transaction so the commit handler can wrap a single tx around
 * the whole batch.
 *
 * Per-row failures are caught and returned in `failed[]`; the handler
 * decides whether to mark the parent job COMMITTED or FAILED based on the
 * overall counts.
 */
import type { PrismaTx } from '../../../../infra/prisma/types';
import type { ImportKindValue } from '../../reporting.constants';
import type { ImportContext } from '../../reporting.types';

export interface RowCommitterResult {
  readonly committed: number;
  readonly failed: readonly { readonly rowNumber: number; readonly message: string }[];
}

export interface RowCommitter<TInput> {
  readonly kind: ImportKindValue;
  commit(
    rows: readonly TInput[],
    ctx: ImportContext,
    tx: PrismaTx,
  ): Promise<RowCommitterResult>;
}
