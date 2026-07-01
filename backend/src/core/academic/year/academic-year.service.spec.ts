import { AcademicYearOverlapError } from '../academic.errors';
import type { AcademicYearRow } from '../academic.types';
import type { AcademicYearRepository } from '../repositories/academic-year.repository';
import { AcademicYearService } from './academic-year.service';
import { NotFoundError, ValidationFailedError, VersionConflict } from '../../errors/domain-error';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<AcademicYearRow> = {}): AcademicYearRow {
  return {
    id: 'year-1',
    schoolId: 'school-1',
    name: 'AY 2026',
    startDate: new Date('2026-04-01T00:00:00Z'),
    endDate: new Date('2027-03-31T00:00:00Z'),
    isCurrent: false,
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
  const repo: Mocked<AcademicYearRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setCurrent: jest.fn(),
    findOverlapping: jest.fn(),
  } as unknown as Mocked<AcademicYearRepository>;
  const svc = new AcademicYearService(prisma as never, repo as never);
  return { svc, prisma, repo };
}

describe('AcademicYearService.create', () => {
  it('creates when no overlap exists', async () => {
    const t = makeService();
    t.repo.findOverlapping.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());

    const row = await t.svc.create({
      name: 'AY 2026',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
    });
    expect(row.id).toBe('year-1');
    expect(t.repo.findOverlapping).toHaveBeenCalled();
  });

  it('rejects when startDate >= endDate', async () => {
    const t = makeService();
    await expect(
      t.svc.create({
        name: 'AY',
        startDate: new Date('2027-04-01'),
        endDate: new Date('2026-04-01'),
      }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('rejects when overlapping year exists', async () => {
    const t = makeService();
    t.repo.findOverlapping.mockResolvedValue(makeRow({ id: 'other', name: 'AY 2025' }));
    await expect(
      t.svc.create({
        name: 'AY',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
      }),
    ).rejects.toBeInstanceOf(AcademicYearOverlapError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('AcademicYearService.update', () => {
  it('throws NotFound when row missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.update('x', 1, { name: 'new' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws VersionConflict on stale expectedVersion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ version: 5 }));
    await expect(t.svc.update('year-1', 4, { name: 'new' })).rejects.toBeInstanceOf(
      VersionConflict,
    );
  });

  it('applies a name-only patch without overlap re-check', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow());
    t.repo.update.mockResolvedValue(makeRow({ name: 'AY 2026 Renamed', version: 2 }));
    const row = await t.svc.update('year-1', 1, { name: 'AY 2026 Renamed' });
    expect(row.version).toBe(2);
    expect(t.repo.findOverlapping).not.toHaveBeenCalled();
  });
});

describe('AcademicYearService.activate', () => {
  it('demotes others and promotes target inside a transaction', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow());
    t.repo.setCurrent.mockResolvedValue(makeRow({ isCurrent: true, version: 2 }));
    const row = await t.svc.activate('year-1', 1);
    expect(row.isCurrent).toBe(true);
    expect(t.prisma.transaction).toHaveBeenCalled();
    expect(t.repo.setCurrent).toHaveBeenCalledWith('year-1', 1, expect.anything());
  });

  it('throws VersionConflict on stale expectedVersion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ version: 3 }));
    await expect(t.svc.activate('year-1', 2)).rejects.toBeInstanceOf(VersionConflict);
    expect(t.repo.setCurrent).not.toHaveBeenCalled();
  });
});
