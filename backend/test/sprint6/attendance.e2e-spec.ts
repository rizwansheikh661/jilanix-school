/**
 * Sprint 6 — Student attendance lifecycle e2e (service-orchestration spec).
 *
 * The project does not yet wire Testcontainers for a real MySQL backend in
 * e2e specs (see Sprint 4.5 working-days.e2e-spec.ts for the same pattern).
 * This spec drives the full student-attendance lifecycle through the real
 * service code paths with stubbed repositories, asserting the cross-service
 * contracts a real HTTP test would assert against:
 *
 *   1. Bulk-mark a class on a date.
 *   2. PATCH a row in-window — succeeds, history appended, `attendance.changed` published.
 *   3. PATCH the row out-of-window — refused with EDIT_WINDOW_EXPIRED.
 *   4. Create a correction request for the same row.
 *   5. Approve the correction — status flips, CORRECTED history appended,
 *      `attendance.corrected` published.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { StudentAttendanceService } from '../../src/core/attendance/student-attendance/student-attendance.service';
import { AttendanceCorrectionService } from '../../src/core/attendance/correction/correction.service';
import type { AttendanceDailyRow, AttendanceCorrectionRow } from '../../src/core/attendance/attendance.types';
import { EditWindowExpiredError } from '../../src/core/attendance/attendance.errors';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const SECTION = 'sec-e2e';
const ACADEMIC_YEAR = 'ay-e2e';
const TODAY = new Date(Date.UTC(2026, 5, 19));

function makeAtt(overrides: Partial<AttendanceDailyRow> = {}): AttendanceDailyRow {
  return {
    id: 'att-1', schoolId: SCHOOL, branchId: BRANCH, academicYearId: ACADEMIC_YEAR,
    sectionId: SECTION, studentId: 'stu-1', date: TODAY, status: 'PRESENT',
    source: 'MANUAL', markedAt: TODAY, markedBy: null,
    checkInTime: null, checkOutTime: null, remarks: null,
    mode: 'DAILY', periodNumber: null, subjectId: null,
    version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
    ...overrides,
  };
}

function makeStudentService(opts: { editWindowHours?: number } = {}) {
  const prisma = { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) };
  const repo = {
    findById: jest.fn(),
    findActive: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const historyRepo = { append: jest.fn(), listForAttendance: jest.fn() };
  const configService = {
    getEffective: jest.fn(async () => ({
      editWindowHours: opts.editWindowHours ?? 24, lateThresholdMinutes: 15,
      correctionsRequireApproval: true, allowedSources: ['MANUAL'] as const, holidayAutoMark: true,
    })),
  };
  const lockService = { assertNotLocked: jest.fn(async () => undefined) };
  const holidayService = { findHoliday: jest.fn(async () => null) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })) };
  const svc = new StudentAttendanceService(
    prisma as never, repo as never, historyRepo as never,
    configService as never, lockService as never, holidayService as never,
    featureFlags as never, outbox as never, audit as never,
  );
  return { svc, prisma, repo, historyRepo, lockService, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 6 e2e — student attendance lifecycle', () => {
  it('bulk-mark → in-window patch → out-of-window patch refused → correction approved', async () => {
    const t = makeStudentService();

    // Step 1: bulk-mark a class.
    t.repo.findActive.mockResolvedValue(null);
    t.repo.create.mockImplementation(async (input) =>
      makeAtt({ id: `att-${(input as { studentId: string }).studentId}`, studentId: (input as { studentId: string }).studentId })
    );
    const bulkOut = await withCtx(() => t.svc.bulkMark({
      academicYearId: ACADEMIC_YEAR, sectionId: SECTION, date: TODAY,
      entries: [{ studentId: 'stu-1' }, { studentId: 'stu-2' }],
    }));
    expect(bulkOut.created).toBe(2);
    expect(bulkOut.failed).toBe(0);

    // Step 2: in-window PATCH (markedAt 1h ago, editWindow=24h).
    const inWindow = makeAtt({ markedAt: new Date(Date.UTC(2026, 5, 19, 8, 0)) });
    t.repo.findById.mockResolvedValue(inWindow);
    t.repo.update.mockResolvedValue(makeAtt({ status: 'ABSENT', version: 2 }));
    jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 19, 9, 0)));
    const patched = await withCtx(() => t.svc.update('att-1', 1, { status: 'ABSENT' }));
    expect(patched.status).toBe('ABSENT');
    const changedEvents = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { eventType: string }]>)
      .filter((c) => c[1].eventType === 'AttendanceDailyChanged');
    expect(changedEvents.length).toBeGreaterThanOrEqual(1);
    jest.useRealTimers();

    // Step 3: out-of-window PATCH (markedAt 48h ago).
    const stale = makeAtt({ markedAt: new Date(Date.UTC(2026, 5, 17, 9, 0)) });
    t.repo.findById.mockResolvedValue(stale);
    jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 19, 12, 0)));
    await expect(
      withCtx(() => t.svc.update('att-1', 1, { status: 'LATE' })),
    ).rejects.toBeInstanceOf(EditWindowExpiredError);
    jest.useRealTimers();

    // Step 4 + 5: correction created and approved (uses applyCorrectedStatus).
    const correctionRepo = {
      findById: jest.fn(async (): Promise<AttendanceCorrectionRow | null> => ({
        id: 'corr-1', schoolId: SCHOOL, attendanceDailyId: 'att-1',
        requestedBy: 'usr-1', requestedAt: TODAY,
        previousStatus: 'ABSENT', newStatus: 'PRESENT', reason: 'parent letter',
        supportingFileId: null, status: 'PENDING',
        decidedBy: null, decidedAt: null, decisionReason: null,
        version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
      })),
      list: jest.fn(),
      create: jest.fn(),
      decide: jest.fn(async (id, _v, input) => ({
        id, schoolId: SCHOOL, attendanceDailyId: 'att-1',
        requestedBy: 'usr-1', requestedAt: TODAY,
        previousStatus: 'ABSENT' as const, newStatus: 'PRESENT' as const, reason: 'parent letter',
        supportingFileId: null, status: input.status,
        decidedBy: 'usr-2', decidedAt: TODAY, decisionReason: null,
        version: 2, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
      })),
    };
    const attendanceRepo = { findById: jest.fn(async () => makeAtt({ status: 'ABSENT' })) };
    t.repo.findById.mockResolvedValue(makeAtt({ status: 'ABSENT' }));
    t.repo.update.mockResolvedValue(makeAtt({ status: 'PRESENT', version: 3 }));

    const correctionSvc = new AttendanceCorrectionService(
      { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
      correctionRepo as never,
      attendanceRepo as never,
      t.svc as never,
      t.outbox as never,
      t.audit as never,
    );

    await withCtx(() => correctionSvc.approve('corr-1', 1, 'admin override'));
    expect(t.historyRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'CORRECTED' }),
      expect.anything(),
    );
    const correctedEvents = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { eventType: string }]>)
      .filter((c) => c[1].eventType === 'AttendanceDailyCorrected');
    expect(correctedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
