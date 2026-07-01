/**
 * Sprint 6 e2e — holiday auto-mark behaviour:
 *   - Bulk-mark on a holiday → every row coerced to status=HOLIDAY (request status ignored).
 *   - Single-mark on a holiday with non-HOLIDAY status → 409 HOLIDAY_STATUS_CONFLICT.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { StudentAttendanceService } from '../../src/core/attendance/student-attendance/student-attendance.service';
import { HolidayStatusConflictError } from '../../src/core/attendance/attendance.errors';
import type { AttendanceDailyRow } from '../../src/core/attendance/attendance.types';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const SECTION = 'sec-e2e';
const TODAY = new Date(Date.UTC(2026, 5, 19));

function makeAtt(status: AttendanceDailyRow['status'], studentId: string): AttendanceDailyRow {
  return {
    id: `att-${studentId}`, schoolId: SCHOOL, branchId: BRANCH, academicYearId: 'ay-1',
    sectionId: SECTION, studentId, date: TODAY, status,
    source: 'MANUAL', markedAt: TODAY, markedBy: null,
    checkInTime: null, checkOutTime: null, remarks: null,
    mode: 'DAILY', periodNumber: null, subjectId: null,
    version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

function makeService() {
  const repo = {
    findById: jest.fn(),
    findActive: jest.fn(async () => null),
    list: jest.fn(),
    create: jest.fn(async (input) => makeAtt(
      (input as { status: AttendanceDailyRow['status'] }).status,
      (input as { studentId: string }).studentId,
    )),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const historyRepo = { append: jest.fn(), listForAttendance: jest.fn() };
  const configService = {
    getEffective: jest.fn(async () => ({
      editWindowHours: 24, lateThresholdMinutes: 15,
      correctionsRequireApproval: true, allowedSources: ['MANUAL'] as const, holidayAutoMark: true,
    })),
  };
  const lockService = { assertNotLocked: jest.fn(async () => undefined) };
  const holidayService = {
    findHoliday: jest.fn(async () => ({ id: 'hol-1', date: TODAY, branchId: null, isFullDay: true })),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })) };
  const svc = new StudentAttendanceService(
    { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
    repo as never, historyRepo as never,
    configService as never, lockService as never, holidayService as never,
    featureFlags as never, outbox as never, audit as never,
  );
  return { svc, repo };
}

describe('Sprint 6 e2e — holiday auto-mark', () => {
  it('bulk-mark on a holiday coerces every entry to HOLIDAY', async () => {
    const t = makeService();
    const out = await withCtx(() => t.svc.bulkMark({
      academicYearId: 'ay-1', sectionId: SECTION, date: TODAY,
      entries: [
        { studentId: 's-1', status: 'PRESENT' },
        { studentId: 's-2', status: 'ABSENT' },
        { studentId: 's-3' },
      ],
    }));
    expect(out.created).toBe(3);
    const statuses = (t.repo.create.mock.calls as unknown as Array<[{ status: string }]>).map((c) => c[0].status);
    expect(statuses).toEqual(['HOLIDAY', 'HOLIDAY', 'HOLIDAY']);
  });

  it('single-mark with non-HOLIDAY status on a holiday returns 409', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.mark({
        academicYearId: 'ay-1', sectionId: SECTION, studentId: 'stu-1',
        date: TODAY, status: 'PRESENT',
      })),
    ).rejects.toBeInstanceOf(HolidayStatusConflictError);
  });

  it('single-mark with HOLIDAY status on a holiday is accepted', async () => {
    const t = makeService();
    const row = await withCtx(() => t.svc.mark({
      academicYearId: 'ay-1', sectionId: SECTION, studentId: 'stu-1',
      date: TODAY, status: 'HOLIDAY',
    }));
    expect(row.status).toBe('HOLIDAY');
  });
});
