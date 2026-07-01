/**
 * Sprint 4.5 — Branch service orchestration spec.
 *
 * Real-MySQL e2e infrastructure (Testcontainers) is not yet wired in this
 * project — the smoke test in `test/app.e2e-spec.ts` stubs PrismaService.
 * Until that lands, these specs exercise the multi-step orchestration logic
 * (single-primary demote, deactivation guard, primary-required) by
 * constructing the service with mocked repositories. The contract verified
 * is the same one a real HTTP test would assert through `POST /branches`,
 * `POST /branches/:id/set-primary`, and `POST /branches/:id/deactivate`.
 */
import { NotFoundError } from '../../src/core/errors/domain-error';
import {
  BranchPrimaryRequiredError,
} from '../../src/core/branch/branch.errors';
import { BranchService } from '../../src/core/branch/branch/branch.service';
import type { BranchRepository } from '../../src/core/branch/repositories/branch.repository';
import type { BranchRow } from '../../src/core/branch/branch.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeBranch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    id: 'br-1',
    schoolId: 'sch-1',
    parentBranchId: null,
    code: 'MAIN',
    name: 'Main Campus',
    isPrimary: false,
    status: 'ACTIVE',
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateCode: null,
    pincode: null,
    phone: null,
    email: null,
    establishedDate: null,
    managerStaffId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<BranchRepository> = {
    findById: jest.fn(),
    findByCode: jest.fn(),
    listAll: jest.fn(),
    findPrimary: jest.fn(),
    demoteAllPrimary: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    setPrimary: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<BranchRepository>;
  const svc = new BranchService(prisma as never, repo as never);
  return { svc, prisma, repo };
}

describe('Sprint 4.5 — BranchService.create', () => {
  it('auto-promotes the very first branch to primary', async () => {
    const t = makeService();
    t.repo.findPrimary.mockResolvedValue(null);
    t.repo.create.mockImplementation(async (input) =>
      makeBranch({ id: 'br-new', code: input.code, isPrimary: input.isPrimary ?? false }),
    );

    const row = await t.svc.create({ code: 'MAIN', name: 'Main' });

    expect(t.repo.findPrimary).toHaveBeenCalled();
    expect(t.repo.demoteAllPrimary).not.toHaveBeenCalled();
    expect(row.isPrimary).toBe(true);
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: true }),
      expect.anything(),
    );
  });

  it('does not auto-promote when a primary already exists', async () => {
    const t = makeService();
    t.repo.findPrimary.mockResolvedValue(makeBranch({ id: 'br-existing', isPrimary: true }));
    t.repo.create.mockImplementation(async (input) =>
      makeBranch({ id: 'br-2', code: input.code, isPrimary: input.isPrimary ?? false }),
    );

    const row = await t.svc.create({ code: 'NORTH', name: 'North' });

    expect(t.repo.demoteAllPrimary).not.toHaveBeenCalled();
    expect(row.isPrimary).toBe(false);
  });

  it('demotes the prior primary in the same tx when create requests isPrimary=true', async () => {
    const t = makeService();
    t.repo.create.mockImplementation(async (input) =>
      makeBranch({ id: 'br-new', code: input.code, isPrimary: input.isPrimary ?? false }),
    );

    const row = await t.svc.create({ code: 'NORTH', name: 'North', isPrimary: true });

    expect(t.repo.demoteAllPrimary).toHaveBeenCalledTimes(1);
    expect(t.prisma.transaction).toHaveBeenCalledTimes(1);
    expect(row.isPrimary).toBe(true);
  });
});

describe('Sprint 4.5 — BranchService.setPrimary', () => {
  it('demotes the current primary then promotes the target', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeBranch({ id: 'br-2', isPrimary: false }));
    t.repo.setPrimary.mockResolvedValue(makeBranch({ id: 'br-2', isPrimary: true, version: 2 }));

    const row = await t.svc.setPrimary('br-2', 1);

    expect(t.repo.demoteAllPrimary).toHaveBeenCalledTimes(1);
    expect(t.repo.setPrimary).toHaveBeenCalledWith('br-2', 1, expect.anything());
    expect(row.isPrimary).toBe(true);
  });

  it('is a no-op when target is already primary', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeBranch({ id: 'br-1', isPrimary: true }));
    const row = await t.svc.setPrimary('br-1', 1);
    expect(t.repo.demoteAllPrimary).not.toHaveBeenCalled();
    expect(t.repo.setPrimary).not.toHaveBeenCalled();
    expect(row.isPrimary).toBe(true);
  });

  it('NotFound when the branch is missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.setPrimary('missing', 1)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Sprint 4.5 — BranchService.deactivate', () => {
  it('refuses to deactivate the primary branch', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeBranch({ id: 'br-1', isPrimary: true }));
    await expect(t.svc.deactivate('br-1', 1)).rejects.toBeInstanceOf(BranchPrimaryRequiredError);
    expect(t.repo.setStatus).not.toHaveBeenCalled();
  });

  it('deactivates a non-primary branch (Sprint 5 dependent-count stub passes today)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeBranch({ id: 'br-2', isPrimary: false }));
    t.repo.setStatus.mockResolvedValue(makeBranch({ id: 'br-2', status: 'INACTIVE', version: 2 }));
    const row = await t.svc.deactivate('br-2', 1);
    expect(t.repo.setStatus).toHaveBeenCalledWith('br-2', 1, 'INACTIVE', expect.anything());
    expect(row.status).toBe('INACTIVE');
  });
});
