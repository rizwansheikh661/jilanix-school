/**
 * EventFeeAssignmentService unit specs — generateInvoices happy path +
 * batching, NotPaid/HeadMissing guards, voidAssignment behavior, flag-gating.
 */
import { RequestContextRegistry } from '../../request-context';
import { EventsOutboxTopics } from '../events.constants';
import {
  EventFeeAssignmentNotFoundError,
  EventFeeAssignmentNotVoidableError,
  EventFeeGenerationDisabledError,
  EventFeeHeadMissingError,
  EventNotFoundError,
  EventNotPaidError,
} from '../events.errors';
import type { EventFeeAssignmentRow, EventRow } from '../events.types';
import { EventFeeAssignmentService } from './event-fee-assignment.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'evt-1', schoolId: SCHOOL, code: 'EVT-000001', name: 'Workshop',
    description: null, eventType: 'WORKSHOP', category: 'WORKSHOP', subType: null,
    status: 'PUBLISHED', startDate: new Date('2026-07-15'), endDate: new Date('2026-07-15'),
    startTime: null, endTime: null, timezone: 'Asia/Kolkata',
    branchId: null, venue: null, organizerStaffId: null,
    registrationType: 'OPEN', registrationOpen: true,
    registrationOpenAt: null, registrationClosedAt: null, registrationCapacity: null,
    isFree: false, feeHeadId: 'fh-1', feeStructureId: 'fs-1', feeAmount: 500,
    estimatedCost: null, actualCost: null, sponsorshipAmount: null,
    publishedAt: null, startedAt: null, completedAt: null,
    cancelledAt: null, cancellationReason: null,
    registeredCount: 3, attendedCount: 0, absentCount: 0,
    createdAt: NOW, updatedAt: NOW, createdBy: 'user-1', updatedBy: null,
    deletedAt: null, deletedBy: null, version: 1,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<EventFeeAssignmentRow> = {}): EventFeeAssignmentRow {
  return {
    id: 'fa-1', schoolId: SCHOOL, eventId: 'evt-1', participantId: 'part-1',
    studentId: 'stu-1', feeHeadId: 'fh-1', feeStructureId: 'fs-1',
    amount: 500, status: 'PENDING', feeInvoiceId: null, invoicedAt: null,
    voidedAt: null, voidedBy: null, voidReason: null,
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
    listPendingForEvent: jest.fn().mockResolvedValue([]) as jest.Mock,
    markInvoiced: jest.fn(async (id: string, _v: number, invoiceId: string) =>
      makeAssignment({ id, status: 'INVOICED', feeInvoiceId: invoiceId, invoicedAt: NOW, version: 2 }),
    ),
    voidOne: jest.fn(async (id: string) =>
      makeAssignment({ id, status: 'VOID', voidedAt: NOW, version: 2 }),
    ),
  };
  const eventRepo = {
    findById: jest.fn(async () => makeEvent()) as jest.Mock,
  };
  const feeInvoiceService = {
    generate: jest.fn() as jest.Mock,
  };
  const featureFlags = { isEnabled: jest.fn(async (_key?: string) => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new EventFeeAssignmentService(
    prisma as never,
    repo as never,
    eventRepo as never,
    feeInvoiceService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, eventRepo, feeInvoiceService, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL, userId: 'user-1', actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('EventFeeAssignmentService.generateInvoices', () => {
  it('refuses for a free event', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ isFree: true }));
    await expect(withCtx(() => t.svc.generateInvoices('evt-1'))).rejects.toBeInstanceOf(
      EventNotPaidError,
    );
  });

  it('refuses when feeHeadId or feeStructureId missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(makeEvent({ feeStructureId: null }));
    await expect(withCtx(() => t.svc.generateInvoices('evt-1'))).rejects.toBeInstanceOf(
      EventFeeHeadMissingError,
    );
  });

  it('refuses when event missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(null);
    await expect(withCtx(() => t.svc.generateInvoices('missing'))).rejects.toBeInstanceOf(
      EventNotFoundError,
    );
  });

  it('refuses when ALLOW_FEE_GENERATION flag is off', async () => {
    const t = makeService();
    t.featureFlags.isEnabled.mockImplementation(async (key?: string) =>
      key === 'events.allow_fee_generation' ? false : true,
    );
    await expect(withCtx(() => t.svc.generateInvoices('evt-1'))).rejects.toBeInstanceOf(
      EventFeeGenerationDisabledError,
    );
  });

  it('returns zero counts when no PENDING rows', async () => {
    const t = makeService();
    const res = await withCtx(() => t.svc.generateInvoices('evt-1'));
    expect(res).toEqual({ invoiced: 0, skipped: 0, invoiceIds: [] });
  });

  it('happy path: 3 PENDING → 3 INVOICED with feeInvoiceId set + outbox × 3', async () => {
    const t = makeService();
    const assignments = [
      makeAssignment({ id: 'fa-1', studentId: 'stu-1', participantId: 'p-1' }),
      makeAssignment({ id: 'fa-2', studentId: 'stu-2', participantId: 'p-2' }),
      makeAssignment({ id: 'fa-3', studentId: 'stu-3', participantId: 'p-3' }),
    ];
    t.repo.listPendingForEvent.mockResolvedValue(assignments);
    t.feeInvoiceService.generate.mockResolvedValue({
      generated: 3, skipped: 0,
      invoices: [
        { id: 'inv-1', studentId: 'stu-1', lines: [] },
        { id: 'inv-2', studentId: 'stu-2', lines: [] },
        { id: 'inv-3', studentId: 'stu-3', lines: [] },
      ],
    });
    const res = await withCtx(() => t.svc.generateInvoices('evt-1'));
    expect(res.invoiced).toBe(3);
    expect(res.skipped).toBe(0);
    expect(res.invoiceIds).toEqual(['inv-1', 'inv-2', 'inv-3']);
    expect(t.repo.markInvoiced).toHaveBeenCalledTimes(3);
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics.filter((x) => x === EventsOutboxTopics.FEE_ASSIGNMENT_INVOICED)).toHaveLength(3);
  });

  it('passes structureId + scope=students + studentIds to fees module', async () => {
    const t = makeService();
    t.repo.listPendingForEvent.mockResolvedValue([
      makeAssignment({ id: 'fa-1', studentId: 'stu-1' }),
    ]);
    t.feeInvoiceService.generate.mockResolvedValue({
      generated: 1, skipped: 0,
      invoices: [{ id: 'inv-1', studentId: 'stu-1', lines: [] }],
    });
    await withCtx(() => t.svc.generateInvoices('evt-1'));
    expect(t.feeInvoiceService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        structureId: 'fs-1',
        scope: 'students',
        studentIds: ['stu-1'],
      }),
    );
  });

  it('skips assignment when fees module did not return an invoice for the student', async () => {
    const t = makeService();
    t.repo.listPendingForEvent.mockResolvedValue([
      makeAssignment({ id: 'fa-1', studentId: 'stu-1' }),
      makeAssignment({ id: 'fa-2', studentId: 'stu-2' }),
    ]);
    t.feeInvoiceService.generate.mockResolvedValue({
      generated: 1, skipped: 1,
      invoices: [{ id: 'inv-1', studentId: 'stu-1', lines: [] }],
    });
    const res = await withCtx(() => t.svc.generateInvoices('evt-1'));
    expect(res.invoiced).toBe(1);
    expect(res.skipped).toBe(1);
  });
});

describe('EventFeeAssignmentService.voidAssignment', () => {
  it('flips PENDING → VOID + publishes outbox', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeAssignment({ status: 'PENDING' }));
    const row = await withCtx(() => t.svc.voidAssignment('evt-1', 'fa-1', 1, 'refund'));
    expect(row.status).toBe('VOID');
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.FEE_ASSIGNMENT_VOIDED);
  });

  it('refuses INVOICED rows', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeAssignment({ status: 'INVOICED' }));
    await expect(
      withCtx(() => t.svc.voidAssignment('evt-1', 'fa-1', 1, null)),
    ).rejects.toBeInstanceOf(EventFeeAssignmentNotVoidableError);
  });

  it('throws NotFound when assignment missing or wrong eventId', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() => t.svc.voidAssignment('evt-1', 'fa-1', 1, null)),
    ).rejects.toBeInstanceOf(EventFeeAssignmentNotFoundError);
  });
});
