/**
 * BulkOperationExecutorRegistry — per-kind executor lookup. Executors
 * self-register on application bootstrap; the bulk-operation service +
 * `bulk-op.execute` job handler resolve the kind's executor for
 * preview / validate / execute.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { BulkOperationKindValue } from '../../reporting.constants';
import type { BulkOperationExecutor } from './executor.types';

@Injectable()
export class BulkOperationExecutorRegistry {
  private readonly logger = new Logger(BulkOperationExecutorRegistry.name);
  private readonly map = new Map<BulkOperationKindValue, BulkOperationExecutor>();

  public register(executor: BulkOperationExecutor): void {
    if (this.map.has(executor.kind)) {
      this.logger.warn(
        `Bulk-operation executor for kind=${executor.kind} already registered; overwriting.`,
      );
    }
    this.map.set(executor.kind, executor);
    this.logger.log(
      `Registered bulk-operation executor for kind=${executor.kind}.`,
    );
  }

  public get(
    kind: BulkOperationKindValue,
  ): BulkOperationExecutor | undefined {
    return this.map.get(kind);
  }

  public list(): readonly BulkOperationExecutor[] {
    return Array.from(this.map.values());
  }
}
