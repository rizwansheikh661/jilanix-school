/**
 * ImportPreviewService unit specs — verifies parse + validate, multi-error
 * row counting, and CLEAN / PARTIAL / INVALID importStatus derivation.
 *
 * Uses a fake parser + fake validator (no DB, no parser-registry boot).
 */
import type {
  ImportContext,
  RowValidationIssue,
  ValidationResult,
} from '../../reporting.types';
import { ValidatorRegistry } from '../../validation/validator.registry';
import { withTenantCtx } from '../../__test__/test-harness';
import { ImportParserRegistry } from '../parsers/parser.registry';
import type { ImportParser } from '../parsers/parser.types';
import { ImportPreviewService } from './preview.service';

interface Row {
  admissionNo: string;
  firstName: string;
}

function makeParser(rows: ReadonlyArray<Record<string, unknown>>): ImportParser {
  return {
    kind: 'STUDENT',
    parse: jest.fn(async () => rows),
  };
}

function makeValidator(
  predicate: (row: Record<string, unknown>) =>
    | { ok: true; output: Row }
    | { ok: false; issues: RowValidationIssue[] },
) {
  return {
    validate: jest.fn(async (row: Record<string, unknown>, _ctx: ImportContext) => {
      return predicate(row) as ValidationResult<Row>;
    }),
  };
}

function makeHarness(
  rows: ReadonlyArray<Record<string, unknown>>,
  predicate: (row: Record<string, unknown>) =>
    | { ok: true; output: Row }
    | { ok: false; issues: RowValidationIssue[] },
): ImportPreviewService {
  const parsers = new ImportParserRegistry();
  parsers.register(makeParser(rows));
  const validators = new ValidatorRegistry();
  validators.register('STUDENT', makeValidator(predicate));
  return new ImportPreviewService(parsers, validators);
}

describe('ImportPreviewService — happy path', () => {
  it('returns CLEAN when every row validates', async () => {
    const rows: Record<string, unknown>[] = [
      { admissionNo: 'A1', firstName: 'A' },
      { admissionNo: 'A2', firstName: 'B' },
    ];
    const svc = makeHarness(rows, (r) => ({
      ok: true,
      output: r as unknown as Row,
    }));
    const out = await withTenantCtx(() =>
      svc.preview({ buffer: Buffer.from(''), mimeType: 'text/csv', kind: 'STUDENT' }),
    );
    expect(out.summary.totalRows).toBe(2);
    expect(out.summary.validRows).toBe(2);
    expect(out.summary.invalidRows).toBe(0);
    expect(out.summary.importStatus).toBe('CLEAN');
    expect(out.summary.errors).toHaveLength(0);
    expect(out.rows).toHaveLength(2);
  });
});

describe('ImportPreviewService — partial validity', () => {
  it('returns PARTIAL when some rows fail and surfaces per-row errors', async () => {
    const rows: Record<string, unknown>[] = [
      { admissionNo: 'A1', firstName: 'A' },
      { admissionNo: '', firstName: 'B' },
      { admissionNo: 'A3', firstName: '' },
    ];
    const svc = makeHarness(rows, (r) => {
      const issues: RowValidationIssue[] = [];
      if ((r['admissionNo'] ?? '') === '') {
        issues.push({
          rowNumber: 0,
          columnName: 'admissionNo',
          severity: 'ERROR',
          code: 'REQUIRED_FIELD_MISSING',
          message: 'admissionNo is required.',
          providedValue: '',
          rowSnapshot: r,
        });
      }
      if ((r['firstName'] ?? '') === '') {
        issues.push({
          rowNumber: 0,
          columnName: 'firstName',
          severity: 'ERROR',
          code: 'REQUIRED_FIELD_MISSING',
          message: 'firstName is required.',
          providedValue: '',
          rowSnapshot: r,
        });
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, output: r as unknown as Row };
    });
    const out = await withTenantCtx(() =>
      svc.preview({ buffer: Buffer.from(''), mimeType: 'text/csv', kind: 'STUDENT' }),
    );
    expect(out.summary.totalRows).toBe(3);
    expect(out.summary.validRows).toBe(1);
    expect(out.summary.invalidRows).toBe(2);
    expect(out.summary.importStatus).toBe('PARTIAL');
    // One error per invalid row, both at distinct rowNumbers (2, 3).
    const rowNums = out.summary.errors.map((e) => e.rowNumber).sort();
    expect(rowNums).toEqual([2, 3]);
    // providedValue surfaced from the validator-supplied issue
    for (const e of out.summary.errors) {
      expect(e.providedValue).toBe('');
      expect(e.severity).toBe('ERROR');
    }
  });

  it('emits multiple error entries for the same row (e.g. two missing fields)', async () => {
    const rows: Record<string, unknown>[] = [{ admissionNo: '', firstName: '' }];
    const svc = makeHarness(rows, (r) => ({
      ok: false,
      issues: [
        {
          rowNumber: 0,
          columnName: 'admissionNo',
          severity: 'ERROR',
          code: 'REQUIRED_FIELD_MISSING',
          message: 'admissionNo is required.',
          rowSnapshot: r,
        },
        {
          rowNumber: 0,
          columnName: 'firstName',
          severity: 'ERROR',
          code: 'REQUIRED_FIELD_MISSING',
          message: 'firstName is required.',
          rowSnapshot: r,
        },
      ],
    }));
    const out = await withTenantCtx(() =>
      svc.preview({ buffer: Buffer.from(''), mimeType: 'text/csv', kind: 'STUDENT' }),
    );
    expect(out.summary.totalRows).toBe(1);
    expect(out.summary.validRows).toBe(0);
    expect(out.summary.invalidRows).toBe(1); // distinct rows with errors
    expect(out.summary.errors).toHaveLength(2);
    expect(out.summary.importStatus).toBe('INVALID');
  });
});

describe('ImportPreviewService — INVALID status', () => {
  it('returns INVALID when no rows validate', async () => {
    const rows: Record<string, unknown>[] = [
      { admissionNo: '', firstName: 'A' },
      { admissionNo: '', firstName: 'B' },
    ];
    const svc = makeHarness(rows, (r) => ({
      ok: false,
      issues: [
        {
          rowNumber: 0,
          columnName: 'admissionNo',
          severity: 'ERROR',
          code: 'REQUIRED_FIELD_MISSING',
          message: 'admissionNo is required.',
          rowSnapshot: r,
        },
      ],
    }));
    const out = await withTenantCtx(() =>
      svc.preview({ buffer: Buffer.from(''), mimeType: 'text/csv', kind: 'STUDENT' }),
    );
    expect(out.summary.importStatus).toBe('INVALID');
    expect(out.summary.validRows).toBe(0);
    expect(out.summary.invalidRows).toBe(2);
  });

  it('returns CLEAN when the file is empty (0 rows)', async () => {
    const svc = makeHarness([], () => ({ ok: true, output: {} as Row }));
    const out = await withTenantCtx(() =>
      svc.preview({ buffer: Buffer.from(''), mimeType: 'text/csv', kind: 'STUDENT' }),
    );
    expect(out.summary.totalRows).toBe(0);
    expect(out.summary.importStatus).toBe('CLEAN');
  });
});

describe('ImportPreviewService — previewRows cap', () => {
  it('honours an explicit previewRows cap', async () => {
    const rows: Record<string, unknown>[] = Array.from({ length: 10 }, (_v, i) => ({
      admissionNo: `A${i}`,
      firstName: 'X',
    }));
    const svc = makeHarness(rows, (r) => ({ ok: true, output: r as unknown as Row }));
    const out = await withTenantCtx(() =>
      svc.preview({
        buffer: Buffer.from(''),
        mimeType: 'text/csv',
        kind: 'STUDENT',
        previewRows: 3,
      }),
    );
    expect(out.summary.totalRows).toBe(3);
    expect(out.rows).toHaveLength(3);
  });
});
