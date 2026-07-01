/**
 * Import template framework types — metadata-driven spec used to build a
 * downloadable header-row template (CSV/XLSX) for any ImportKind.
 *
 * Convention: required columns are flagged via `required: true` and the
 * template-service appends `*` to the rendered header (e.g. `admissionNo*`)
 * so end-users see at-a-glance which fields the validator will reject when
 * missing.
 *
 * The spec is intentionally *decoupled* from `ImportParser.parse` capability
 * — a stub parser that throws ImportKindNotImplementedError can still ship a
 * template so admins can prep data ahead of the live decoder landing.
 */
import type { ImportKindValue } from '../../reporting.constants';

export interface ImportColumnSpec {
  readonly name: string;
  readonly key: string;
  readonly required: boolean;
  readonly description?: string;
  readonly example?: string;
}

export interface ImportTemplateSpec {
  readonly kind: ImportKindValue;
  readonly columns: ReadonlyArray<ImportColumnSpec>;
  readonly samples: ReadonlyArray<Record<string, string>>;
}

export const IMPORT_TEMPLATE_FORMAT_VALUES = ['csv', 'xlsx'] as const;
export type ImportTemplateFormat = (typeof IMPORT_TEMPLATE_FORMAT_VALUES)[number];

export interface BuiltImportTemplate {
  readonly filename: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}
