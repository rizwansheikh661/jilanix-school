/**
 * EventAttendanceService unit specs — mark single + bulk, latest-row-wins
 * counter delta math, MANUAL-only enforcement, EventNotFound/ParticipantNotFound.
 */
import { RequestContextRegistry } from '../../request-context';
import { EventsOutboxTopics } from '../events.constants';
import {
  EventAttendanceMethodUnsupportedError,
  EventNotFoundError,
  EventParticipantNotFoundError,
} from '../events.errors';
import type {
  EventAttendanceRow,
  EventParticipantRow,
  EventRow,
} from '../events.types';
import { EventAttendanceService } from './event-attendance.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makeEvent(): EventRow {
  return {
    id: 'evt-1', schoolId: SCHOOL, code: 'EVT-000001', name: 'Annual Day',
    description: null, eventType: 'CULTURAL', category: 'CULTURAL', subType: null,
    status: 'ONGOING', startDate: new Date('2026-07-15'), endDate: new Date('2026-07-15'),
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

function makeAttendance(overrides: Partial<EventAttendanceRow> = {}): EventAttendanceRow {
  return {
    id: 'att-1', schoolId: SCHOOL, eventId: 'evt-1', participantId: 'part-1',
    status: 'ATTENDED', method: 'MANUAL', occurredAt: NOW,
    markedBy: 'user-1', deviceRef: null, notes: null,
    createdAt: NOW, createdBy: 'user-1',
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn().mockResolvedValue({ rows: [], nextCursorId: null }) as jest.Mock,
    latestPerParticipant: jest.fn().mockResolvedValue(new Map()) as jest.Mock,
    latestForParticipant: jest.fn().mockResolvedValue(null) as jest.Mock,
    append: jest.fn(async (input: { status: string }) =>
      makeAttendance({ status: input.status as 'ATTENDED' }),
    ),
  };
  const eventRepo = {
    findById: jest.fn(async () => makeEvent()) as jest.Mock,
    bumpCounters: jest.fn(),
  };
  const participantRepo = {
    findById: jest.fn(async () => makeParticipant()) as jest.Mock,
  };
  const featureFlags = { isEnabled: jest.fn(async (_key?: string) => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new EventAttendanceService(
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

describe('EventAttendanceService.mark', () => {
  it('appends ledger row + publishes ATTENDANCE_MARKED outbox', async () => {
    const t = makeService();
    const row = await withCtx(() =>
      t.svc.mark({
        eventId: 'evt-1', participantId: 'part-1', status: 'ATTENDED', method: 'MANUAL',
      }),
    );
    expect(row.status).toBe('ATTENDED');
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.ATTENDANCE_MARKED);
  });

  it('REGISTERED → ATTENDED bumps attended by +1', async () => {
    const t = makeService();
    await withCtx(() =>
      t.svc.mark({
        eventId: 'evt-1', participantId: 'part-1', status: 'ATTENDED', method: 'MANUAL',
      }),
    );
    expect(t.eventRepo.bumpCounters).toHaveBeenCalledWith('evt-1', { attended: 1, absent: 0 }, {});
  });

  it('ATTENDED → ABSENT decrements attended and bumps absent', async () => {
    const t = makeService();
    t.repo.latestForParticipant.mockResolvedValue(makeAttendance({ status: 'ATTENDED' }));
    await withCtx(() =>
      t.svc.mark({
        eventId: 'evt-1', participantId: 'part-1', status: 'ABSENT', method: 'MANUAL',
      }),
    );
    expect(t.eventRepo.bumpCounters).toHaveBeenCalledWith('evt-1', { attended: -1, absent: 1 }, {});
  });

  it('ATTENDED → REGISTERED only decrements attended', async () => {
    const t = makeService();
    t.repo.latestForParticipant.mockResolvedValue(makeAttendance({ status: 'ATTENDED' }));
    await withCtx(() =>
      t.svc.mark({
        eventId: 'evt-1', participantId: 'part-1', status: 'REGISTERED', method: 'MANUAL',
      }),
    );
    expect(t.eventRepo.bumpCounters).toHaveBeenCalledWith('evt-1', { attended: -1, absent: 0 }, {});
  });

  it('no-op when latest already matches (no counter bump)', async () => {
    const t = makeService();
    t.repo.latestForParticipant.mockResolvedValue(makeAttendance({ status: 'ATTENDED' }));
    await withCtx(() =>
      t.svc.mark({
        eventId: 'evt-1', participantId: 'part-1', status: 'ATTENDED', method: 'MANUAL',
      }),
    );
    expect(t.eventRepo.bumpCounters).not.toHaveBeenCalled();
  });

  it('rejects non-MANUAL method (QR/RFID reserved)', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.mark({
          eventId: 'evt-1', participantId: 'part-1', status: 'ATTENDED', method: 'QR' as never,
        }),
      ),
    ).rejects.toBeInstanceOf(EventAttendanceMethodUnsupportedError);
  });

  it('throws EventNotFoundError when event missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.mark({
          eventId: 'evt-missing', participantId: 'part-1', status: 'ATTENDED', method: 'MANUAL',
        }),
      ),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it('throws ParticipantNotFoundError when participant belongs to another event', async () => {
    const t = makeService();
    t.participantRepo.findById.mockResolvedValue({ ...makeParticipant(), eventId: 'evt-other' });
    await expect(
      withCtx(() =>
        t.svc.mark({
          eventId: 'evt-1', participantId: 'part-1', status: 'ATTENDED', method: 'MANUAL',
        }),
      ),
    ).rejects.toBeInstanceOf(EventParticipantNotFoundError);
  });
});

describe('EventAttendanceService.markBulk', () => {
  it('marks every participant + returns counts', async () => {
    const t = makeService();
    const res = await withCtx(() =>
      t.svc.markBulk('evt-1', [
        { participantId: 'p1', status: 'ATTENDED', method: 'MANUAL' },
        { participantId: 'p2', status: 'ATTENDED', method: 'MANUAL' },
      ]),
    );
    expect(res).toEqual({ marked: 2, skipped: 0 });
  });

  it('skips ParticipantNotFound entries and continues', async () => {
    const t = makeService();
    t.participantRepo.findById
      .mockResolvedValueOnce(makeParticipant())
      .mockResolvedValueOnce(null);
    const res = await withCtx(() =>
      t.svc.markBulk('evt-1', [
        { participantId: 'p1', status: 'ATTENDED', method: 'MANUAL' },
        { participantId: 'p-missing', status: 'ATTENDED', method: 'MANUAL' },
      ]),
    );
    expect(res).toEqual({ marked: 1, skipped: 1 });
  });

  it('rejects entire batch when any entry uses non-MANUAL method', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.markBulk('evt-1', [
          { participantId: 'p1', status: 'ATTENDED', method: 'MANUAL' },
          { participantId: 'p2', status: 'ATTENDED', method: 'RFID' as never },
        ]),
      ),
    ).rejects.toBeInstanceOf(EventAttendanceMethodUnsupportedError);
  });
});
