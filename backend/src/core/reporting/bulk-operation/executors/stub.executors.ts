/**
 * Stub executors for the 6 bulk-operation kinds whose live executors land
 * in future sprints. Each throws BulkOperationKindNotImplementedError on
 * preview/validate/execute — the bulk-operation service and
 * `bulk-op.execute` handler convert the throw into a 422 / FAILED job.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { BulkOperationKindValue } from '../../reporting.constants';
import { BulkOperationKindNotImplementedError } from '../../reporting.errors';
import type {
  BulkOperationExecutionResult,
  BulkOperationPreviewResult,
  BulkOperationValidationResult,
} from '../../reporting.types';
import { BulkOperationExecutorRegistry } from './executor.registry';
import type {
  BulkOperationExecutor,
  BulkOperationExecutorContext,
} from './executor.types';

abstract class StubExecutorBase
  implements BulkOperationExecutor, OnApplicationBootstrap
{
  public abstract readonly kind: BulkOperationKindValue;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(private readonly registry: BulkOperationExecutorRegistry) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async preview(
    _params: Record<string, unknown>,
    _ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationPreviewResult> {
    throw new BulkOperationKindNotImplementedError(this.kind);
  }

  public async validate(
    _params: Record<string, unknown>,
    _ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationValidationResult> {
    throw new BulkOperationKindNotImplementedError(this.kind);
  }

  public async execute(
    _params: Record<string, unknown>,
    _ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationExecutionResult> {
    throw new BulkOperationKindNotImplementedError(this.kind);
  }
}

@Injectable()
export class StudentTransferSectionExecutor extends StubExecutorBase {
  public readonly kind: BulkOperationKindValue = 'STUDENT_TRANSFER_SECTION';
  constructor(registry: BulkOperationExecutorRegistry) {
    super(registry);
  }
}

@Injectable()
export class StudentDeactivateExecutor extends StubExecutorBase {
  public readonly kind: BulkOperationKindValue = 'STUDENT_DEACTIVATE';
  constructor(registry: BulkOperationExecutorRegistry) {
    super(registry);
  }
}

@Injectable()
export class StaffDeactivateExecutor extends StubExecutorBase {
  public readonly kind: BulkOperationKindValue = 'STAFF_DEACTIVATE';
  constructor(registry: BulkOperationExecutorRegistry) {
    super(registry);
  }
}

@Injectable()
export class FeeWaiveExecutor extends StubExecutorBase {
  public readonly kind: BulkOperationKindValue = 'FEE_WAIVE';
  constructor(registry: BulkOperationExecutorRegistry) {
    super(registry);
  }
}

@Injectable()
export class HomeworkCloseExecutor extends StubExecutorBase {
  public readonly kind: BulkOperationKindValue = 'HOMEWORK_CLOSE';
  constructor(registry: BulkOperationExecutorRegistry) {
    super(registry);
  }
}

@Injectable()
export class AssignmentCloseExecutor extends StubExecutorBase {
  public readonly kind: BulkOperationKindValue = 'ASSIGNMENT_CLOSE';
  constructor(registry: BulkOperationExecutorRegistry) {
    super(registry);
  }
}
