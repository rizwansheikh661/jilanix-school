/**
 * Stub validators for import kinds whose live implementations land in
 * future sprints (STAFF / EXAM_MARKS / ATTENDANCE / FEE_PAYMENT). Each
 * emits a single NOT_IMPLEMENTED ERROR per row so the row never reaches
 * the committer.
 */
import { Injectable } from '@nestjs/common';

import type { ImportKindValue } from '../reporting.constants';
import type {
  ImportContext,
  RowValidationIssue,
  ValidationResult,
} from '../reporting.types';
import type { RowValidator } from './row-validator';

function notImplementedIssue(
  kind: ImportKindValue,
  rowNumber: number,
  row: Record<string, unknown>,
): RowValidationIssue {
  const snapshot: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === '__rowNumber') continue;
    snapshot[k] = v;
  }
  return {
    rowNumber,
    severity: 'ERROR',
    code: 'NOT_IMPLEMENTED',
    message: `Import kind ${kind} validator not yet implemented.`,
    rowSnapshot: snapshot,
  };
}

abstract class StubValidatorBase
  implements RowValidator<Record<string, unknown>, never>
{
  protected abstract readonly kind: ImportKindValue;

  public async validate(
    row: Record<string, unknown>,
    _ctx: ImportContext,
  ): Promise<ValidationResult<never>> {
    const rowNumber =
      typeof row.__rowNumber === 'number' ? (row.__rowNumber as number) : 0;
    return { ok: false, issues: [notImplementedIssue(this.kind, rowNumber, row)] };
  }
}

@Injectable()
export class StaffImportRowValidator extends StubValidatorBase {
  protected readonly kind: ImportKindValue = 'STAFF';
}

@Injectable()
export class ExamMarksImportRowValidator extends StubValidatorBase {
  protected readonly kind: ImportKindValue = 'EXAM_MARKS';
}

@Injectable()
export class AttendanceImportRowValidator extends StubValidatorBase {
  protected readonly kind: ImportKindValue = 'ATTENDANCE';
}

@Injectable()
export class FeePaymentImportRowValidator extends StubValidatorBase {
  protected readonly kind: ImportKindValue = 'FEE_PAYMENT';
}
