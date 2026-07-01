/**
 * ImportTemplateService — materialises an `ImportTemplateSpec` into a CSV
 * or XLSX buffer ready to be streamed back to the caller.
 *
 * CSV (csv-stringify/sync, UTF-8 BOM): header row (with `*` appended to
 * required column names) followed by the sample rows. XLSX (ExcelJS):
 * single "Template" sheet with a bold, frozen header row + sample rows.
 *
 * Decoupled from `ImportParser.parse` — STUDENT ships a full spec, the 4
 * stub kinds ship minimal placeholder specs so the framework is exercised
 * across all kinds while the live decoders mature.
 */
import { Injectable } from '@nestjs/common';
import { stringify as csvStringifySync } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

import type { ImportKindValue } from '../../reporting.constants';
import { ImportTemplateRegistry } from './template.registry';
import type {
  BuiltImportTemplate,
  ImportColumnSpec,
  ImportTemplateFormat,
  ImportTemplateSpec,
} from './template.types';

@Injectable()
export class ImportTemplateService {
  constructor(private readonly registry: ImportTemplateRegistry) {}

  public async build(
    kind: ImportKindValue,
    format: ImportTemplateFormat,
  ): Promise<BuiltImportTemplate> {
    const spec = this.registry.get(kind);
    if (format === 'csv') return this.buildCsv(spec);
    return this.buildXlsx(spec);
  }

  private buildCsv(spec: ImportTemplateSpec): BuiltImportTemplate {
    const header = spec.columns.map((c) => renderHeader(c));
    const sampleRows = spec.samples.map((sample) =>
      spec.columns.map((c) => sample[c.key] ?? ''),
    );
    const csv = csvStringifySync([header, ...sampleRows], { bom: true });
    return {
      filename: `${spec.kind.toLowerCase()}-import-template.csv`,
      mimeType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(csv, 'utf8'),
    };
  }

  private async buildXlsx(spec: ImportTemplateSpec): Promise<BuiltImportTemplate> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SchoolOS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Template');

    sheet.columns = spec.columns.map((c) => ({
      header: renderHeader(c),
      key: c.key,
      width: Math.min(Math.max(c.name.length + 6, 14), 40),
    }));

    for (const sample of spec.samples) {
      const projected: Record<string, unknown> = {};
      for (const col of spec.columns) {
        projected[col.key] = sample[col.key] ?? '';
      }
      sheet.addRow(projected);
    }

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `${spec.kind.toLowerCase()}-import-template.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(arrayBuffer as ArrayBuffer),
    };
  }
}

function renderHeader(c: ImportColumnSpec): string {
  return c.required ? `${c.name}*` : c.name;
}
