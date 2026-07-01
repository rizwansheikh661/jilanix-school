import type { PrismaTx } from '../../../infra/prisma/types';
import type { ReportKindValue } from '../reporting.constants';
import type { ReportRowSet } from '../reporting.types';

export interface ReportEngineContext {
  readonly schoolId: string;
  readonly userId: string;
  readonly tx?: PrismaTx;
}

export interface ReportEngine {
  readonly kind: ReportKindValue;
  execute(
    params: Record<string, unknown>,
    ctx: ReportEngineContext,
  ): Promise<ReportRowSet>;
}

