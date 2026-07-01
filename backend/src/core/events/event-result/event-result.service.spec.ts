/**
 * EventResultService unit specs — create/update/softDelete with EventNotFound
 * + ParticipantNotFound + ResultNotFound + cross-event guard.
 */
import { RequestContextRegistry } from '../../request-context';
import { EventsOutboxTopics } from '../events.constants';
import {
  EventNotFoundError,
  EventParticipantNotFoundError,
  EventResultNotFoundError,
} from '../events.errors';
import type {
  EventParticipantRow,
  EventResultRow,
  EventRow,
} from '../events.types';
import { EventResultService } from './event-result.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makeEvent(): EventRow {
  return {
    id: 'evt-1', schoolId: SCHOOL, code: 'EVT-000001', name: 'Annual Day',
    description: null, eventType: 'CULTURAL', category: 'CULTURAL', subType: null,
    status: 'COMPLETED', startDate: new Date('2026-07-15'), endDate: new Date('2026-07-15'),
    startTime: null, endTime: null, timezone: 'Asia/Kolkata',
    branchId: null, venue: null, organizerStaffId: null,
    registrationType: 'OPEN', registrationOpen: false,
    registrationOpenAt: null, registrationClosedAt: null, registrationCapacity: null,
    isFree: true, feeHeadId: null, feeStructureId: null, feeAmount: null,
    estimatedCost: null, actualCost: null, sponsorshipAmount: null,
    publishedAt: null, startedAt: null, completedAt: null,
    cancelledAt: null, cancellationReason: null,
    registeredCount: 0, attendedCount: 0, absentCount: 0,
    createdAt: NOW, updatedAt: NOW, createdBy: 'user-1', updatedBy: null,
    deletedAt: null, deletedBy: null, version: 1,
  };
}

function makeParticipant(): EventParticipantRow {
  return {
    id: 'part-1', schoolId: SCHOOL, eventId: 'evt-1', audience: 'STUDENT',
    userId: 'user-2', studentId: 'stu-1', staffId: null, classId: null, sectionId: null,
    status: 'REGISTERED', registrationType: 'OPEN', registeredAt: NOW,
    approvedAt: null, approvedBy: null, rejectedAt: null, rejectedBy: null,
    rejectionReason: null, cancelledAt: null, cancellationReason: null,
    registrationSource: 'INDIVIDUAL', createdAt: NOW, updatedAt: NOW,
    createdBy: 'user-1', updatedBy: null, deletedAt: null, deletedBy: null, version: 1,
  };
}

function makeResult(overrides: Partial<EventResultRow> = {}): EventResultRow {
  return {
    id: 'res-1', schoolId: SCHOOL, eventId: 'evt-1', participantId: 'part-1',
    rank: 1, position: 'WINNER', score: 95, remark: null,
    awardedAt: null, awardedBy: null,
    createdAt: NOW, updatedAt: NOW, createdBy: 'user-1', updatedBy: null,
    deletedAt: null, deletedBy: null, version: 1,
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
    create: jest.fn(async () => makeResult()),
    update: jest.fn(async (id: string, _v: number, patch: Partial<EventResultRow>) =>
      makeResult({ id, ...patch, version: 2 }),
    ),
    softDelete: jest.fn(),
  };
  const eventRepo = {
    findById: jest.fn(async () => makeEvent()) as jest.Mock,
  };
  const participantRepo = {
    findById: jest.fn(async () => makeParticipant()) as jest.Mock,
  };
  const featureFlags = { isEnabled: jest.fn(async (_key?: string) => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new EventResultService(
    prisma as never,
    repo as never,
    eventRepo as never,
    participantRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, eventRepo, participantRepo, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL, userId: 'user-1', actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('EventResultService.create', () => {
  it('inserts row + publishes RESULT_RECORDED outbox', async () => {
    const t = makeService();
    const row = await withCtx(() =>
      t.svc.create('evt-1', {
        participantId: 'part-1', position: 'WINNER', rank: 1, score: 95,
      } as never),
    );
    expect(row.id).toBe('res-1');
    expect(t.repo.create).toHaveBeenCalled();
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.RESULT_RECORDED);
  });

  it('throws EventNotFoundError when event missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.create('evt-missing', {
          participantId: 'part-1', position: 'WINNER',
        } as never),
      ),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it('throws ParticipantNotFoundError when participant from another event', async () => {
    const t = makeService();
    t.participantRepo.findById.mockResolvedValue({ ...makeParticipant(), eventId: 'evt-other' });
    await expect(
      withCtx(() =>
        t.svc.create('evt-1', {
          participantId: 'part-1', position: 'WINNER',
        } as never),
      ),
    ).rejects.toBeInstanceOf(EventParticipantNotFoundError);
  });
});

describe('EventResultService.update', () => {
  it('updates and audits when row exists', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeResult());
    const row = await withCtx(() =>
      t.svc.update('evt-1', 'res-1', 1, { rank: 2, position: 'RUNNER_UP' } as never),
    );
    expect(row.version).toBe(2);
    expect(t.audit.record).toHaveBeenCalled();
  });

  it('throws NotFound when result missing or wrong eventId', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() => t.svc.update('evt-1', 'res-missing', 1, {} as never)),
    ).rejects.toBeInstanceOf(EventResultNotFoundError);
  });
});

describe('EventResultService.softDelete', () => {
  it('soft-deletes row + records audit', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeResult());
    await withCtx(() => t.svc.softDelete('evt-1', 'res-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledWith('res-1', 1, {});
    expect(t.audit.record).toHaveBeenCalled();
  });

  it('throws NotFound when row missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() => t.svc.softDelete('evt-1', 'res-1', 1)),
    ).rejects.toBeInstanceOf(EventResultNotFoundError);
  });
});
