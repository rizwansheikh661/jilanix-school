/**
 * Stub parsers for the 4 import kinds whose live decoders land in future
 * sprints (STAFF / EXAM_MARKS / ATTENDANCE / FEE_PAYMENT). Each throws
 * ImportKindNotImplementedError on parse() — the import-run handler
 * converts the throw into a FAILED job + IMPORT_FAILED notification.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { ImportKindNotImplementedError } from '../../reporting.errors';
import type { ImportKindValue } from '../../reporting.constants';
import type { ImportParser } from './parser.types';
import { ImportParserRegistry } from './parser.registry';

abstract class StubParserBase implements ImportParser, OnApplicationBootstrap {
  public abstract readonly kind: ImportKindValue;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(private readonly registry: ImportParserRegistry) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async parse(_input: {
    readonly buffer: Buffer;
    readonly mimeType: string;
  }): Promise<readonly Record<string, unknown>[]> {
    throw new ImportKindNotImplementedError(this.kind);
  }
}

@Injectable()
export class StaffParser extends StubParserBase {
  public readonly kind: ImportKindValue = 'STAFF';
  constructor(registry: ImportParserRegistry) {
    super(registry);
  }
}

@Injectable()
export class ExamMarksParser extends StubParserBase {
  public readonly kind: ImportKindValue = 'EXAM_MARKS';
  constructor(registry: ImportParserRegistry) {
    super(registry);
  }
}

@Injectable()
export class AttendanceParser extends StubParserBase {
  public readonly kind: ImportKindValue = 'ATTENDANCE';
  constructor(registry: ImportParserRegistry) {
    super(registry);
  }
}

@Injectable()
export class FeePaymentParser extends StubParserBase {
  public readonly kind: ImportKindValue = 'FEE_PAYMENT';
  constructor(registry: ImportParserRegistry) {
    super(registry);
  }
}
