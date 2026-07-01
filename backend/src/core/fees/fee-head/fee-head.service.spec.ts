/**
 * FeeHeadService unit specs — duplicate-code guard, in-use guard, outbox +
 * finance audit, and version-conflict propagation.
 *
 * Persistence + cross-cutting deps are fully mocked.
 */
import { VersionConflictError } from '../../../infra/prisma/errors';
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  DuplicateFeeHeadCodeError,
  FeesInUseError,
} from '../fees.errors';
import type { FeeHeadRow } from '../fees.types';
import { FeeHeadService } from './fee-head.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeHead(overrides: Partial<FeeHeadRow> = {}): FeeHeadRow {
  return {
    id: 'fh-1',
    schoolId: SCHOOL,
    code: 'TUI-A',
    name: 'Tuition A',
    category: 'TUITION',
    hsnSac: null,
    isRefundable: false,
    isTaxable: false,
    defaultAmount: 1000,
    glAccount: null,
    description: null,
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
    findActiveByCode: jest.fn(),
    create: jest.fn(async (input: { code: string; name: string; category: string }) =>
      makeHead({ id: 'fh-new', code: input.code, name: input.name, category: input.category as never }),
    ),
    update: jest.fn(),
    softDelete: jest.fn(),
    countActiveStructureLineRefs: jest.fn(async () => 0),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new FeeHeadService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, userId: 'user-1', actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('FeeHeadService.create', () => {
  it('creates a head and publishes head.created + finance audit', async () => {
    const t = makeService();
    t.repo.findActiveByCode.mockResolvedValue(null);
    const row = await withCtx(() =>
      t.svc.create({ code: 'TUI-A', name: 'Tuition A', category: 'TUITION' }),
    );
    expect(row.code).toBe('TUI-A');
    expect(t.outbox.publish).toHaveBeenCalledTimes(1);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string; aggregateType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.HEAD_CREATED,
        eventType: 'FeeHeadCreated',
        aggregateType: 'FeeHead',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledTimes(1);
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string; resourceType: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({
        action: 'fee_head.create',
        category: 'finance',
        resourceType: 'FeeHead',
      }),
    );
  });

  it('rejects duplicate code with DuplicateFeeHeadCodeError', async () => {
    const t = makeService();
    t.repo.findActiveByCode.mockResolvedValue(makeHead({ code: 'TUI-A' }));
    await expect(
      withCtx(() =>
        t.svc.create({ code: 'TUI-A', name: 'Tuition A', category: 'TUITION' }),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeeHeadCodeError);
    expect(t.repo.create).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});

describe('FeeHeadService.softDelete', () => {
  it('refuses when active structure line refs exist (FeesInUseError)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHead());
    t.repo.countActiveStructureLineRefs.mockResolvedValue(2);
    await expect(withCtx(() => t.svc.softDelete('fh-1', 1))).rejects.toBeInstanceOf(
      FeesInUseError,
    );
    expect(t.repo.softDelete).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });

  it('soft-deletes when no refs and publishes head.deleted', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHead());
    t.repo.countActiveStructureLineRefs.mockResolvedValue(0);
    t.repo.softDelete.mockResolvedValue(undefined);
    await withCtx(() => t.svc.softDelete('fh-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledWith('fh-1', 1, expect.anything());
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({ topic: FeesOutboxTopics.HEAD_DELETED }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ action: 'fee_head.delete', category: 'finance' }),
    );
  });
});

describe('FeeHeadService.update', () => {
  it('propagates VersionConflictError from repo when version mismatches', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHead({ version: 1 }));
    t.repo.update.mockRejectedValue(new VersionConflictError('FeeHead', 'fh-1', 99));
    await expect(
      withCtx(() => t.svc.update('fh-1', 99, { name: 'Renamed' })),
    ).rejects.toBeDefined();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});
