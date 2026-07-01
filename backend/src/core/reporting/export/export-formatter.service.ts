/**
 * ExportFormatterService — materialises a ReportRowSet into a binary
 * buffer (CSV / Excel). PDF is reserved (throws
 * ReportFormatNotImplementedError).
 *
 * Sprint 13 ships CSV + Excel only:
 *   - CSV   — csv-stringify/sync; UTF-8; header row from columns[].
 *   - Excel — exceljs Workbook with a single "Report" sheet; the first
 *             row is the header row, subsequent rows mirror the rowset.
 *   - PDF   — reserved for Sprint 14+; the report-run handler refuses
 *             PDF requests up-front in ReportRunService.create() too.
 */
import { Injectable } from '@nestjs/common';
import { stringify as csvStringifySync } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

import type { ReportFormatValue } from '../reporting.constants';
import { ReportFormatNotImplementedError } from '../reporting.errors';
import type { ReportRowSet } from '../reporting.types';

export interface FormattedReport {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly extension: string;
}

@Injectable()
export class ExportFormatterService {
  public async format(
    rowSet: ReportRowSet,
    format: ReportFormatValue,
  ): Promise<FormattedReport> {
    switch (format) {
      case 'CSV':
        return this.formatCsv(rowSet);
      case 'EXCEL':
        return this.formatExcel(rowSet);
      case 'PDF':
        throw new ReportFormatNotImplementedError('PDF');
      default: {
        const exhaustive: never = format;
        throw new ReportFormatNotImplementedError(exhaustive);
      }
    }
  }

  private formatCsv(rowSet: ReportRowSet): FormattedReport {
    const header = rowSet.columns.map((c) => c.header);
    const rows = rowSet.rows.map((row) =>
      rowSet.columns.map((col) => stringifyCell(row[col.key])),
    );
    const csv = csvStringifySync([header, ...rows], { bom: true });
    return {
      buffer: Buffer.from(csv, 'utf8'),
      mimeType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }

  private async formatExcel(rowSet: ReportRowSet): Promise<FormattedReport> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SchoolOS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Report');

    sheet.columns = rowSet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: Math.min(Math.max(col.header.length + 4, 12), 40),
    }));

    for (const row of rowSet.rows) {
      const projected: Record<string, unknown> = {};
      for (const col of rowSet.columns) {
        projected[col.key] = excelCell(row[col.key]);
      }
      sheet.addRow(projected);
    }

    sheet.getRow(1).font = { bold: true };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer as ArrayBuffer),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function excelCell(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
