import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { AttendanceReportService } from '../../attendance/report/report.service';
import type { ReportKindValue } from '../reporting.constants';
import type { ReportColumn, ReportRowSet } from '../reporting.types';
import { ReportEngineRegistry } from './report-engine.registry';
import type { ReportEngine, ReportEngineContext } from './report-engine.types';

const COLUMNS: readonly ReportColumn[] = Object.freeze([
  { key: 'status', header: 'Status' },
  { key: 'count', header: 'Count' },
  { key: 'staffId', header: 'Staff' },
  { key: 'dateFrom', header: 'From' },
  { key: 'dateTo', header: 'To' },
]);

interface Params {
  readonly staffId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
}

@Injectable()
export class StaffAttendanceSummaryEngine
  implements ReportEngine, OnApplicationBootstrap
{
  public readonly kind: ReportKindValue = 'STAFF_ATTENDANCE_SUMMARY';

  constructor(
    private readonly registry: ReportEngineRegistry,
    private readonly reports: AttendanceReportService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async execute(
    params: Record<string, unknown>,
    _ctx: ReportEngineContext,
  ): Promise<ReportRowSet> {
    const parsed = parseParams(params);
    const result = await this.reports.staffReport({
      staffId: parsed.staffId,
      dateFrom: new Date(parsed.dateFrom),
      dateTo: new Date(parsed.dateTo),
    });
    const rows = result.byStatus.map((entry) => ({
      status: entry.status,
      count: entry.count,
      staffId: result.staffId,
      dateFrom: result.dateFrom.toISOString().slice(0, 10),
      dateTo: result.dateTo.toISOString().slice(0, 10),
    }));
    return { columns: COLUMNS, rows };
  }
}

function parseParams(params: Record<string, unknown>): Params {
  if (typeof params.staffId !== 'string') {
    throw new Error('StaffAttendanceSummary requires staffId.');
  }
  if (typeof params.dateFrom !== 'string') {
    throw new Error('StaffAttendanceSummary requires dateFrom.');
  }
  if (typeof params.dateTo !== 'string') {
    throw new Error('StaffAttendanceSummary requires dateTo.');
  }
  return {
    staffId: params.staffId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };
}
