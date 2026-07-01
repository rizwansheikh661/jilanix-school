/**
 * ReportEngineService — thin facade over ReportEngineRegistry.
 *
 * Resolves the engine for a given kind and invokes execute(). Throws
 * ReportKindUnknownError if no engine has registered for the kind (this
 * indicates a wiring bug — every kind in REPORT_KIND_CATALOG should have
 * a corresponding engine implementation or scaffold). The catalog itself
 * is validated separately at the controller / service layer via
 * getReportKindEntry.
 */
import { Injectable } from '@nestjs/common';

import type { ReportKindValue } from '../reporting.constants';
import { ReportKindUnknownError } from '../reporting.errors';
import type { ReportRowSet } from '../reporting.types';
import { ReportEngineRegistry } from './report-engine.registry';
import type { ReportEngineContext } from './report-engine.types';

@Injectable()
export class ReportEngineService {
  constructor(private readonly registry: ReportEngineRegistry) {}

  public async execute(
    kind: ReportKindValue,
    params: Record<string, unknown>,
    ctx: ReportEngineContext,
  ): Promise<ReportRowSet> {
    const engine = this.registry.get(kind);
    if (engine === undefined) {
      throw new ReportKindUnknownError(kind);
    }
    return engine.execute(params, ctx);
  }

  public listRegistered(): readonly ReportKindValue[] {
    return this.registry.list();
  }
}
