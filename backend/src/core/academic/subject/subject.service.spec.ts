import { SubjectCodeTakenError } from '../academic.errors';
import type { SubjectRow } from '../academic.types';
import type { SubjectRepository } from '../repositories/subject.repository';
import { SubjectService } from './subject.service';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: 'subj-1',
    schoolId: 'school-1',
    name: 'Mathematics',
    code: 'MATH',
    type: 'CORE',
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
  const repo: Mocked<SubjectRepository> = {
    findById: jest.fn(),
    findByCode: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<SubjectRepository>;
  const svc = new SubjectService(prisma as never, repo as never);
  return { svc, prisma, repo };
}

describe('SubjectService.create', () => {
  it('creates when code is free', async () => {
    const t = makeService();
    t.repo.findByCode.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());
    const row = await t.svc.create({ name: 'Math', code: 'MATH', type: 'CORE' });
    expect(row.code).toBe('MATH');
  });

  it('throws SubjectCodeTakenError on duplicate', async () => {
    const t = makeService();
    t.repo.findByCode.mockResolvedValue(makeRow());
    await expect(
      t.svc.create({ name: 'Math', code: 'MATH', type: 'CORE' }),
    ).rejects.toBeInstanceOf(SubjectCodeTakenError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('SubjectService.update', () => {
  it('throws NotFound when missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.update('x', 1, { name: 'New' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws VersionConflict on stale version', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ version: 5 }));
    await expect(t.svc.update('subj-1', 4, { name: 'New' })).rejects.toBeInstanceOf(
      VersionConflict,
    );
  });

  it('rejects code change that collides with another subject', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ code: 'MATH' }));
    t.repo.findByCode.mockResolvedValue(makeRow({ id: 'other', code: 'ENG' }));
    await expect(t.svc.update('subj-1', 1, { code: 'ENG' })).rejects.toBeInstanceOf(
      SubjectCodeTakenError,
    );
  });
});
