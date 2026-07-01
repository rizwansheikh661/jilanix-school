import { NotFoundError, ValidationFailedError } from '../../errors/domain-error';
import type { ClassRow, ClassSubjectRow, SubjectRow } from '../academic.types';
import type { ClassRepository } from '../repositories/class.repository';
import type { ClassSubjectRepository } from '../repositories/class-subject.repository';
import type { SubjectRepository } from '../repositories/subject.repository';
import { ClassSubjectService } from './class-subject.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeClassRow(): ClassRow {
  return {
    id: 'class-1',
    schoolId: 'school-1',
    name: 'Grade 1',
    gradeLevel: 1,
    displayOrder: 1,
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

function makeClassSubjectRow(subjectId: string): ClassSubjectRow {
  return {
    id: `cs-${subjectId}`,
    schoolId: 'school-1',
    classId: 'class-1',
    subjectId,
    isOptional: false,
    weeklyPeriods: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<ClassSubjectRepository> = {
    findAllForClass: jest.fn(),
    replaceForClass: jest.fn(),
    listSubjectIdsForClass: jest.fn(),
  } as unknown as Mocked<ClassSubjectRepository>;
  const classRepo: Mocked<ClassRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<ClassRepository>;
  const subjectRepo: Mocked<SubjectRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<SubjectRepository>;
  const svc = new ClassSubjectService(
    prisma as never,
    repo as never,
    classRepo as never,
    subjectRepo as never,
  );
  return { svc, prisma, repo, classRepo, subjectRepo };
}

describe('ClassSubjectService.setForClass', () => {
  it('rejects duplicate subject ids in input', async () => {
    const t = makeService();
    await expect(
      t.svc.setForClass({
        classId: 'class-1',
        subjects: [{ subjectId: 's-1' }, { subjectId: 's-1' }],
      }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('throws NotFound when class missing', async () => {
    const t = makeService();
    t.classRepo.findById.mockResolvedValue(null);
    await expect(
      t.svc.setForClass({ classId: 'class-1', subjects: [{ subjectId: 's-1' }] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFound when any subject missing', async () => {
    const t = makeService();
    t.classRepo.findById.mockResolvedValue(makeClassRow());
    t.subjectRepo.findById.mockResolvedValueOnce(makeSubjectRow('s-1'));
    t.subjectRepo.findById.mockResolvedValueOnce(null);
    await expect(
      t.svc.setForClass({
        classId: 'class-1',
        subjects: [{ subjectId: 's-1' }, { subjectId: 's-2' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('replaces the set when all inputs are valid', async () => {
    const t = makeService();
    t.classRepo.findById.mockResolvedValue(makeClassRow());
    t.subjectRepo.findById.mockResolvedValueOnce(makeSubjectRow('s-1'));
    t.subjectRepo.findById.mockResolvedValueOnce(makeSubjectRow('s-2'));
    t.repo.replaceForClass.mockResolvedValue([
      makeClassSubjectRow('s-1'),
      makeClassSubjectRow('s-2'),
    ]);
    const rows = await t.svc.setForClass({
      classId: 'class-1',
      subjects: [{ subjectId: 's-1' }, { subjectId: 's-2' }],
    });
    expect(rows).toHaveLength(2);
    expect(t.repo.replaceForClass).toHaveBeenCalledWith(
      'class-1',
      [{ subjectId: 's-1' }, { subjectId: 's-2' }],
      expect.anything(),
    );
  });

  it('accepts an empty set (drops all subjects from the class)', async () => {
    const t = makeService();
    t.classRepo.findById.mockResolvedValue(makeClassRow());
    t.repo.replaceForClass.mockResolvedValue([]);
    const rows = await t.svc.setForClass({ classId: 'class-1', subjects: [] });
    expect(rows).toHaveLength(0);
  });
});

describe('ClassSubjectService.list', () => {
  it('throws NotFound when class missing', async () => {
    const t = makeService();
    t.classRepo.findById.mockResolvedValue(null);
    await expect(t.svc.list('class-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns rows from repo', async () => {
    const t = makeService();
    t.classRepo.findById.mockResolvedValue(makeClassRow());
    t.repo.findAllForClass.mockResolvedValue([makeClassSubjectRow('s-1')]);
    const rows = await t.svc.list('class-1');
    expect(rows).toHaveLength(1);
  });
});
