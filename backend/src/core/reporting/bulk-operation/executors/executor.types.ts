/**
 * BulkOperationExecutor contract. One executor per BulkOperationKindValue.
 * Each implements three modes: preview (read-only summary), validate
 * (per-target issue list), execute (the actual mutation, run from the
 * `bulk-op.execute` job handler).
 */
import type { PrismaTx } from '../../../../infra/prisma/types';
import type { BulkOperationKindValue } from '../../reporting.constants';
import type {
  BulkOperationExecutionResult,
  BulkOperationPreviewResult,
  BulkOperationValidationResult,
} from '../../reporting.types';

export interface BulkOperationExecutorContext {
  readonly schoolId: string;
  readonly userId: string;
  readonly bulkOperationId: string;
  readonly tx?: PrismaTx;
}

export interface BulkOperationExecutor {
  readonly kind: BulkOperationKindValue;
  preview(
    params: Record<string, unknown>,
    ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationPreviewResult>;
  validate(
    params: Record<string, unknown>,
    ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationValidationResult>;
  execute(
    params: Record<string, unknown>,
    ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationExecutionResult>;
}
