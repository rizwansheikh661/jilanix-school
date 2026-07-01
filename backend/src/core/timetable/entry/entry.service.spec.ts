/**
 * TimetableEntryService unit specs — version-status guard, cross-school
 * reference guard, happy-path single create with outbox+audit+load
 * recompute, soft-delete, bulkCreate limit, and partial-failure
 * accounting.
 */
import { RequestContextRegistry } from '../../request-context';
import { TimetableEntryService, type CreateEntryArgs } from './entry.service';
import {
  BulkLimitExceededError,
  CrossSchoolReferenceError,
  VersionNotDraftError,
} from '../timetable.errors';
import type { TimetableEntryRow, TimetableVersionRow } from '../timetable.types';
import type { TimetableVersionStatusValue } from '../timetable.constants';

const SCHOOL = 'sch-1';
const NOW = new Date(Date.UTC(2026, 0, 5));

function makeVersion(
  status: TimetableVersionStatusValue = 'DRAFT',
  overrides: Partial<TimetableVersionRow> = {},
): TimetableVersionRow {
  return {
    id: 'ver-1',
    schoolId: SCHOOL,
    branchId: 'br-1',
    academicYearId: 'ay-1',
    periodTemplateId: 'tpl-1',
    name: 'V1',
    status,
    effectiveFrom: NOW,
    effectiveTo: null,
    activatedAt: null,
    archivedAt: null,
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

function makeEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: 'ent-1',
    schoolId: SCHOOL,
    timetableVersionId: 'ver-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
    roomId: null,
    dayOfWeek: 1,
    periodIndex: 1,
    notes: null,
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
  const tx = {
    section: { findUnique: jest.fn(async () => ({})) },
    subject: { findUnique: jest.fn(async () => ({})) },
    staff: { findUnique: jest.fn(async () => ({})) },
    room: { findUnique: jest.fn(async () => ({})) },
  };
  const prisma = {
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const versionRepo = { findById: jest.fn(async () => makeVersion('DRAFT')) };
  const detector = { validate: jest.fn(async () => undefined) };
  const loadRecomputer = { recompute: jest.fn(async () => undefined) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new TimetableEntryService(
    prisma as never,
    repo as never,
    versionRepo as never,
    detector as never,
    loadRecomputer as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, tx, repo, versionRepo, detector, loadRecomputer, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

function createArgs(overrides: Partial<CreateEntryArgs> = {}): CreateEntryArgs {
  return {
    timetableVersionId: 'ver-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
    roomId: null,
    dayOfWeek: 1,
    periodIndex: 1,
    ...overrides,
  };
}

describe('TimetableEntryService.create', () => {
  it('rejects when version status is not DRAFT', async () => {
    const t = makeService();
    t.versionRepo.findById.mockResolvedValue(makeVersion('ACTIVE'));
    await expect(withCtx(() => t.svc.create(createArgs()))).rejects.toBeInstanceOf(
      VersionNotDraftError,
    );
  });

  it('rejects cross-school section (section lookup returns null)', async () => {
    const t = makeService();
    t.tx.section.findUnique.mockResolvedValue(null as never);
    await expect(withCtx(() => t.svc.create(createArgs()))).rejects.toBeInstanceOf(
      CrossSchoolReferenceError,
    );
  });

  it('happy path publishes entry.created + recomputes load + writes audit', async () => {
    const t = makeService();
    t.repo.create.mockResolvedValue(makeEntry());
    const row = await withCtx(() => t.svc.create(createArgs()));
    expect(row.id).toBe('ent-1');
    expect(t.loadRecomputer.recompute).toHaveBeenCalledWith('ver-1', 'stf-1', expect.anything());
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'timetable.entry.created' }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'timetable_entry.create' }),
      expect.anything(),
    );
  });
});

describe('TimetableEntryService.softDelete', () => {
  it('publishes entry.deleted and recomputes load', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeEntry());
    t.repo.softDelete.mockResolvedValue(undefined);

    await withCtx(() => t.svc.softDelete('ent-1', 1));
    expect(t.loadRecomputer.recompute).toHaveBeenCalledWith('ver-1', 'stf-1', expect.anything());
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'timetable.entry.deleted' }),
    );
  });
});

describe('TimetableEntryService.bulkCreate', () => {
  it('rejects when entries.length exceeds the limit', async () => {
    const t = makeService();
    const entries = Array.from({ length: 501 }, () => ({
      sectionId: 'sec-1',
      subjectId: 'sub-1',
      staffId: 'stf-1',
      roomId: null,
      dayOfWeek: 1,
      periodIndex: 1,
    }));
    await expect(
      withCtx(() => t.svc.bulkCreate({ timetableVersionId: 'ver-1', entries })),
    ).rejects.toBeInstanceOf(BulkLimitExceededError);
  });

  it('partial failure: second entry fails — created=1, failed=1, recompute+bulk_created fired', async () => {
    const t = makeService();
    t.repo.create.mockResolvedValueOnce(makeEntry({ id: 'ent-A', staffId: 'stf-1' }));
    // second row fails at the detector
    t.detector.validate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));

    const result = await withCtx(() =>
      t.svc.bulkCreate({
        timetableVersionId: 'ver-1',
        entries: [
          {
            sectionId: 'sec-1',
            subjectId: 'sub-1',
            staffId: 'stf-1',
            roomId: null,
            dayOfWeek: 1,
            periodIndex: 1,
          },
          {
            sectionId: 'sec-2',
            subjectId: 'sub-2',
            staffId: 'stf-2',
            roomId: null,
            dayOfWeek: 1,
            periodIndex: 2,
          },
        ],
      }),
    );
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[1]?.error).not.toBeNull();
    expect(t.loadRecomputer.recompute).toHaveBeenCalledWith('ver-1', 'stf-1', expect.anything());
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'timetable.entries.bulk_created' }),
    );
  });
});
