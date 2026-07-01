/**
 * Sprint 16 unit — StudentService enforcement wiring.
 *
 * Asserts:
 *   1. StudentService.create calls guard.assertAndConsume('student_count', 1)
 *      *inside* the create tx and skips when there is no schoolId in context.
 *   2. StudentService.softDelete calls guard.releaseUsage('student_count', 1).
 */
import type { StudentRepository } from '../../src/core/student/repositories/student.repository';
import { RequestContextRegistry } from '../../src/core/request-context';
import { StudentService } from '../../src/core/student/student/student.service';
import type { StudentRow } from '../../src/core/student/student.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(over: Partial<StudentRow> = {}): StudentRow {
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
    ...over,
  };
}

function build() {
  let txSeen: unknown = null;
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { __marker: 'tx' };
      txSeen = tx;
      return fn(tx);
    }),
  };
  const repo: Mocked<StudentRepository> = {
    findById: jest.fn(),
    findByAdmissionNo: jest.fn().mockResolvedValue(null),
    findRollClash: jest.fn().mockResolvedValue(null),
    findMany: jest.fn(),
    create: jest.fn().mockResolvedValue(makeRow()),
    update: jest.fn(),
    setStatus: jest.fn(),
    setRollNo: jest.fn(),
    softDelete: jest.fn().mockResolvedValue(undefined),
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

  const svc = new StudentService(
    prisma as never,
    repo as never,
    crypto as never,
    guard as never,
  );

  return {
    svc,
    repo,
    guard,
    getTx: () => txSeen,
  };
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
  emergencyContacts: [{ name: 'Mum', phone: '+1 555 0100', relation: 'Mother' as const }],
};

function inTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: 'school-1',
    userId: 'u-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function inPlatformCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ actorScope: 'global' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 16 — StudentService enforcement', () => {
  it('create consumes student_count inside the create tx, skips when no schoolId in context', async () => {
    const t = build();
    await inTenantCtx(() => t.svc.create(sampleCreate));

    expect(t.repo.create).toHaveBeenCalledTimes(1);
    expect(t.guard.assertAndConsume).toHaveBeenCalledTimes(1);
    const args = t.guard.assertAndConsume.mock.calls[0] as unknown[];
    expect(args[0]).toBe('school-1');
    expect(args[1]).toBe('student_count');
    expect(args[2]).toBe(1);
    expect(args[3]).toBe('student:stu-1');
    expect(args[4]).toBe(t.getTx());

    const platform = build();
    await inPlatformCtx(() => platform.svc.create(sampleCreate));
    expect(platform.repo.create).toHaveBeenCalledTimes(1);
    expect(platform.guard.assertAndConsume).not.toHaveBeenCalled();
  });

  it('softDelete releases student_count inside the delete tx', async () => {
    const t = build();
    t.repo.findById.mockResolvedValue(makeRow());
    await inTenantCtx(() => t.svc.softDelete('stu-1', 1));

    expect(t.repo.softDelete).toHaveBeenCalledTimes(1);
    expect(t.guard.releaseUsage).toHaveBeenCalledTimes(1);
    const args = t.guard.releaseUsage.mock.calls[0] as unknown[];
    expect(args[0]).toBe('school-1');
    expect(args[1]).toBe('student_count');
    expect(args[2]).toBe(1);
    expect(args[3]).toBe('student:stu-1');
    expect(args[4]).toBe(t.getTx());
  });
});
