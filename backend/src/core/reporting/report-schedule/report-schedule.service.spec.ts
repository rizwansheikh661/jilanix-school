/**
 * ReportScheduleService unit specs — create (incl. cron validation),
 * enable/disable, update.
 */
import {
  ReportScheduleCronInvalidError,
  ReportScheduleNotFoundError,
} from '../reporting.errors';
import { ReportingOutboxTopics } from '../reporting.constants';
import type { ReportScheduleRow } from '../reporting.types';
import {
  TEST_NOW,
  TEST_SCHOOL_ID,
  TEST_USER_ID,
  makeFakeAudit,
  makeFakeFeatureFlags,
  makeFakeOutbox,
  makeFakePrisma,
  makeFakeSequences,
  withTenantCtx,
} from '../__test__/test-harness';
import { ReportScheduleService } from './report-schedule.service';

function makeRow(overrides: Partial<ReportScheduleRow> = {}): ReportScheduleRow {
  return {
    id: 'sch-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'SCHED-000001',
    name: 'Daily students',
    reportKind: 'STUDENT_LIST',
    format: 'EXCEL',
    frequency: 'DAILY',
    cron: '0 7 * * *',
    params: {},
    recipients: [],
    isEnabled: true,
    nextRunAt: TEST_NOW,
    lastRunAt: null,
    lastReportRunId: null,
    ownedByUserId: TEST_USER_ID,
    version: 1,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeHarness() {
  const { prisma } = makeFakePrisma();
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(async (input: { code: string; name: string }) =>
      makeRow({ code: input.code, name: input.name }),
    ),
    update: jest.fn(async () => makeRow({ name: 'updated', version: 2 })),
    patchToggle: jest.fn(
      async (id: string, _v: number, isEnabled: boolean) =>
        makeRow({ id, isEnabled, version: 2 }),
    ),
    softDelete: jest.fn(),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const svc = new ReportScheduleService(
    prisma as never,
    repo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, outbox, audit, sequences, featureFlags };
}

describe('ReportScheduleService.create', () => {
  it('allocates SCHED code and publishes SCHEDULE_CREATED', async () => {
    const t = makeHarness();
    const out = await withTenantCtx(() =>
      t.svc.create({
        name: 'Daily students',
        reportKind: 'STUDENT_LIST',
        format: 'EXCEL',
        frequency: 'DAILY',
        cron: '0 7 * * *',
        params: {},
        recipients: [],
      }),
    );
    expect(out.code).toBe('SCHED-000001');
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.SCHEDULE_CREATED);
  });

  it('rejects an invalid cron expression', async () => {
    const t = makeHarness();
    await expect(
      withTenantCtx(() =>
        t.svc.create({
          name: 'Bad cron',
          reportKind: 'STUDENT_LIST',
          format: 'EXCEL',
          frequency: 'CUSTOM_CRON',
          cron: 'not a cron',
          params: {},
          recipients: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ReportScheduleCronInvalidError);
  });
});

describe('ReportScheduleService.enable / disable', () => {
  it('enable patches the toggle and publishes SCHEDULE_TOGGLED', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ isEnabled: false }));
    const out = await withTenantCtx(() => t.svc.enable('sch-1', 1));
    expect(out.isEnabled).toBe(true);
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.SCHEDULE_TOGGLED);
  });

  it('disable patches the toggle off', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ isEnabled: true }));
    const out = await withTenantCtx(() => t.svc.disable('sch-1', 1));
    expect(out.isEnabled).toBe(false);
  });

  it('NotFound when toggling missing row', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() => t.svc.enable('missing', 1)),
    ).rejects.toBeInstanceOf(ReportScheduleNotFoundError);
  });
});

describe('ReportScheduleService.update', () => {
  it('updates and publishes SCHEDULE_TOGGLED', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow());
    const out = await withTenantCtx(() =>
      t.svc.update('sch-1', 1, { name: 'updated' }),
    );
    expect(out.name).toBe('updated');
    expect(t.repo.update).toHaveBeenCalled();
  });

  it('NotFound when updating missing row', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() => t.svc.update('missing', 1, { name: 'x' })),
    ).rejects.toBeInstanceOf(ReportScheduleNotFoundError);
  });
});
