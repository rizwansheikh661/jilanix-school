import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { withTestContext } from '../../request-context/helpers';
import {
  PromotionInvalidStateTransitionError,
  PromotionSameYearError,
} from '../academic.errors';
import type { AcademicYearPromotionRow, AcademicYearRow } from '../academic.types';
import type { AcademicYearPromotionRepository } from '../repositories/academic-year-promotion.repository';
import type { AcademicYearRepository } from '../repositories/academic-year.repository';
import { AcademicYearPromotionService } from './academic-year-promotion.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeYearRow(id: string): AcademicYearRow {
  return {
    id,
    schoolId: 'school-1',
    name: id,
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    isCurrent: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
  };
}

function makePromotionRow(
  overrides: Partial<AcademicYearPromotionRow> = {},
): AcademicYearPromotionRow {
  return {
    id: 'p-1',
    schoolId: 'school-1',
    sourceAcademicYearId: 'src',
    targetAcademicYearId: 'tgt',
    status: 'PENDING',
    startedAt: null,
    finishedAt: null,
    summaryJson: null,
    triggeredBy: null,
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
  const repo: Mocked<AcademicYearPromotionRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  } as unknown as Mocked<AcademicYearPromotionRepository>;
  const yearRepo: Mocked<AcademicYearRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<AcademicYearRepository>;
  const svc = new AcademicYearPromotionService(
    prisma as never,
    repo as never,
    yearRepo as never,
  );
  return { svc, prisma, repo, yearRepo };
}

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  withTestContext({ schoolId: 'school-1', userId: 'user-1' }, fn) as Promise<T>;

describe('AcademicYearPromotionService.create', () => {
  it('rejects when source === target', async () => {
    const t = makeService();
    await expect(
      runInContext(() =>
        t.svc.create({ sourceAcademicYearId: 'a', targetAcademicYearId: 'a' }),
      ),
    ).rejects.toBeInstanceOf(PromotionSameYearError);
  });

  it('throws NotFound when source year missing', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValueOnce(null);
    t.yearRepo.findById.mockResolvedValueOnce(makeYearRow('tgt'));
    await expect(
      runInContext(() =>
        t.svc.create({ sourceAcademicYearId: 'src', targetAcademicYearId: 'tgt' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFound when target year missing', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValueOnce(makeYearRow('src'));
    t.yearRepo.findById.mockResolvedValueOnce(null);
    await expect(
      runInContext(() =>
        t.svc.create({ sourceAcademicYearId: 'src', targetAcademicYearId: 'tgt' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates PENDING record with triggeredBy from context', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValueOnce(makeYearRow('src'));
    t.yearRepo.findById.mockResolvedValueOnce(makeYearRow('tgt'));
    t.repo.create.mockResolvedValue(makePromotionRow({ triggeredBy: 'user-1' }));
    const row = await runInContext(() =>
      t.svc.create({ sourceAcademicYearId: 'src', targetAcademicYearId: 'tgt' }),
    );
    expect(row.status).toBe('PENDING');
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAcademicYearId: 'src',
        targetAcademicYearId: 'tgt',
        triggeredBy: 'user-1',
      }),
      expect.anything(),
    );
  });
});

describe('AcademicYearPromotionService.cancel', () => {
  it('throws NotFound when promotion missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.cancel('p-1', 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws VersionConflict on stale expectedVersion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makePromotionRow({ version: 4 }));
    await expect(t.svc.cancel('p-1', 3)).rejects.toBeInstanceOf(VersionConflict);
  });

  it('rejects cancel of COMPLETED promotion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makePromotionRow({ status: 'COMPLETED' }));
    await expect(t.svc.cancel('p-1', 1)).rejects.toBeInstanceOf(
      PromotionInvalidStateTransitionError,
    );
  });

  it('cancels PENDING promotion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makePromotionRow({ status: 'PENDING' }));
    t.repo.updateStatus.mockResolvedValue(
      makePromotionRow({ status: 'CANCELLED', version: 2 }),
    );
    const row = await t.svc.cancel('p-1', 1);
    expect(row.status).toBe('CANCELLED');
    expect(t.repo.updateStatus).toHaveBeenCalledWith('p-1', 1, 'CANCELLED', expect.anything());
  });

  it('cancels RUNNING promotion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makePromotionRow({ status: 'RUNNING' }));
    t.repo.updateStatus.mockResolvedValue(
      makePromotionRow({ status: 'CANCELLED', version: 2 }),
    );
    const row = await t.svc.cancel('p-1', 1);
    expect(row.status).toBe('CANCELLED');
  });
});
