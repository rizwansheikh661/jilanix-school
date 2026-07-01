/**
 * StudentParser — decodes a STUDENT bulk-import spreadsheet. Accepts CSV
 * (text/csv) and XLSX (excel mime types) and returns header-keyed rows
 * keyed by the first row's column names.
 *
 * Caps the row count at MAX_IMPORT_ROWS_PER_FILE; over-cap files throw
 * ImportRowCapExceededError before validation begins.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { parse as csvParseSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

import {
  MAX_IMPORT_ROWS_PER_FILE,
  type ImportKindValue,
} from '../../reporting.constants';
import { ImportRowCapExceededError } from '../../reporting.errors';
import type { ImportParser } from './parser.types';
import { ImportParserRegistry } from './parser.registry';

const XLSX_MIMES = new Set<string>([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

@Injectable()
export class StudentParser implements ImportParser, OnApplicationBootstrap {
  public readonly kind: ImportKindValue = 'STUDENT';
  private readonly logger = new Logger(StudentParser.name);

  constructor(private readonly registry: ImportParserRegistry) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async parse(input: {
    readonly buffer: Buffer;
    readonly mimeType: string;
  }): Promise<readonly Record<string, unknown>[]> {
    const mime = (input.mimeType ?? '').toLowerCase();
    let rows: Record<string, unknown>[];
    if (mime.startsWith('text/csv') || mime === 'text/plain') {
      rows = this.parseCsv(input.buffer);
    } else if (XLSX_MIMES.has(mime)) {
      rows = await this.parseXlsx(input.buffer);
    } else {
      // Fall back to sniffing — XLSX archives start with PK; otherwise treat
      // as CSV.
      if (input.buffer.length >= 2 && input.buffer[0] === 0x50 && input.buffer[1] === 0x4b) {
        rows = await this.parseXlsx(input.buffer);
      } else {
        rows = this.parseCsv(input.buffer);
      }
    }

    if (rows.length > MAX_IMPORT_ROWS_PER_FILE) {
      throw new ImportRowCapExceededError(rows.length, MAX_IMPORT_ROWS_PER_FILE);
    }
    this.logger.debug(`Parsed ${rows.length} rows for STUDENT import.`);
    return rows;
  }

  private parseCsv(buffer: Buffer): Record<string, unknown>[] {
    const records = csvParseSync(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as unknown as Record<string, unknown>[];
    return records;
  }

  private async parseXlsx(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (sheet === undefined) return [];

    const headers: string[] = [];
    const headerRow = sheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });

    const out: Record<string, unknown>[] = [];
    const lastRow = sheet.actualRowCount;
    for (let rowIdx = 2; rowIdx <= lastRow; rowIdx += 1) {
      const row = sheet.getRow(rowIdx);
      // Skip empty rows.
      if (row.actualCellCount === 0) continue;
      const obj: Record<string, unknown> = {};
      let hasAny = false;
      for (let c = 0; c < headers.length; c += 1) {
        const header = headers[c];
        if (header === undefined || header === '') continue;
        const cell = row.getCell(c + 1);
        const raw = cell.value;
        const norm = normalizeCell(raw);
        if (norm !== null && norm !== '') hasAny = true;
        obj[header] = norm;
      }
      if (hasAny) out.push(obj);
    }
    return out;
  }
}

function normalizeCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.slice(0, 10);
  }
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown };
    if (typeof v.text === 'string') return v.text;
    if (v.result !== undefined) return v.result;
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return value.trim();
  return value;
}
