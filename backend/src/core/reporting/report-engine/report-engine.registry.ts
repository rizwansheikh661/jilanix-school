import { Injectable, Logger } from '@nestjs/common';

import type { ReportKindValue } from '../reporting.constants';
import type { ReportEngine } from './report-engine.types';

@Injectable()
export class ReportEngineRegistry {
  private readonly logger = new Logger(ReportEngineRegistry.name);
  private readonly engines = new Map<ReportKindValue, ReportEngine>();

  public register(engine: ReportEngine): void {
    if (this.engines.has(engine.kind)) {
      this.logger.warn(`Report engine for kind "${engine.kind}" replaced.`);
    }
    this.engines.set(engine.kind, engine);
  }

  public get(kind: ReportKindValue): ReportEngine | undefined {
    return this.engines.get(kind);
  }

  public list(): readonly ReportKindValue[] {
    return Array.from(this.engines.keys()).sort();
  }
}
