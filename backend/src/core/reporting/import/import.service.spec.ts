/**
 * ImportJobService unit specs — create + cancel + commit.
 */
import {
  ImportJobNotCancellableError,
  ImportJobNotCommittableError,
  ImportJobNotFoundError,
  ImportKindUnknownError,
} from '../reporting.errors';
import { ReportingOutboxTopics } from '../reporting.constants';
import type { ImportJobRow } from '../reporting.types';
import {
  TEST_NOW,
  TEST_SCHOOL_ID,
  TEST_USER_ID,
  makeFakeAudit,
  makeFakeFeatureFlags,
  makeFakeJobEnqueue,
  makeFakeOutbox,
  makeFakePrisma,
  makeFakeSequences,
  withTenantCtx,
} from '../__test__/test-harness';
import { ImportJobService } from './import.service';

function makeRow(overrides: Partial<ImportJobRow> = {}): ImportJobRow {
  return {
    id: 'imp-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'IMP-000001',
    kind: 'STUDENT',
    status: 'PENDING',
    requestedByUserId: TEST_USER_ID,
    requestedAt: TEST_NOW,
    sourceFileAssetId: 'file-1',
    options: {},
    queuedJobId: null,
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    committedRows: 0,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
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
    create: jest.fn(async (input: { code: string; kind: ImportJobRow['kind'] }) =>
      makeRow({ id: 'imp-new', code: input.code, kind: input.kind }),
    ),
    updateStatus: jest.fn(
      async (id: string, _v: number, patch: { status?: ImportJobRow['status'] }) =>
        makeRow({ id, status: (patch.status ?? 'PENDING'), version: 2 }),
    ),
    softDelete: jest.fn(),
    bumpQueuedJobId: jest.fn(),
  };
  const issueRepo = {
    list: jest.fn(async () => ({ rows: [], nextCursorId: null })),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const jobEnqueue = makeFakeJobEnqueue();
  const fileAssets = {
    upload: jest.fn(async () => ({ id: 'file-uploaded' })),
  };
  const svc = new ImportJobService(
    prisma as never,
    repo as never,
    issueRepo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    jobEnqueue as never,
    fileAssets as never,
  );
  return { svc, repo, issueRepo, outbox, audit, sequences, featureFlags, jobEnqueue, fileAssets };
}

describe('ImportJobService.create', () => {
  it('uploads source file, allocates IMP code, persists, publishes IMPORT_REQUESTED', async () => {
    const t = makeHarness();
    const row = await withTenantCtx(() =>
      t.svc.create({
        kind: 'STUDENT',
        sourceFile: {
          fileName: 'students.csv',
          mimeType: 'text/csv',
          body: Buffer.from('admissionNo\nA1'),
        },
      }),
    );
    expect(row.code).toBe('IMP-000001');
    expect(t.fileAssets.upload).toHaveBeenCalled();
    expect(t.repo.create).toHaveBeenCalled();
    expect(t.jobEnqueue.enqueue).toHaveBeenCalled();
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.IMPORT_REQUESTED);
    expect(t.audit.record).toHaveBeenCalled();
  });

  it('rejects unknown import kind', async () => {
    const t = makeHarness();
    await expect(
      withTenantCtx(() =>
        t.svc.create({
          kind: 'BOGUS' as never,
          sourceFile: { fileName: 'x.csv', mimeType: 'text/csv', body: Buffer.from('') },
        }),
      ),
    ).rejects.toBeInstanceOf(ImportKindUnknownError);
  });
});

describe('ImportJobService.cancel', () => {
  it('cancels a PENDING job', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PENDING' }));
    const out = await withTenantCtx(() => t.svc.cancel('imp-1', 1));
    expect(out.status).toBe('CANCELLED');
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.IMPORT_CANCELLED);
  });

  it('refuses cancel on terminal status (COMMITTED)', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'COMMITTED' }));
    await expect(
      withTenantCtx(() => t.svc.cancel('imp-1', 1)),
    ).rejects.toBeInstanceOf(ImportJobNotCancellableError);
  });

  it('NotFound when row missing', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() => t.svc.cancel('missing', 1)),
    ).rejects.toBeInstanceOf(ImportJobNotFoundError);
  });
});

describe('ImportJobService.commit', () => {
  it('promotes VALIDATED → COMMITTING and enqueues commit job', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'VALIDATED' }));
    const out = await withTenantCtx(() => t.svc.commit('imp-1', 1));
    expect(out.status).toBe('COMMITTING');
    expect(t.jobEnqueue.enqueue).toHaveBeenCalled();
    const topics = (t.outbox.publish.mock.calls as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(ReportingOutboxTopics.IMPORT_COMMITTING);
  });

  it('refuses commit when not VALIDATED', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PENDING' }));
    await expect(
      withTenantCtx(() => t.svc.commit('imp-1', 1)),
    ).rejects.toBeInstanceOf(ImportJobNotCommittableError);
  });
});
