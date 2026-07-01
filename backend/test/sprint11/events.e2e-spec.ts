/**
 * Sprint 11 e2e — full event lifecycle DRAFT → SCHEDULED → PUBLISHED →
 * ONGOING → COMPLETED. Outbox topics asserted in order. PATCH refused for
 * non-whitelisted field after publish. Notification dispatcher fires at
 * publish + cancel transitions.
 */
import { EventsOutboxTopics } from '../../src/core/events/events.constants';
import { EventNotEditableError } from '../../src/core/events/events.errors';
import { createSprint11Harness } from './helpers';

describe('Sprint 11 e2e — events lifecycle', () => {
  it('full happy-path lifecycle emits correct outbox sequence', async () => {
    const h = createSprint11Harness();
    const created = await h.withCtx(() =>
      h.eventService.create({
        name: 'Annual Day',
        eventType: 'CULTURAL',
        category: 'CULTURAL',
        startDate: new Date('2026-07-15'),
        endDate: new Date('2026-07-15'),
      }),
    );
    expect(created.status).toBe('DRAFT');
    expect(created.code).toMatch(/^EVT-\d+$/);

    const scheduled = await h.withCtx(() =>
      h.eventService.schedule(created.id, created.version),
    );
    expect(scheduled.status).toBe('SCHEDULED');

    const published = await h.withCtx(() =>
      h.eventService.publish(created.id, scheduled.version),
    );
    expect(published.status).toBe('PUBLISHED');

    const started = await h.withCtx(() =>
      h.eventService.start(created.id, published.version),
    );
    expect(started.status).toBe('ONGOING');

    const completed = await h.withCtx(() =>
      h.eventService.complete(created.id, started.version),
    );
    expect(completed.status).toBe('COMPLETED');

    expect(h.outboxTopics()).toEqual([
      EventsOutboxTopics.EVENT_CREATED,
      EventsOutboxTopics.EVENT_SCHEDULED,
      EventsOutboxTopics.EVENT_PUBLISHED,
      EventsOutboxTopics.EVENT_STARTED,
      EventsOutboxTopics.EVENT_COMPLETED,
    ]);

    expect(h.dispatcher.dispatch).toHaveBeenCalled();
    const dispatchedEventKeys = h.dispatcher.dispatch.mock.calls.map(
      (c) => (c[0] as { eventKey: string }).eventKey,
    );
    expect(dispatchedEventKeys).toContain('EVENT_PUBLISHED');
  });

  it('after publish, PATCH on non-whitelisted field is refused', async () => {
    const h = createSprint11Harness();
    const created = await h.withCtx(() =>
      h.eventService.create({
        name: 'Sports Day',
        eventType: 'SPORTS',
        category: 'SPORTS',
        startDate: new Date('2026-07-20'),
        endDate: new Date('2026-07-20'),
      }),
    );
    const scheduled = await h.withCtx(() =>
      h.eventService.schedule(created.id, created.version),
    );
    const published = await h.withCtx(() =>
      h.eventService.publish(created.id, scheduled.version),
    );

    await expect(
      h.withCtx(() =>
        h.eventService.update(created.id, published.version, {
          name: 'Renamed Sports Day',
        } as never),
      ),
    ).rejects.toBeInstanceOf(EventNotEditableError);

    await h.withCtx(() =>
      h.eventService.update(created.id, published.version, {
        venue: 'Stadium B',
      } as never),
    );
    expect(h.state.events.get(created.id)!.venue).toBe('Stadium B');
  });
});
