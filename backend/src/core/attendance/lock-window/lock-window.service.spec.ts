/**
 * AttendanceLockWindowService unit specs — covers scope-validation rules
 * (SCHOOL/BRANCH/SECTION argument shape), startDate>endDate validation,
 * and the `assertNotLocked` gate used by writers.
 */
import { RequestContextRegistry } from '../../request-context';
import { AttendanceLockWindowService } from './lock-window.service';
import { AttendanceLockWindowRepository } from './lock-window.repository';
import {
  AttendanceLockedError,
  AttendanceLockNotFoundError,
  LockScopeArgumentError,
} from '../attendance.errors';
import type { AttendanceLockWindowRow } from '../attendance.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
const SECTION = 'sec-1';
const DAY = new Date(Date.UTC(2026, 5, 19));

function makeLock(overrides: Partial<AttendanceLockWindowRow> = {}): AttendanceLockWindowRow {
  return {
    id: 'lock-1',
    schoolId: SCHOOL,
    scope: 'SCHOOL',
    branchId: null,
    sectionId: null,
    startDate: DAY,
    endDate: DAY,
    reason: null,
    lockedBy: null,
    lockedAt: DAY,
    version: 1,
    createdAt: DAY,
    updatedAt: DAY,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<AttendanceLockWindowRepository> = {
    findById: jest.fn(),
    findActive: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    unlock: jest.fn(),
  } as unknown as Mocked<AttendanceLockWindowRepository>;
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new AttendanceLockWindowService(prisma as never, repo as never, outbox as never, audit as never);
  return { svc, prisma, repo, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('AttendanceLockWindowService.create — scope validation', () => {
  it('SCHOOL scope rejects branchId/sectionId', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create({ scope: 'SCHOOL', branchId: BRANCH, startDate: DAY, endDate: DAY })),
    ).rejects.toBeInstanceOf(LockScopeArgumentError);
  });

  it('BRANCH scope requires branchId', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create({ scope: 'BRANCH', startDate: DAY, endDate: DAY })),
    ).rejects.toBeInstanceOf(LockScopeArgumentError);
  });

  it('BRANCH scope rejects sectionId', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create({ scope: 'BRANCH', branchId: BRANCH, sectionId: SECTION, startDate: DAY, endDate: DAY })),
    ).rejects.toBeInstanceOf(LockScopeArgumentError);
  });

  it('SECTION scope requires sectionId', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create({ scope: 'SECTION', startDate: DAY, endDate: DAY })),
    ).rejects.toBeInstanceOf(LockScopeArgumentError);
  });

  it('rejects startDate > endDate', async () => {
    const t = makeService();
    const later = new Date(Date.UTC(2026, 5, 20));
    await expect(
      withCtx(() => t.svc.create({ scope: 'SCHOOL', startDate: later, endDate: DAY })),
    ).rejects.toBeInstanceOf(LockScopeArgumentError);
  });

  it('happy path — SCHOOL lock publishes attendance.locked + audit', async () => {
    const t = makeService();
    t.repo.create.mockResolvedValue(makeLock());
    const row = await withCtx(() => t.svc.create({ scope: 'SCHOOL', startDate: DAY, endDate: DAY, reason: 'exam' }));
    expect(row.id).toBe('lock-1');
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'attendance.locked' }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attendance_lock_window.create' }),
      expect.anything(),
    );
  });
});

describe('AttendanceLockWindowService.unlock', () => {
  it('throws NotFound for missing lock', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(withCtx(() => t.svc.unlock('missing', 1))).rejects.toBeInstanceOf(AttendanceLockNotFoundError);
  });

  it('publishes attendance.unlocked on success', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeLock());
    t.repo.unlock.mockResolvedValue(undefined);
    await withCtx(() => t.svc.unlock('lock-1', 1));
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'attendance.unlocked' }),
    );
  });
});

describe('AttendanceLockWindowService.assertNotLocked', () => {
  it('returns silently when no active locks cover the triple', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue([]);
    await expect(
      withCtx(() => t.svc.assertNotLocked(BRANCH, SECTION, DAY, {} as never)),
    ).resolves.toBeUndefined();
  });

  it('throws AttendanceLockedError when an active lock exists', async () => {
    const t = makeService();
    t.repo.findActive.mockResolvedValue([makeLock()]);
    await expect(
      withCtx(() => t.svc.assertNotLocked(BRANCH, SECTION, DAY, {} as never)),
    ).rejects.toBeInstanceOf(AttendanceLockedError);
  });
});
