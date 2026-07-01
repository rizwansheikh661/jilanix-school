import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { FeeLedgerService } from '../../fees/fee-ledger/fee-ledger.service';
import { RequestContextRegistry } from '../../request-context';
import {
  MAX_REPORT_ROWS,
  type ReportKindValue,
} from '../reporting.constants';
import type { ReportColumn, ReportRowSet } from '../reporting.types';
import { ReportEngineRegistry } from './report-engine.registry';
import type { ReportEngine, ReportEngineContext } from './report-engine.types';

const COLUMNS: readonly ReportColumn[] = Object.freeze([
  { key: 'studentId', header: 'Student Id' },
  { key: 'admissionNo', header: 'Admission No' },
  { key: 'firstName', header: 'First Name' },
  { key: 'lastName', header: 'Last Name' },
  { key: 'classId', header: 'Class' },
  { key: 'sectionId', header: 'Section' },
  { key: 'totalPaid', header: 'Total Paid' },
  { key: 'paymentCount', header: 'Payment Count' },
]);

interface Params {
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

@Injectable()
export class FeeCollectionSummaryEngine
  implements ReportEngine, OnApplicationBootstrap
{
  public readonly kind: ReportKindValue = 'FEE_COLLECTION_SUMMARY';

  constructor(
    private readonly registry: ReportEngineRegistry,
    private readonly prisma: PrismaService,
    private readonly ledger: FeeLedgerService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async execute(
    params: Record<string, unknown>,
    ctx: ReportEngineContext,
  ): Promise<ReportRowSet> {
    const parsed = parseParams(params);
    const schoolId = ctx.schoolId;
    const from = parsed.dateFrom !== undefined ? new Date(parsed.dateFrom) : null;
    const to = parsed.dateTo !== undefined ? new Date(parsed.dateTo) : null;

    const where: Record<string, unknown> = {
      schoolId,
      status: 'ACTIVE',
      deletedAt: null,
    };
    if (parsed.academicYearId !== undefined) where.academicYearId = parsed.academicYearId;
    if (parsed.classId !== undefined) where.classId = parsed.classId;
    if (parsed.sectionId !== undefined) where.sectionId = parsed.sectionId;

    const students = await this.prisma.client.student.findMany({
      where,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        classId: true,
        sectionId: true,
      },
      take: MAX_REPORT_ROWS,
      orderBy: [{ admissionNo: 'asc' }],
    });

    const rows: Record<string, unknown>[] = [];
    await RequestContextRegistry.run(
      RequestContextRegistry.require(),
      async () => {
        for (const s of students) {
          if (rows.length >= MAX_REPORT_ROWS) break;
          const ledger = await this.ledger.getStudentLedger({
            schoolId,
            studentId: s.id,
            ...(parsed.academicYearId !== undefined
              ? { academicYearId: parsed.academicYearId }
              : {}),
          });
          let totalPaid = 0;
          let paymentCount = 0;
          for (const entry of ledger.entries) {
            if (entry.type !== 'PAYMENT') continue;
            const t = entry.at.getTime();
            if (from !== null && t < from.getTime()) continue;
            if (to !== null && t > to.getTime()) continue;
            totalPaid += entry.credit;
            paymentCount += 1;
          }
          if (paymentCount === 0) continue;
          rows.push({
            studentId: s.id,
            admissionNo: s.admissionNo,
            firstName: s.firstName,
            lastName: s.lastName,
            classId: s.classId,
            sectionId: s.sectionId,
            totalPaid,
            paymentCount,
          });
        }
      },
    );

    return { columns: COLUMNS, rows };
  }
}

function parseParams(params: Record<string, unknown>): Params {
  const out: { -readonly [K in keyof Params]: Params[K] } = {};
  if (typeof params.academicYearId === 'string') {
    out.academicYearId = params.academicYearId;
  }
  if (typeof params.classId === 'string') out.classId = params.classId;
  if (typeof params.sectionId === 'string') out.sectionId = params.sectionId;
  if (typeof params.dateFrom === 'string') out.dateFrom = params.dateFrom;
  if (typeof params.dateTo === 'string') out.dateTo = params.dateTo;
  return out;
}
