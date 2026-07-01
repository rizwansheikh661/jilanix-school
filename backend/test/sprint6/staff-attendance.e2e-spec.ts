/**
 * Sprint 6 e2e — staff attendance: single mark + bulk + filtered list.
 * Service-orchestration spec; no Testcontainers wired in this project.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { StaffAttendanceService } from '../../src/core/attendance/staff-attendance/staff-attendance.service';
import type { StaffAttendanceRow } from '../../src/core/attendance/attendance.types';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const TODAY = new Date(Date.UTC(2026, 5, 19));

function makeRow(overrides: Partial<StaffAttendanceRow> = {}): StaffAttendanceRow {
  return {
    id: 'sa-1', schoolId: SCHOOL, branchId: BRANCH, staffId: 'stf-1',
    date: TODAY, status: 'PRESENT', source: 'MANUAL',
    markedAt: TODAY, markedBy: null, checkInTime: null, checkOutTime: null, remarks: null,
    version: 1, createdAt: TODAY, updatedAt: TODAY, createdBy: null, updatedBy: null,
    ...overrides,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

function makeService() {
  const prisma = { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) };
  const repo = {
    findById: jest.fn(),
    findActive: jest.fn(async () => null),
    list: jest.fn(async () => ({ rows: [makeRow()], nextCursorId: null })),
    create: jest.fn(async (input) => makeRow(input as Partial<StaffAttendanceRow>)),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const configService = {
    getEffective: jest.fn(async () => ({
      editWindowHours: 24, lateThresholdMinutes: 15,
      correctionsRequireApproval: true, allowedSources: ['MANUAL'] as const, holidayAutoMark: true,
    })),
  };
  const lockService = { assertNotLocked: jest.fn(async () => undefined) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })) };
  const svc = new StaffAttendanceService(
    prisma as never, repo as never, configService as never,
    lockService as never, featureFlags as never, outbox as never, audit as never,
  );
  return { svc, repo, outbox };
}

describe('Sprint 6 e2e — staff attendance', () => {
  it('single mark + bulk + filtered list', async () => {
    const t = makeService();

    const marked = await withCtx(() => t.svc.mark({ staffId: 'stf-1', date: TODAY, status: 'PRESENT' }));
    expect(marked.staffId).toBe('stf-1');

    const bulk = await withCtx(() => t.svc.bulkMark({
      date: TODAY,
      entries: [{ staffId: 's-2' }, { staffId: 's-3', status: 'LATE' }],
    }));
    expect(bulk.created).toBe(2);

    const list = await withCtx(() => t.svc.list({ limit: 10, dateFrom: TODAY, dateTo: TODAY }));
    expect(list.items).toHaveLength(1);

    const events = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { eventType: string }]>)
      .map((c) => c[1].eventType);
    expect(events).toContain('StaffAttendanceMarked');
    expect(events).toContain('StaffAttendanceBulkMarked');
  });
});
