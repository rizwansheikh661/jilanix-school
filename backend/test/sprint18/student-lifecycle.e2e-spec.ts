/**
 * Sprint 18 e2e — student-portal lifecycle: suspend → /me/profile 403 →
 * reactivate → /me/profile 200.
 *
 * Mirrors `parent-lifecycle.e2e-spec.ts`. Starts from a seeded ACTIVE
 * StudentUser, exercises the admin suspend / reactivate HTTP path through
 * StudentUserController, and verifies the /me/profile gate on
 * StudentController flips with status.
 */
import { withTestContext } from '../../src/core/request-context';
import { ERROR_CODES } from '../../src/contracts/api';
import type { AcademicYearRepository } from '../../src/core/academic/repositories/academic-year.repository';
import type { ClassRepository } from '../../src/core/academic/repositories/class.repository';
import type { SectionRepository } from '../../src/core/academic/repositories/section.repository';
import type { FeatureFlagService } from '../../src/core/feature-flag/services/feature-flag.service';
import { StudentController } from '../../src/core/student/student/student.controller';
import type { StudentService } from '../../src/core/student/student/student.service';
import { StudentUserController } from '../../src/core/student/student-user/student-user.controller';
import { StudentUserService } from '../../src/core/student/student-user/student-user.service';
import type { StudentRepository } from '../../src/core/student/repositories/student.repository';
import type { StudentUserRepository } from '../../src/core/student/student-user/student-user.repository';
import { StudentOutboxTopics } from '../../src/core/student/student.constants';
import { StudentUserNotActiveError } from '../../src/core/student/student.errors';
import type { StudentInvitationService } from '../../src/core/student/invitation/student-invitation.service';
import type { StudentRow, StudentUserRow } from '../../src/core/student/student.types';

function makeStudent(): StudentRow {
  return {
    id: 's-1',
    schoolId: 'school-1',
    firstName: 'Asha',
    lastName: 'Kumar',
    dateOfBirth: new Date('2012-04-10T00:00:00Z'),
    gender: 'FEMALE',
    bloodGroup: null,
    photoUrl: null,
    admissionNo: 'A-001',
    rollNo: '7',
    academicYearId: 'ay-1',
    classId: 'c-1',
    sectionId: 'se-1',
    status: 'ACTIVE',
    admittedOn: new Date('2026-04-01T00:00:00Z'),
    emergencyContacts: [],
    religion: null,
    category: null,
    nationality: 'IN',
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
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
  };
}

function makeActiveStudentUser(): StudentUserRow {
  return {
    id: 'su-1',
    schoolId: 'school-1',
    studentId: 's-1',
    userId: 'u-student',
    status: 'ACTIVE',
    invitedAt: new Date('2026-06-10T00:00:00Z'),
    activatedAt: new Date('2026-06-12T00:00:00Z'),
    suspendedAt: null,
    archivedAt: null,
    lastInviteAt: new Date('2026-06-10T00:00:00Z'),
    version: 4,
    createdAt: new Date('2026-06-10T00:00:00Z'),
    updatedAt: new Date('2026-06-12T00:00:00Z'),
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
  };
}

function buildSuite() {
  let studentUserRow: StudentUserRow = makeActiveStudentUser();
  const studentRow = makeStudent();
  const outbox: { topic: string; payload: Record<string, unknown> }[] = [];

  const studentRepo: jest.Mocked<Pick<StudentRepository, 'findById'>> = {
    findById: jest.fn(async (id: string) => (id === studentRow.id ? studentRow : null)),
  } as never;

  const studentUserRepo: jest.Mocked<
    Pick<
      StudentUserRepository,
      'findById' | 'findAliveByUserId' | 'findByStudent' | 'updateStatus' | 'create'
    >
  > = {
    findById: jest.fn(async (id: string) =>
      id === studentUserRow.id ? studentUserRow : null,
    ),
    findAliveByUserId: jest.fn(async (userId: string) =>
      userId === studentUserRow.userId ? studentUserRow : null,
    ),
    findByStudent: jest.fn(async () => [studentUserRow]),
    create: jest.fn(),
    updateStatus: jest.fn(async (id, expectedVersion, patch) => {
      if (id !== studentUserRow.id) throw new Error('unknown id');
      if (studentUserRow.version !== expectedVersion) throw new Error('version conflict');
      studentUserRow = {
        ...studentUserRow,
        status: patch.status,
        ...(patch.activatedAt !== undefined ? { activatedAt: patch.activatedAt } : {}),
        ...(patch.suspendedAt !== undefined ? { suspendedAt: patch.suspendedAt } : {}),
        ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
        ...(patch.lastInviteAt !== undefined ? { lastInviteAt: patch.lastInviteAt } : {}),
        version: studentUserRow.version + 1,
        updatedAt: new Date(),
      };
      return studentUserRow;
    }),
  } as never;

  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {},
  };

  const audit = { record: jest.fn().mockResolvedValue({ id: 'a', rowHash: 'h' }) };
  const outboxStub = {
    publish: jest.fn(async (_tx: unknown, e: { topic: string; payload: Record<string, unknown> }) => {
      outbox.push({ topic: e.topic, payload: e.payload });
    }),
  };
  const resetRepo = { cancelOutstandingForUser: jest.fn().mockResolvedValue(0) };

  const studentUsers = new StudentUserService(
    prisma as never,
    studentUserRepo as never,
    outboxStub as never,
    audit as never,
    resetRepo as never,
  );

  const featureFlags: jest.Mocked<Pick<FeatureFlagService, 'isEnabled'>> = {
    isEnabled: jest.fn().mockResolvedValue(true),
  } as never;

  const studentSvc = {
    getById: jest.fn(async (id: string) =>
      id === studentRow.id ? studentRow : (null as never),
    ),
  } as unknown as StudentService;

  // Invitation service required by StudentUserController ctor but not
  // exercised on the suspend/reactivate path.
  const invitations = {} as StudentInvitationService;

  const yearRepo: jest.Mocked<Pick<AcademicYearRepository, 'findById'>> = {
    findById: jest.fn(),
  } as never;
  const classRepo: jest.Mocked<Pick<ClassRepository, 'findById'>> = {
    findById: jest.fn(),
  } as never;
  const sectionRepo: jest.Mocked<Pick<SectionRepository, 'findById'>> = {
    findById: jest.fn(),
  } as never;

  const studentUserController = new StudentUserController(
    invitations,
    studentUsers,
    featureFlags as never,
  );
  const studentController = new StudentController(
    studentSvc,
    studentUsers,
    featureFlags as never,
    yearRepo as never,
    classRepo as never,
    sectionRepo as never,
  );

  // StudentRepository is referenced only to silence lint on unused — keep
  // the binding to mirror the parent test style.
  void studentRepo;

  return {
    studentUserController,
    studentController,
    getStudentUser: () => studentUserRow,
    outbox,
  };
}

describe('Sprint 18 e2e — student lifecycle suspend → /me 403 → reactivate → /me 200', () => {
  it('blocks /me/profile while SUSPENDED and restores access on reactivate', async () => {
    const t = buildSuite();

    // 1. Suspend the active StudentUser.
    const suspended = await withTestContext(
      { schoolId: 'school-1', userId: 'admin-1', actorScope: 'tenant' },
      () =>
        t.studentUserController.suspend(
          's-1',
          'su-1',
          `"${t.getStudentUser().version.toString()}"`,
          { expectedVersion: t.getStudentUser().version, reason: 'fraud-check' },
        ),
    );
    expect(suspended.status).toBe('SUSPENDED');
    expect(t.getStudentUser().status).toBe('SUSPENDED');
    expect(
      t.outbox.some((e) => e.topic === StudentOutboxTopics.LIFECYCLE_SUSPENDED),
    ).toBe(true);

    // 2. Student calls /me/profile — expected to 403 ACCOUNT_SUSPENDED.
    let thrown: unknown;
    try {
      await withTestContext(
        { schoolId: 'school-1', userId: 'u-student', actorScope: 'tenant' },
        () => t.studentController.getMeProfile(),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(StudentUserNotActiveError);
    const dom = thrown as StudentUserNotActiveError;
    expect(dom.code).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS);
    expect(dom.details?.reason).toBe('ACCOUNT_SUSPENDED');

    // 3. Admin reactivates with bumped If-Match.
    const reactivated = await withTestContext(
      { schoolId: 'school-1', userId: 'admin-1', actorScope: 'tenant' },
      () =>
        t.studentUserController.reactivate(
          's-1',
          'su-1',
          `"${t.getStudentUser().version.toString()}"`,
          { expectedVersion: t.getStudentUser().version },
        ),
    );
    expect(reactivated.status).toBe('ACTIVE');
    expect(
      t.outbox.some((e) => e.topic === StudentOutboxTopics.LIFECYCLE_REACTIVATED),
    ).toBe(true);

    // 4. /me/profile now succeeds.
    const profile = await withTestContext(
      { schoolId: 'school-1', userId: 'u-student', actorScope: 'tenant' },
      () => t.studentController.getMeProfile(),
    );
    expect(profile.id).toBe('s-1');
  });
});
