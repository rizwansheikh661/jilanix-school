/**
 * StudentParser unit specs — CSV inline, XLSX round-trip, row-cap.
 */
import { stringify as csvStringifySync } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

import { ImportRowCapExceededError } from '../../reporting.errors';
import { MAX_IMPORT_ROWS_PER_FILE } from '../../reporting.constants';
import { ImportParserRegistry } from './parser.registry';
import { StudentParser } from './student.parser';

describe('StudentParser.parse CSV', () => {
  it('decodes a 2-row CSV buffer into header-keyed rows', async () => {
    const reg = new ImportParserRegistry();
    const parser = new StudentParser(reg);
    const csv = csvStringifySync(
      [
        ['admissionNo', 'firstName', 'lastName'],
        ['A001', 'Aisha', 'Khan'],
        ['A002', 'Rahul', 'Verma'],
      ],
      {},
    );
    const rows = await parser.parse({
      buffer: Buffer.from(csv, 'utf8'),
      mimeType: 'text/csv',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      admissionNo: 'A001',
      firstName: 'Aisha',
      lastName: 'Khan',
    });
    expect(rows[1]).toEqual({
      admissionNo: 'A002',
      firstName: 'Rahul',
      lastName: 'Verma',
    });
  });
});

describe('StudentParser.parse XLSX', () => {
  it('decodes an in-memory XLSX workbook', async () => {
    const reg = new ImportParserRegistry();
    const parser = new StudentParser(reg);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Students');
    sheet.addRow(['admissionNo', 'firstName', 'lastName']);
    sheet.addRow(['A100', 'Maya', 'Singh']);
    sheet.addRow(['A101', 'Rohan', 'Sharma']);
    const buf = await wb.xlsx.writeBuffer();
    const rows = await parser.parse({
      buffer: Buffer.from(buf as ArrayBuffer),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!['admissionNo']).toBe('A100');
    expect(rows[0]!['firstName']).toBe('Maya');
    expect(rows[1]!['lastName']).toBe('Sharma');
  });
});

describe('StudentParser.parse row cap', () => {
  it('throws ImportRowCapExceededError when over MAX_IMPORT_ROWS_PER_FILE', async () => {
    const reg = new ImportParserRegistry();
    const parser = new StudentParser(reg);
    const tooMany = MAX_IMPORT_ROWS_PER_FILE + 5;
    const data: string[][] = [['admissionNo']];
    for (let i = 0; i < tooMany; i += 1) {
      data.push([`A${i.toString().padStart(5, '0')}`]);
    }
    const csv = csvStringifySync(data, {});
    await expect(
      parser.parse({
        buffer: Buffer.from(csv, 'utf8'),
        mimeType: 'text/csv',
      }),
    ).rejects.toBeInstanceOf(ImportRowCapExceededError);
  });
});
