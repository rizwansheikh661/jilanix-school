/**
 * ValidatorRegistry — per-kind row-validator lookup. Validators self-register
 * on application bootstrap; the import-run handler resolves the kind's
 * validator and feeds parsed rows through it.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { ImportKindValue } from '../reporting.constants';
import type { RowValidator } from './row-validator';

@Injectable()
export class ValidatorRegistry {
  private readonly logger = new Logger(ValidatorRegistry.name);
  private readonly map = new Map<
    ImportKindValue,
    RowValidator<Record<string, unknown>, unknown>
  >();

  public register<TInput extends Record<string, unknown>, TOutput>(
    kind: ImportKindValue,
    validator: RowValidator<TInput, TOutput>,
  ): void {
    if (this.map.has(kind)) {
      this.logger.warn(
        `Validator for kind=${kind} already registered; overwriting.`,
      );
    }
    this.map.set(
      kind,
      validator as unknown as RowValidator<Record<string, unknown>, unknown>,
    );
    this.logger.log(`Registered validator for kind=${kind}.`);
  }

  public get(
    kind: ImportKindValue,
  ): RowValidator<Record<string, unknown>, unknown> | undefined {
    return this.map.get(kind);
  }
}
