/**
 * Sprint 17 e2e — parent-portal lifecycle suspend → reactivate.
 *
 * Walks the HTTP controllers end-to-end against in-memory stubs:
 *   1. Admin already has an ACTIVE parent user (seeded directly into the
 *      ParentUserRepository state map; the activation path is exercised
 *      by parent-invitation.e2e-spec.ts).
 *   2. Admin POSTs /api/v1/parents/:id/users/:userId/suspend with
 *      If-Match — controller parses ETag, ParentUserService.suspend
 *      writes the transition, audit + outbox emit.
 *   3. Parent then calls GET /api/v1/parents/me/students — expected to
 *      throw `ParentUserNotActiveError` whose details.reason is
 *      `ACCOUNT_SUSPENDED`.
 *   4. Admin POSTs /reactivate with the bumped If-Match.
 *   5. /me/students now returns the (empty) link list (200).
 *
 * Stubs: PrismaService is reduced to a tx passthrough, Outbox + Audit
 * are recording stubs, FeatureFlagService.isEnabled returns true. All
 * controllers + services are real instances.
 */
import { withTestContext } from '../../src/core/request-context';
import type { FeatureFlagService } from '../../src/core/feature-flag/services/feature-flag.service';
import { ERROR_CODES } from '../../src/contracts/api';
import { ParentController } from '../../src/core/parent/parent/parent.controller';
import { ParentService } from '../../src/core/parent/parent/parent.service';
import { ParentUserController } from '../../src/core/parent/parent-user/parent-user.controller';
import { ParentUserService } from '../../src/core/parent/parent-user/parent-user.service';
import type { ParentRepository } from '../../src/core/parent/repositories/parent.repository';
import type { ParentStudentLinkRepository } from '../../src/core/parent/repositories/parent-student-link.repository';
import type { ParentUserRepository } from '../../src/core/parent/parent-user/parent-user.repository';
import { ParentOutboxTopics } from '../../src/core/parent/parent.constants';
import { ParentUserNotActiveError } from '../../src/core/parent/parent.errors';
import { ParentRelationshipService } from '../../src/core/parent/relationships/parent-relationship.service';
import type { ParentInvitationService } from '../../src/core/parent/invitation/parent-invitation.service';
import type { ParentRow, ParentUserRow } from '../../src/core/parent/parent.types';

function makeParent(): ParentRow {
  return {
    id: 'p-1',
    schoolId: 'school-1',
    fatherName: 'Dad',
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
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
  };
}

function makeActiveParentUser(): ParentUserRow {
  return {
    id: 'pu-1',
    schoolId: 'school-1',
    parentId: 'p-1',
    userId: 'u-parent',
    relation: 'FATHER',
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
  let parentUserRow: ParentUserRow = makeActiveParentUser();
  const parentRow = makeParent();
  const outbox: { topic: string; payload: Record<string, unknown> }[] = [];

  const parentRepo: jest.Mocked<Pick<ParentRepository, 'findById' | 'studentExists'>> = {
    findById: jest.fn(async (id: string) => (id === parentRow.id ? parentRow : null)),
    studentExists: jest.fn().mockResolvedValue(true),
  } as never;

  const parentUserRepo: jest.Mocked<
    Pick<
      ParentUserRepository,
      'findById' | 'findAliveByUserId' | 'findByParent' | 'updateStatus' | 'create'
    >
  > = {
    findById: jest.fn(async (id: string) => (id === parentUserRow.id ? parentUserRow : null)),
    findAliveByUserId: jest.fn(async (userId: string) =>
      userId === parentUserRow.userId ? parentUserRow : null,
    ),
    findByParent: jest.fn(async () => [parentUserRow]),
    create: jest.fn(),
    updateStatus: jest.fn(async (id, expectedVersion, patch) => {
      if (id !== parentUserRow.id) throw new Error('unknown id');
      if (parentUserRow.version !== expectedVersion) throw new Error('version conflict');
      parentUserRow = {
        ...parentUserRow,
        status: patch.status,
        ...(patch.activatedAt !== undefined ? { activatedAt: patch.activatedAt } : {}),
        ...(patch.suspendedAt !== undefined ? { suspendedAt: patch.suspendedAt } : {}),
        ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
        ...(patch.lastInviteAt !== undefined ? { lastInviteAt: patch.lastInviteAt } : {}),
        version: parentUserRow.version + 1,
        updatedAt: new Date(),
      };
      return parentUserRow;
    }),
  } as never;

  const linkRepo: jest.Mocked<Pick<ParentStudentLinkRepository, 'findByParent'>> = {
    findByParent: jest.fn().mockResolvedValue([]),
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

  const parentUsers = new ParentUserService(
    prisma as never,
    parentUserRepo as never,
    outboxStub as never,
    audit as never,
    resetRepo as never,
  );

  const featureFlags: jest.Mocked<Pick<FeatureFlagService, 'isEnabled'>> = {
    isEnabled: jest.fn().mockResolvedValue(true),
  } as never;

  const parentSvc = new ParentService(
    prisma as never,
    parentRepo as never,
    linkRepo as never,
    new ParentRelationshipService(linkRepo as never),
  );

  // The invitation service is required by the ParentUserController
  // constructor but isn't exercised by the suspend/reactivate path; a
  // tombstone stub keeps the wiring honest without dragging in the
  // full PasswordReset + Password fixture.
  const invitations = {} as ParentInvitationService;

  const parentUserController = new ParentUserController(
    invitations,
    parentUsers,
    featureFlags as never,
  );
  const parentController = new ParentController(parentSvc, parentUsers, featureFlags as never);

  return {
    parentUserController,
    parentController,
    getParentUser: () => parentUserRow,
    outbox,
  };
}

describe('Sprint 17 e2e — parent lifecycle suspend → /me 403 → reactivate → /me 200', () => {
  it('blocks /me/students while SUSPENDED and restores access on reactivate', async () => {
    const t = buildSuite();

    // 1. Suspend the active ParentUser.
    const suspended = await withTestContext(
      { schoolId: 'school-1', userId: 'admin-1', actorScope: 'tenant' },
      () =>
        t.parentUserController.suspend(
          'p-1',
          'pu-1',
          `"${t.getParentUser().version.toString()}"`,
          { expectedVersion: t.getParentUser().version, reason: 'fraud-check' },
        ),
    );
    expect(suspended.status).toBe('SUSPENDED');
    expect(t.getParentUser().status).toBe('SUSPENDED');
    expect(
      t.outbox.some((e) => e.topic === ParentOutboxTopics.LIFECYCLE_SUSPENDED),
    ).toBe(true);

    // 2. Parent calls /me/students — expected to 403 with ACCOUNT_SUSPENDED.
    let thrown: unknown;
    try {
      await withTestContext(
        { schoolId: 'school-1', userId: 'u-parent', actorScope: 'tenant' },
        () => t.parentController.getMeStudents(),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ParentUserNotActiveError);
    const dom = thrown as ParentUserNotActiveError;
    expect(dom.code).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS);
    expect(dom.details?.reason).toBe('ACCOUNT_SUSPENDED');

    // 3. Admin reactivates with the bumped If-Match.
    const reactivated = await withTestContext(
      { schoolId: 'school-1', userId: 'admin-1', actorScope: 'tenant' },
      () =>
        t.parentUserController.reactivate(
          'p-1',
          'pu-1',
          `"${t.getParentUser().version.toString()}"`,
          { expectedVersion: t.getParentUser().version },
        ),
    );
    expect(reactivated.status).toBe('ACTIVE');
    expect(
      t.outbox.some((e) => e.topic === ParentOutboxTopics.LIFECYCLE_REACTIVATED),
    ).toBe(true);

    // 4. /me/students now succeeds (empty links).
    const studentsResponse = await withTestContext(
      { schoolId: 'school-1', userId: 'u-parent', actorScope: 'tenant' },
      () => t.parentController.getMeStudents(),
    );
    expect(studentsResponse.items).toEqual([]);
  });
});
