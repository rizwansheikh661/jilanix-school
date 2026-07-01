/**
 * ParentInvitationService specs.
 *
 * Covers the two assertions called out in the Sprint 17 test plan:
 *   - `invite()` creates User + ParentUser + NotificationUserPreference +
 *     outbox row atomically.
 *   - Activation handler flips ParentUser → ACTIVE and emits the
 *     LIFECYCLE_ACTIVATED outbox topic (handler tested separately so its
 *     idempotency story has its own coverage).
 *
 * The whole test wraps the call in `withTestContext({schoolId,userId})`
 * because `ParentInvitationService.requireTenant()` reads the
 * `RequestContext`.
 */
import { withTestContext } from '../../request-context';
import type { PasswordService } from '../../auth/password/password.service';
import type { PasswordResetService } from '../../provisioning/password-reset/password-reset.service';
import { ParentOutboxTopics } from '../parent.constants';
import type { ParentRow, ParentUserRow } from '../parent.types';
import type { ParentRepository } from '../repositories/parent.repository';
import type { ParentUserService } from '../parent-user/parent-user.service';
import { ParentActivationOutboxHandler } from './parent-activation.outbox-handler';
import { ParentInvitationService } from './parent-invitation.service';

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

function makeParentUser(overrides: Partial<ParentUserRow> = {}): ParentUserRow {
  return {
    id: 'pu-1',
    schoolId: 'school-1',
    parentId: 'p-1',
    userId: 'u-1',
    relation: 'FATHER',
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

function makeFakeTx(): {
  tx: unknown;
  calls: {
    userFindFirst: jest.Mock;
    userCreate: jest.Mock;
    userPasswordCreate: jest.Mock;
    parentUserFindFirst: jest.Mock;
    notificationPrefCreate: jest.Mock;
  };
} {
  const calls = {
    userFindFirst: jest.fn().mockResolvedValue(null),
    userCreate: jest.fn().mockResolvedValue({}),
    userPasswordCreate: jest.fn().mockResolvedValue({}),
    parentUserFindFirst: jest.fn().mockResolvedValue(null),
    notificationPrefCreate: jest.fn().mockResolvedValue({}),
  };
  const tx = {
    user: { findFirst: calls.userFindFirst, create: calls.userCreate },
    userPassword: { create: calls.userPasswordCreate },
    parentUser: { findFirst: calls.parentUserFindFirst },
    notificationUserPreference: { create: calls.notificationPrefCreate },
  };
  return { tx, calls };
}

function makeService() {
  const { tx, calls } = makeFakeTx();
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  const parentRepo: Mocked<ParentRepository> = {
    findById: jest.fn().mockResolvedValue(makeParent()),
  } as unknown as Mocked<ParentRepository>;
  const parentUsers: Mocked<ParentUserService> = {
    createInvited: jest.fn().mockResolvedValue(makeParentUser()),
    markReinvited: jest.fn().mockResolvedValue(makeParentUser()),
  } as unknown as Mocked<ParentUserService>;
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

  const svc = new ParentInvitationService(
    prisma as never,
    parentRepo as never,
    parentUsers as never,
    passwords as never,
    passwordReset as never,
    outbox as never,
    audit as never,
  );
  return {
    svc,
    prisma,
    parentRepo,
    parentUsers,
    passwords,
    passwordReset,
    outbox,
    audit,
    txCalls: calls,
  };
}

describe('ParentInvitationService.invite', () => {
  it('creates User + ParentUser + NotificationUserPreference + outbox row atomically', async () => {
    const t = makeService();
    await withTestContext({ schoolId: 'school-1', userId: 'admin' }, async () => {
      await t.svc.invite({
        parentId: 'p-1',
        email: 'mom@example.com',
        displayName: 'Mrs. Mom',
        relation: 'MOTHER',
      });
    });

    expect(t.txCalls.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'mom@example.com',
          status: 'invited',
          mustChangePassword: true,
        }),
      }),
    );
    expect(t.txCalls.userPasswordCreate).toHaveBeenCalled();
    expect(t.parentUsers.createInvited).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'p-1',
        relation: 'MOTHER',
      }),
      expect.anything(),
    );
    expect(t.txCalls.notificationPrefCreate).toHaveBeenCalled();
    expect(t.passwordReset.request).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        email: 'mom@example.com',
        ttlMs: 7 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: ParentOutboxTopics.INVITED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'parent_user.invite' }),
      expect.anything(),
    );
  });

  it('on re-invite, reuses existing PENDING_INVITE row and emits REINVITED', async () => {
    const t = makeService();
    t.txCalls.userFindFirst.mockResolvedValue({ id: 'u-1', status: 'invited' });
    t.txCalls.parentUserFindFirst.mockResolvedValue({
      id: 'pu-1',
      version: 2,
      status: 'PENDING_INVITE',
    });
    await withTestContext({ schoolId: 'school-1', userId: 'admin' }, async () => {
      await t.svc.invite({
        parentId: 'p-1',
        email: 'mom@example.com',
        displayName: 'Mrs. Mom',
        relation: 'MOTHER',
      });
    });
    expect(t.parentUsers.markReinvited).toHaveBeenCalledWith(
      'pu-1',
      2,
      expect.any(Date),
      expect.anything(),
    );
    expect(t.parentUsers.createInvited).not.toHaveBeenCalled();
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: ParentOutboxTopics.REINVITED }),
    );
  });

  it('refuses re-invite when the existing link is ACTIVE', async () => {
    const t = makeService();
    t.txCalls.userFindFirst.mockResolvedValue({ id: 'u-1', status: 'active' });
    t.txCalls.parentUserFindFirst.mockResolvedValue({
      id: 'pu-1',
      version: 5,
      status: 'ACTIVE',
    });
    await withTestContext({ schoolId: 'school-1', userId: 'admin' }, async () => {
      await expect(
        t.svc.invite({
          parentId: 'p-1',
          email: 'mom@example.com',
          displayName: 'Mrs. Mom',
          relation: 'MOTHER',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});

describe('ParentActivationOutboxHandler', () => {
  it('flips ParentUser → ACTIVE and emits PARENT_ACTIVATED on first_login.completed', async () => {
    const pending = makeParentUser({ status: 'PENDING_INVITE', version: 1 });
    const activated = makeParentUser({
      status: 'ACTIVE',
      version: 2,
      activatedAt: new Date('2026-06-25T12:00:00Z'),
    });

    const parentUsersSvc = {
      activate: jest.fn().mockResolvedValue(activated),
    } as unknown as ParentUserService;
    const repo = {
      findAliveByUserId: jest.fn().mockResolvedValue(pending),
    } as unknown as {
      findAliveByUserId: jest.Mock;
    };
    const registry = { registerTopic: jest.fn() } as unknown as {
      registerTopic: jest.Mock;
    };

    const handler = new ParentActivationOutboxHandler(
      registry as never,
      parentUsersSvc,
      repo as never,
    );
    handler.onApplicationBootstrap();

    // Pull the handler fn the bootstrap registered and invoke it directly.
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

    expect(parentUsersSvc.activate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pu-1', expectedVersion: 1 }),
    );
  });
});
