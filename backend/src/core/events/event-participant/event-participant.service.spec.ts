/**
 * EventParticipantService unit specs — individual register flow, capacity,
 * approval flow, cancel, INVITATION_ONLY guard, paid-event fee-assignment.
 */
import { RequestContextRegistry } from '../../request-context';
import { EventsOutboxTopics } from '../events.constants';
import {
  DuplicateEventParticipantError,
  EventCapacityExceededError,
  EventFeeHeadMissingError,
  EventInvitationOnlyError,
  EventNotFoundError,
  EventParticipantNotApprovableError,
  EventParticipantNotFoundError,
  EventRegistrationClosedError,
} from '../events.errors';
import type { EventParticipantRow, EventRow } from '../events.types';
import { EventParticipantService } from './event-participant.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'evt-1',
    schoolId: SCHOOL,
    code: 'EVT-000001',
    name: 'Annual Day',
    description: null,
    eventType: 'CULTURAL',
    category: 'CULTURAL',
    subType: null,
    status: 'PUBLISHED',
    startDate: new Date('2026-07-15'),
    endDate: new Date('2026-07-15'),
    startTime: null,
    endTime: null,
    timezone: 'Asia/Kolkata',
    branchId: null,
    venue: null,
    organizerStaffId: null,
    registrationType: 'OPEN',
    registrationOpen: true,
    registrationOpenAt: null,
    registrationClosedAt: null,
    registrationCapacity: null,
    isFree: true,
    feeHeadId: null,
    feeStructureId: null,
    feeAmount: null,
    estimatedCost: null,
    actualCost: null,
    sponsorshipAmount: null,
    publishedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    registeredCount: 0,
    attendedCount: 0,
    absentCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'user-1',
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<EventParticipantRow> = {}): EventParticipantRow {
  return {
    id: 'part-1',
    schoolId: SCHOOL,
    eventId: 'evt-1',
    audience: 'STUDENT',
    userId: 'user-2',
    studentId: 'stu-1',
    staffId: null,
    classId: null,
    sectionId: null,
    status: 'REGISTERED',
    registrationType: 'OPEN',
    registeredAt: NOW,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    cancelledAt: null,
    cancellationReason: null,
    registrationSource: 'INDIVIDUAL',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'user-1',
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn().mockResolvedValue({ rows: [], nextCursorId: null }) as jest.Mock,
    findById: jest.fn() as jest.Mock,
    findActiveByEventUser: jest.fn().mockResolvedValue(null) as jest.Mock,
    create: jest.fn(async (input: { eventId: string; userId: string; audience: string; status: string }) =>
      makeParticipant({
        id: 'part-new',
        eventId: input.eventId,
        userId: input.userId,
        audience: input.audience as 'STUDENT',
        status: input.status as 'REGISTERED',
      }),
    ),
    patchStatus: jest.fn(async (id: string, _v: number, patch: { status: string }) =>
      makeParticipant({ id, status: patch.status as 'REGISTERED' }),
    ),
    softDelete: jest.fn(),
    cancelAllForEvent: jest.fn(),
  };
  const eventRepo = {
    findById: jest.fn(async () => makeEvent()) as jest.Mock,
    bumpCounters: jest.fn(),
  };
  const feeAssignmentRepo = {
    create: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async (_key?: string) => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new EventParticipantService(
    prisma as never,
    repo as never,
    eventRepo as never,
    feeAssignmentRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, eventRepo, feeAssignmentRepo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: 'user-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('EventParticipantService.register', () => {
  it('OPEN event creates a REGISTERED row + bumps counter + publishes outbox', async () => {
    const t = makeService();
    const row = await withCtx(() =>
      t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2', studentId: 'stu-1' }),
    );
    expect(row.status).toBe('REGISTERED');
    expect(t.eventRepo.bumpCounters).toHaveBeenCalledWith('evt-1', { registered: 1 }, {});
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.PARTICIPANT_REGISTERED);
  });

  it('APPROVAL_REQUIRED event creates a PENDING row (no counter bump)', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ registrationType: 'APPROVAL_REQUIRED' }));
    const row = await withCtx(() =>
      t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2', studentId: 'stu-1' }),
    );
    expect(row.status).toBe('PENDING');
    expect(t.eventRepo.bumpCounters).not.toHaveBeenCalled();
  });

  it('INVITATION_ONLY refuses public register', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ registrationType: 'INVITATION_ONLY' }));
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2', studentId: 'stu-1' }),
      ),
    ).rejects.toBeInstanceOf(EventInvitationOnlyError);
  });

  it('refuses when registration is closed', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ registrationOpen: false }));
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2' }),
      ),
    ).rejects.toBeInstanceOf(EventRegistrationClosedError);
  });

  it('refuses when event is COMPLETED or CANCELLED', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ status: 'CANCELLED' }));
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2' }),
      ),
    ).rejects.toBeInstanceOf(EventRegistrationClosedError);
  });

  it('refuses with EventNotFoundError when event missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-missing', audience: 'STUDENT', userId: 'user-2' }),
      ),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it('refuses when capacity is full', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(
      makeEvent({ registrationCapacity: 10, registeredCount: 10 }),
    );
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2' }),
      ),
    ).rejects.toBeInstanceOf(EventCapacityExceededError);
  });

  it('refuses duplicate registration', async () => {
    const t = makeService();
    t.repo.findActiveByEventUser.mockResolvedValue(makeParticipant());
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2' }),
      ),
    ).rejects.toBeInstanceOf(DuplicateEventParticipantError);
  });

  it('paid STUDENT event auto-creates EventFeeAssignment', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(
      makeEvent({
        isFree: false,
        feeHeadId: 'fh-1',
        feeStructureId: 'fs-1',
        feeAmount: 500,
      }),
    );
    await withCtx(() =>
      t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2', studentId: 'stu-1' }),
    );
    expect(t.feeAssignmentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1', studentId: 'stu-1', amount: 500 }),
      {},
    );
  });

  it('paid event refuses when feeHeadId missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ isFree: false, feeHeadId: null }));
    await expect(
      withCtx(() =>
        t.svc.register({ eventId: 'evt-1', audience: 'STUDENT', userId: 'user-2', studentId: 'stu-1' }),
      ),
    ).rejects.toBeInstanceOf(EventFeeHeadMissingError);
  });
});

describe('EventParticipantService.approve / reject', () => {
  it('approve flips PENDING → REGISTERED + publishes outbox', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParticipant({ status: 'PENDING' }));
    const row = await withCtx(() => t.svc.approve('evt-1', 'part-1', 1));
    expect(row.status).toBe('REGISTERED');
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.PARTICIPANT_APPROVED);
  });

  it('approve refuses when not PENDING', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParticipant({ status: 'REGISTERED' }));
    await expect(
      withCtx(() => t.svc.approve('evt-1', 'part-1', 1)),
    ).rejects.toBeInstanceOf(EventParticipantNotApprovableError);
  });

  it('approve refuses when participant not found', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() => t.svc.approve('evt-1', 'missing', 1)),
    ).rejects.toBeInstanceOf(EventParticipantNotFoundError);
  });

  it('reject flips PENDING → REJECTED', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeParticipant({ status: 'PENDING' }));
    const row = await withCtx(() => t.svc.reject('evt-1', 'part-1', 1, 'incomplete'));
    expect(row.status).toBe('REJECTED');
  });
});

describe('EventParticipantService.cancel', () => {
  it('cancels REGISTERED participant + decrements counter', async () => {
    const t = makeService();
    t.repo.findById
      .mockResolvedValueOnce(makeParticipant({ status: 'REGISTERED' }))
      .mockResolvedValueOnce(makeParticipant({ status: 'CANCELLED', version: 2 }));
    await withCtx(() => t.svc.cancel('evt-1', 'part-1', 1, 'pulled out'));
    expect(t.eventRepo.bumpCounters).toHaveBeenCalledWith('evt-1', { registered: -1 }, {});
    expect(t.repo.softDelete).toHaveBeenCalled();
  });

  it('does NOT decrement counter for PENDING participant', async () => {
    const t = makeService();
    t.repo.findById
      .mockResolvedValueOnce(makeParticipant({ status: 'PENDING' }))
      .mockResolvedValueOnce(makeParticipant({ status: 'CANCELLED', version: 2 }));
    await withCtx(() => t.svc.cancel('evt-1', 'part-1', 1, null));
    expect(t.eventRepo.bumpCounters).not.toHaveBeenCalled();
  });
});
