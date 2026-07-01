/**
 * NotificationQueuedOutboxHandler unit spec — verifies the bridge between
 * the `notification.queued` outbox topic and the `notification.send` Job
 * queue. EMAIL/SMS/WHATSAPP must enqueue a job with the correct shape;
 * IN_APP must early-return (with a warn) because IN_APP is delivered
 * synchronously at message-creation time.
 */
import type { OutboxEventRow } from '../../outbox/outbox.types';
import { NotificationsOutboxTopics } from '../notifications.constants';
import {
  NOTIFICATION_SEND_JOB_HANDLER,
  NOTIFICATION_SEND_JOB_QUEUE,
  NotificationQueuedOutboxHandler,
} from './notification-queued.outbox-handler';

const SCHOOL = 'school-1';
const MESSAGE = 'msg-1';

function makeOutboxEvent(
  payload: Record<string, unknown> | null,
  overrides: Partial<OutboxEventRow> = {},
): OutboxEventRow {
  return {
    id: 'evt-1',
    schoolId: SCHOOL,
    topic: NotificationsOutboxTopics.MESSAGE_QUEUED,
    aggregateType: 'NotificationMessage',
    aggregateId: MESSAGE,
    eventId: 'evtid-1',
    eventType: 'NotificationQueued',
    payload: payload as never,
    headers: null,
    status: 'pending',
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

function makeHandler() {
  const outboxRegistry = { registerTopic: jest.fn() };
  const jobs = { enqueue: jest.fn(async () => ({ id: 'job-1' })) };
  const handler = new NotificationQueuedOutboxHandler(
    outboxRegistry as never,
    jobs as never,
  );
  return { handler, outboxRegistry, jobs };
}

/** Invoke the registered topic handler exactly as the outbox dispatcher
 * would, so the spec exercises the real handler closure rather than a
 * private method. */
async function dispatch(
  registered: jest.Mock,
  event: OutboxEventRow,
): Promise<void> {
  const calls = registered.mock.calls as Array<[string, (e: OutboxEventRow) => Promise<void>]>;
  const subscription = calls.find(
    (c) => c[0] === NotificationsOutboxTopics.MESSAGE_QUEUED,
  );
  expect(subscription).toBeDefined();
  await subscription![1](event);
}

describe('NotificationQueuedOutboxHandler', () => {
  it('subscribes to notification.queued on bootstrap', () => {
    const { handler, outboxRegistry } = makeHandler();
    handler.onApplicationBootstrap();
    expect(outboxRegistry.registerTopic).toHaveBeenCalledWith(
      NotificationsOutboxTopics.MESSAGE_QUEUED,
      expect.any(Function),
    );
  });

  it('enqueues a notification.send Job for EMAIL payloads', async () => {
    const { handler, outboxRegistry, jobs } = makeHandler();
    handler.onApplicationBootstrap();
    await dispatch(outboxRegistry.registerTopic as jest.Mock, makeOutboxEvent({
      messageId: MESSAGE,
      schoolId: SCHOOL,
      channel: 'EMAIL',
      recipientUserId: 'user-1',
    }));

    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: NOTIFICATION_SEND_JOB_QUEUE,
        handlerName: NOTIFICATION_SEND_JOB_HANDLER,
        schoolId: SCHOOL,
        payload: { messageId: MESSAGE, schoolId: SCHOOL },
        runAt: expect.any(Date),
      }),
    );
  });

  it('early-returns (no enqueue) when channel is IN_APP', async () => {
    const { handler, outboxRegistry, jobs } = makeHandler();
    handler.onApplicationBootstrap();
    await dispatch(outboxRegistry.registerTopic as jest.Mock, makeOutboxEvent({
      messageId: MESSAGE,
      schoolId: SCHOOL,
      channel: 'IN_APP',
      recipientUserId: 'user-1',
    }));
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('throws on malformed payloads (missing channel)', async () => {
    const { handler, outboxRegistry, jobs } = makeHandler();
    handler.onApplicationBootstrap();
    await expect(
      dispatch(outboxRegistry.registerTopic as jest.Mock, makeOutboxEvent({
        messageId: MESSAGE,
        schoolId: SCHOOL,
      } as never)),
    ).rejects.toThrow(/notification\.queued payload malformed/);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});
