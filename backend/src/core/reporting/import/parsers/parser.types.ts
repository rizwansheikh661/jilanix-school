/**
 * ImportParser — per-kind binary → header-keyed row mapper. Implementations
 * decode CSV / XLSX into `Record<string, unknown>[]` keyed by header
 * column. The validator + committer never see Buffer / mimetype; the
 * parser is the only stage with raw-binary access.
 */
import type { ImportKindValue } from '../../reporting.constants';

export interface ImportParser {
  readonly kind: ImportKindValue;
  parse(input: {
    readonly buffer: Buffer;
    readonly mimeType: string;
  }): Promise<readonly Record<string, unknown>[]>;
}
