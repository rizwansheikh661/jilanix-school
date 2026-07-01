/**
 * Sprint 6 e2e — attendance lock-window:
 *   1. Create a SECTION lock for today.
 *   2. Mark for the locked section → 409 ATTENDANCE_LOCKED.
 *   3. Unlock the lock window.
 *   4. Mark again — succeeds.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { StudentAttendanceService } from '../../src/core/attendance/student-attendance/student-attendance.service';
import { AttendanceLockWindowService } from '../../src/core/attendance/lock-window/lock-window.service';
import { AttendanceLockedError } from '../../src/core/attendance/attendance.errors';
import type { AttendanceDailyRow, AttendanceLockWindowRow } from '../../src/core/attendance/attendance.types';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const SECTION = 'sec-e2e';
const TODAY = new Date(Date.UTC(2026, 5, 19));

function makeAtt(overrides: Partial<AttendanceDailyRow> = {}): AttendanceDailyRow {
  return {
    id: 'att-1', schoolId: SCHOOL, branchId: BRANCH, academicYearId: 'ay-1',
    sectionId: SECTION, studentId: 'stu-1', date: TODAY, status: 'PRESENT',
    source: 'MANUAL', markedAt: TODAY, markedBy: null,
    checkInTime: null, checkOutTime: null, remarks: null,
    mode: 'DAILY', periodNumber: null, subjectId: null,
    version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
    ...overrides,
  };
}

function makeLock(): AttendanceLockWindowRow {
  return {
    id: 'lock-1', schoolId: SCHOOL, scope: 'SECTION', branchId: BRANCH, sectionId: SECTION,
    startDate: TODAY, endDate: TODAY, reason: 'audit',
    lockedBy: null, lockedAt: TODAY,
    version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 6 e2e — lock window blocks then allows after unlock', () => {
  it('lock → mark refused → unlock → mark succeeds', async () => {
    // Lock service shared between create-lock and assertNotLocked.
    const lockState = { active: true };
    const lockRepo = {
      findById: jest.fn(async () => makeLock()),
      findActive: jest.fn(async () => (lockState.active ? [makeLock()] : [])),
      list: jest.fn(),
      create: jest.fn(async () => makeLock()),
      unlock: jest.fn(async () => { lockState.active = false; }),
    };
    const outbox = { publish: jest.fn(async () => undefined) };
    const audit = { record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })) };
    const lockSvc = new AttendanceLockWindowService(
      { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
      lockRepo as never,
      outbox as never,
      audit as never,
    );

    // 1. Create the lock.
    await withCtx(() => lockSvc.create({
      scope: 'SECTION', branchId: BRANCH, sectionId: SECTION, startDate: TODAY, endDate: TODAY,
    }));

    // 2. Mark refused while locked.
    const studentRepo = {
      findById: jest.fn(),
      findActive: jest.fn(async () => null),
      list: jest.fn(),
      create: jest.fn(async () => makeAtt()),
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
    const holidayService = { findHoliday: jest.fn(async () => null) };
    const featureFlags = { isEnabled: jest.fn(async () => true) };
    const studentSvc = new StudentAttendanceService(
      { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
      studentRepo as never,
      historyRepo as never,
      configService as never,
      lockSvc as never, // real lock service — uses lockRepo.findActive
      holidayService as never,
      featureFlags as never,
      outbox as never,
      audit as never,
    );

    await expect(
      withCtx(() => studentSvc.mark({
        academicYearId: 'ay-1', sectionId: SECTION, studentId: 'stu-1',
        date: TODAY, status: 'PRESENT', branchId: BRANCH,
      })),
    ).rejects.toBeInstanceOf(AttendanceLockedError);
    expect(studentRepo.create).not.toHaveBeenCalled();

    // 3. Unlock.
    await withCtx(() => lockSvc.unlock('lock-1', 1));
    expect(lockState.active).toBe(false);

    // 4. Mark succeeds after unlock.
    const row = await withCtx(() => studentSvc.mark({
      academicYearId: 'ay-1', sectionId: SECTION, studentId: 'stu-1',
      date: TODAY, status: 'PRESENT', branchId: BRANCH,
    }));
    expect(row.id).toBe('att-1');
  });
});
