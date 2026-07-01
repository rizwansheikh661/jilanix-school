/**
 * Sprint 11 e2e — paid-event fees flow. Paid event → register 3 students →
 * 3 PENDING EventFeeAssignment rows auto-created → generate-invoices →
 * 3 INVOICED with feeInvoiceId set + 3 outbox events. FeeInvoiceService
 * called with expected structure/scope/studentIds.
 */
import { EventsOutboxTopics } from '../../src/core/events/events.constants';
import { createSprint11Harness } from './helpers';

describe('Sprint 11 e2e — paid event fees', () => {
  it('paid event: register 3 → 3 PENDING assignments → generate-invoices → 3 INVOICED', async () => {
    const h = createSprint11Harness();
    const created = await h.withCtx(() =>
      h.eventService.create({
        name: 'AI Workshop',
        eventType: 'WORKSHOP',
        category: 'WORKSHOP',
        startDate: new Date('2026-07-20'),
        endDate: new Date('2026-07-20'),
        isFree: false,
        feeHeadId: 'fh-1',
        feeStructureId: 'fs-1',
        feeAmount: 500,
      } as never),
    );
    const scheduled = await h.withCtx(() =>
      h.eventService.schedule(created.id, created.version),
    );
    const published = await h.withCtx(() =>
      h.eventService.publish(created.id, scheduled.version),
    );
    const opened = await h.withCtx(() =>
      h.eventService.openRegistration(created.id, published.version),
    );

    for (const sid of ['stu-1', 'stu-2', 'stu-3']) {
      await h.withCtx(() =>
        h.participantService.register({
          eventId: created.id,
          audience: 'STUDENT',
          userId: `u-${sid}`,
          studentId: sid,
        }),
      );
    }
    const pending = [...h.state.feeAssignments.values()].filter(
      (f) => f.status === 'PENDING',
    );
    expect(pending).toHaveLength(3);
    expect(pending.every((f) => f.amount === 500)).toBe(true);

    const summary = await h.withCtx(() =>
      h.feeAssignmentService.generateInvoices(opened.id),
    );
    expect(summary).toEqual(
      expect.objectContaining({ invoiced: 3, skipped: 0 }),
    );
    expect(summary.invoiceIds).toHaveLength(3);

    const invoiced = [...h.state.feeAssignments.values()].filter(
      (f) => f.status === 'INVOICED',
    );
    expect(invoiced).toHaveLength(3);
    expect(invoiced.every((f) => f.feeInvoiceId !== null)).toBe(true);

    expect(h.feeInvoiceService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        structureId: 'fs-1',
        scope: 'students',
        studentIds: expect.arrayContaining(['stu-1', 'stu-2', 'stu-3']),
      }),
    );

    const invoicedTopics = h.outboxTopics().filter(
      (t) => t === EventsOutboxTopics.FEE_ASSIGNMENT_INVOICED,
    );
    expect(invoicedTopics).toHaveLength(3);
  });

  it('cancel paid event voids all PENDING fee assignments', async () => {
    const h = createSprint11Harness();
    const created = await h.withCtx(() =>
      h.eventService.create({
        name: 'AI Workshop',
        eventType: 'WORKSHOP',
        category: 'WORKSHOP',
        startDate: new Date('2026-07-20'),
        endDate: new Date('2026-07-20'),
        isFree: false,
        feeHeadId: 'fh-1',
        feeStructureId: 'fs-1',
        feeAmount: 500,
      } as never),
    );
    const scheduled = await h.withCtx(() =>
      h.eventService.schedule(created.id, created.version),
    );
    const published = await h.withCtx(() =>
      h.eventService.publish(created.id, scheduled.version),
    );
    const opened = await h.withCtx(() =>
      h.eventService.openRegistration(created.id, published.version),
    );

    await h.withCtx(() =>
      h.participantService.register({
        eventId: created.id, audience: 'STUDENT', userId: 'u-1', studentId: 'stu-1',
      }),
    );
    const fresh = h.state.events.get(opened.id)!;
    await h.withCtx(() => h.eventService.cancel(opened.id, fresh.version, 'cancelled'));

    const voided = [...h.state.feeAssignments.values()].filter(
      (f) => f.status === 'VOID',
    );
    expect(voided).toHaveLength(1);
  });
});
