/**
 * ImportPreviewService — in-memory parse+validate of the first N rows of an
 * uploaded spreadsheet. No DB writes, no FileAsset persistence, no audit
 * row, no outbox publish — purely a read-side reflection of what the
 * existing `import.run` handler WOULD produce for the same buffer.
 *
 * Reuses `ImportParserRegistry` + `ValidatorRegistry` so STUDENT and any
 * future kind are exercised by the same code path. Stub parsers throw
 * ImportKindNotImplementedError up-front — the controller layer converts
 * that into a 400.
 */
import { Injectable } from '@nestjs/common';

import { RequestContextRegistry } from '../../../request-context';
import {
  MAX_IMPORT_PREVIEW_ROWS,
  type ImportKindValue,
} from '../../reporting.constants';
import { ImportKindUnknownError } from '../../reporting.errors';
import type { RowValidationIssue } from '../../reporting.types';
import { ValidatorRegistry } from '../../validation/validator.registry';
import { ImportParserRegistry } from '../parsers/parser.registry';
import {
  deriveImportStatus,
  type ImportValidationErrorItem,
  type ImportValidationSummary,
} from './preview.types';

export interface ImportPreviewArgs {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly kind: ImportKindValue;
  readonly previewRows?: number;
}

export interface ImportPreviewResult {
  readonly summary: ImportValidationSummary;
  /** First N parsed rows (header-keyed), for UI display. */
  readonly rows: ReadonlyArray<Record<string, unknown>>;
}

@Injectable()
export class ImportPreviewService {
  constructor(
    private readonly parsers: ImportParserRegistry,
    private readonly validators: ValidatorRegistry,
  ) {}

  public async preview(args: ImportPreviewArgs): Promise<ImportPreviewResult> {
    const parser = this.parsers.get(args.kind);
    if (parser === undefined) throw new ImportKindUnknownError(args.kind);
    const validator = this.validators.get(args.kind);
    if (validator === undefined) {
      throw new Error(`No row validator registered for kind=${args.kind}.`);
    }

    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ImportPreviewService requires tenant scope.');
    }

    const cap = clampPreviewLimit(args.previewRows);
    const allRows = await parser.parse({
      buffer: args.buffer,
      mimeType: args.mimeType,
    });
    const previewRows = allRows.slice(0, cap);

    const issues: RowValidationIssue[] = [];
    let validRows = 0;
    for (let i = 0; i < previewRows.length; i += 1) {
      const rowNumber = i + 1;
      const annotated: Record<string, unknown> = {
        ...previewRows[i],
        __rowNumber: rowNumber,
      };
      const result = await validator.validate(annotated, {
        schoolId: ctx.schoolId,
        userId: ctx.userId ?? '',
        importJobId: 'preview',
        options: {},
      });
      if (result.ok) {
        validRows += 1;
      } else {
        for (const iss of result.issues) {
          issues.push({
            ...iss,
            rowNumber: iss.rowNumber !== 0 ? iss.rowNumber : rowNumber,
          });
        }
      }
    }

    const totalRows = previewRows.length;
    const invalidRows = countDistinctRowsWithErrors(issues);
    const errorRowCount = totalRows - validRows;
    const errors: ImportValidationErrorItem[] = issues.map((iss) => ({
      rowNumber: iss.rowNumber,
      columnName: iss.columnName ?? null,
      providedValue: pickProvidedValue(iss),
      userFriendlyMessage: iss.message,
      code: iss.code,
      severity: iss.severity,
    }));
    const summary: ImportValidationSummary = {
      totalRows,
      validRows,
      invalidRows,
      importStatus: deriveImportStatus(totalRows, validRows, errorRowCount),
      errors,
    };
    return { summary, rows: previewRows };
  }
}

function clampPreviewLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) {
    return MAX_IMPORT_PREVIEW_ROWS;
  }
  return Math.min(Math.floor(requested), MAX_IMPORT_PREVIEW_ROWS);
}

function countDistinctRowsWithErrors(
  issues: ReadonlyArray<RowValidationIssue>,
): number {
  const rows = new Set<number>();
  for (const iss of issues) {
    if (iss.severity === 'ERROR') rows.add(iss.rowNumber);
  }
  return rows.size;
}

function pickProvidedValue(iss: RowValidationIssue): string | null {
  if (iss.columnName === undefined || iss.columnName === null) return null;
  const snapshot = iss.rowSnapshot;
  if (snapshot === undefined || snapshot === null) return null;
  const raw = (snapshot as Record<string, unknown>)[iss.columnName];
  if (raw === undefined || raw === null) return null;
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return str.length > 500 ? str.slice(0, 500) : str;
}
