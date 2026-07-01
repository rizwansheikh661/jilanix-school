/**
 * RowValidator — per-kind row validator contract. Implementations are
 * registered with ValidatorRegistry at boot.
 */
import type { ImportContext, ValidationResult } from '../reporting.types';

export interface RowValidator<TInput, TOutput> {
  validate(row: TInput, ctx: ImportContext): Promise<ValidationResult<TOutput>>;
}
