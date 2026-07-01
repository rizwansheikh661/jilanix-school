import { ClassHasSectionsError } from '../academic.errors';
import type { ClassRow } from '../academic.types';
import type { ClassRepository } from '../repositories/class.repository';
import { ClassService } from './class.service';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: 'class-1',
    schoolId: 'school-1',
    name: 'Grade 5',
    gradeLevel: 5,
    displayOrder: 0,
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
  const repo: Mocked<ClassRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    countLiveSections: jest.fn(),
  } as unknown as Mocked<ClassRepository>;
  const svc = new ClassService(prisma as never, repo as never);
  return { svc, prisma, repo };
}

describe('ClassService.create', () => {
  it('creates a class via the repository', async () => {
    const t = makeService();
    t.repo.create.mockResolvedValue(makeRow());
    const row = await t.svc.create({ name: 'Grade 5', gradeLevel: 5 });
    expect(row.id).toBe('class-1');
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Grade 5', gradeLevel: 5 }),
      expect.anything(),
    );
  });
});

describe('ClassService.softDelete', () => {
  it('refuses delete when sections still reference the class', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow());
    t.repo.countLiveSections.mockResolvedValue(3);
    await expect(t.svc.softDelete('class-1', 1)).rejects.toBeInstanceOf(ClassHasSectionsError);
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });

  it('proceeds when no sections remain', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow());
    t.repo.countLiveSections.mockResolvedValue(0);
    t.repo.softDelete.mockResolvedValue(undefined);
    await t.svc.softDelete('class-1', 1);
    expect(t.repo.softDelete).toHaveBeenCalledWith('class-1', 1, expect.anything());
  });

  it('throws NotFound when the class is missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.softDelete('missing', 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws VersionConflict on stale expectedVersion', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ version: 5 }));
    await expect(t.svc.softDelete('class-1', 4)).rejects.toBeInstanceOf(VersionConflict);
  });
});
