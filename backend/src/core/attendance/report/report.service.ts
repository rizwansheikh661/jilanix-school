/**
 * AttendanceReportService — read-only aggregations over `AttendanceDaily`
 * and `StaffAttendance`. Uses Prisma `groupBy`; tenant scope + soft-delete
 * filters are injected by the Prisma extension stack.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AttendanceStatusValue,
} from '../attendance.constants';

export interface ClassReportArgs {
  readonly sectionId: string;
  readonly date: Date;
}

export interface StudentReportArgs {
  readonly studentId: string;
  readonly dateFrom: Date;
  readonly dateTo: Date;
}

export interface StaffReportArgs {
  readonly staffId: string;
  readonly dateFrom: Date;
  readonly dateTo: Date;
}

export interface MonthlyReportArgs {
  readonly sectionId: string;
  /** `YYYY-MM`. */
  readonly month: string;
}

export interface AnalyticsReportArgs {
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly branchId?: string;
  readonly sectionId?: string;
}

export interface StatusCount {
  readonly status: AttendanceStatusValue;
  readonly count: number;
}

export interface ClassReport {
  readonly sectionId: string;
  readonly date: Date;
  readonly total: number;
  readonly byStatus: readonly StatusCount[];
}

export interface StudentReport {
  readonly studentId: string;
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly total: number;
  readonly byStatus: readonly StatusCount[];
}

export interface StaffReport {
  readonly staffId: string;
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly total: number;
  readonly byStatus: readonly StatusCount[];
}

export interface MonthlyReportCell {
  readonly studentId: string;
  readonly date: Date;
  readonly status: AttendanceStatusValue;
}

export interface MonthlyReport {
  readonly sectionId: string;
  readonly month: string;
  readonly cells: readonly MonthlyReportCell[];
}

export interface AnalyticsReport {
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly total: number;
  readonly byStatus: readonly StatusCount[];
}

@Injectable()
export class AttendanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  private reader(): PrismaTx {
    return this.prisma.client as unknown as PrismaTx;
  }

  private requireTenant(): void {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AttendanceReportService requires tenant scope.');
    }
  }

  public async classReport(args: ClassReportArgs): Promise<ClassReport> {
    this.requireTenant();
    const groups = await this.reader().attendanceDaily.groupBy({
      by: ['status'],
      where: { sectionId: args.sectionId, date: args.date },
      _count: { _all: true },
    });
    return {
      sectionId: args.sectionId,
      date: args.date,
      total: groups.reduce((acc, g) => acc + g._count._all, 0),
      byStatus: groups.map((g) => ({
        status: g.status as AttendanceStatusValue,
        count: g._count._all,
      })),
    };
  }

  public async studentReport(args: StudentReportArgs): Promise<StudentReport> {
    this.requireTenant();
    const groups = await this.reader().attendanceDaily.groupBy({
      by: ['status'],
      where: {
        studentId: args.studentId,
        date: { gte: args.dateFrom, lte: args.dateTo },
      },
      _count: { _all: true },
    });
    return {
      studentId: args.studentId,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      total: groups.reduce((acc, g) => acc + g._count._all, 0),
      byStatus: groups.map((g) => ({
        status: g.status as AttendanceStatusValue,
        count: g._count._all,
      })),
    };
  }

  public async staffReport(args: StaffReportArgs): Promise<StaffReport> {
    this.requireTenant();
    const groups = await this.reader().staffAttendance.groupBy({
      by: ['status'],
      where: {
        staffId: args.staffId,
        date: { gte: args.dateFrom, lte: args.dateTo },
      },
      _count: { _all: true },
    });
    return {
      staffId: args.staffId,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      total: groups.reduce((acc, g) => acc + g._count._all, 0),
      byStatus: groups.map((g) => ({
        status: g.status as AttendanceStatusValue,
        count: g._count._all,
      })),
    };
  }

  public async monthlyReport(args: MonthlyReportArgs): Promise<MonthlyReport> {
    this.requireTenant();
    const { from, to } = monthRange(args.month);
    const rows = await this.reader().attendanceDaily.findMany({
      where: {
        sectionId: args.sectionId,
        date: { gte: from, lte: to },
      },
      select: { studentId: true, date: true, status: true },
      orderBy: [{ studentId: 'asc' }, { date: 'asc' }],
    });
    return {
      sectionId: args.sectionId,
      month: args.month,
      cells: rows.map((r) => ({
        studentId: r.studentId,
        date: r.date,
        status: r.status as AttendanceStatusValue,
      })),
    };
  }

  public async analyticsReport(args: AnalyticsReportArgs): Promise<AnalyticsReport> {
    this.requireTenant();
    const where: Record<string, unknown> = {
      date: { gte: args.dateFrom, lte: args.dateTo },
    };
    if (args.branchId !== undefined) where.branchId = args.branchId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    const groups = await this.reader().attendanceDaily.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    return {
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      total: groups.reduce((acc, g) => acc + g._count._all, 0),
      byStatus: groups.map((g) => ({
        status: g.status as AttendanceStatusValue,
        count: g._count._all,
      })),
    };
  }
}

function monthRange(month: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (m === null) throw new Error(`Invalid month "${month}", expected YYYY-MM.`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 0));
  return { from, to };
}
