/**
 * ImportTemplateRegistry — per-kind template-spec lookup. Specs self-register
 * via `ImportTemplateBootstrap` at application boot. Mirrors
 * `ImportParserRegistry` / `ValidatorRegistry`.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { ImportKindValue } from '../../reporting.constants';
import { ImportKindUnknownError } from '../../reporting.errors';
import type { ImportTemplateSpec } from './template.types';

@Injectable()
export class ImportTemplateRegistry {
  private readonly logger = new Logger(ImportTemplateRegistry.name);
  private readonly map = new Map<ImportKindValue, ImportTemplateSpec>();

  public register(spec: ImportTemplateSpec): void {
    if (this.map.has(spec.kind)) {
      this.logger.warn(
        `Template spec for kind=${spec.kind} already registered; overwriting.`,
      );
    }
    this.map.set(spec.kind, spec);
    this.logger.log(
      `Registered template spec kind=${spec.kind} columns=${spec.columns.length}.`,
    );
  }

  public get(kind: ImportKindValue): ImportTemplateSpec {
    const spec = this.map.get(kind);
    if (spec === undefined) throw new ImportKindUnknownError(kind);
    return spec;
  }

  public has(kind: ImportKindValue): boolean {
    return this.map.has(kind);
  }
}
