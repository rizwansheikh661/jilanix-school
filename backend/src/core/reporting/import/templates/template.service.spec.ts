/**
 * ImportTemplateService unit specs — verifies CSV + XLSX rendering for
 * STUDENT (full spec) + a stub kind (STAFF), the `*` required-flag suffix,
 * and the bundled sample rows.
 */
import ExcelJS from 'exceljs';

import { ImportTemplateRegistry } from './template.registry';
import { ImportTemplateService } from './template.service';
import { STAFF_TEMPLATE_SPEC } from './stub.templates';
import { STUDENT_TEMPLATE_SPEC } from './student.template';

function makeService(): { svc: ImportTemplateService; registry: ImportTemplateRegistry } {
  const registry = new ImportTemplateRegistry();
  registry.register(STUDENT_TEMPLATE_SPEC);
  registry.register(STAFF_TEMPLATE_SPEC);
  const svc = new ImportTemplateService(registry);
  return { svc, registry };
}

describe('ImportTemplateService — CSV', () => {
  it('renders STUDENT header row with `*` flag on every required column', async () => {
    const { svc } = makeService();
    const built = await svc.build('STUDENT', 'csv');
    expect(built.mimeType).toContain('text/csv');
    expect(built.filename).toBe('student-import-template.csv');
    const csv = built.buffer.toString('utf8');
    const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.length > 0);
    // BOM + header + 2 samples
    expect(lines.length).toBe(3);
    const header = lines[0]!;
    for (const col of STUDENT_TEMPLATE_SPEC.columns) {
      const expected = col.required ? `${col.name}*` : col.name;
      expect(header).toContain(expected);
    }
    // Sample row sanity — first sample includes ADM-1001
    expect(lines[1]).toContain('ADM-1001');
  });

  it('writes a UTF-8 BOM at the start of the CSV', async () => {
    const { svc } = makeService();
    const built = await svc.build('STUDENT', 'csv');
    expect(built.buffer[0]).toBe(0xef);
    expect(built.buffer[1]).toBe(0xbb);
    expect(built.buffer[2]).toBe(0xbf);
  });

  it('renders a stub kind (STAFF) with 1 sample row', async () => {
    const { svc } = makeService();
    const built = await svc.build('STAFF', 'csv');
    const lines = built.buffer
      .toString('utf8')
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(lines.length).toBe(2); // header + 1 sample
    expect(lines[0]).toContain('staffCode*');
    expect(lines[0]).toContain('firstName*');
    expect(lines[0]).toContain('lastName*');
    expect(lines[1]).toContain('STF-001');
  });
});

describe('ImportTemplateService — XLSX', () => {
  it('produces a workbook with one Template sheet + header + samples for STUDENT', async () => {
    const { svc } = makeService();
    const built = await svc.build('STUDENT', 'xlsx');
    expect(built.filename).toBe('student-import-template.xlsx');
    expect(built.mimeType).toContain('spreadsheetml.sheet');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(built.buffer as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Template');
    expect(sheet).toBeDefined();
    const header = sheet!.getRow(1);
    // First column "admissionNo" required → "admissionNo*"
    expect(header.getCell(1).value).toBe('admissionNo*');
    // Last column "photoUrl" optional → "photoUrl"
    const lastCol = STUDENT_TEMPLATE_SPEC.columns.length;
    expect(header.getCell(lastCol).value).toBe('photoUrl');
    // Bold header
    expect(header.font?.bold).toBe(true);
    // Frozen first row
    const view = sheet!.views?.[0] as { ySplit?: number } | undefined;
    expect(view?.ySplit).toBe(1);
    // 2 sample rows under header (row 1 = header, 2 + 3 = samples)
    expect(sheet!.getRow(2).getCell(1).value).toBe('ADM-1001');
    expect(sheet!.getRow(3).getCell(1).value).toBe('ADM-1002');
  });

  it('XLSX for stub kind (STAFF) has 3 required header cells with `*`', async () => {
    const { svc } = makeService();
    const built = await svc.build('STAFF', 'xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(built.buffer as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Template')!;
    const header = sheet.getRow(1);
    expect(header.getCell(1).value).toBe('staffCode*');
    expect(header.getCell(2).value).toBe('firstName*');
    expect(header.getCell(3).value).toBe('lastName*');
  });
});

describe('ImportTemplateService — unknown kind', () => {
  it('throws ImportKindUnknownError when no spec registered', async () => {
    const registry = new ImportTemplateRegistry();
    const svc = new ImportTemplateService(registry);
    await expect(svc.build('STUDENT', 'csv')).rejects.toThrow(/STUDENT/);
  });
});
