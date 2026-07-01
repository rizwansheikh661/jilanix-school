import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import type { ReportKindValue } from '../reporting.constants';
import { ReportKindEngineNotImplementedError } from '../reporting.errors';
import type { ReportRowSet } from '../reporting.types';
import { ReportEngineRegistry } from './report-engine.registry';
import type { ReportEngine, ReportEngineContext } from './report-engine.types';

abstract class ScaffoldEngine implements ReportEngine, OnApplicationBootstrap {
  public abstract readonly kind: ReportKindValue;

  protected constructor(private readonly registry: ReportEngineRegistry) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public execute(
    _params: Record<string, unknown>,
    _ctx: ReportEngineContext,
  ): Promise<ReportRowSet> {
    throw new ReportKindEngineNotImplementedError(this.kind);
  }
}

@Injectable()
export class ExamMarksSheetEngine extends ScaffoldEngine {
  public readonly kind: ReportKindValue = 'EXAM_MARKS_SHEET';
  constructor(registry: ReportEngineRegistry) {
    super(registry);
  }
}

@Injectable()
export class ExamResultSummaryEngine extends ScaffoldEngine {
  public readonly kind: ReportKindValue = 'EXAM_RESULT_SUMMARY';
  constructor(registry: ReportEngineRegistry) {
    super(registry);
  }
}

@Injectable()
export class HomeworkComplianceEngine extends ScaffoldEngine {
  public readonly kind: ReportKindValue = 'HOMEWORK_COMPLIANCE';
  constructor(registry: ReportEngineRegistry) {
    super(registry);
  }
}

@Injectable()
export class SyllabusProgressEngine extends ScaffoldEngine {
  public readonly kind: ReportKindValue = 'SYLLABUS_PROGRESS';
  constructor(registry: ReportEngineRegistry) {
    super(registry);
  }
}
