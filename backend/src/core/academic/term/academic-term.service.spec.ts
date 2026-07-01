import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import {
  TermDateRangeInvalidError,
  TermOutsideYearError,
  TermOverlapError,
  TermSequenceGapError,
} from '../academic.errors';
import type { AcademicTermRow, AcademicYearRow } from '../academic.types';
import type { AcademicTermRepository } from '../repositories/academic-term.repository';
import type { AcademicYearRepository } from '../repositories/academic-year.repository';
import { AcademicTermService } from './academic-term.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeYearRow(overrides: Partial<AcademicYearRow> = {}): AcademicYearRow {
  return {
    id: 'year-1',
    schoolId: 'school-1',
    name: 'AY 2026',
    startDate: new Date('2026-04-01T00:00:00Z'),
    endDate: new Date('2027-03-31T00:00:00Z'),
    isCurrent: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeTermRow(overrides: Partial<AcademicTermRow> = {}): AcademicTermRow {
  return {
    id: 'term-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    name: 'Term 1',
    sequence: 1,
    startDate: new Date('2026-04-01T00:00:00Z'),
    endDate: new Date('2026-09-30T00:00:00Z'),
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
  const repo: Mocked<AcademicTermRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    findAllForYear: jest.fn(),
    findOverlapping: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<AcademicTermRepository>;
  const yearRepo: Mocked<AcademicYearRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<AcademicYearRepository>;
  const svc = new AcademicTermService(prisma as never, repo as never, yearRepo as never);
  return { svc, prisma, repo, yearRepo };
}

describe('AcademicTermService.create', () => {
  it('rejects when startDate >= endDate', async () => {
    const t = makeService();
    await expect(
      t.svc.create({
        academicYearId: 'year-1',
        name: 'Term 1',
        startDate: new Date('2026-09-30'),
        endDate: new Date('2026-04-01'),
      }),
    ).rejects.toBeInstanceOf(TermDateRangeInvalidError);
  });

  it('rejects when term falls outside parent year window', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValue(makeYearRow());
    await expect(
      t.svc.create({
        academicYearId: 'year-1',
        name: 'Term 1',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-06-30'),
      }),
    ).rejects.toBeInstanceOf(TermOutsideYearError);
  });

  it('rejects on overlap with sibling term', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValue(makeYearRow());
    t.repo.findOverlapping.mockResolvedValue(makeTermRow());
    await expect(
      t.svc.create({
        academicYearId: 'year-1',
        name: 'Term 2',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-09-30'),
      }),
    ).rejects.toBeInstanceOf(TermOverlapError);
  });

  it('rejects when caller-supplied sequence is not contiguous', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValue(makeYearRow());
    t.repo.findOverlapping.mockResolvedValue(null);
    t.repo.findAllForYear.mockResolvedValue([makeTermRow({ sequence: 1 })]);
    await expect(
      t.svc.create({
        academicYearId: 'year-1',
        name: 'Term 3',
        sequence: 3,
        startDate: new Date('2026-10-01'),
        endDate: new Date('2027-03-30'),
      }),
    ).rejects.toBeInstanceOf(TermSequenceGapError);
  });

  it('auto-assigns sequence = maxSeq + 1 when omitted', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValue(makeYearRow());
    t.repo.findOverlapping.mockResolvedValue(null);
    t.repo.findAllForYear.mockResolvedValue([makeTermRow({ sequence: 1 })]);
    t.repo.create.mockResolvedValue(makeTermRow({ id: 'term-2', sequence: 2 }));
    const row = await t.svc.create({
      academicYearId: 'year-1',
      name: 'Term 2',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2027-03-30'),
    });
    expect(row.sequence).toBe(2);
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 2 }),
      expect.anything(),
    );
  });

  it('starts at sequence 1 when no terms exist', async () => {
    const t = makeService();
    t.yearRepo.findById.mockResolvedValue(makeYearRow());
    t.repo.findOverlapping.mockResolvedValue(null);
    t.repo.findAllForYear.mockResolvedValue([]);
    t.repo.create.mockResolvedValue(makeTermRow({ sequence: 1 }));
    await t.svc.create({
      academicYearId: 'year-1',
      name: 'Term 1',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-09-30'),
    });
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 1 }),
      expect.anything(),
    );
  });
});

describe('AcademicTermService.update', () => {
  it('throws NotFound when row missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.update('term-1', 1, { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws VersionConflict on stale expectedVersion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeTermRow({ version: 3 }));
    await expect(t.svc.update('term-1', 2, { name: 'X' })).rejects.toBeInstanceOf(VersionConflict);
  });

  it('applies a name-only patch without re-checking overlap', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeTermRow());
    t.repo.update.mockResolvedValue(makeTermRow({ name: 'Term 1 Renamed', version: 2 }));
    const row = await t.svc.update('term-1', 1, { name: 'Term 1 Renamed' });
    expect(row.version).toBe(2);
    expect(t.repo.findOverlapping).not.toHaveBeenCalled();
  });
});

describe('AcademicTermService.softDelete', () => {
  it('soft-deletes when version matches', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeTermRow());
    await t.svc.softDelete('term-1', 1);
    expect(t.repo.softDelete).toHaveBeenCalledWith('term-1', 1, expect.anything());
  });

  it('throws VersionConflict on stale expectedVersion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeTermRow({ version: 4 }));
    await expect(t.svc.softDelete('term-1', 3)).rejects.toBeInstanceOf(VersionConflict);
  });
});
