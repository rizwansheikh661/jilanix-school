import { NotFoundError } from '../../errors/domain-error';
import {
  SectionSubjectReplacesNotInClassError,
  SectionSubjectReplacesRequiredError,
  SectionSubjectReplacesUnexpectedError,
} from '../academic.errors';
import type { SectionRow, SectionSubjectRow, SubjectRow } from '../academic.types';
import type { ClassSubjectRepository } from '../repositories/class-subject.repository';
import type { SectionRepository } from '../repositories/section.repository';
import type { SectionSubjectRepository } from '../repositories/section-subject.repository';
import type { SubjectRepository } from '../repositories/subject.repository';
import { SectionSubjectService } from './section-subject.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeSectionRow(): SectionRow {
  return {
    id: 'section-1',
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
  };
}

function makeSubjectRow(id: string): SubjectRow {
  return {
    id,
    schoolId: 'school-1',
    name: id.toUpperCase(),
    code: id.toUpperCase(),
    type: 'CORE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
  };
}

function makeOverride(overrides: Partial<SectionSubjectRow> = {}): SectionSubjectRow {
  return {
    id: 'ovr-1',
    schoolId: 'school-1',
    sectionId: 'section-1',
    subjectId: 's-new',
    mode: 'ADD',
    replacesSubjectId: null,
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
  const repo: Mocked<SectionSubjectRepository> = {
    findById: jest.fn(),
    findAllForSection: jest.fn(),
    create: jest.fn(),
    deleteById: jest.fn(),
  } as unknown as Mocked<SectionSubjectRepository>;
  const sectionRepo: Mocked<SectionRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<SectionRepository>;
  const subjectRepo: Mocked<SubjectRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<SubjectRepository>;
  const classSubjectRepo: Mocked<ClassSubjectRepository> = {
    listSubjectIdsForClass: jest.fn(),
  } as unknown as Mocked<ClassSubjectRepository>;
  const svc = new SectionSubjectService(
    prisma as never,
    repo as never,
    sectionRepo as never,
    subjectRepo as never,
    classSubjectRepo as never,
  );
  return { svc, prisma, repo, sectionRepo, subjectRepo, classSubjectRepo };
}

describe('SectionSubjectService.create', () => {
  it('rejects REPLACE without replacesSubjectId', async () => {
    const t = makeService();
    await expect(
      t.svc.create({ sectionId: 'section-1', subjectId: 's-new', mode: 'REPLACE' }),
    ).rejects.toBeInstanceOf(SectionSubjectReplacesRequiredError);
  });

  it('rejects ADD with replacesSubjectId', async () => {
    const t = makeService();
    await expect(
      t.svc.create({
        sectionId: 'section-1',
        subjectId: 's-new',
        mode: 'ADD',
        replacesSubjectId: 's-old',
      }),
    ).rejects.toBeInstanceOf(SectionSubjectReplacesUnexpectedError);
  });

  it('throws NotFound when section missing', async () => {
    const t = makeService();
    t.sectionRepo.findById.mockResolvedValue(null);
    await expect(
      t.svc.create({ sectionId: 'section-1', subjectId: 's-new', mode: 'ADD' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects REPLACE when replacesSubjectId is not a class default', async () => {
    const t = makeService();
    t.sectionRepo.findById.mockResolvedValue(makeSectionRow());
    t.subjectRepo.findById.mockResolvedValueOnce(makeSubjectRow('s-new'));
    t.subjectRepo.findById.mockResolvedValueOnce(makeSubjectRow('s-old'));
    t.classSubjectRepo.listSubjectIdsForClass.mockResolvedValue(['s-different']);
    await expect(
      t.svc.create({
        sectionId: 'section-1',
        subjectId: 's-new',
        mode: 'REPLACE',
        replacesSubjectId: 's-old',
      }),
    ).rejects.toBeInstanceOf(SectionSubjectReplacesNotInClassError);
  });

  it('creates ADD override when valid', async () => {
    const t = makeService();
    t.sectionRepo.findById.mockResolvedValue(makeSectionRow());
    t.subjectRepo.findById.mockResolvedValue(makeSubjectRow('s-new'));
    t.repo.create.mockResolvedValue(makeOverride());
    const row = await t.svc.create({
      sectionId: 'section-1',
      subjectId: 's-new',
      mode: 'ADD',
    });
    expect(row.mode).toBe('ADD');
  });
});

describe('SectionSubjectService.listEffective', () => {
  it('applies ADD / REMOVE / REPLACE in order over class defaults', async () => {
    const t = makeService();
    t.sectionRepo.findById.mockResolvedValue(makeSectionRow());
    t.classSubjectRepo.listSubjectIdsForClass.mockResolvedValue(['math', 'sci', 'hist']);
    t.repo.findAllForSection.mockResolvedValue([
      makeOverride({ id: 'a', mode: 'REMOVE', subjectId: 'hist' }),
      makeOverride({
        id: 'b',
        mode: 'REPLACE',
        subjectId: 'phys',
        replacesSubjectId: 'sci',
      }),
      makeOverride({ id: 'c', mode: 'ADD', subjectId: 'art' }),
    ]);

    const result = await t.svc.listEffective('section-1');
    expect(result.classId).toBe('class-1');
    expect([...result.subjectIds].sort()).toEqual(['art', 'math', 'phys']);
  });

  it('throws NotFound when section missing', async () => {
    const t = makeService();
    t.sectionRepo.findById.mockResolvedValue(null);
    await expect(t.svc.listEffective('section-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('SectionSubjectService.delete', () => {
  it('throws NotFound when override missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.delete('ovr-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes when override exists', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeOverride());
    await t.svc.delete('ovr-1');
    expect(t.repo.deleteById).toHaveBeenCalledWith('ovr-1', expect.anything());
  });
});
