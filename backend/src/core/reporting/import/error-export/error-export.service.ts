/**
 * ImportErrorExportService — materialises an import-job's `ImportJobIssue`
 * rows into a downloadable CSV / XLSX. Used by
 * `GET /imports/:id/issues.csv|xlsx`.
 *
 * Columns: rowNumber, columnName, providedValue, severity, code,
 * userFriendlyMessage, rowSnapshot (flattened to JSON string).
 *
 * Reuses `csv-stringify/sync` + `ExcelJS` directly (rather than going
 * through `ExportFormatterService`) because the issue-row shape — fixed
 * 7-column header — is independent of `ReportRowSet`.
 */
import { Injectable } from '@nestjs/common';
import { stringify as csvStringifySync } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

import type { ImportIssueSeverityValue } from '../../reporting.constants';
import { ImportJobIssueRepository } from '../import-issue.repository';

export interface ImportErrorExportArgs {
  readonly importJobId: string;
  readonly severity?: ImportIssueSeverityValue;
}

export interface BuiltImportErrorExport {
  readonly filename: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

const COLUMNS = [
  { key: 'rowNumber', header: 'rowNumber' },
  { key: 'columnName', header: 'columnName' },
  { key: 'providedValue', header: 'providedValue' },
  { key: 'severity', header: 'severity' },
  { key: 'code', header: 'code' },
  { key: 'userFriendlyMessage', header: 'userFriendlyMessage' },
  { key: 'rowSnapshot', header: 'rowSnapshot' },
] as const;

@Injectable()
export class ImportErrorExportService {
  constructor(private readonly issues: ImportJobIssueRepository) {}

  public async exportCsv(args: ImportErrorExportArgs): Promise<BuiltImportErrorExport> {
    const rows = await this.fetchAll(args);
    const header = COLUMNS.map((c) => c.header);
    const data = rows.map((r) =>
      COLUMNS.map((c) => stringifyCell(r[c.key as keyof typeof r])),
    );
    const csv = csvStringifySync([header, ...data], { bom: true });
    return {
      filename: `import-${args.importJobId}-issues.csv`,
      mimeType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(csv, 'utf8'),
    };
  }

  public async exportXlsx(args: ImportErrorExportArgs): Promise<BuiltImportErrorExport> {
    const rows = await this.fetchAll(args);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SchoolOS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Issues');
    sheet.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.key === 'userFriendlyMessage' || c.key === 'rowSnapshot' ? 40 : 18,
    }));
    for (const r of rows) {
      const projected: Record<string, unknown> = {};
      for (const c of COLUMNS) projected[c.key] = stringifyCell(r[c.key as keyof typeof r]);
      sheet.addRow(projected);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `import-${args.importJobId}-issues.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(arrayBuffer as ArrayBuffer),
    };
  }

  private async fetchAll(args: ImportErrorExportArgs): Promise<
    ReadonlyArray<{
      rowNumber: number;
      columnName: string | null;
      providedValue: string | null;
      severity: string;
      code: string;
      userFriendlyMessage: string;
      rowSnapshot: Record<string, unknown> | null;
    }>
  > {
    const out: Array<{
      rowNumber: number;
      columnName: string | null;
      providedValue: string | null;
      severity: string;
      code: string;
      userFriendlyMessage: string;
      rowSnapshot: Record<string, unknown> | null;
    }> = [];
    let cursorId: string | undefined;
    const pageSize = 500;
    for (;;) {
      const page = await this.issues.list({
        importJobId: args.importJobId,
        limit: pageSize,
        ...(args.severity !== undefined ? { severity: args.severity } : {}),
        ...(cursorId !== undefined ? { cursorId } : {}),
      });
      for (const r of page.rows) {
        out.push({
          rowNumber: r.rowNumber,
          columnName: r.columnName,
          providedValue: r.providedValue ?? null,
          severity: r.severity,
          code: r.code,
          userFriendlyMessage: r.message,
          rowSnapshot: r.rowSnapshot,
        });
      }
      if (page.nextCursorId === null) break;
      cursorId = page.nextCursorId;
    }
    return out;
  }
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
