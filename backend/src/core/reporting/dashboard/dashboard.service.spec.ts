/**
 * DashboardService unit specs — create + getById + softDelete cascade +
 * addWidget cap.
 */
import {
  DashboardNotFoundError,
  DashboardWidgetCapExceededError,
} from '../reporting.errors';
import {
  MAX_WIDGETS_PER_DASHBOARD,
  ReportingOutboxTopics,
} from '../reporting.constants';
import type { DashboardRow, DashboardWidgetRow } from '../reporting.types';
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
import { DashboardService } from './dashboard.service';

function makeRow(overrides: Partial<DashboardRow> = {}): DashboardRow {
  return {
    id: 'dsh-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'DSH-000001',
    name: 'Main',
    description: null,
    isDefault: false,
    ownedByUserId: TEST_USER_ID,
    version: 1,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeWidgetRow(): DashboardWidgetRow {
  return {
    id: 'w-1',
    schoolId: TEST_SCHOOL_ID,
    dashboardId: 'dsh-1',
    kind: 'METRIC',
    position: 1,
    title: 'KPIs',
    config: {},
    version: 1,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    deletedAt: null,
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
    softDelete: jest.fn(),
  };
  const widgetRepo = {
    listByDashboard: jest.fn(async () => []),
    countByDashboard: jest.fn(async () => 0),
    findById: jest.fn(),
    create: jest.fn(async () => makeWidgetRow()),
    update: jest.fn(),
    softDelete: jest.fn(),
    softDeleteAllForDashboard: jest.fn(),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const svc = new DashboardService(
    prisma as never,
    repo as never,
    widgetRepo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, widgetRepo, outbox, audit, sequences, featureFlags };
}

describe('DashboardService.create', () => {
  it('allocates DSH code and publishes DASHBOARD_CREATED', async () => {
    const t = makeHarness();
    const out = await withTenantCtx(() =>
      t.svc.create({ name: 'Main' }),
    );
    expect(out.code).toBe('DSH-000001');
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.DASHBOARD_CREATED);
  });
});

describe('DashboardService.getById', () => {
  it('NotFound when missing', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() => t.svc.getById('missing')),
    ).rejects.toBeInstanceOf(DashboardNotFoundError);
  });
});

describe('DashboardService.softDelete', () => {
  it('cascades widget soft-delete in the same tx', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow());
    await withTenantCtx(() => t.svc.softDelete('dsh-1', 1));
    expect(t.widgetRepo.softDeleteAllForDashboard).toHaveBeenCalledWith(
      'dsh-1',
      expect.anything(),
    );
    expect(t.repo.softDelete).toHaveBeenCalled();
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.DASHBOARD_DELETED);
  });
});

describe('DashboardService.addWidget', () => {
  it('refuses to add a widget when at MAX_WIDGETS_PER_DASHBOARD', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow());
    t.widgetRepo.countByDashboard.mockResolvedValue(MAX_WIDGETS_PER_DASHBOARD);
    await expect(
      withTenantCtx(() =>
        t.svc.addWidget('dsh-1', {
          kind: 'METRIC',
          position: 1,
          title: 'KPIs',
          config: {},
        }),
      ),
    ).rejects.toBeInstanceOf(DashboardWidgetCapExceededError);
  });
});
