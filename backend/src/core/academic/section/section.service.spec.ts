import { SectionTeacherNotEligibleError } from '../academic.errors';
import type { SectionRow } from '../academic.types';
import type { SectionRepository } from '../repositories/section.repository';
import { SectionService } from './section.service';
import {
  NotFoundError,
  ValidationFailedError,
  VersionConflict,
} from '../../errors/domain-error';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<SectionRow> = {}): SectionRow {
  return {
    id: 'sec-1',
    schoolId: 'school-1',
    classId: 'class-1',
    name: 'A',
    capacity: 40,
    classTeacherId: null,
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
  const repo: Mocked<SectionRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setClassTeacher: jest.fn(),
    softDelete: jest.fn(),
    classExists: jest.fn(),
    classifyTeacher: jest.fn(),
  } as unknown as Mocked<SectionRepository>;
  const svc = new SectionService(prisma as never, repo as never);
  return { svc, prisma, repo };
}

describe('SectionService.create', () => {
  it('refuses creation when parent class is missing', async () => {
    const t = makeService();
    t.repo.classExists.mockResolvedValue(false);
    await expect(
      t.svc.create({ classId: 'missing', name: 'A' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('refuses ineligible teacher (not found)', async () => {
    const t = makeService();
    t.repo.classExists.mockResolvedValue(true);
    t.repo.classifyTeacher.mockResolvedValue('not_found');
    await expect(
      t.svc.create({ classId: 'class-1', name: 'A', classTeacherId: 'ghost' }),
    ).rejects.toBeInstanceOf(SectionTeacherNotEligibleError);
  });

  it('creates with valid teacher', async () => {
    const t = makeService();
    t.repo.classExists.mockResolvedValue(true);
    t.repo.classifyTeacher.mockResolvedValue('ok');
    t.repo.create.mockResolvedValue(makeRow({ classTeacherId: 'user-99' }));
    const row = await t.svc.create({ classId: 'class-1', name: 'A', classTeacherId: 'user-99' });
    expect(row.classTeacherId).toBe('user-99');
  });

  it('rejects non-positive capacity', async () => {
    const t = makeService();
    await expect(
      t.svc.create({ classId: 'class-1', name: 'A', capacity: 0 }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe('SectionService.assignClassTeacher', () => {
  it('clears the teacher when null is passed', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ classTeacherId: 'user-9' }));
    t.repo.setClassTeacher.mockResolvedValue(makeRow({ classTeacherId: null, version: 2 }));
    const row = await t.svc.assignClassTeacher('sec-1', 1, null);
    expect(row.classTeacherId).toBeNull();
    expect(t.repo.classifyTeacher).not.toHaveBeenCalled();
  });

  it('rejects on stale version', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ version: 5 }));
    await expect(t.svc.assignClassTeacher('sec-1', 4, null)).rejects.toBeInstanceOf(
      VersionConflict,
    );
  });

  it('throws NotFound when the section is missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.assignClassTeacher('missing', 1, null)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
