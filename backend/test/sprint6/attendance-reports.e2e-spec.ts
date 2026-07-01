/**
 * Sprint 6 e2e — attendance reports: class summary + monthly grid sanity.
 * Service-orchestration spec; Prisma client is stubbed to return canned
 * groupBy / findMany results.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { AttendanceReportService } from '../../src/core/attendance/report/report.service';

const SCHOOL = 'sch-e2e';
const SECTION = 'sec-e2e';
const DAY = new Date(Date.UTC(2026, 5, 19));

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 6 e2e — attendance reports', () => {
  it('classReport returns total + per-status counts for a (section, date)', async () => {
    const attendanceDaily = {
      groupBy: jest.fn(async () => [
        { status: 'PRESENT', _count: { _all: 27 } },
        { status: 'ABSENT', _count: { _all: 2 } },
        { status: 'LATE', _count: { _all: 1 } },
      ]),
      findMany: jest.fn(),
    };
    const svc = new AttendanceReportService({
      client: { attendanceDaily, staffAttendance: { groupBy: jest.fn() } },
    } as never);

    const out = await withCtx(() => svc.classReport({ sectionId: SECTION, date: DAY }));
    expect(out.total).toBe(30);
    expect(out.byStatus.find((s) => s.status === 'PRESENT')?.count).toBe(27);
  });

  it('monthlyReport returns one cell per (student, date)', async () => {
    const cells = [
      { studentId: 'stu-1', date: new Date(Date.UTC(2026, 5, 1)), status: 'PRESENT' as const },
      { studentId: 'stu-1', date: new Date(Date.UTC(2026, 5, 2)), status: 'ABSENT' as const },
      { studentId: 'stu-2', date: new Date(Date.UTC(2026, 5, 1)), status: 'PRESENT' as const },
    ];
    const attendanceDaily = {
      groupBy: jest.fn(),
      findMany: jest.fn(async () => cells),
    };
    const svc = new AttendanceReportService({
      client: { attendanceDaily, staffAttendance: { groupBy: jest.fn() } },
    } as never);

    const out = await withCtx(() => svc.monthlyReport({ sectionId: SECTION, month: '2026-06' }));
    expect(out.cells).toHaveLength(3);
    expect(out.month).toBe('2026-06');
  });
});
