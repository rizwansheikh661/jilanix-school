/**
 * StudentInvitationService specs — Sprint 18 W8.
 *
 * Covers the two assertions called out in the Sprint 18 test plan:
 *   - `invite()` creates User + StudentUser + NotificationUserPreference +
 *     outbox row atomically.
 *   - Activation handler flips StudentUser → ACTIVE on the
 *     `provisioning.password.first_login.completed` outbox event.
 */
import { withTestContext } from '../../src/core/request-context';
import type { PasswordService } from '../../src/core/auth/password/password.service';
import type { PasswordResetService } from '../../src/core/provisioning/password-reset/password-reset.service';
import type { StudentRepository } from '../../src/core/student/repositories/student.repository';
import { StudentOutboxTopics } from '../../src/core/student/student.constants';
import type { StudentRow, StudentUserRow } from '../../src/core/student/student.types';
import type { StudentUserService } from '../../src/core/student/student-user/student-user.service';
import { StudentActivationOutboxHandler } from '../../src/core/student/invitation/student-activation.outbox-handler';
import { StudentInvitationService } from '../../src/core/student/invitation/student-invitation.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeStudent(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 's-1',
    schoolId: 'school-1',
    firstName: 'Asha',
    lastName: 'K',
    dateOfBirth: new Date('2012-04-10T00:00:00Z'),
    gender: 'FEMALE',
    bloodGroup: null,
    photoUrl: null,
    admissionNo: 'A-001',
    rollNo: null,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeStudentUser(overrides: Partial<StudentUserRow> = {}): StudentUserRow {
  return {
    id: 'su-1',
    schoolId: 'school-1',
    studentId: 's-1',
    userId: 'u-1',
    status: 'PENDING_INVITE',
    invitedAt: new Date('2026-06-01T00:00:00Z'),
    activatedAt: null,
    suspendedAt: null,
    archivedAt: null,
    lastInviteAt: new Date('2026-06-01T00:00:00Z'),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeFakeTx() {
  const calls = {
    userFindFirst: jest.fn().mockResolvedValue(null),
    userCreate: jest.fn().mockResolvedValue({}),
    userPasswordCreate: jest.fn().mockResolvedValue({}),
    studentUserFindFirst: jest.fn().mockResolvedValue(null),
    notificationPrefCreate: jest.fn().mockResolvedValue({}),
  };
  const tx = {
    user: { findFirst: calls.userFindFirst, create: calls.userCreate },
    userPassword: { create: calls.userPasswordCreate },
    studentUser: { findFirst: calls.studentUserFindFirst },
    notificationUserPreference: { create: calls.notificationPrefCreate },
  };
  return { tx, calls };
}

function makeService() {
  const { tx, calls } = makeFakeTx();
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  const studentRepo: Mocked<StudentRepository> = {
    findById: jest.fn().mockResolvedValue(makeStudent()),
  } as unknown as Mocked<StudentRepository>;
  const studentUsers: Mocked<StudentUserService> = {
    createInvited: jest.fn().mockResolvedValue(makeStudentUser()),
    markReinvited: jest.fn().mockResolvedValue(makeStudentUser()),
  } as unknown as Mocked<StudentUserService>;
  const passwords: Mocked<PasswordService> = {
    hash: jest.fn().mockResolvedValue({
      passwordHash: 'argon2id$decoy',
      algorithm: 'argon2id',
      params: {},
      pepperVersion: 1,
    }),
  } as unknown as Mocked<PasswordService>;
  const passwordReset: Mocked<PasswordResetService> = {
    request: jest.fn().mockResolvedValue({
      accepted: true,
      clearTextToken: 'tok',
      tokenExpiresAt: new Date('2026-06-08T00:00:00Z').toISOString(),
      userId: 'u-1',
    }),
  } as unknown as Mocked<PasswordResetService>;
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'a', rowHash: 'h' }) };

  const svc = new StudentInvitationService(
    prisma as never,
    studentRepo as never,
    studentUsers as never,
    passwords as never,
    passwordReset as never,
    outbox as never,
    audit as never,
  );
  return {
    svc,
    prisma,
    studentRepo,
    studentUsers,
    passwords,
    passwordReset,
    outbox,
    audit,
    txCalls: calls,
  };
}

describe('StudentInvitationService.invite', () => {
  it('creates User + StudentUser + NotificationUserPreference + outbox row atomically', async () => {
    const t = makeService();
    await withTestContext({ schoolId: 'school-1', userId: 'admin' }, async () => {
      await t.svc.invite({
        studentId: 's-1',
        email: 'kid@example.com',
        displayName: 'Asha K',
      });
    });

    expect(t.txCalls.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'kid@example.com',
          status: 'invited',
          mustChangePassword: true,
        }),
      }),
    );
    expect(t.txCalls.userPasswordCreate).toHaveBeenCalled();
    expect(t.studentUsers.createInvited).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's-1' }),
      expect.anything(),
    );
    expect(t.txCalls.notificationPrefCreate).toHaveBeenCalled();
    expect(t.passwordReset.request).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        email: 'kid@example.com',
        ttlMs: 7 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.INVITED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'student_user.invite' }),
      expect.anything(),
    );
  });

  it('on re-invite, reuses existing PENDING_INVITE row and emits REINVITED', async () => {
    const t = makeService();
    t.txCalls.userFindFirst.mockResolvedValue({ id: 'u-1', status: 'invited' });
    t.txCalls.studentUserFindFirst.mockResolvedValue({
      id: 'su-1',
      version: 2,
      status: 'PENDING_INVITE',
    });
    await withTestContext({ schoolId: 'school-1', userId: 'admin' }, async () => {
      await t.svc.invite({
        studentId: 's-1',
        email: 'kid@example.com',
        displayName: 'Asha K',
      });
    });
    expect(t.studentUsers.markReinvited).toHaveBeenCalledWith(
      'su-1',
      2,
      expect.any(Date),
      expect.anything(),
    );
    expect(t.studentUsers.createInvited).not.toHaveBeenCalled();
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.REINVITED }),
    );
  });

  it('refuses re-invite when the existing link is ACTIVE', async () => {
    const t = makeService();
    t.txCalls.userFindFirst.mockResolvedValue({ id: 'u-1', status: 'active' });
    t.txCalls.studentUserFindFirst.mockResolvedValue({
      id: 'su-1',
      version: 5,
      status: 'ACTIVE',
    });
    await withTestContext({ schoolId: 'school-1', userId: 'admin' }, async () => {
      await expect(
        t.svc.invite({
          studentId: 's-1',
          email: 'kid@example.com',
          displayName: 'Asha K',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});

describe('StudentActivationOutboxHandler', () => {
  it('flips StudentUser → ACTIVE on first_login.completed', async () => {
    const pending = makeStudentUser({ status: 'PENDING_INVITE', version: 1 });
    const activated = makeStudentUser({
      status: 'ACTIVE',
      version: 2,
      activatedAt: new Date('2026-06-25T12:00:00Z'),
    });

    const studentUsersSvc = {
      activate: jest.fn().mockResolvedValue(activated),
    } as unknown as StudentUserService;
    const repo = {
      findAliveByUserId: jest.fn().mockResolvedValue(pending),
    };
    const registry = { registerTopic: jest.fn() };

    const handler = new StudentActivationOutboxHandler(
      registry as never,
      studentUsersSvc,
      repo as never,
    );
    handler.onApplicationBootstrap();

    const registeredHandler = registry.registerTopic.mock.calls[0]?.[1] as
      | ((event: unknown) => Promise<void>)
      | undefined;
    expect(registeredHandler).toBeDefined();

    await registeredHandler?.({
      eventId: 'evt-1',
      payload: {
        userId: 'u-1',
        schoolId: 'school-1',
        completedAt: '2026-06-25T12:00:00Z',
      },
    });

    expect(studentUsersSvc.activate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'su-1', expectedVersion: 1 }),
    );
  });

  it('skips when no StudentUser exists for the user (non-student first-login)', async () => {
    const studentUsersSvc = { activate: jest.fn() } as unknown as StudentUserService;
    const repo = { findAliveByUserId: jest.fn().mockResolvedValue(null) };
    const registry = { registerTopic: jest.fn() };

    const handler = new StudentActivationOutboxHandler(
      registry as never,
      studentUsersSvc,
      repo as never,
    );
    handler.onApplicationBootstrap();

    const registeredHandler = registry.registerTopic.mock.calls[0]?.[1] as
      | ((event: unknown) => Promise<void>)
      | undefined;
    await registeredHandler?.({
      eventId: 'evt-2',
      payload: {
        userId: 'u-2',
        schoolId: 'school-1',
        completedAt: '2026-06-25T12:00:00Z',
      },
    });
    expect(studentUsersSvc.activate).not.toHaveBeenCalled();
  });
});
