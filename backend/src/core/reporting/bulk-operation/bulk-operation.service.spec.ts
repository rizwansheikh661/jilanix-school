/**
 * BulkOperationService unit specs — create modes + cancel.
 */
import {
  BulkOperationNotCancellableError,
  BulkOperationNotFoundError,
  BulkOperationTargetsExceededError,
} from '../reporting.errors';
import { ReportingOutboxTopics } from '../reporting.constants';
import type { BulkOperationRow } from '../reporting.types';
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
import { BulkOperationService } from './bulk-operation.service';

function makeRow(overrides: Partial<BulkOperationRow> = {}): BulkOperationRow {
  return {
    id: 'bop-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'BOP-000001',
    kind: 'STUDENT_PROMOTE',
    mode: 'PREVIEW',
    status: 'PREVIEWED',
    requestedByUserId: TEST_USER_ID,
    requestedAt: TEST_NOW,
    params: {},
    queuedJobId: null,
    targetCount: 0,
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    previewResult: null,
    validationResult: null,
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
    create: jest.fn(
      async (input: {
        code: string;
        kind: BulkOperationRow['kind'];
        mode: BulkOperationRow['mode'];
        status: BulkOperationRow['status'];
      }) =>
        makeRow({
          id: 'bop-new',
          code: input.code,
          kind: input.kind,
          mode: input.mode,
          status: input.status,
        }),
    ),
    updateStatus: jest.fn(
      async (id: string, _v: number, patch: { status?: BulkOperationRow['status'] }) =>
        makeRow({ id, status: (patch.status ?? 'PREVIEWED'), version: 2 }),
    ),
    bumpQueuedJobId: jest.fn(),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const jobEnqueue = makeFakeJobEnqueue();
  const executor = {
    kind: 'STUDENT_PROMOTE',
    preview: jest.fn(async () => ({ targetCount: 3, summary: { eligibleCount: 3 } })),
    validate: jest.fn(async () => ({ targetCount: 3, issues: [] })),
    execute: jest.fn(),
  };
  const executors = {
    get: jest.fn(() => executor),
  };
  const svc = new BulkOperationService(
    prisma as never,
    repo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    jobEnqueue as never,
    executors as never,
  );
  return { svc, repo, outbox, audit, sequences, featureFlags, jobEnqueue, executors, executor };
}

const UUID_A = '00000000-0000-4000-8000-00000000aaaa';
const UUID_B = '00000000-0000-4000-8000-00000000bbbb';

describe('BulkOperationService.create', () => {
  it('PREVIEW returns synchronously with status PREVIEWED', async () => {
    const t = makeHarness();
    const out = await withTenantCtx(() =>
      t.svc.create({
        kind: 'STUDENT_PROMOTE',
        mode: 'PREVIEW',
        params: { studentIds: ['a', 'b', 'c'] },
      }),
    );
    expect(out.status).toBe('PREVIEWED');
    expect(t.executor.preview).toHaveBeenCalled();
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.BULK_OP_PREVIEWED);
  });

  it('VALIDATE returns synchronously with status VALIDATED', async () => {
    const t = makeHarness();
    const out = await withTenantCtx(() =>
      t.svc.create({
        kind: 'STUDENT_PROMOTE',
        mode: 'VALIDATE',
        params: { studentIds: ['a', 'b'] },
      }),
    );
    expect(out.status).toBe('VALIDATED');
    expect(t.executor.validate).toHaveBeenCalled();
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.BULK_OP_VALIDATED);
  });

  it('EXECUTE enqueues a job and lands in EXECUTING', async () => {
    const t = makeHarness();
    const out = await withTenantCtx(() =>
      t.svc.create({
        kind: 'STUDENT_PROMOTE',
        mode: 'EXECUTE',
        params: {
          sourceAcademicYearId: UUID_A,
          targetAcademicYearId: UUID_B,
          studentIds: ['s1', 's2'],
        },
      }),
    );
    expect(out.status).toBe('EXECUTING');
    expect(t.jobEnqueue.enqueue).toHaveBeenCalled();
    const topics = (t.outbox.publish.mock.calls as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(ReportingOutboxTopics.BULK_OP_REQUESTED);
    expect(topics).toContain(ReportingOutboxTopics.BULK_OP_EXECUTING);
  });

  it('rejects PREVIEW when targetCount > MAX_BULK_OPERATION_PREVIEW_TARGETS', async () => {
    const t = makeHarness();
    const bigIds = new Array(501).fill('x');
    await expect(
      withTenantCtx(() =>
        t.svc.create({
          kind: 'STUDENT_PROMOTE',
          mode: 'PREVIEW',
          params: { studentIds: bigIds },
        }),
      ),
    ).rejects.toBeInstanceOf(BulkOperationTargetsExceededError);
  });
});

describe('BulkOperationService.cancel', () => {
  it('cancels DRAFT/PREVIEWED happily', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PREVIEWED' }));
    const out = await withTenantCtx(() => t.svc.cancel('bop-1', 1));
    expect(out.status).toBe('CANCELLED');
    const publishArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(publishArgs.topic).toBe(ReportingOutboxTopics.BULK_OP_CANCELLED);
  });

  it('refuses cancel on terminal (COMPLETED)', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'COMPLETED' }));
    await expect(
      withTenantCtx(() => t.svc.cancel('bop-1', 1)),
    ).rejects.toBeInstanceOf(BulkOperationNotCancellableError);
  });

  it('NotFound when row missing', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() => t.svc.cancel('missing', 1)),
    ).rejects.toBeInstanceOf(BulkOperationNotFoundError);
  });
});
