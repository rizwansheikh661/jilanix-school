import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import type { ParentService } from '../../parent';
import type { ParentRow, ParentStudentLinkRow } from '../../parent';
import { withTestContext } from '../../request-context';
import type { StudentService } from '../../student';
import type { StudentRow } from '../../student';
import {
  AdmissionAlreadyDecidedError,
  AdmissionNotApprovableError,
  AdmissionNotDeletableError,
  InvalidAdmissionTransitionError,
} from '../admission.errors';
import type { AdmissionRow } from '../admission.types';
import type { AdmissionHistoryRepository } from '../repositories/admission-history.repository';
import type { AdmissionRepository } from '../repositories/admission.repository';
import { AdmissionService } from './admission.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'school-1';

function makeAdmission(overrides: Partial<AdmissionRow> = {}): AdmissionRow {
  return {
    id: 'a-1',
    schoolId: SCHOOL,
    status: 'DRAFT',
    firstName: 'Asha',
    lastName: 'Kumar',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'FEMALE',
    bloodGroup: null,
    targetAcademicYearId: 'ay-1',
    targetClassId: 'c-1',
    targetSectionId: 's-1',
    admissionNo: 'ADM-001',
    rollNo: null,
    fatherName: 'Ravi Kumar',
    fatherPhone: '+91 9999 000 000',
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
    addressLine1: '12 Way',
    addressLine2: null,
    city: 'Pune',
    state: 'MH',
    postalCode: '411001',
    country: 'IN',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    studentId: null,
    parentId: null,
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
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeStudent(): StudentRow {
  return {
    id: 'stu-1',
    schoolId: SCHOOL,
    firstName: 'Asha',
    lastName: 'Kumar',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'FEMALE',
    bloodGroup: null,
    photoUrl: null,
    admissionNo: 'ADM-001',
    rollNo: null,
    academicYearId: 'ay-1',
    classId: 'c-1',
    sectionId: 's-1',
    status: 'ACTIVE',
    admittedOn: new Date(),
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
  };
}

function makeParent(): ParentRow {
  return {
    id: 'par-1',
    schoolId: SCHOOL,
    fatherName: 'Ravi Kumar',
    fatherPhone: '+91 9999 000 000',
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
    addressLine1: '12 Way',
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
  };
}

function makeLink(): ParentStudentLinkRow {
  return {
    id: 'lnk-1',
    schoolId: SCHOOL,
    parentId: 'par-1',
    studentId: 'stu-1',
    relation: 'FATHER',
    isPrimaryContact: true,
    canPickup: true,
    createdAt: new Date(),
    createdBy: null,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<AdmissionRepository> = {
    findById: jest.fn(),
    findByAdmissionNo: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    markSubmitted: jest.fn(),
    markApproved: jest.fn(),
    markRejected: jest.fn(),
    markWithdrawn: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<AdmissionRepository>;
  const historyRepo: Mocked<AdmissionHistoryRepository> = {
    findByAdmission: jest.fn(),
    append: jest.fn().mockResolvedValue({ id: 'h-1' }),
  } as unknown as Mocked<AdmissionHistoryRepository>;
  const studentService = {
    create: jest.fn(),
  } as unknown as Mocked<StudentService>;
  const parentService = {
    create: jest.fn(),
    linkStudent: jest.fn(),
  } as unknown as Mocked<ParentService>;
  const crypto = {
    sealString: jest.fn((s: string) => `sealed:${s}`),
    openString: jest.fn((s: string) => s.replace(/^sealed:/, '')),
    last4: jest.fn((s: string) => s.slice(-4)),
    mask: jest.fn((s: string) => `XXXX-${s.slice(-4)}`),
  };
  const service = new AdmissionService(
    prisma as never,
    repo as unknown as AdmissionRepository,
    historyRepo as unknown as AdmissionHistoryRepository,
    studentService as unknown as StudentService,
    parentService as unknown as ParentService,
    crypto as never,
  );
  return { service, prisma, repo, historyRepo, studentService, parentService, crypto };
}

describe('AdmissionService', () => {
  describe('create', () => {
    it('writes the admission and a DRAFT history row', async () => {
      const { service, repo, historyRepo } = makeService();
      const created = makeAdmission({ id: 'new-1' });
      repo.create.mockResolvedValue(created);
      const result = await service.create({
        firstName: 'Asha',
        lastName: 'Kumar',
        dateOfBirth: new Date('2010-01-01'),
        gender: 'FEMALE',
        targetAcademicYearId: 'ay-1',
        targetClassId: 'c-1',
        targetSectionId: 's-1',
        addressLine1: '12 Way',
        city: 'Pune',
        state: 'MH',
        postalCode: '411001',
      });
      expect(result.id).toBe('new-1');
      expect(historyRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ admissionId: 'new-1', fromStatus: null, toStatus: 'DRAFT' }),
        expect.anything(),
      );
    });
  });

  describe('update', () => {
    it('rejects update when status is not DRAFT', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'SUBMITTED' }));
      await expect(service.update('a-1', 1, { firstName: 'New' })).rejects.toBeInstanceOf(
        InvalidAdmissionTransitionError,
      );
    });

    it('throws version conflict on stale If-Match', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ version: 5 }));
      await expect(service.update('a-1', 1, { firstName: 'New' })).rejects.toBeInstanceOf(
        VersionConflict,
      );
    });
  });

  describe('submit', () => {
    it('promotes DRAFT to SUBMITTED and appends history', async () => {
      const { service, repo, historyRepo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'DRAFT' }));
      repo.markSubmitted.mockResolvedValue(makeAdmission({ status: 'SUBMITTED', version: 2 }));
      const result = await service.submit('a-1', 1);
      expect(result.status).toBe('SUBMITTED');
      expect(historyRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }),
        expect.anything(),
      );
    });

    it('rejects submit on terminal state', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'APPROVED' }));
      await expect(service.submit('a-1', 1)).rejects.toBeInstanceOf(AdmissionAlreadyDecidedError);
    });
  });

  describe('reject', () => {
    it('only accepts reject from SUBMITTED', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'DRAFT' }));
      await expect(service.reject('a-1', 1)).rejects.toBeInstanceOf(
        InvalidAdmissionTransitionError,
      );
    });
  });

  describe('withdraw', () => {
    it('accepts withdraw from DRAFT', async () => {
      const { service, repo, historyRepo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'DRAFT' }));
      repo.markWithdrawn.mockResolvedValue(makeAdmission({ status: 'WITHDRAWN', version: 2 }));
      await withTestContext({ userId: 'u-1', schoolId: SCHOOL }, async () => {
        const result = await service.withdraw('a-1', 1);
        expect(result.status).toBe('WITHDRAWN');
        expect(historyRepo.append).toHaveBeenCalledWith(
          expect.objectContaining({ toStatus: 'WITHDRAWN' }),
          expect.anything(),
        );
      });
    });

    it('accepts withdraw from SUBMITTED', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'SUBMITTED' }));
      repo.markWithdrawn.mockResolvedValue(makeAdmission({ status: 'WITHDRAWN', version: 2 }));
      await withTestContext({ userId: 'u-1', schoolId: SCHOOL }, async () => {
        await expect(service.withdraw('a-1', 1)).resolves.toBeDefined();
      });
    });

    it('refuses withdraw on terminal', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'REJECTED' }));
      await expect(service.withdraw('a-1', 1)).rejects.toBeInstanceOf(
        AdmissionAlreadyDecidedError,
      );
    });
  });

  describe('approve', () => {
    it('composes Parent + Student + Link + Admission update + history in one tx', async () => {
      const { service, prisma, repo, historyRepo, studentService, parentService } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'SUBMITTED' }));
      parentService.create.mockResolvedValue(makeParent());
      studentService.create.mockResolvedValue(makeStudent());
      parentService.linkStudent.mockResolvedValue(makeLink());
      repo.markApproved.mockResolvedValue(
        makeAdmission({
          status: 'APPROVED',
          studentId: 'stu-1',
          parentId: 'par-1',
          version: 2,
        }),
      );
      await withTestContext({ userId: 'u-1', schoolId: SCHOOL }, async () => {
        const result = await service.approve('a-1', 1);
        expect(prisma.transaction).toHaveBeenCalledTimes(1);
        expect(parentService.create).toHaveBeenCalled();
        expect(studentService.create).toHaveBeenCalled();
        expect(parentService.linkStudent).toHaveBeenCalled();
        expect(repo.markApproved).toHaveBeenCalled();
        expect(historyRepo.append).toHaveBeenCalledWith(
          expect.objectContaining({ fromStatus: 'SUBMITTED', toStatus: 'APPROVED' }),
          expect.anything(),
        );
        expect(result.admission.status).toBe('APPROVED');
        expect(result.student.id).toBe('stu-1');
        expect(result.parent.id).toBe('par-1');
        expect(result.link.id).toBe('lnk-1');
      });
    });

    it('refuses approve when admissionNo is missing', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'SUBMITTED', admissionNo: null }));
      await expect(service.approve('a-1', 1)).rejects.toBeInstanceOf(AdmissionNotApprovableError);
    });

    it('refuses approve when not SUBMITTED', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'DRAFT' }));
      await expect(service.approve('a-1', 1)).rejects.toBeInstanceOf(
        InvalidAdmissionTransitionError,
      );
    });

    it('refuses approve on terminal', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'APPROVED' }));
      await expect(service.approve('a-1', 1)).rejects.toBeInstanceOf(
        AdmissionAlreadyDecidedError,
      );
    });
  });

  describe('softDelete', () => {
    it('refuses delete on APPROVED', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'APPROVED' }));
      await expect(service.softDelete('a-1', 1)).rejects.toBeInstanceOf(AdmissionNotDeletableError);
    });

    it('refuses delete on SUBMITTED', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'SUBMITTED' }));
      await expect(service.softDelete('a-1', 1)).rejects.toBeInstanceOf(AdmissionNotDeletableError);
    });

    it('accepts delete on DRAFT', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(makeAdmission({ status: 'DRAFT' }));
      repo.softDelete.mockResolvedValue(undefined);
      await expect(service.softDelete('a-1', 1)).resolves.toBeUndefined();
    });

    it('throws not-found when missing', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(null);
      await expect(service.softDelete('missing', 1)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
