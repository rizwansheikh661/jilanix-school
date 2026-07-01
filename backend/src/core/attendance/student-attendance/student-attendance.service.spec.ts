/**
 * StudentAttendanceService unit specs — exercises the four service-level
 * gates (feature flag, future date, lock window, edit window) plus the
 * holiday auto-mark coercion and the status-history + outbox + audit
 * fan-out on every mutation.
 *
 * Pattern follows `class.service.spec.ts`: plain jest with a `Mocked<T>`
 * helper, factory functions for fixtures, and a stubbed prisma client whose
 * `transaction` callback receives an empty tx object.
 */
import { RequestContextRegistry } from '../../request-context';
import { StudentAttendanceService } from './student-attendance.service';
import { AttendanceDailyRepository } from './attendance-daily.repository';
import { AttendanceStatusHistoryRepository } from '../status-history/status-history.repository';
import { AttendanceConfigService } from '../config/config.service';
import { AttendanceLockWindowService } from '../lock-window/lock-window.service';
import { HolidayLookupService } from '../holiday-lookup.service';
import {
  AttendanceModuleDisabledError,
  AttendanceLockedError,
  DuplicateAttendanceError,
  EditWindowExpiredError,
  FutureDateNotAllowedError,
  HolidayStatusConflictError,
  BulkLimitExceededError,
} from '../attendance.errors';
import type { AttendanceDailyRow } from '../attendance.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
const SECTION = 'sec-1';
const ACADEMIC_YEAR = 'ay-1';
const STUDENT = 'stu-1';
const TODAY = new Date(Date.UTC(2026, 5, 19)); // 2026-06-19

function makeRow(overrides: Partial<AttendanceDailyRow> = {}): AttendanceDailyRow {
  return {
    id: 'att-1',
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: ACADEMIC_YEAR,
    sectionId: SECTION,
    studentId: STUDENT,
    date: TODAY,
    status: 'PRESENT',
    source: 'MANUAL',
    markedAt: TODAY,
    markedBy: null,
    checkInTime: null,
    checkOutTime: null,
    remarks: null,
    mode: 'DAILY',
    periodNumber: null,
    subjectId: null,
    version: 1,
    createdAt: TODAY,
    updatedAt: TODAY,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService(opts: { flagEnabled?: boolean } = {}) {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<AttendanceDailyRepository> = {
    findById: jest.fn(),
    findActive: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<AttendanceDailyRepository>;
  const historyRepo: Mocked<AttendanceStatusHistoryRepository> = {
    append: jest.fn(),
    listForAttendance: jest.fn(),
  } as unknown as Mocked<AttendanceStatusHistoryRepository>;
  const configService: Mocked<AttendanceConfigService> = {
    getEffective: jest.fn(async () => ({
      editWindowHours: 24,
      lateThresholdMinutes: 15,
      correctionsRequireApproval: true,
      allowedSources: ['MANUAL'] as const,
      holidayAutoMark: true,
    })),
  } as unknown as Mocked<AttendanceConfigService>;
  const lockService: Mocked<AttendanceLockWindowService> = {
    assertNotLocked: jest.fn(async () => undefined),
  } as unknown as Mocked<AttendanceLockWindowService>;
  const holidayService: Mocked<HolidayLookupService> = {
    findHoliday: jest.fn(async () => null),
  } as unknown as Mocked<HolidayLookupService>;
  const featureFlags = {
    isEnabled: jest.fn(async () => opts.flagEnabled ?? true),
  };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new StudentAttendanceService(
    prisma as never,
    repo as never,
    historyRepo as never,
    configService as never,
    lockService as never,
    holidayService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, historyRepo, configService, lockService, holidayService, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('StudentAttendanceService.mark — gates', () => {
  it('refuses when the attendance module flag is disabled', async () => {
    const t = makeService({ flagEnabled: false });
    await expect(
      withCtx(() => t.svc.mark({
        academicYearId: ACADEMIC_YEAR, sectionId: SECTION, studentId: STUDENT,
        date: TODAY, status: 'PRESENT',
      })),
    ).rejects.toBeInstanceOf(AttendanceModuleDisabledError);
    expect(t.prisma.transaction).not.toHaveBeenCalled();
  });

  it('refuses future dates', async () => {
    const t = makeService();
    const future = new Date(Date.UTC(2099, 0, 1));
    await expect(
      withCtx(() => t.svc.mark({
        academicYearId: ACADEMIC_YEAR, sectionId: SECTION, studentId: STUDENT,
        date: future, status: 'PRESENT',
      })),
    ).rejects.toBeInstanceOf(FutureDateNotAllowedError);
  });

  it('refuses inside an active lock window', async () => {
    const t = makeService();
    t.lockService.assertNotLocked.mockRejectedValue(new AttendanceLockedError(TODAY, 'lock-1'));
    await expect(
      withCtx(() => t.svc.mark({
        academicYearId: ACADEMIC_YEAR, sectionId: SECTION, studentId: STUDENT,
        date: TODAY, status: 'PRESENT',
      })),
    ).rejects.toBeInstanceOf(AttendanceLockedError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('refuses non-HOLIDAY status when the date is a holiday and autoMark is on', async () => {
    const t = makeService();
    t.holidayService.findHoliday.mockResolvedValue({
      id: 'hol-1', date: TODAY, branchId: null, isFullDay: true,
    });
    await expect(
      withCtx(() => t.svc.mark({
        academicYearId: ACADEMIC_YEAR, sectionId: SECTION, studentId: STUDENT,
        date: TODAY, status: 'PRESENT',
      })),
    ).rejects.toBeInstanceOf(HolidayStatusConflictError);
  });

  it('refuses duplicate active rows for the same (student, date)', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue(makeRow());
    await expect(
      withCtx(() => t.svc.mark({
        academicYearId: ACADEMIC_YEAR, sectionId: SECTION, studentId: STUDENT,
        date: TODAY, status: 'PRESENT',
      })),
    ).rejects.toBeInstanceOf(DuplicateAttendanceError);
  });
});

describe('StudentAttendanceService.mark — happy path', () => {
  it('creates a row, appends MARKED history, publishes outbox, records audit', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());
    t.historyRepo.append.mockResolvedValue({} as never);

    const row = await withCtx(() => t.svc.mark({
      academicYearId: ACADEMIC_YEAR, sectionId: SECTION, studentId: STUDENT,
      date: TODAY, status: 'PRESENT',
    }));

    expect(row.id).toBe('att-1');
    expect(t.repo.create).toHaveBeenCalledTimes(1);
    expect(t.historyRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'MARKED', previousStatus: null, newStatus: 'PRESENT' }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'attendance.marked', eventType: 'AttendanceDailyMarked' }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attendance_daily.mark' }),
      expect.anything(),
    );
  });
});

describe('StudentAttendanceService.update — edit window gate', () => {
  it('refuses when markedAt is older than editWindowHours', async () => {
    const t = makeService();
    const stale = new Date(Date.UTC(2026, 5, 17)); // ~48h before TODAY
    t.repo.findById.mockResolvedValue(makeRow({ markedAt: stale }));
    jest.useFakeTimers().setSystemTime(TODAY);
    await expect(
      withCtx(() => t.svc.update('att-1', 1, { status: 'ABSENT' })),
    ).rejects.toBeInstanceOf(EditWindowExpiredError);
    jest.useRealTimers();
  });

  it('appends EDITED history when status changes inside the edit window', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ markedAt: TODAY, status: 'PRESENT' }));
    t.repo.update.mockResolvedValue(makeRow({ status: 'ABSENT', version: 2 }));
    jest.useFakeTimers().setSystemTime(TODAY);

    const out = await withCtx(() => t.svc.update('att-1', 1, { status: 'ABSENT' }));

    expect(out.status).toBe('ABSENT');
    expect(t.historyRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'EDITED', previousStatus: 'PRESENT', newStatus: 'ABSENT' }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'attendance.changed' }),
    );
    jest.useRealTimers();
  });

  it('does not append history when the patch leaves status unchanged', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ markedAt: TODAY, status: 'PRESENT' }));
    t.repo.update.mockResolvedValue(makeRow({ status: 'PRESENT', remarks: 'updated', version: 2 }));
    jest.useFakeTimers().setSystemTime(TODAY);

    await withCtx(() => t.svc.update('att-1', 1, { remarks: 'updated' }));

    expect(t.historyRepo.append).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('StudentAttendanceService.applyCorrectedStatus', () => {
  it('updates the row, appends CORRECTED history, publishes attendance.corrected', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'ABSENT' }));
    t.repo.update.mockResolvedValue(makeRow({ status: 'PRESENT', version: 2 }));

    const out = await withCtx(() => t.svc.applyCorrectedStatus(
      'att-1', 'PRESENT', 'corr-1', 'parent letter', {} as never,
    ));

    expect(out.status).toBe('PRESENT');
    expect(t.historyRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'CORRECTED', correctionId: 'corr-1', reason: 'parent letter' }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'attendance.corrected' }),
    );
  });
});

describe('StudentAttendanceService.bulkMark', () => {
  it('rejects > ATTENDANCE_BULK_MAX_ENTRIES rows', async () => {
    const t = makeService();
    const entries = Array.from({ length: 1001 }, (_, i) => ({ studentId: `s-${i}` }));
    await expect(
      withCtx(() => t.svc.bulkMark({
        academicYearId: ACADEMIC_YEAR, sectionId: SECTION, date: TODAY, entries,
      })),
    ).rejects.toBeInstanceOf(BulkLimitExceededError);
  });

  it('returns empty result for empty entries without opening a transaction', async () => {
    const t = makeService();
    const out = await withCtx(() => t.svc.bulkMark({
      academicYearId: ACADEMIC_YEAR, sectionId: SECTION, date: TODAY, entries: [],
    }));
    expect(out).toEqual({ results: [], created: 0, failed: 0 });
    expect(t.prisma.transaction).not.toHaveBeenCalled();
  });

  it('reports DUPLICATE per row, continues, and counts failures', async () => {
    const t = makeService();
    t.repo.findActive
      .mockResolvedValueOnce(null)            // s-1: clean
      .mockResolvedValueOnce(makeRow());       // s-2: duplicate
    t.repo.create.mockResolvedValue(makeRow({ studentId: 's-1' }));

    const out = await withCtx(() => t.svc.bulkMark({
      academicYearId: ACADEMIC_YEAR, sectionId: SECTION, date: TODAY,
      entries: [{ studentId: 's-1' }, { studentId: 's-2' }],
    }));

    expect(out.created).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.results[1]?.error).toBe('DUPLICATE');
  });

  it('coerces every row to HOLIDAY when the date is a holiday', async () => {
    const t = makeService();
    t.holidayService.findHoliday.mockResolvedValue({
      id: 'hol-1', date: TODAY, branchId: null, isFullDay: true,
    });
    t.repo.findActive.mockResolvedValue(null);
    t.repo.create.mockImplementation(async (input) => makeRow({ status: input.status }));

    const out = await withCtx(() => t.svc.bulkMark({
      academicYearId: ACADEMIC_YEAR, sectionId: SECTION, date: TODAY,
      entries: [{ studentId: 's-1', status: 'PRESENT' }, { studentId: 's-2', status: 'ABSENT' }],
    }));

    const createCalls = (t.repo.create.mock.calls as unknown as Array<[{ status: string }]>).map((c) => c[0].status);
    expect(createCalls).toEqual(['HOLIDAY', 'HOLIDAY']);
    expect(out.created).toBe(2);
  });

  it('publishes a single AttendanceDailyBulkMarked event for the batch', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());
    await withCtx(() => t.svc.bulkMark({
      academicYearId: ACADEMIC_YEAR, sectionId: SECTION, date: TODAY,
      entries: [{ studentId: 's-1' }, { studentId: 's-2' }],
    }));
    const calls = t.outbox.publish.mock.calls as unknown as Array<[unknown, { eventType: string }]>;
    const bulkPublishCalls = calls.filter((c) => c[1].eventType === 'AttendanceDailyBulkMarked');
    expect(bulkPublishCalls).toHaveLength(1);
  });
});

describe('StudentAttendanceService.softDelete', () => {
  it('refuses outside the edit window', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ markedAt: new Date(Date.UTC(2026, 5, 17)) }));
    jest.useFakeTimers().setSystemTime(TODAY);
    await expect(
      withCtx(() => t.svc.softDelete('att-1', 1)),
    ).rejects.toBeInstanceOf(EditWindowExpiredError);
    jest.useRealTimers();
  });
});
