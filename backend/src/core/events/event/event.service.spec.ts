/**
 * EventService unit specs — create DRAFT, transition matrix, PATCH whitelist
 * after publish, cancel cascade.
 */
import { RequestContextRegistry } from '../../request-context';
import { EventsOutboxTopics } from '../events.constants';
import {
  DuplicateEventCodeError,
  EventDateRangeInvalidError,
  EventFeeHeadMissingError,
  EventInvalidStateTransitionError,
  EventNotEditableError,
  EventNotFoundError,
} from '../events.errors';
import type { EventRow } from '../events.types';
import { EventService } from './event.service';

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
    status: 'DRAFT',
    startDate: new Date('2026-07-15'),
    endDate: new Date('2026-07-15'),
    startTime: null,
    endTime: null,
    timezone: 'Asia/Kolkata',
    branchId: null,
    venue: null,
    organizerStaffId: null,
    registrationType: 'OPEN',
    registrationOpen: false,
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

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn().mockResolvedValue(null) as jest.Mock,
    create: jest.fn(async (input: { code: string; name: string }) =>
      makeEvent({ id: 'evt-new', code: input.code, name: input.name }),
    ),
    update: jest.fn(async (_id: string, _v: number, _input: unknown) =>
      makeEvent({ id: 'evt-1', name: 'updated' }),
    ),
    patchStatus: jest.fn(async (id: string, _v: number, patch: { status: EventRow['status'] }) =>
      makeEvent({ id, status: patch.status }),
    ),
    softDelete: jest.fn(),
    bumpCounters: jest.fn(),
  };
  const participantRepo = {
    cancelAllForEvent: jest.fn(async () => 3),
  };
  const feeAssignmentRepo = {
    voidAllPendingForEvent: jest.fn(async () => 2),
  };
  const sequences = { nextValue: jest.fn(async () => 1) };
  const featureFlags = { isEnabled: jest.fn(async (_key?: string) => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const dispatcher = { dispatch: jest.fn(async () => undefined) };
  const svc = new EventService(
    prisma as never,
    repo as never,
    participantRepo as never,
    feeAssignmentRepo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  return { svc, prisma, repo, participantRepo, feeAssignmentRepo, sequences, featureFlags, outbox, audit, dispatcher };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: 'user-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('EventService.create', () => {
  it('creates a DRAFT event, allocates a code, and publishes EVENT_CREATED outbox', async () => {
    const t = makeService();
    const row = await withCtx(() =>
      t.svc.create({
        name: 'Annual Day',
        eventType: 'CULTURAL',
        category: 'CULTURAL',
        startDate: new Date('2026-07-15'),
        endDate: new Date('2026-07-15'),
      }),
    );
    expect(row.code).toBe('EVT-000001');
    expect(t.sequences.nextValue).toHaveBeenCalled();
    expect(t.repo.create).toHaveBeenCalled();
    const outboxCall = (t.outbox.publish.mock.calls[0]! as unknown as [unknown, { topic: string }])[1];
    expect(outboxCall.topic).toBe(EventsOutboxTopics.EVENT_CREATED);
    expect(t.audit.record).toHaveBeenCalled();
  });

  it('rejects when endDate < startDate', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          name: 'X',
          eventType: 'CULTURAL',
          category: 'CULTURAL',
          startDate: new Date('2026-07-15'),
          endDate: new Date('2026-07-14'),
        }),
      ),
    ).rejects.toBeInstanceOf(EventDateRangeInvalidError);
  });

  it('rejects paid event with no feeHeadId', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          name: 'Paid',
          eventType: 'WORKSHOP',
          category: 'WORKSHOP',
          startDate: new Date('2026-07-15'),
          endDate: new Date('2026-07-15'),
          isFree: false,
        }),
      ),
    ).rejects.toBeInstanceOf(EventFeeHeadMissingError);
  });

  it('refuses duplicate code', async () => {
    const t = makeService();
    t.repo.findActiveByCode.mockResolvedValueOnce(makeEvent({ code: 'EVT-CUSTOM' }));
    await expect(
      withCtx(() =>
        t.svc.create({
          code: 'EVT-CUSTOM',
          name: 'X',
          eventType: 'CULTURAL',
          category: 'CULTURAL',
          startDate: new Date('2026-07-15'),
          endDate: new Date('2026-07-15'),
        } as never),
      ),
    ).rejects.toBeInstanceOf(DuplicateEventCodeError);
  });
});

describe('EventService.update', () => {
  it('after publish, refuses to edit non-whitelisted fields (e.g. name)', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'PUBLISHED' }));
    await expect(
      withCtx(() => t.svc.update('evt-1', 1, { name: 'renamed' } as never)),
    ).rejects.toBeInstanceOf(EventNotEditableError);
  });

  it('after publish, permits whitelisted schedule shift (e.g. venue)', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'PUBLISHED' }));
    await withCtx(() => t.svc.update('evt-1', 1, { venue: 'Hall B' } as never));
    expect(t.repo.update).toHaveBeenCalled();
  });

  it('throws EventNotFoundError when row missing', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => null);
    await expect(
      withCtx(() => t.svc.update('missing', 1, { venue: 'X' } as never)),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });
});

describe('EventService.schedule / publish / start / complete', () => {
  it('DRAFT → SCHEDULED → PUBLISHED → ONGOING → COMPLETED happy path', async () => {
    const t = makeService();
    t.repo.findById = jest
      .fn()
      .mockResolvedValueOnce(makeEvent({ status: 'DRAFT' }))
      .mockResolvedValueOnce(makeEvent({ status: 'SCHEDULED' }))
      .mockResolvedValueOnce(makeEvent({ status: 'PUBLISHED' }))
      .mockResolvedValueOnce(makeEvent({ status: 'ONGOING' }));

    await withCtx(() => t.svc.schedule('evt-1', 1));
    await withCtx(() => t.svc.publish('evt-1', 2));
    await withCtx(() => t.svc.start('evt-1', 3));
    await withCtx(() => t.svc.complete('evt-1', 4));

    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toEqual([
      EventsOutboxTopics.EVENT_SCHEDULED,
      EventsOutboxTopics.EVENT_PUBLISHED,
      EventsOutboxTopics.EVENT_STARTED,
      EventsOutboxTopics.EVENT_COMPLETED,
    ]);
    expect(t.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it('publish from DRAFT is refused', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'DRAFT' }));
    await expect(
      withCtx(() => t.svc.publish('evt-1', 1)),
    ).rejects.toBeInstanceOf(EventInvalidStateTransitionError);
  });

  it('publish refused when ALLOW_PUBLISH flag is off', async () => {
    const t = makeService();
    t.featureFlags.isEnabled.mockImplementation(async (key?: string) =>
      key === 'events.allow_publish' ? false : true,
    );
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'SCHEDULED' }));
    await expect(
      withCtx(() => t.svc.publish('evt-1', 1)),
    ).rejects.toBeInstanceOf(EventNotEditableError);
  });
});

describe('EventService.cancel', () => {
  it('cancels event + cascades participants + voids fee assignments', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'PUBLISHED' }));
    const row = await withCtx(() => t.svc.cancel('evt-1', 1, 'rain'));
    expect(row.status).toBe('CANCELLED');
    expect(t.participantRepo.cancelAllForEvent).toHaveBeenCalledWith('evt-1', 'rain', {});
    expect(t.feeAssignmentRepo.voidAllPendingForEvent).toHaveBeenCalledWith('evt-1', 'rain', {});
    const outbox = (t.outbox.publish.mock.calls[0]! as unknown as [unknown, { topic: string; payload: { cancelledParticipants: number; voidedAssignments: number } }])[1];
    expect(outbox.topic).toBe(EventsOutboxTopics.EVENT_CANCELLED);
    expect(outbox.payload.cancelledParticipants).toBe(3);
    expect(outbox.payload.voidedAssignments).toBe(2);
    expect(t.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it('refuses cancel when already CANCELLED or COMPLETED', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'COMPLETED' }));
    await expect(withCtx(() => t.svc.cancel('evt-1', 1, null))).rejects.toBeInstanceOf(
      EventInvalidStateTransitionError,
    );
  });
});

describe('EventService.softDelete', () => {
  it('refuses delete on PUBLISHED event', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'PUBLISHED' }));
    await expect(withCtx(() => t.svc.softDelete('evt-1', 1))).rejects.toBeInstanceOf(
      EventNotEditableError,
    );
  });

  it('permits delete on DRAFT event and publishes EVENT_DELETED outbox', async () => {
    const t = makeService();
    t.repo.findById = jest.fn(async () => makeEvent({ status: 'DRAFT' }));
    await withCtx(() => t.svc.softDelete('evt-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledWith('evt-1', 1, {});
    const outbox = (t.outbox.publish.mock.calls[0]! as unknown as [unknown, { topic: string }])[1];
    expect(outbox.topic).toBe(EventsOutboxTopics.EVENT_DELETED);
  });
});
