/**
 * ExamMarksHistoryService — read-only ledger reads.
 * Writes go through ExamMarksService → ExamMarksHistoryRepository.append
 * inside the same transaction.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequestContextRegistry } from '../../request-context';
import { ExaminationFeatureFlags } from '../examination.constants';
import { ExaminationModuleDisabledError } from '../examination.errors';
import type { ExamMarksHistoryRow } from '../examination.types';
import { ExamMarksHistoryRepository } from './exam-marks-history.repository';

@Injectable()
export class ExamMarksHistoryService {
  constructor(
    private readonly repo: ExamMarksHistoryRepository,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  public async listForMarks(
    examMarksId: string,
  ): Promise<readonly ExamMarksHistoryRow[]> {
    await this.assertModuleEnabled();
    return this.repo.listForMarks(examMarksId);
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ExaminationFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ExaminationModuleDisabledError();
  }
}
