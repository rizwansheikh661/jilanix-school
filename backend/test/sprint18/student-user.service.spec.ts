/**
 * StudentUserService unit specs — Sprint 18 W8.
 *
 * Covers the two transitions called out in the Sprint 18 test plan:
 *   - `suspend()` from `PENDING_INVITE` throws the FSM error.
 *   - `archive()` cancels unconsumed reset tokens for the underlying user.
 *
 * Plus orthogonal coverage for activate / reactivate / markReinvited
 * happy paths to pin down regression risk.
 */
import { NotFoundError } from '../../src/core/errors/domain-error';
import { StudentOutboxTopics } from '../../src/core/student/student.constants';
import { StudentUserStateError } from '../../src/core/student/student.errors';
import type { StudentUserRow } from '../../src/core/student/student.types';
import type { StudentUserRepository } from '../../src/core/student/student-user/student-user.repository';
import { StudentUserService } from '../../src/core/student/student-user/student-user.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeRow(overrides: Partial<StudentUserRow> = {}): StudentUserRow {
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
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<StudentUserRepository> = {
    findById: jest.fn(),
    findByStudentAndUser: jest.fn(),
    findAliveByUserId: jest.fn(),
    findAliveByStudentId: jest.fn(),
    findByStudent: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<StudentUserRepository>;
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'a', rowHash: 'h' }) };
  const resetRepo = { cancelOutstandingForUser: jest.fn().mockResolvedValue(0) };

  const svc = new StudentUserService(
    prisma as never,
    repo as never,
    outbox as never,
    audit as never,
    resetRepo as never,
  );
  return { svc, prisma, repo, outbox, audit, resetRepo };
}

describe('StudentUserService.activate', () => {
  it('PENDING_INVITE → ACTIVE happy path', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'PENDING_INVITE', version: 3 }));
    t.repo.updateStatus.mockResolvedValueOnce(
      makeRow({ status: 'ACTIVE', version: 4, activatedAt: new Date() }),
    );
    const out = await t.svc.activate({ id: 'su-1', expectedVersion: 3 });
    expect(out.status).toBe('ACTIVE');
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'student_user.activate',
        category: 'security',
        resourceType: 'StudentUser',
      }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.LIFECYCLE_ACTIVATED }),
    );
  });

  it('throws NotFound when row is missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(null);
    await expect(t.svc.activate({ id: 'su-1', expectedVersion: 1 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('StudentUserService.suspend', () => {
  it('suspend() from PENDING_INVITE throws illegal state transition', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'PENDING_INVITE', version: 2 }));
    await expect(t.svc.suspend({ id: 'su-1', expectedVersion: 2 })).rejects.toBeInstanceOf(
      StudentUserStateError,
    );
    expect(t.repo.updateStatus).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });

  it('ACTIVE → SUSPENDED happy path', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'ACTIVE', version: 4 }));
    t.repo.updateStatus.mockResolvedValueOnce(
      makeRow({ status: 'SUSPENDED', version: 5, suspendedAt: new Date() }),
    );
    const out = await t.svc.suspend({ id: 'su-1', expectedVersion: 4, reason: 'disciplinary' });
    expect(out.status).toBe('SUSPENDED');
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.LIFECYCLE_SUSPENDED }),
    );
  });
});

describe('StudentUserService.reactivate', () => {
  it('SUSPENDED → ACTIVE clears suspendedAt and emits reactivated topic', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(
      makeRow({ status: 'SUSPENDED', version: 5, suspendedAt: new Date() }),
    );
    t.repo.updateStatus.mockResolvedValueOnce(
      makeRow({ status: 'ACTIVE', version: 6, activatedAt: new Date(), suspendedAt: null }),
    );
    await t.svc.reactivate({ id: 'su-1', expectedVersion: 5 });
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.LIFECYCLE_REACTIVATED }),
    );
  });

  it('throws StudentUserStateError when source is PENDING_INVITE', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'PENDING_INVITE', version: 2 }));
    await expect(
      t.svc.reactivate({ id: 'su-1', expectedVersion: 2 }),
    ).rejects.toBeInstanceOf(StudentUserStateError);
  });
});

describe('StudentUserService.archive', () => {
  it('cancels unconsumed reset tokens for that user', async () => {
    const t = makeService();
    const at = new Date('2026-06-25T12:00:00Z');
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'ACTIVE', version: 7 }));
    t.repo.updateStatus.mockResolvedValueOnce(
      makeRow({ status: 'ARCHIVED', version: 8, archivedAt: at }),
    );
    await t.svc.archive({ id: 'su-1', expectedVersion: 7, at, reason: 'transferred-out' });
    expect(t.resetRepo.cancelOutstandingForUser).toHaveBeenCalledWith(
      'school-1',
      'u-1',
      at,
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.LIFECYCLE_ARCHIVED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'student_user.archive' }),
      expect.anything(),
    );
  });

  it('archives from PENDING_INVITE (terminal-from-any)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'PENDING_INVITE', version: 1 }));
    t.repo.updateStatus.mockResolvedValueOnce(
      makeRow({ status: 'ARCHIVED', version: 2, archivedAt: new Date() }),
    );
    const out = await t.svc.archive({ id: 'su-1', expectedVersion: 1 });
    expect(out.status).toBe('ARCHIVED');
  });
});

describe('StudentUserService.markReinvited', () => {
  it('bumps lastInviteAt without changing status and emits reinvited topic', async () => {
    const t = makeService();
    const at = new Date('2026-06-25T13:00:00Z');
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'PENDING_INVITE', version: 1 }));
    t.repo.updateStatus.mockResolvedValueOnce(
      makeRow({ status: 'PENDING_INVITE', version: 2, lastInviteAt: at }),
    );
    await t.svc.markReinvited('su-1', 1, at, {} as never);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: StudentOutboxTopics.REINVITED }),
    );
  });

  it('refuses re-invite once ACTIVE', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValueOnce(makeRow({ status: 'ACTIVE', version: 2 }));
    await expect(
      t.svc.markReinvited('su-1', 2, new Date(), {} as never),
    ).rejects.toBeInstanceOf(StudentUserStateError);
  });
});
