/**
 * Sprint 18 e2e — admin invites a student → activation handler flips →
 * `GET /students/me/profile` succeeds with the student's own JWT.
 *
 * Walks the HTTP controllers end-to-end against in-memory stubs:
 *   1. Admin calls StudentUserController.invite → StudentInvitationService
 *      writes User + UserPassword + StudentUser + NotificationUserPreference,
 *      publishes `student.invited`, issues a 7d reset token.
 *   2. The first-login outbox event is simulated by invoking the same
 *      activate() path the StudentActivationOutboxHandler would take
 *      (the handler itself is unit-tested separately) — the StudentUser
 *      flips PENDING_INVITE → ACTIVE.
 *   3. StudentController.getMeProfile is called inside the student's
 *      RequestContext and is expected to return the full profile row.
 *
 * Stubs: PrismaService is reduced to tx passthrough, Outbox + Audit are
 * recording stubs, PasswordResetService.request returns a deterministic
 * token. Everything else (services, controllers) is real.
 */
import { withTestContext } from '../../src/core/request-context';
import type { AcademicYearRepository } from '../../src/core/academic/repositories/academic-year.repository';
import type { ClassRepository } from '../../src/core/academic/repositories/class.repository';
import type { SectionRepository } from '../../src/core/academic/repositories/section.repository';
import type { FeatureFlagService } from '../../src/core/feature-flag/services/feature-flag.service';
import type { PasswordService } from '../../src/core/auth/password/password.service';
import type { PasswordResetService } from '../../src/core/provisioning/password-reset/password-reset.service';
import { StudentController } from '../../src/core/student/student/student.controller';
import { StudentService } from '../../src/core/student/student/student.service';
import { StudentInvitationService } from '../../src/core/student/invitation/student-invitation.service';
import { StudentUserController } from '../../src/core/student/student-user/student-user.controller';
import { StudentUserService } from '../../src/core/student/student-user/student-user.service';
import type { StudentRepository } from '../../src/core/student/repositories/student.repository';
import type { StudentUserRepository } from '../../src/core/student/student-user/student-user.repository';
import { StudentOutboxTopics } from '../../src/core/student/student.constants';
import type { StudentRow, StudentUserRow } from '../../src/core/student/student.types';

interface InMemoryState {
  readonly student: StudentRow;
  studentUser: StudentUserRow | null;
  resetTokens: { token: string; userId: string; expiresAt: Date }[];
  outbox: { topic: string; eventType: string; payload: Record<string, unknown> }[];
}

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

function makeState(): InMemoryState {
  return {
    student: makeStudent(),
    studentUser: null,
    resetTokens: [],
    outbox: [],
  };
}

function buildSuite() {
  const state = makeState();

  const studentRepo: jest.Mocked<Pick<StudentRepository, 'findById'>> = {
    findById: jest.fn(async (id: string) => (id === state.student.id ? state.student : null)),
  } as never;

  const studentUserRepo: jest.Mocked<
    Pick<
      StudentUserRepository,
      'findById' | 'findAliveByUserId' | 'findByStudent' | 'create' | 'updateStatus'
    >
  > = {
    findById: jest.fn(async (id: string) =>
      state.studentUser !== null && state.studentUser.id === id ? state.studentUser : null,
    ),
    findAliveByUserId: jest.fn(async (userId: string) =>
      state.studentUser !== null && state.studentUser.userId === userId
        ? state.studentUser
        : null,
    ),
    findByStudent: jest.fn(async () => (state.studentUser !== null ? [state.studentUser] : [])),
    create: jest.fn(async (input) => {
      state.studentUser = {
        id: 'su-1',
        schoolId: 'school-1',
        studentId: input.studentId,
        userId: input.userId,
        status: input.status ?? 'PENDING_INVITE',
        invitedAt: input.invitedAt ?? new Date(),
        activatedAt: null,
        suspendedAt: null,
        archivedAt: null,
        lastInviteAt: input.lastInviteAt ?? input.invitedAt ?? new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };
      return state.studentUser;
    }),
    updateStatus: jest.fn(async (id, expectedVersion, patch) => {
      if (state.studentUser === null || state.studentUser.id !== id) {
        throw new Error(`unknown student-user ${id}`);
      }
      if (state.studentUser.version !== expectedVersion) {
        throw new Error('version mismatch');
      }
      state.studentUser = {
        ...state.studentUser,
        status: patch.status,
        ...(patch.activatedAt !== undefined ? { activatedAt: patch.activatedAt } : {}),
        ...(patch.suspendedAt !== undefined ? { suspendedAt: patch.suspendedAt } : {}),
        ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
        ...(patch.lastInviteAt !== undefined ? { lastInviteAt: patch.lastInviteAt } : {}),
        version: state.studentUser.version + 1,
        updatedAt: new Date(),
      };
      return state.studentUser;
    }),
  } as never;

  // ---------- Prisma stub ----------
  const prismaClient = {
    studentUser: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        state.studentUser !== null && state.studentUser.userId === where.userId
          ? state.studentUser
          : null,
      ),
    },
    user: { findFirst: jest.fn(async () => null) },
  };
  const prismaTx = {
    user: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => undefined),
    },
    userPassword: { create: jest.fn(async () => undefined) },
    studentUser: { findFirst: jest.fn(async () => null) },
    notificationUserPreference: { create: jest.fn(async () => undefined) },
  };
  const prisma = {
    client: prismaClient,
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaTx)),
  };

  // ---------- Outbox + audit ----------
  const outbox = {
    publish: jest.fn(
      async (
        _tx: unknown,
        e: { topic: string; eventType: string; payload: Record<string, unknown> },
      ) => {
        state.outbox.push({ topic: e.topic, eventType: e.eventType, payload: e.payload });
      },
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'a-1', rowHash: 'h' }) };

  // ---------- Password reset / hash stubs ----------
  const passwords: jest.Mocked<Pick<PasswordService, 'hash'>> = {
    hash: jest.fn().mockResolvedValue({
      passwordHash: 'argon2id$decoy',
      algorithm: 'argon2id',
      params: {},
      pepperVersion: 1,
    }),
  } as never;
  const passwordReset: jest.Mocked<Pick<PasswordResetService, 'request'>> = {
    request: jest.fn(async ({ email }: { email: string }) => {
      const token = 'reset-token-' + email;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      state.resetTokens.push({ token, userId: 'u-new', expiresAt });
      return {
        accepted: true,
        clearTextToken: token,
        tokenExpiresAt: expiresAt.toISOString(),
        userId: 'u-new',
      };
    }),
  } as never;
  const resetRepo = { cancelOutstandingForUser: jest.fn().mockResolvedValue(0) };

  // ---------- Academic repositories (used by /me/* helpers) ----------
  const yearRepo: jest.Mocked<Pick<AcademicYearRepository, 'findById'>> = {
    findById: jest.fn(),
  } as never;
  const classRepo: jest.Mocked<Pick<ClassRepository, 'findById'>> = {
    findById: jest.fn(),
  } as never;
  const sectionRepo: jest.Mocked<Pick<SectionRepository, 'findById'>> = {
    findById: jest.fn(),
  } as never;

  // ---------- Real services ----------
  const studentUsers = new StudentUserService(
    prisma as never,
    studentUserRepo as never,
    outbox as never,
    audit as never,
    resetRepo as never,
  );
  const invitations = new StudentInvitationService(
    prisma as never,
    studentRepo as never,
    studentUsers,
    passwords as never,
    passwordReset as never,
    outbox as never,
    audit as never,
  );

  const featureFlags: jest.Mocked<Pick<FeatureFlagService, 'isEnabled'>> = {
    isEnabled: jest.fn().mockResolvedValue(true),
  } as never;

  // StudentService only needs getById in this test — stub it.
  const studentSvc = {
    getById: jest.fn(async (id: string) =>
      id === state.student.id ? state.student : (null as never),
    ),
  } as unknown as StudentService;

  // ---------- Real controllers ----------
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

  return {
    state,
    studentUserController,
    studentController,
    studentUsers,
  };
}

describe('Sprint 18 e2e — student invitation + activation + /me/profile', () => {
  it('admin invites → activation flips StudentUser → /me/profile succeeds', async () => {
    const t = buildSuite();

    // Step 1 — admin POSTs /api/v1/students/:id/users.
    const inviteResponse = await withTestContext(
      { schoolId: 'school-1', userId: 'admin-1', actorScope: 'tenant' },
      () =>
        t.studentUserController.invite('s-1', {
          email: 'asha@example.com',
          displayName: 'Asha Kumar',
        }),
    );

    expect(inviteResponse.studentUser.studentId).toBe('s-1');
    expect(inviteResponse.studentUser.status).toBe('PENDING_INVITE');
    expect(inviteResponse.userId).toBeDefined();

    // The invite outbox row carries the activation token.
    const invited = t.state.outbox.find((e) => e.topic === StudentOutboxTopics.INVITED);
    expect(invited).toBeDefined();
    const activationToken = invited?.payload.activationToken;
    expect(typeof activationToken).toBe('string');
    expect((activationToken as string).startsWith('reset-token-')).toBe(true);

    expect(t.state.studentUser?.status).toBe('PENDING_INVITE');
    const userIdAtInvite = t.state.studentUser?.userId ?? '';

    // Step 2 — simulate the activation handler reacting to
    // provisioning.password.first_login.completed.
    await withTestContext(
      { schoolId: 'school-1', actorScope: 'global' },
      async () => {
        const row = await t.studentUsers.findAliveByUserId(userIdAtInvite);
        expect(row).not.toBeNull();
        expect(row?.status).toBe('PENDING_INVITE');
        await t.studentUsers.activate({
          id: row!.id,
          expectedVersion: row!.version,
          at: new Date('2026-06-26T12:00:00Z'),
        });
      },
    );

    expect(t.state.studentUser?.status).toBe('ACTIVE');

    // Step 3 — student calls GET /api/v1/students/me/profile.
    const profile = await withTestContext(
      { schoolId: 'school-1', userId: userIdAtInvite, actorScope: 'tenant' },
      () => t.studentController.getMeProfile(),
    );

    expect(profile.id).toBe('s-1');
    expect(profile.firstName).toBe('Asha');
    expect(profile.lastName).toBe('Kumar');
    expect(profile.admissionNo).toBe('A-001');
  });
});
