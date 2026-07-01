/**
 * RowCommitterRegistry — per-kind committer lookup. Committers self-register
 * on application bootstrap; the import-commit handler resolves the kind's
 * committer and writes the previously-validated rows inside one tx.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { ImportKindValue } from '../../reporting.constants';
import type { RowCommitter } from './row-committer';

@Injectable()
export class RowCommitterRegistry {
  private readonly logger = new Logger(RowCommitterRegistry.name);
  private readonly map = new Map<ImportKindValue, RowCommitter<unknown>>();

  public register<TInput>(committer: RowCommitter<TInput>): void {
    if (this.map.has(committer.kind)) {
      this.logger.warn(
        `Committer for kind=${committer.kind} already registered; overwriting.`,
      );
    }
    this.map.set(
      committer.kind,
      committer as unknown as RowCommitter<unknown>,
    );
    this.logger.log(`Registered committer for kind=${committer.kind}.`);
  }

  public get(kind: ImportKindValue): RowCommitter<unknown> | undefined {
    return this.map.get(kind);
  }

  public list(): readonly ImportKindValue[] {
    return Array.from(this.map.keys()).sort();
  }
}
