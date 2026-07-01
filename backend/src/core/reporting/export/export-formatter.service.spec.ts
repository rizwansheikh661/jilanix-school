/**
 * ExportFormatterService unit specs — CSV bytes, XLSX round-trip, PDF reject.
 */
import { parse as csvParseSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

import { ReportFormatNotImplementedError } from '../reporting.errors';
import type { ReportRowSet } from '../reporting.types';
import { ExportFormatterService } from './export-formatter.service';

function sampleRowSet(): ReportRowSet {
  return {
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
    ],
    rows: [
      { id: 's1', name: 'Aisha' },
      { id: 's2', name: 'Rahul' },
    ],
  };
}

describe('ExportFormatterService.format CSV', () => {
  it('produces UTF-8 CSV with a header row + 2 data rows', async () => {
    const svc = new ExportFormatterService();
    const result = await svc.format(sampleRowSet(), 'CSV');
    expect(result.mimeType).toBe('text/csv; charset=utf-8');
    expect(result.extension).toBe('csv');

    const parsed = csvParseSync(result.buffer, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ ID: 's1', Name: 'Aisha' });
    expect(parsed[1]).toEqual({ ID: 's2', Name: 'Rahul' });
  });
});

describe('ExportFormatterService.format XLSX', () => {
  it('writes a workbook that round-trips through ExcelJS', async () => {
    const svc = new ExportFormatterService();
    const result = await svc.format(sampleRowSet(), 'EXCEL');
    expect(result.extension).toBe('xlsx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    // Header row.
    expect(sheet.getRow(1).getCell(1).value).toBe('ID');
    expect(sheet.getRow(1).getCell(2).value).toBe('Name');
    // Data rows.
    expect(sheet.getRow(2).getCell(1).value).toBe('s1');
    expect(sheet.getRow(2).getCell(2).value).toBe('Aisha');
    expect(sheet.getRow(3).getCell(1).value).toBe('s2');
    expect(sheet.getRow(3).getCell(2).value).toBe('Rahul');
  });
});

describe('ExportFormatterService.format PDF', () => {
  it('throws ReportFormatNotImplementedError for PDF', async () => {
    const svc = new ExportFormatterService();
    await expect(svc.format(sampleRowSet(), 'PDF')).rejects.toBeInstanceOf(
      ReportFormatNotImplementedError,
    );
  });
});
