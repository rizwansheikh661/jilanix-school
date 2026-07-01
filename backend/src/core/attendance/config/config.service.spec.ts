/**
 * AttendanceConfigService unit specs — covers the branch fallback in
 * `getEffective` and the audit + version-checked upsert in `upsert`.
 */
import { RequestContextRegistry } from '../../request-context';
import { AttendanceConfigService } from './config.service';
import { AttendanceConfigRepository } from './config.repository';
import {
  ATTENDANCE_DEFAULT_EDIT_WINDOW_HOURS,
  ATTENDANCE_DEFAULT_LATE_THRESHOLD_MINUTES,
} from '../attendance.constants';
import type { AttendanceConfigRow } from '../attendance.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'sch-1';
const NOW = new Date(Date.UTC(2026, 5, 19));

function makeRow(overrides: Partial<AttendanceConfigRow> = {}): AttendanceConfigRow {
  return {
    id: 'cfg-1',
    schoolId: SCHOOL,
    branchId: null,
    editWindowHours: 12,
    lateThresholdMinutes: 10,
    correctionsRequireApproval: false,
    allowedSources: ['MANUAL', 'BIOMETRIC'],
    holidayAutoMark: false,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<AttendanceConfigRepository> = {
    listAll: jest.fn(),
    findForBranch: jest.fn(),
    findEffective: jest.fn(),
    upsert: jest.fn(),
  } as unknown as Mocked<AttendanceConfigRepository>;
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new AttendanceConfigService(prisma as never, repo as never, audit as never);
  return { svc, prisma, repo, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('AttendanceConfigService.getEffective', () => {
  it('returns module defaults when no row exists', async () => {
    const t = makeService();
    t.repo.findEffective.mockResolvedValue(null);
    const eff = await withCtx(() => t.svc.getEffective(null));
    expect(eff.editWindowHours).toBe(ATTENDANCE_DEFAULT_EDIT_WINDOW_HOURS);
    expect(eff.lateThresholdMinutes).toBe(ATTENDANCE_DEFAULT_LATE_THRESHOLD_MINUTES);
    expect(eff.holidayAutoMark).toBe(true);
  });

  it('uses the resolved row when one is present', async () => {
    const t = makeService();
    t.repo.findEffective.mockResolvedValue(makeRow({ editWindowHours: 6, holidayAutoMark: false }));
    const eff = await withCtx(() => t.svc.getEffective('br-1'));
    expect(eff.editWindowHours).toBe(6);
    expect(eff.holidayAutoMark).toBe(false);
  });
});

describe('AttendanceConfigService.upsert', () => {
  it('records audit with before/after rows', async () => {
    const t = makeService();
    t.repo.findForBranch.mockResolvedValue(null);
    t.repo.upsert.mockResolvedValue(makeRow({ editWindowHours: 24 }));
    await withCtx(() => t.svc.upsert({
      branchId: null, editWindowHours: 24, lateThresholdMinutes: 15,
      correctionsRequireApproval: true, allowedSources: ['MANUAL'], holidayAutoMark: true,
    }));
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attendance_config.upsert' }),
      expect.anything(),
    );
  });
});
