/**
 * AttendanceReportService unit specs — verifies the groupBy shape used by
 * each of the five report endpoints. The Prisma client is stubbed; we
 * assert the where filters and that totals are summed correctly.
 */
import { RequestContextRegistry } from '../../request-context';
import { AttendanceReportService } from './report.service';

const SCHOOL = 'sch-1';
const FROM = new Date(Date.UTC(2026, 5, 1));
const TO = new Date(Date.UTC(2026, 5, 30));
const DAY = new Date(Date.UTC(2026, 5, 19));

function makeService() {
  const attendanceDaily = {
    groupBy: jest.fn(),
    findMany: jest.fn(),
  };
  const staffAttendance = {
    groupBy: jest.fn(),
  };
  const prisma = {
    client: { attendanceDaily, staffAttendance },
  };
  const svc = new AttendanceReportService(prisma as never);
  return { svc, attendanceDaily, staffAttendance };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('AttendanceReportService', () => {
  it('classReport sums per-status counts to total', async () => {
    const t = makeService();
    t.attendanceDaily.groupBy.mockResolvedValue([
      { status: 'PRESENT', _count: { _all: 28 } },
      { status: 'ABSENT', _count: { _all: 2 } },
    ]);
    const out = await withCtx(() => t.svc.classReport({ sectionId: 'sec-1', date: DAY }));
    expect(out.total).toBe(30);
    expect(out.byStatus).toHaveLength(2);
  });

  it('studentReport filters by date range', async () => {
    const t = makeService();
    t.attendanceDaily.groupBy.mockResolvedValue([{ status: 'PRESENT', _count: { _all: 20 } }]);
    await withCtx(() => t.svc.studentReport({ studentId: 'stu-1', dateFrom: FROM, dateTo: TO }));
    expect(t.attendanceDaily.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: 'stu-1', date: { gte: FROM, lte: TO } }),
      }),
    );
  });

  it('staffReport routes to the staffAttendance table', async () => {
    const t = makeService();
    t.staffAttendance.groupBy.mockResolvedValue([{ status: 'PRESENT', _count: { _all: 5 } }]);
    const out = await withCtx(() => t.svc.staffReport({ staffId: 'stf-1', dateFrom: FROM, dateTo: TO }));
    expect(out.total).toBe(5);
    expect(t.staffAttendance.groupBy).toHaveBeenCalled();
  });

  it('monthlyReport parses YYYY-MM and queries the full month range', async () => {
    const t = makeService();
    t.attendanceDaily.findMany.mockResolvedValue([]);
    await withCtx(() => t.svc.monthlyReport({ sectionId: 'sec-1', month: '2026-06' }));
    const call = t.attendanceDaily.findMany.mock.calls[0][0];
    const where = (call as { where: { date: { gte: Date; lte: Date } } }).where;
    expect(where.date.gte.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(where.date.lte.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('analyticsReport applies optional branchId/sectionId filters', async () => {
    const t = makeService();
    t.attendanceDaily.groupBy.mockResolvedValue([]);
    await withCtx(() => t.svc.analyticsReport({
      dateFrom: FROM, dateTo: TO, branchId: 'br-1', sectionId: 'sec-1',
    }));
    expect(t.attendanceDaily.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 'br-1', sectionId: 'sec-1' }),
      }),
    );
  });
});
