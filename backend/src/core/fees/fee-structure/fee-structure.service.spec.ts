/**
 * FeeStructureService unit specs — CRUD + status machine.
 *
 * Persistence is mocked end-to-end. We assert that the service:
 *   - publishes the right outbox topic on each mutation
 *   - writes a finance-category audit row in the tx
 *   - enforces DRAFT-only edits and the status transitions
 *   - clones strip child-line identifiers and reset status to DRAFT
 */
import { RequestContextRegistry } from '../../request-context';
import {
  FeeStructureNotEditableError,
  FeeStructureStatusTransitionError,
  FeesBulkLimitExceededError,
} from '../fees.errors';
import { FeesOutboxTopics } from '../fees.constants';
import type {
  FeeStructureLineRow,
  FeeStructureRow,
  FeeStructureWithLines,
} from '../fees.types';
import { FeeStructureService } from './fee-structure.service';
import type { CreateFeeStructureLineInput } from './fee-structure.repository';

const SCHOOL = 'sch-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeHeader(overrides: Partial<FeeStructureRow> = {}): FeeStructureRow {
  return {
    id: 'fs-1',
    schoolId: SCHOOL,
    academicYearId: 'ay-1',
    branchId: null,
    name: 'Annual 2026',
    appliesTo: 'SCHOOL',
    classId: null,
    sectionId: null,
    studentId: null,
    currency: 'INR',
    status: 'DRAFT',
    publishedAt: null,
    archivedAt: null,
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

function makeLine(overrides: Partial<FeeStructureLineRow> = {}): FeeStructureLineRow {
  return {
    id: 'fsl-1',
    schoolId: SCHOOL,
    feeStructureId: 'fs-1',
    feeHeadId: 'fh-1',
    lateFinePolicyId: null,
    amount: 1000,
    frequency: 'ANNUAL',
    dueDay: null,
    ordering: 1,
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

function makeStructure(
  headerOverrides: Partial<FeeStructureRow> = {},
  lines: readonly FeeStructureLineRow[] = [makeLine()],
): FeeStructureWithLines {
  return { ...makeHeader(headerOverrides), lines };
}

function makeService() {
  const tx = {
    academicYear: { findFirst: jest.fn(async () => ({ id: 'ay-1' })) },
    branch: { findFirst: jest.fn(async () => ({ id: 'br-1' })) },
    class: { findFirst: jest.fn(async () => ({ id: 'cls-1' })) },
    section: { findFirst: jest.fn(async () => ({ id: 'sec-1' })) },
    student: { findFirst: jest.fn(async () => ({ id: 'st-1' })) },
    feeHead: { findFirst: jest.fn(async () => ({ id: 'fh-1' })) },
    feeLateFinePolicy: { findFirst: jest.fn(async () => ({ id: 'pol-1' })) },
  };
  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByName: jest.fn(async () => null),
    create: jest.fn(),
    updateHeader: jest.fn(async () => makeHeader({ version: 2 })),
    replaceLines: jest.fn(async () => [makeLine({ id: 'fsl-2' })]),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new FeeStructureService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, tx, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('FeeStructureService.create', () => {
  it('persists structure + lines and emits fees.structure.created with finance audit', async () => {
    const t = makeService();
    const created = makeStructure({}, [makeLine({ id: 'fsl-a' }), makeLine({ id: 'fsl-b' })]);
    t.repo.create.mockResolvedValue(created);

    const result = await withCtx(() =>
      t.svc.create({
        academicYearId: 'ay-1',
        name: 'Annual 2026',
        appliesTo: 'SCHOOL',
        lines: [
          { feeHeadId: 'fh-1', amount: 1000, frequency: 'ANNUAL', ordering: 1 },
          { feeHeadId: 'fh-1', amount: 500, frequency: 'ANNUAL', ordering: 2 },
        ],
      }),
    );
    expect(result.id).toBe('fs-1');
    expect(t.repo.create).toHaveBeenCalledTimes(1);
    const createArg = t.repo.create.mock.calls[0]![0] as { lines: readonly unknown[] };
    expect(createArg.lines).toHaveLength(2);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.STRUCTURE_CREATED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee_structure.create' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });
});

describe('FeeStructureService.update', () => {
  it('replaces lines + emits structure.updated when on DRAFT', async () => {
    const t = makeService();
    t.repo.findById
      .mockResolvedValueOnce(makeStructure({ status: 'DRAFT', version: 1 }))
      .mockResolvedValueOnce(
        makeStructure({ status: 'DRAFT', version: 2 }, [makeLine({ id: 'fsl-new' })]),
      );

    const updated = await withCtx(() =>
      t.svc.update('fs-1', 1, {
        name: 'Annual 2026 v2',
        lines: [
          { feeHeadId: 'fh-1', amount: 2000, frequency: 'ANNUAL', ordering: 1 },
        ],
      }),
    );
    expect(updated.version).toBe(2);
    expect(t.repo.updateHeader).toHaveBeenCalledTimes(1);
    expect(t.repo.replaceLines).toHaveBeenCalledTimes(1);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.STRUCTURE_UPDATED }),
    );
  });

  it('refuses update on PUBLISHED structure → FeeStructureNotEditableError', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeStructure({ status: 'PUBLISHED' }));
    await expect(
      withCtx(() => t.svc.update('fs-1', 1, { name: 'X' })),
    ).rejects.toBeInstanceOf(FeeStructureNotEditableError);
    expect(t.repo.updateHeader).not.toHaveBeenCalled();
  });
});

describe('FeeStructureService.publish', () => {
  it('flips DRAFT→PUBLISHED + emits fees.structure.published', async () => {
    const t = makeService();
    t.repo.findById
      .mockResolvedValueOnce(makeStructure({ status: 'DRAFT' }))
      .mockResolvedValueOnce(makeStructure({ status: 'PUBLISHED', version: 2 }));
    t.repo.setStatus.mockResolvedValue(makeHeader({ status: 'PUBLISHED', version: 2 }));

    const out = await withCtx(() => t.svc.publish('fs-1', 1));
    expect(out.status).toBe('PUBLISHED');
    expect(t.repo.setStatus).toHaveBeenCalledWith(
      'fs-1',
      1,
      'PUBLISHED',
      expect.objectContaining({ publishedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.STRUCTURE_PUBLISHED }),
    );
  });

  it('refuses publish when structure has no lines', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeStructure({ status: 'DRAFT' }, []));
    await expect(withCtx(() => t.svc.publish('fs-1', 1))).rejects.toBeInstanceOf(
      FeesBulkLimitExceededError,
    );
    expect(t.repo.setStatus).not.toHaveBeenCalled();
  });
});

describe('FeeStructureService.archive', () => {
  it('archives PUBLISHED structure + emits fees.structure.archived', async () => {
    const t = makeService();
    t.repo.findById
      .mockResolvedValueOnce(makeStructure({ status: 'PUBLISHED' }))
      .mockResolvedValueOnce(makeStructure({ status: 'ARCHIVED', version: 3 }));
    t.repo.setStatus.mockResolvedValue(makeHeader({ status: 'ARCHIVED', version: 3 }));

    const out = await withCtx(() => t.svc.archive('fs-1', 2));
    expect(out.status).toBe('ARCHIVED');
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.STRUCTURE_ARCHIVED }),
    );
  });

  it('refuses archive on already-ARCHIVED → status transition error', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeStructure({ status: 'ARCHIVED' }));
    await expect(withCtx(() => t.svc.archive('fs-1', 1))).rejects.toBeInstanceOf(
      FeeStructureStatusTransitionError,
    );
  });
});

describe('FeeStructureService.cloneFrom', () => {
  it('clones source structure stripped of identifiers, defaults to DRAFT', async () => {
    const t = makeService();
    const source = makeStructure({ id: 'fs-src', status: 'PUBLISHED', version: 5 }, [
      makeLine({ id: 'fsl-x', amount: 1000, ordering: 1 }),
      makeLine({ id: 'fsl-y', amount: 500, ordering: 2 }),
    ]);
    t.repo.findById.mockResolvedValue(source);
    const cloned = makeStructure({ id: 'fs-clone', name: 'Annual Clone', status: 'DRAFT' });
    t.repo.create.mockResolvedValue(cloned);

    const out = await withCtx(() =>
      t.svc.cloneFrom('fs-src', { name: 'Annual Clone' }),
    );
    expect(out.id).toBe('fs-clone');
    expect(out.status).toBe('DRAFT');
    const createArg = t.repo.create.mock.calls[0]![0] as {
      lines: readonly CreateFeeStructureLineInput[];
    };
    // Clone passes line *content* — no `id` field exists on CreateFeeStructureLineInput.
    expect(createArg.lines).toHaveLength(2);
    for (const l of createArg.lines) {
      expect(l).not.toHaveProperty('id');
    }
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.STRUCTURE_CLONED }),
    );
  });
});
