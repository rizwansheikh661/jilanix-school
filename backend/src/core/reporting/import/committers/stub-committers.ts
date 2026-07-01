/**
 * Stub committers for the 4 import kinds whose live writers land in future
 * sprints. Each throws ImportKindNotImplementedError on commit() — the
 * import-commit handler converts the throw into a FAILED job +
 * IMPORT_FAILED notification.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { PrismaTx } from '../../../../infra/prisma/types';
import type { ImportKindValue } from '../../reporting.constants';
import { ImportKindNotImplementedError } from '../../reporting.errors';
import type { ImportContext } from '../../reporting.types';
import { RowCommitterRegistry } from './committer.registry';
import type { RowCommitter, RowCommitterResult } from './row-committer';

abstract class StubCommitterBase
  implements RowCommitter<unknown>, OnApplicationBootstrap
{
  public abstract readonly kind: ImportKindValue;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(private readonly registry: RowCommitterRegistry) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async commit(
    _rows: readonly unknown[],
    _ctx: ImportContext,
    _tx: PrismaTx,
  ): Promise<RowCommitterResult> {
    throw new ImportKindNotImplementedError(this.kind);
  }
}

@Injectable()
export class StaffCommitter extends StubCommitterBase {
  public readonly kind: ImportKindValue = 'STAFF';
  constructor(registry: RowCommitterRegistry) {
    super(registry);
  }
}

@Injectable()
export class ExamMarksCommitter extends StubCommitterBase {
  public readonly kind: ImportKindValue = 'EXAM_MARKS';
  constructor(registry: RowCommitterRegistry) {
    super(registry);
  }
}

@Injectable()
export class AttendanceCommitter extends StubCommitterBase {
  public readonly kind: ImportKindValue = 'ATTENDANCE';
  constructor(registry: RowCommitterRegistry) {
    super(registry);
  }
}

@Injectable()
export class FeePaymentCommitter extends StubCommitterBase {
  public readonly kind: ImportKindValue = 'FEE_PAYMENT';
  constructor(registry: RowCommitterRegistry) {
    super(registry);
  }
}
