/**
 * PeriodTemplateService unit specs — validation gates (days, periods,
 * times), happy-path create with outbox+audit, delete-guard, and
 * module-disabled feature flag rejection.
 */
import { RequestContextRegistry } from '../../request-context';
import { PeriodTemplateService, type CreatePeriodTemplateArgs } from './period-template.service';
import {
  PeriodIndicesInvalidError,
  PeriodTemplateDaysInvalidError,
  PeriodTemplateInUseError,
  PeriodTimeOrderError,
  PeriodTimesOverlapError,
  TimetableModuleDisabledError,
} from '../timetable.errors';
import type {
  PeriodTemplateRow,
  PeriodTemplateWithPeriods,
} from '../timetable.types';

const SCHOOL = 'sch-1';
const BRANCH = 'br-1';
const YEAR = 'ay-1';
const NOW = new Date(Date.UTC(2026, 5, 19));

function makeTemplate(
  overrides: Partial<PeriodTemplateWithPeriods> = {},
): PeriodTemplateWithPeriods {
  const base: PeriodTemplateRow = {
    id: 'tpl-1',
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

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    replacePeriods: jest.fn(),
    countActiveReferencingVersions: jest.fn(),
    findPeriodByIndex: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new PeriodTemplateService(
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

function validArgs(overrides: Partial<CreatePeriodTemplateArgs> = {}): CreatePeriodTemplateArgs {
  return {
    branchId: BRANCH,
    academicYearId: YEAR,
    name: 'Morning',
    days: [1, 2, 3],
    periods: [
      { index: 1, label: 'P1', type: 'TEACHING', startTime: '09:00:00', endTime: '09:45:00' },
      { index: 2, label: 'P2', type: 'TEACHING', startTime: '09:45:00', endTime: '10:30:00' },
    ],
    ...overrides,
  };
}

describe('PeriodTemplateService.create — validateDays', () => {
  it('rejects empty days[]', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create(validArgs({ days: [] }))),
    ).rejects.toBeInstanceOf(PeriodTemplateDaysInvalidError);
  });

  it('rejects out-of-range day (0)', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create(validArgs({ days: [0, 1] }))),
    ).rejects.toBeInstanceOf(PeriodTemplateDaysInvalidError);
  });

  it('rejects out-of-range day (8)', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create(validArgs({ days: [1, 8] }))),
    ).rejects.toBeInstanceOf(PeriodTemplateDaysInvalidError);
  });

  it('rejects duplicate days', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create(validArgs({ days: [1, 1, 2] }))),
    ).rejects.toBeInstanceOf(PeriodTemplateDaysInvalidError);
  });
});

describe('PeriodTemplateService.create — validatePeriods', () => {
  it('rejects empty periods[]', async () => {
    const t = makeService();
    await expect(
      withCtx(() => t.svc.create(validArgs({ periods: [] }))),
    ).rejects.toBeInstanceOf(PeriodIndicesInvalidError);
  });

  it('rejects non-contiguous indices', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create(
          validArgs({
            periods: [
              { index: 1, label: 'P1', type: 'TEACHING', startTime: '09:00', endTime: '09:45' },
              { index: 3, label: 'P3', type: 'TEACHING', startTime: '09:45', endTime: '10:30' },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(PeriodIndicesInvalidError);
  });

  it('rejects startTime >= endTime', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create(
          validArgs({
            periods: [
              { index: 1, label: 'P1', type: 'TEACHING', startTime: '10:00', endTime: '10:00' },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(PeriodTimeOrderError);
  });

  it('rejects overlapping period times', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create(
          validArgs({
            periods: [
              { index: 1, label: 'P1', type: 'TEACHING', startTime: '09:00', endTime: '09:50' },
              { index: 2, label: 'P2', type: 'TEACHING', startTime: '09:40', endTime: '10:30' },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(PeriodTimesOverlapError);
  });
});

describe('PeriodTemplateService.create — happy path', () => {
  it('publishes period_template.created + writes audit', async () => {
    const t = makeService();
    t.repo.findActiveByName.mockResolvedValue(null);
    const row = makeTemplate({
      periods: [
        {
          id: 'pp-1',
          schoolId: SCHOOL,
          periodTemplateId: 'tpl-1',
          index: 1,
          label: 'P1',
          type: 'TEACHING',
          startTime: '09:00:00',
          endTime: '09:45:00',
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: null,
          updatedBy: null,
          version: 1,
        },
      ],
    });
    t.repo.create.mockResolvedValue(row);

    const result = await withCtx(() => t.svc.create(validArgs()));
    expect(result.id).toBe('tpl-1');
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: 'timetable.period_template.created' }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'period_template.create' }),
      expect.anything(),
    );
  });
});

describe('PeriodTemplateService.softDelete — in-use guard', () => {
  it('refuses delete when version still references the template', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeTemplate());
    t.repo.countActiveReferencingVersions.mockResolvedValue(2);

    await expect(
      withCtx(() => t.svc.softDelete('tpl-1', 1)),
    ).rejects.toBeInstanceOf(PeriodTemplateInUseError);
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });
});

describe('PeriodTemplateService — module disabled', () => {
  it('throws TimetableModuleDisabledError when flag is off', async () => {
    const t = makeService();
    t.featureFlags.isEnabled.mockResolvedValue(false);
    await expect(
      withCtx(() => t.svc.create(validArgs())),
    ).rejects.toBeInstanceOf(TimetableModuleDisabledError);
  });
});
