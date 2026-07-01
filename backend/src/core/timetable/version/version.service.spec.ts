/**
 * TimetableVersionService unit specs — DRAFT/ACTIVE/ARCHIVED state machine
 * transitions, date-range invariants, activate-archive cascade, and the
 * ACTIVE-cannot-delete guard.
 */
import { RequestContextRegistry } from '../../request-context';
import { TimetableVersionService } from './version.service';
import {
  VersionActiveCannotDeleteError,
  VersionDateRangeError,
  VersionStatusTransitionError,
} from '../timetable.errors';
import type {
  PeriodTemplateRow,
  PeriodTemplateWithPeriods,
  TimetableVersionRow,
} from '../timetable.types';
import type { TimetableVersionStatusValue } from '../timetable.constants';

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
const YEAR = 'ay-1';
const TPL = 'tpl-1';
const NOW = new Date(Date.UTC(2026, 5, 19));

function makeTemplate(
  overrides: Partial<PeriodTemplateWithPeriods> = {},
): PeriodTemplateWithPeriods {
  const base: PeriodTemplateRow = {
    id: TPL,
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: YEAR,
    name: 'Default',
    description: null,
    days: [1, 2, 3, 4, 5],
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  };
  return { ...base, periods: [], ...overrides };
}

function makeVersion(
  status: TimetableVersionStatusValue = 'DRAFT',
  overrides: Partial<TimetableVersionRow> = {},
): TimetableVersionRow {
  return {
    id: 'ver-1',
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: YEAR,
    periodTemplateId: TPL,
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

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActive: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
  };
  const templateRepo = {
    findById: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new TimetableVersionService(
    prisma as never,
    repo as never,
    templateRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, templateRepo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('TimetableVersionService.create', () => {
  it('rejects when periodTemplate branch/year mismatch', async () => {
    const t = makeService();
    t.templateRepo.findById.mockResolvedValue(
      makeTemplate({ branchId: 'br-other', academicYearId: YEAR }),
    );
    await expect(
      withCtx(() =>
        t.svc.create({
          branchId: BRANCH,
          academicYearId: YEAR,
          periodTemplateId: TPL,
          name: 'V1',
          effectiveFrom: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(VersionDateRangeError);
  });

  it('happy path publishes version.created', async () => {
    const t = makeService();
    t.templateRepo.findById.mockResolvedValue(makeTemplate());
    t.repo.create.mockResolvedValue(makeVersion('DRAFT'));

    const row = await withCtx(() =>
      t.svc.create({
        branchId: BRANCH,
        academicYearId: YEAR,
        periodTemplateId: TPL,
        name: 'V1',
        effectiveFrom: NOW,
      }),
    );
    expect(row.id).toBe('ver-1');
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'timetable.version.created' }),
    );
  });

  it('rejects effectiveFrom > effectiveTo', async () => {
    const t = makeService();
    const later = new Date(Date.UTC(2026, 5, 25));
    await expect(
      withCtx(() =>
        t.svc.create({
          branchId: BRANCH,
          academicYearId: YEAR,
          periodTemplateId: TPL,
          name: 'V1',
          effectiveFrom: later,
          effectiveTo: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(VersionDateRangeError);
  });
});

describe('TimetableVersionService.activate', () => {
  it('rejects when current status is not DRAFT', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeVersion('ACTIVE'));
    await expect(
      withCtx(() => t.svc.activate('ver-1', 1)),
    ).rejects.toBeInstanceOf(VersionStatusTransitionError);
  });

  it('archives prior ACTIVE then activates target', async () => {
    const t = makeService();
    const draft = makeVersion('DRAFT', { id: 'ver-1' });
    const prior = makeVersion('ACTIVE', { id: 'ver-prior' });
    t.repo.findById.mockResolvedValue(draft);
    t.repo.findActive.mockResolvedValue(prior);
    t.repo.setStatus
      .mockResolvedValueOnce(makeVersion('ARCHIVED', { id: 'ver-prior' }))
      .mockResolvedValueOnce(makeVersion('ACTIVE', { id: 'ver-1' }));

    const activated = await withCtx(() => t.svc.activate('ver-1', 1));
    expect(activated.status).toBe('ACTIVE');
    expect(t.repo.setStatus).toHaveBeenNthCalledWith(
      1,
      'ver-prior',
      prior.version,
      'ARCHIVED',
      expect.objectContaining({ archivedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(t.repo.setStatus).toHaveBeenNthCalledWith(
      2,
      'ver-1',
      1,
      'ACTIVE',
      expect.objectContaining({ activatedAt: expect.any(Date) }),
      expect.anything(),
    );
    const topics = (t.outbox.publish.mock.calls as unknown as Array<unknown[]>).map(
      (c) => (c[1] as { topic: string }).topic,
    );
    expect(topics).toContain('timetable.version.archived');
    expect(topics).toContain('timetable.version.activated');
  });
});

describe('TimetableVersionService.archive', () => {
  it('rejects when current status is not ACTIVE', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeVersion('DRAFT'));
    await expect(
      withCtx(() => t.svc.archive('ver-1', 1)),
    ).rejects.toBeInstanceOf(VersionStatusTransitionError);
  });
});

describe('TimetableVersionService.softDelete', () => {
  it('refuses deletion of an ACTIVE version', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeVersion('ACTIVE'));
    await expect(
      withCtx(() => t.svc.softDelete('ver-1', 1)),
    ).rejects.toBeInstanceOf(VersionActiveCannotDeleteError);
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });
});
