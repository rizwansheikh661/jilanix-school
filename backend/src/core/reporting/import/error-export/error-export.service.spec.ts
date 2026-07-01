/**
 * ImportErrorExportService unit specs — verifies CSV + XLSX rendering of
 * `ImportJobIssue` rows including the providedValue + commit-time WARNING
 * blend, and the severity filter pass-through to the underlying repository.
 */
import ExcelJS from 'exceljs';

import type { ImportJobIssueRow } from '../../reporting.types';
import { ImportErrorExportService } from './error-export.service';

const NOW = new Date('2026-06-23T00:00:00.000Z');

function makeIssue(overrides: Partial<ImportJobIssueRow>): ImportJobIssueRow {
  return {
    id: 'iss-1',
    schoolId: 'school-1',
    importJobId: 'imp-1',
    rowNumber: 1,
    columnName: null,
    severity: 'ERROR',
    code: 'X',
    message: 'msg',
    providedValue: null,
    rowSnapshot: null,
    version: 1,
    createdAt: NOW,
    ...overrides,
  };
}

function makeRepo(pages: ReadonlyArray<ReadonlyArray<ImportJobIssueRow>>) {
  let calls = 0;
  return {
    list: jest.fn(
      async (args: {
        importJobId: string;
        limit: number;
        cursorId?: string;
        severity?: string;
      }) => {
        const idx = calls;
        calls += 1;
        const rows = pages[idx] ?? [];
        const nextCursorId = idx + 1 < pages.length ? `cursor-${idx}` : null;
        return {
          rows,
          nextCursorId,
          __severityCalled: args.severity,
        };
      },
    ),
  };
}

describe('ImportErrorExportService — CSV', () => {
  it('writes header + one row per issue with all 7 columns', async () => {
    const issues = [
      makeIssue({
        id: 'a',
        rowNumber: 2,
        columnName: 'admissionNo',
        severity: 'ERROR',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'admissionNo is required.',
        providedValue: '',
        rowSnapshot: { admissionNo: '' },
      }),
      makeIssue({
        id: 'b',
        rowNumber: 5,
        columnName: null,
        severity: 'WARNING',
        code: 'COMMIT_FAILED',
        message: 'Constraint violation.',
        providedValue: null,
        rowSnapshot: { admissionNo: 'A99' },
      }),
    ];
    const repo = makeRepo([issues]);
    const svc = new ImportErrorExportService(repo as never);
    const built = await svc.exportCsv({ importJobId: 'imp-1' });
    expect(built.filename).toBe('import-imp-1-issues.csv');
    expect(built.mimeType).toContain('text/csv');
    const csv = built.buffer.toString('utf8');
    const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.length > 0);
    // header + 2 rows
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('rowNumber');
    expect(lines[0]).toContain('columnName');
    expect(lines[0]).toContain('providedValue');
    expect(lines[0]).toContain('severity');
    expect(lines[0]).toContain('code');
    expect(lines[0]).toContain('userFriendlyMessage');
    expect(lines[0]).toContain('rowSnapshot');
    // Validation ERROR + commit-time WARNING both appear
    expect(csv).toContain('REQUIRED_FIELD_MISSING');
    expect(csv).toContain('COMMIT_FAILED');
    expect(csv).toContain('WARNING');
  });

  it('paginates the repo until nextCursorId is null', async () => {
    const repo = makeRepo([
      [makeIssue({ id: 'a' })],
      [makeIssue({ id: 'b' })],
      [makeIssue({ id: 'c' })],
    ]);
    const svc = new ImportErrorExportService(repo as never);
    const built = await svc.exportCsv({ importJobId: 'imp-1' });
    expect(repo.list).toHaveBeenCalledTimes(3);
    const lines = built.buffer
      .toString('utf8')
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.length > 0);
    // header + 3 rows
    expect(lines).toHaveLength(4);
  });

  it('passes severity filter through to the repo', async () => {
    const repo = makeRepo([[]]);
    const svc = new ImportErrorExportService(repo as never);
    await svc.exportCsv({ importJobId: 'imp-1', severity: 'WARNING' });
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'WARNING', importJobId: 'imp-1' }),
    );
  });
});

describe('ImportErrorExportService — XLSX', () => {
  it('writes a workbook with an Issues sheet and bold header', async () => {
    const issues = [
      makeIssue({
        id: 'a',
        rowNumber: 2,
        columnName: 'admissionNo',
        providedValue: '',
        message: 'admissionNo is required.',
        code: 'REQUIRED_FIELD_MISSING',
      }),
    ];
    const repo = makeRepo([issues]);
    const svc = new ImportErrorExportService(repo as never);
    const built = await svc.exportXlsx({ importJobId: 'imp-1' });
    expect(built.filename).toBe('import-imp-1-issues.xlsx');
    expect(built.mimeType).toContain('spreadsheetml.sheet');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(built.buffer as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Issues');
    expect(sheet).toBeDefined();
    expect(sheet!.getRow(1).font?.bold).toBe(true);
    expect(sheet!.getRow(2).getCell(1).value).toBe('2'); // rowNumber stringified
    expect(sheet!.getRow(2).getCell(6).value).toBe('admissionNo is required.');
  });
});
