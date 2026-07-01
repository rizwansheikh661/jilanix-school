/**
 * Sprint 11 e2e — participants flow. OPEN registration → 3 individual
 * registrations → cancel event → all participants cancelled. Approval
 * flow tested for APPROVAL_REQUIRED events.
 */
import { EventsOutboxTopics } from '../../src/core/events/events.constants';
import { EventInvitationOnlyError } from '../../src/core/events/events.errors';
import { createSprint11Harness } from './helpers';

describe('Sprint 11 e2e — participants', () => {
  async function openEvent(h: ReturnType<typeof createSprint11Harness>, overrides: { registrationType?: 'OPEN' | 'APPROVAL_REQUIRED' | 'INVITATION_ONLY' } = {}) {
    const created = await h.withCtx(() =>
      h.eventService.create({
        name: 'Annual Day',
        eventType: 'CULTURAL',
        category: 'CULTURAL',
        startDate: new Date('2026-07-15'),
        endDate: new Date('2026-07-15'),
        registrationType: overrides.registrationType ?? 'OPEN',
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
    return opened;
  }

  it('OPEN: 3 registrations → registered counter = 3 + outbox events', async () => {
    const h = createSprint11Harness();
    const event = await openEvent(h);
    for (const uid of ['u-1', 'u-2', 'u-3']) {
      await h.withCtx(() =>
        h.participantService.register({
          eventId: event.id,
          audience: 'STUDENT',
          userId: uid,
          studentId: `stu-${uid}`,
        }),
      );
    }
    expect(h.state.events.get(event.id)!.registeredCount).toBe(3);
    const participantTopics = h.outboxTopics().filter(
      (t) => t === EventsOutboxTopics.PARTICIPANT_REGISTERED,
    );
    expect(participantTopics).toHaveLength(3);
  });

  it('event cancel cascades all PENDING + REGISTERED participants to CANCELLED', async () => {
    const h = createSprint11Harness();
    const event = await openEvent(h);
    await h.withCtx(() =>
      h.participantService.register({
        eventId: event.id, audience: 'STUDENT', userId: 'u-1', studentId: 'stu-1',
      }),
    );
    await h.withCtx(() =>
      h.participantService.register({
        eventId: event.id, audience: 'STUDENT', userId: 'u-2', studentId: 'stu-2',
      }),
    );
    const fresh = h.state.events.get(event.id)!;
    await h.withCtx(() => h.eventService.cancel(event.id, fresh.version, 'rain'));
    const after = h.state.events.get(event.id)!;
    expect(after.status).toBe('CANCELLED');
    const participants = [...h.state.participants.values()];
    expect(participants).toHaveLength(2);
    expect(participants.every((p) => p.status === 'CANCELLED')).toBe(true);
    expect(h.outboxTopics()).toContain(EventsOutboxTopics.EVENT_CANCELLED);
  });

  it('INVITATION_ONLY refuses public register', async () => {
    const h = createSprint11Harness();
    const event = await openEvent(h, { registrationType: 'INVITATION_ONLY' });
    await expect(
      h.withCtx(() =>
        h.participantService.register({
          eventId: event.id, audience: 'STUDENT', userId: 'u-1', studentId: 'stu-1',
        }),
      ),
    ).rejects.toBeInstanceOf(EventInvitationOnlyError);
  });

  it('APPROVAL_REQUIRED registration starts PENDING, approve flips to REGISTERED', async () => {
    const h = createSprint11Harness();
    const event = await openEvent(h, { registrationType: 'APPROVAL_REQUIRED' });
    const p = await h.withCtx(() =>
      h.participantService.register({
        eventId: event.id, audience: 'STUDENT', userId: 'u-1', studentId: 'stu-1',
      }),
    );
    expect(p.status).toBe('PENDING');
    expect(h.state.events.get(event.id)!.registeredCount).toBe(0);

    const approved = await h.withCtx(() =>
      h.participantService.approve(event.id, p.id, p.version),
    );
    expect(approved.status).toBe('REGISTERED');
    expect(h.outboxTopics()).toContain(EventsOutboxTopics.PARTICIPANT_APPROVED);
  });
});
