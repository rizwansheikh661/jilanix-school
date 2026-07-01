/**
 * ImportParserRegistry — per-kind parser lookup. Parsers self-register on
 * application bootstrap; the import-run handler resolves the kind's parser
 * to decode the source FileAsset.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { ImportKindValue } from '../../reporting.constants';
import type { ImportParser } from './parser.types';

@Injectable()
export class ImportParserRegistry {
  private readonly logger = new Logger(ImportParserRegistry.name);
  private readonly map = new Map<ImportKindValue, ImportParser>();

  public register(parser: ImportParser): void {
    if (this.map.has(parser.kind)) {
      this.logger.warn(
        `Parser for kind=${parser.kind} already registered; overwriting.`,
      );
    }
    this.map.set(parser.kind, parser);
    this.logger.log(`Registered parser for kind=${parser.kind}.`);
  }

  public get(kind: ImportKindValue): ImportParser | undefined {
    return this.map.get(kind);
  }
}
