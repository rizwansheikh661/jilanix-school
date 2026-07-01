/**
 * Preview / validation summary types shared between the `POST /imports/preview`
 * endpoint and the validation-issue reporting / commit-time persistence
 * subsystems (Patch B + C).
 *
 * `ImportValidationSummary` is the canonical shape for "what does my upload
 * look like under the validator?". Multiple errors per row are supported —
 * one entry per (rowNumber, columnName, code) tuple.
 */
import type { ImportIssueSeverityValue } from '../../reporting.constants';

export const IMPORT_STATUS_VALUES = ['CLEAN', 'PARTIAL', 'INVALID'] as const;
export type ImportStatus = (typeof IMPORT_STATUS_VALUES)[number];

export interface ImportValidationErrorItem {
  readonly rowNumber: number;
  readonly columnName: string | null;
  readonly providedValue: string | null;
  readonly userFriendlyMessage: string;
  readonly code: string;
  readonly severity: ImportIssueSeverityValue;
}

export interface ImportValidationSummary {
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly importStatus: ImportStatus;
  readonly errors: ReadonlyArray<ImportValidationErrorItem>;
}

/**
 * Pure helper: derive `ImportStatus` from row counts. Used by both the
 * preview service AND `ImportJobResponseDto.from` so the live import-job
 * response carries the same flag the preview endpoint surfaces.
 */
export function deriveImportStatus(
  totalRows: number,
  validRows: number,
  errorRows: number,
): ImportStatus {
  if (totalRows === 0) return 'CLEAN';
  if (errorRows === 0) return 'CLEAN';
  if (validRows === 0) return 'INVALID';
  return 'PARTIAL';
}
