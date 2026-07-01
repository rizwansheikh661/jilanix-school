import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import {
  AdmissionNumberTakenError,
  PlacementInvalidError,
  RollNumberTakenError,
  StudentInactiveError,
} from '../student.errors';
import type { StudentRow } from '../student.types';
import type { StudentRepository } from '../repositories/student.repository';
import { StudentService } from './student.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 'stu-1',
    schoolId: 'school-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'FEMALE',
    bloodGroup: null,
    photoUrl: null,
    admissionNo: 'A-001',
    rollNo: null,
    academicYearId: 'year-1',
    classId: 'class-1',
    sectionId: 'section-1',
    status: 'ACTIVE',
    admittedOn: new Date('2026-04-01'),
    emergencyContacts: [],
    religion: null,
    category: null,
    nationality: 'Indian',
    motherTongue: null,
    aadhaarLast4: null,
    apaarId: null,
    isCwsn: false,
    disabilityType: null,
    isRte: false,
    isMinority: false,
    minorityCommunity: null,
    isBpl: false,
    previousSchoolName: null,
    previousSchoolTcNo: null,
    previousSchoolTcDate: null,
    admissionType: null,
    placeOfBirth: null,
    birthCertNo: null,
    houseId: null,
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
  const repo: Mocked<StudentRepository> = {
    findById: jest.fn(),
    findByAdmissionNo: jest.fn(),
    findRollClash: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    setRollNo: jest.fn(),
    softDelete: jest.fn(),
    academicYearExists: jest.fn().mockResolvedValue(true),
    classExists: jest.fn().mockResolvedValue(true),
    sectionBelongsToClass: jest.fn().mockResolvedValue('ok'),
  } as unknown as Mocked<StudentRepository>;
  const crypto = {
    sealString: jest.fn((s: string) => `sealed:${s}`),
    openString: jest.fn((s: string) => s.replace(/^sealed:/, '')),
    last4: jest.fn((s: string) => s.slice(-4)),
    mask: jest.fn((s: string) => `XXXX-${s.slice(-4)}`),
  };
  const guard = {
    assertAndConsume: jest.fn(async () => ({})),
    releaseUsage: jest.fn(async () => undefined),
    assertMutationAllowed: jest.fn(async () => undefined),
  };
  const svc = new StudentService(prisma as never, repo as never, crypto as never, guard as never);
  return { svc, prisma, repo, crypto, guard };
}

const sampleCreate = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('2010-01-01'),
  gender: 'FEMALE' as const,
  admissionNo: 'A-001',
  academicYearId: 'year-1',
  classId: 'class-1',
  sectionId: 'section-1',
  admittedOn: new Date('2026-04-01'),
  emergencyContacts: [{ name: 'Mum', phone: '+1 555 0100', relation: 'Mother' }],
};

describe('StudentService.create', () => {
  it('creates when placement and identifiers are free', async () => {
    const t = makeService();
    t.repo.findByAdmissionNo.mockResolvedValue(null);
    t.repo.findRollClash.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeRow());
    const row = await t.svc.create(sampleCreate);
    expect(row.admissionNo).toBe('A-001');
    expect(t.repo.create).toHaveBeenCalledTimes(1);
  });

  it('throws PlacementInvalidError when academic year is missing', async () => {
    const t = makeService();
    t.repo.academicYearExists.mockResolvedValue(false);
    await expect(t.svc.create(sampleCreate)).rejects.toBeInstanceOf(PlacementInvalidError);
  });

  it('throws PlacementInvalidError when section does not belong to class', async () => {
    const t = makeService();
    t.repo.sectionBelongsToClass.mockResolvedValue('mismatch');
    await expect(t.svc.create(sampleCreate)).rejects.toBeInstanceOf(PlacementInvalidError);
  });

  it('throws AdmissionNumberTakenError on duplicate admission number', async () => {
    const t = makeService();
    t.repo.findByAdmissionNo.mockResolvedValue(makeRow({ id: 'other' }));
    await expect(t.svc.create(sampleCreate)).rejects.toBeInstanceOf(
      AdmissionNumberTakenError,
    );
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('throws RollNumberTakenError when rollNo already used', async () => {
    const t = makeService();
    t.repo.findByAdmissionNo.mockResolvedValue(null);
    t.repo.findRollClash.mockResolvedValue(makeRow({ id: 'other', rollNo: '7' }));
    await expect(
      t.svc.create({ ...sampleCreate, rollNo: '7' }),
    ).rejects.toBeInstanceOf(RollNumberTakenError);
  });
});

describe('StudentService.update', () => {
  it('throws NotFound when missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.update('x', 1, { firstName: 'Z' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws VersionConflict on stale version', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ version: 5 }));
    await expect(t.svc.update('stu-1', 4, { firstName: 'Z' })).rejects.toBeInstanceOf(
      VersionConflict,
    );
  });

  it('re-validates placement when section is changed', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow());
    t.repo.sectionBelongsToClass.mockResolvedValue('mismatch');
    await expect(
      t.svc.update('stu-1', 1, { sectionId: 'other-section' }),
    ).rejects.toBeInstanceOf(PlacementInvalidError);
  });
});

describe('StudentService.deactivate / reactivate', () => {
  it('flips ACTIVE -> INACTIVE', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'ACTIVE' }));
    t.repo.setStatus.mockResolvedValue(makeRow({ status: 'INACTIVE', version: 2 }));
    const out = await t.svc.deactivate('stu-1', 1);
    expect(out.status).toBe('INACTIVE');
    expect(t.repo.setStatus).toHaveBeenCalledWith('stu-1', 1, 'INACTIVE', expect.anything());
  });

  it('refuses to deactivate a non-active student', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'GRADUATED' }));
    await expect(t.svc.deactivate('stu-1', 1)).rejects.toBeInstanceOf(StudentInactiveError);
  });

  it('refuses to reactivate a non-inactive student', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'ACTIVE' }));
    await expect(t.svc.reactivate('stu-1', 1)).rejects.toBeInstanceOf(StudentInactiveError);
  });
});

describe('StudentService.assignRoll', () => {
  it('rejects roll-number clashes within same section/year', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow());
    t.repo.findRollClash.mockResolvedValue(makeRow({ id: 'other', rollNo: '7' }));
    await expect(t.svc.assignRoll('stu-1', 1, '7')).rejects.toBeInstanceOf(
      RollNumberTakenError,
    );
  });

  it('clears the roll number when null', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeRow({ rollNo: '7', version: 2 }));
    t.repo.setRollNo.mockResolvedValue(makeRow({ rollNo: null, version: 3 }));
    const out = await t.svc.assignRoll('stu-1', 2, null);
    expect(out.rollNo).toBeNull();
    expect(t.repo.findRollClash).not.toHaveBeenCalled();
  });
});
