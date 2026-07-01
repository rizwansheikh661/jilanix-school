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
  { key: 'totalInvoiced', header: 'Total Invoiced' },
  { key: 'totalPaid', header: 'Total Paid' },
  { key: 'outstandingBalance', header: 'Outstanding Balance' },
]);

interface Params {
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
}

@Injectable()
export class FeeOutstandingEngine
  implements ReportEngine, OnApplicationBootstrap
{
  public readonly kind: ReportKindValue = 'FEE_OUTSTANDING';

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
          if (ledger.totals.outstandingBalance <= 0) continue;
          rows.push({
            studentId: s.id,
            admissionNo: s.admissionNo,
            firstName: s.firstName,
            lastName: s.lastName,
            classId: s.classId,
            sectionId: s.sectionId,
            totalInvoiced: ledger.totals.totalInvoiced,
            totalPaid: ledger.totals.totalPaid,
            outstandingBalance: ledger.totals.outstandingBalance,
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
  return out;
}
