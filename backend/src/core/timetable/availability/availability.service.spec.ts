/**
 * TeacherAvailabilityService unit specs — window validation, happy-path
 * create with outbox + audit, and the isAvailable() truth table.
 */
import { RequestContextRegistry } from '../../request-context';
import { TeacherAvailabilityService } from './availability.service';
import { AvailabilityWindowInvalidError } from '../timetable.errors';
import type { TeacherAvailabilityRow } from '../timetable.types';
import type { TeacherAvailabilityKindValue } from '../timetable.constants';

const SCHOOL = 'sch-1';
const NOW = new Date(Date.UTC(2026, 0, 5));

function makeRow(
  kind: TeacherAvailabilityKindValue = 'UNAVAILABLE',
  overrides: Partial<TeacherAvailabilityRow> = {},
): TeacherAvailabilityRow {
  return {
    id: 'av-1',
    schoolId: SCHOOL,
    staffId: 'stf-1',
    academicYearId: 'ay-1',
    kind,
    dayOfWeek: 1,
    periodIndex: 1,
    reason: null,
    effectiveFrom: NOW,
    effectiveTo: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveForStaffSlot: jest.fn(async () => [] as readonly TeacherAvailabilityRow[]),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new TeacherAvailabilityService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('TeacherAvailabilityService.create — validation', () => {
  it('rejects dayOfWeek=0', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          staffId: 'stf-1',
          academicYearId: 'ay-1',
          kind: 'UNAVAILABLE',
          dayOfWeek: 0,
          effectiveFrom: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(AvailabilityWindowInvalidError);
  });

  it('rejects dayOfWeek=8', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          staffId: 'stf-1',
          academicYearId: 'ay-1',
          kind: 'UNAVAILABLE',
          dayOfWeek: 8,
          effectiveFrom: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(AvailabilityWindowInvalidError);
  });

  it('rejects effectiveFrom > effectiveTo', async () => {
    const t = makeService();
    const later = new Date(Date.UTC(2026, 6, 1));
    await expect(
      withCtx(() =>
        t.svc.create({
          staffId: 'stf-1',
          academicYearId: 'ay-1',
          kind: 'UNAVAILABLE',
          dayOfWeek: 1,
          effectiveFrom: later,
          effectiveTo: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(AvailabilityWindowInvalidError);
  });

  it('happy path publishes availability.changed with TeacherAvailabilityCreated', async () => {
    const t = makeService();
    t.repo.create.mockResolvedValue(makeRow('UNAVAILABLE'));
    await withCtx(() =>
      t.svc.create({
        staffId: 'stf-1',
        academicYearId: 'ay-1',
        kind: 'UNAVAILABLE',
        dayOfWeek: 1,
        effectiveFrom: NOW,
      }),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: 'timetable.availability.changed',
        eventType: 'TeacherAvailabilityCreated',
      }),
    );
  });
});

describe('TeacherAvailabilityService.isAvailable', () => {
  it('returns true when no rows match', async () => {
    const t = makeService();
    t.repo.findActiveForStaffSlot.mockResolvedValue([]);
    const ok = await withCtx(() =>
      t.svc.isAvailable({
        staffId: 'stf-1',
        academicYearId: 'ay-1',
        dayOfWeek: 1,
        periodIndex: 1,
        onDate: NOW,
      }),
    );
    expect(ok).toBe(true);
  });

  it('returns true when all rows are AVAILABLE', async () => {
    const t = makeService();
    t.repo.findActiveForStaffSlot.mockResolvedValue([makeRow('AVAILABLE')]);
    const ok = await withCtx(() =>
      t.svc.isAvailable({
        staffId: 'stf-1',
        academicYearId: 'ay-1',
        dayOfWeek: 1,
        periodIndex: 1,
        onDate: NOW,
      }),
    );
    expect(ok).toBe(true);
  });

  it('returns false when any row is UNAVAILABLE (UNAVAILABLE wins)', async () => {
    const t = makeService();
    t.repo.findActiveForStaffSlot.mockResolvedValue([
      makeRow('AVAILABLE', { id: 'av-1' }),
      makeRow('UNAVAILABLE', { id: 'av-2' }),
    ]);
    const ok = await withCtx(() =>
      t.svc.isAvailable({
        staffId: 'stf-1',
        academicYearId: 'ay-1',
        dayOfWeek: 1,
        periodIndex: 1,
        onDate: NOW,
      }),
    );
    expect(ok).toBe(false);
  });
});
