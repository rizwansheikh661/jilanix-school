import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import {
  MaxLinksExceededError,
  ParentContactRequiredError,
  ParentHasActiveLinksError,
  ParentLinkAlreadyExistsError,
} from '../parent.errors';
import type { ParentRow, ParentStudentLinkRow } from '../parent.types';
import { ParentRelationshipService } from '../relationships/parent-relationship.service';
import type { ParentStudentLinkRepository } from '../repositories/parent-student-link.repository';
import type { ParentRepository } from '../repositories/parent.repository';
import { ParentService } from './parent.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeParent(overrides: Partial<ParentRow> = {}): ParentRow {
  return {
    id: 'p-1',
    schoolId: 'school-1',
    fatherName: 'A',
    fatherPhone: '+1 555 0100',
    fatherEmail: null,
    fatherOccupation: null,
    motherName: null,
    motherPhone: null,
    motherEmail: null,
    motherOccupation: null,
    guardianName: null,
    guardianPhone: null,
    guardianEmail: null,
    guardianOccupation: null,
    guardianRelation: null,
    addressLine1: '1 Way',
    addressLine2: null,
    city: 'Pune',
    state: 'MH',
    postalCode: '411001',
    country: 'IN',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeLink(overrides: Partial<ParentStudentLinkRow> = {}): ParentStudentLinkRow {
  return {
    id: 'l-1',
    schoolId: 'school-1',
    parentId: 'p-1',
    studentId: 's-1',
    relation: 'FATHER',
    isPrimaryContact: false,
    canPickup: true,
    createdAt: new Date(),
    createdBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<ParentRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    studentExists: jest.fn().mockResolvedValue(true),
  } as unknown as Mocked<ParentRepository>;
  const linkRepo: Mocked<ParentStudentLinkRepository> = {
    findById: jest.fn(),
    findExisting: jest.fn(),
    findByStudent: jest.fn(),
    findByParent: jest.fn(),
    countActiveLinksForParent: jest.fn(),
    create: jest.fn(),
    demotePrimaryContact: jest.fn(),
    delete: jest.fn(),
  } as unknown as Mocked<ParentStudentLinkRepository>;
  const svc = new ParentService(
    prisma as never,
    repo as never,
    linkRepo as never,
    new ParentRelationshipService(linkRepo as never),
  );
  return { svc, prisma, repo, linkRepo };
}

const baseAddress = {
  addressLine1: '1 Way',
  city: 'Pune',
  state: 'MH',
  postalCode: '411001',
};

describe('ParentService.create', () => {
  it('requires at least one phone contact', async () => {
    const t = makeService();
    await expect(t.svc.create({ ...baseAddress })).rejects.toBeInstanceOf(
      ParentContactRequiredError,
    );
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('creates when fatherPhone is set', async () => {
    const t = makeService();
    t.repo.create.mockResolvedValue(makeParent());
    const out = await t.svc.create({ ...baseAddress, fatherPhone: '+1 555 0100' });
    expect(out.id).toBe('p-1');
  });
});

describe('ParentService.update', () => {
  it('rejects clearing all phones', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    await expect(
      t.svc.update('p-1', 1, { fatherPhone: null }),
    ).rejects.toBeInstanceOf(ParentContactRequiredError);
  });

  it('throws VersionConflict on stale version', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent({ version: 5 }));
    await expect(t.svc.update('p-1', 4, { city: 'Mumbai' })).rejects.toBeInstanceOf(
      VersionConflict,
    );
  });
});

describe('ParentService.softDelete', () => {
  it('refuses while active links exist', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.linkRepo.countActiveLinksForParent.mockResolvedValue(2);
    await expect(t.svc.softDelete('p-1', 1)).rejects.toBeInstanceOf(ParentHasActiveLinksError);
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });

  it('proceeds when no links', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.linkRepo.countActiveLinksForParent.mockResolvedValue(0);
    await t.svc.softDelete('p-1', 1);
    expect(t.repo.softDelete).toHaveBeenCalledWith('p-1', 1, expect.anything());
  });
});

describe('ParentService.linkStudent', () => {
  it('throws NotFound for missing parent', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      t.svc.linkStudent('p-1', { studentId: 's-1', relation: 'FATHER' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFound for missing student', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.repo.studentExists.mockResolvedValue(false);
    await expect(
      t.svc.linkStudent('p-1', { studentId: 's-1', relation: 'FATHER' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ParentLinkAlreadyExistsError on duplicate slot', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.linkRepo.findExisting.mockResolvedValue(makeLink());
    await expect(
      t.svc.linkStudent('p-1', { studentId: 's-1', relation: 'FATHER' }),
    ).rejects.toBeInstanceOf(ParentLinkAlreadyExistsError);
  });

  it('throws MaxLinksExceededError when student already has 3 parents', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.linkRepo.findExisting.mockResolvedValue(null);
    t.linkRepo.findByStudent.mockResolvedValue([
      makeLink({ id: 'l1', relation: 'FATHER' }),
      makeLink({ id: 'l2', relation: 'MOTHER' }),
      makeLink({ id: 'l3', relation: 'GUARDIAN' }),
    ]);
    await expect(
      t.svc.linkStudent('p-1', { studentId: 's-1', relation: 'GUARDIAN' }),
    ).rejects.toBeInstanceOf(MaxLinksExceededError);
  });

  it('demotes existing primary when wantsPrimary is true', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.linkRepo.findExisting.mockResolvedValue(null);
    t.linkRepo.findByStudent.mockResolvedValue([makeLink({ isPrimaryContact: true })]);
    t.linkRepo.create.mockResolvedValue(makeLink({ id: 'l-2', isPrimaryContact: true }));
    await t.svc.linkStudent('p-1', {
      studentId: 's-1',
      relation: 'MOTHER',
      isPrimaryContact: true,
    });
    expect(t.linkRepo.demotePrimaryContact).toHaveBeenCalledWith('s-1', expect.anything());
  });

  it('promotes first link to primary automatically', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParent());
    t.linkRepo.findExisting.mockResolvedValue(null);
    t.linkRepo.findByStudent.mockResolvedValue([]);
    t.linkRepo.create.mockResolvedValue(makeLink({ isPrimaryContact: true }));
    await t.svc.linkStudent('p-1', { studentId: 's-1', relation: 'FATHER' });
    expect(t.linkRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimaryContact: true }),
      expect.anything(),
    );
  });

  it('invokes RelationshipService.validateLink before linkRepo.create', async () => {
    // Sprint 17 W8 — pin the call ordering: validation must complete
    // before the write, otherwise the cap / primary-contact invariants
    // could be bypassed when validateLink throws.
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    const repo = {
      findById: jest.fn().mockResolvedValue(makeParent()),
      studentExists: jest.fn().mockResolvedValue(true),
    };
    const linkRepo = {
      findById: jest.fn(),
      findExisting: jest.fn().mockResolvedValue(null),
      findByStudent: jest.fn().mockResolvedValue([]),
      findByParent: jest.fn(),
      countActiveLinksForParent: jest.fn(),
      create: jest.fn().mockResolvedValue(makeLink({ isPrimaryContact: true })),
      demotePrimaryContact: jest.fn(),
      delete: jest.fn(),
    };
    const relationships = new ParentRelationshipService(linkRepo as never);
    const validateSpy = jest.spyOn(relationships, 'validateLink');
    const calls: string[] = [];
    validateSpy.mockImplementation(async () => {
      calls.push('validateLink');
    });
    linkRepo.create.mockImplementation(async () => {
      calls.push('create');
      return makeLink({ isPrimaryContact: true });
    });
    const svc = new ParentService(
      prisma as never,
      repo as never,
      linkRepo as never,
      relationships,
    );
    await svc.linkStudent('p-1', { studentId: 's-1', relation: 'FATHER' });
    expect(calls).toEqual(['validateLink', 'create']);
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });
});
