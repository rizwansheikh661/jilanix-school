/**
 * StaffAttendanceService unit specs — verifies the same gates as student
 * attendance minus holiday auto-mark + section coupling. Staff has no
 * status-history table, so changes are tracked only in audit + outbox.
 */
import { RequestContextRegistry } from '../../request-context';
import { StaffAttendanceService } from './staff-attendance.service';
import { StaffAttendanceRepository } from './staff-attendance.repository';
import { AttendanceConfigService } from '../config/config.service';
import { AttendanceLockWindowService } from '../lock-window/lock-window.service';
import {
  AttendanceLockedError,
  BulkLimitExceededError,
  DuplicateStaffAttendanceError,
  EditWindowExpiredError,
  FutureDateNotAllowedError,
} from '../attendance.errors';
import type { StaffAttendanceRow } from '../attendance.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
const STAFF = 'stf-1';
const TODAY = new Date(Date.UTC(2026, 5, 19));

function makeRow(overrides: Partial<StaffAttendanceRow> = {}): StaffAttendanceRow {
  return {
    id: 'sa-1', schoolId: SCHOOL, branchId: BRANCH, staffId: STAFF,
    date: TODAY, status: 'PRESENT', source: 'MANUAL',
    markedAt: TODAY, markedBy: null, checkInTime: null, checkOutTime: null, remarks: null,
    version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<StaffAttendanceRepository> = {
    findById: jest.fn(),
    findActive: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<StaffAttendanceRepository>;
  const configService: Mocked<AttendanceConfigService> = {
    getEffective: jest.fn(async () => ({
      editWindowHours: 24, lateThresholdMinutes: 15,
      correctionsRequireApproval: true, allowedSources: ['MANUAL'] as const, holidayAutoMark: true,
    })),
  } as unknown as Mocked<AttendanceConfigService>;
  const lockService: Mocked<AttendanceLockWindowService> = {
    assertNotLocked: jest.fn(async () => undefined),
  } as unknown as Mocked<AttendanceLockWindowService>;
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new StaffAttendanceService(
    prisma as never, repo as never, configService as never,
    lockService as never, featureFlags as never, outbox as never, audit as never,
  );
  return { svc, prisma, repo, configService, lockService, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('StaffAttendanceService.mark', () => {
  it('refuses future dates', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.mark({ staffId: STAFF, date: new Date(Date.UTC(2099, 0, 1)), status: 'PRESENT' })),
    ).rejects.toBeInstanceOf(FutureDateNotAllowedError);
  });

  it('refuses inside an active lock', async () => {
    const t = makeService();
    t.lockService.assertNotLocked.mockRejectedValue(new AttendanceLockedError(TODAY, 'lock-1'));
    await expect(
      withCtx(() => t.svc.mark({ staffId: STAFF, date: TODAY, status: 'PRESENT' })),
    ).rejects.toBeInstanceOf(AttendanceLockedError);
  });

  it('refuses duplicate (staff, date) rows', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue(makeRow());
    await expect(
      withCtx(() => t.svc.mark({ staffId: STAFF, date: TODAY, status: 'PRESENT' })),
    ).rejects.toBeInstanceOf(DuplicateStaffAttendanceError);
  });

  it('happy path — publishes staff_attendance.marked + audits', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());
    await withCtx(() => t.svc.mark({ staffId: STAFF, date: TODAY, status: 'PRESENT' }));
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'staff_attendance.marked' }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff_attendance.mark' }),
      expect.anything(),
    );
  });
});

describe('StaffAttendanceService.update', () => {
  it('refuses outside the edit window', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ markedAt: new Date(Date.UTC(2026, 5, 17)) }));
    jest.useFakeTimers().setSystemTime(TODAY);
    await expect(
      withCtx(() => t.svc.update('sa-1', 1, { status: 'ABSENT' })),
    ).rejects.toBeInstanceOf(EditWindowExpiredError);
    jest.useRealTimers();
  });
});

describe('StaffAttendanceService.bulkMark', () => {
  it('rejects when entries exceed the cap', async () => {
    const t = makeService();
    const entries = Array.from({ length: 1001 }, (_, i) => ({ staffId: `s-${i}` }));
    await expect(
      withCtx(() => t.svc.bulkMark({ date: TODAY, entries })),
    ).rejects.toBeInstanceOf(BulkLimitExceededError);
  });

  it('publishes a single bulk event for the batch', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());
    await withCtx(() => t.svc.bulkMark({
      date: TODAY,
      entries: [{ staffId: 's-1' }, { staffId: 's-2' }],
    }));
    const allCalls = t.outbox.publish.mock.calls as unknown as Array<[unknown, { eventType: string }]>;
    const calls = allCalls.filter((c) => c[1].eventType === 'StaffAttendanceBulkMarked');
    expect(calls).toHaveLength(1);
  });
});
