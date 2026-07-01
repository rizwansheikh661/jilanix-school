/**
 * ReportTemplateService unit specs — create, getById visibility,
 * update / softDelete ownership.
 */
import {
  ReportTemplateNotFoundError,
  ReportTemplateNotOwnedError,
} from '../reporting.errors';
import { ReportingOutboxTopics } from '../reporting.constants';
import type { ReportTemplateRow } from '../reporting.types';
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
  withTenantCtxAs,
} from '../__test__/test-harness';
import { ReportTemplateService } from './report-template.service';

const OTHER_USER_ID = 'user-2';

function makeRow(overrides: Partial<ReportTemplateRow> = {}): ReportTemplateRow {
  return {
    id: 'tpl-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'TPL-000001',
    name: 'My filter',
    description: null,
    reportKind: 'STUDENT_LIST',
    params: { classId: 'c1' },
    isShared: false,
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
    listOwn: jest.fn(),
    listOwnOrShared: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(async (input: { code: string; name: string }) =>
      makeRow({ code: input.code, name: input.name }),
    ),
    update: jest.fn(async () => makeRow({ name: 'renamed', version: 2 })),
    softDelete: jest.fn(),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const svc = new ReportTemplateService(
    prisma as never,
    repo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, outbox, audit };
}

describe('ReportTemplateService.create', () => {
  it('allocates TPL code and publishes TEMPLATE_CREATED', async () => {
    const t = makeHarness();
    const out = await withTenantCtx(() =>
      t.svc.create({
        name: 'My filter',
        reportKind: 'STUDENT_LIST',
        params: { classId: 'c1' },
      }),
    );
    expect(out.code).toBe('TPL-000001');
    expect(out.ownedByUserId).toBe(TEST_USER_ID);
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.TEMPLATE_CREATED);
  });
});

describe('ReportTemplateService.getById', () => {
  it('returns own row', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow());
    const out = await withTenantCtx(() => t.svc.getById('tpl-1'));
    expect(out.id).toBe('tpl-1');
  });

  it('returns shared row owned by another user', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(
      makeRow({ ownedByUserId: OTHER_USER_ID, isShared: true }),
    );
    const out = await withTenantCtx(() => t.svc.getById('tpl-1'));
    expect(out.id).toBe('tpl-1');
  });

  it('hides non-shared row owned by another user as NotFound', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(
      makeRow({ ownedByUserId: OTHER_USER_ID, isShared: false }),
    );
    await expect(
      withTenantCtx(() => t.svc.getById('tpl-1')),
    ).rejects.toBeInstanceOf(ReportTemplateNotFoundError);
  });

  it('NotFound when missing entirely', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() => t.svc.getById('missing')),
    ).rejects.toBeInstanceOf(ReportTemplateNotFoundError);
  });
});

describe('ReportTemplateService.update', () => {
  it('allows owner to update', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow());
    const out = await withTenantCtx(() =>
      t.svc.update('tpl-1', 1, { name: 'renamed' }),
    );
    expect(out.name).toBe('renamed');
    expect(t.repo.update).toHaveBeenCalled();
  });

  it('refuses non-owner update with NotOwnedError', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(
      makeRow({ ownedByUserId: OTHER_USER_ID, isShared: true }),
    );
    await expect(
      withTenantCtx(() => t.svc.update('tpl-1', 1, { name: 'x' })),
    ).rejects.toBeInstanceOf(ReportTemplateNotOwnedError);
  });

  it('NotFound when row missing', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtxAs(OTHER_USER_ID, () =>
        t.svc.update('missing', 1, { name: 'x' }),
      ),
    ).rejects.toBeInstanceOf(ReportTemplateNotFoundError);
  });
});

describe('ReportTemplateService.softDelete', () => {
  it('allows owner to delete', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow());
    await withTenantCtx(() => t.svc.softDelete('tpl-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalled();
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.TEMPLATE_DELETED);
  });

  it('refuses non-owner delete with NotOwnedError', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(
      makeRow({ ownedByUserId: OTHER_USER_ID, isShared: true }),
    );
    await expect(
      withTenantCtx(() => t.svc.softDelete('tpl-1', 1)),
    ).rejects.toBeInstanceOf(ReportTemplateNotOwnedError);
  });
});
