/**
 * NotificationSendJobHandler unit spec — covers the happy path, the two
 * failure paths (transient retry + dead-letter exhaustion), the
 * permanent CommunicationChannelDisabled branch, and the optimistic-lock
 * VersionConflict retry-once-then-no-op fallback.
 *
 * All collaborators (Prisma, repos, registries, outbox, audit, jobs,
 * DLQ) are hand-rolled jest mocks so the spec stays a pure unit test.
 */
import { VersionConflict } from '../../errors/domain-error';
import type { JobHandler, JobHandlerContext } from '../../jobs/jobs.types';
import { NotificationsOutboxTopics } from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationChannelNotImplementedError,
} from '../notifications.errors';
import type { NotificationMessageRow } from '../notifications.types';
import {
  NOTIFICATION_SEND_JOB_HANDLER,
  NOTIFICATION_SEND_JOB_QUEUE,
} from './notification-queued.outbox-handler';
import { NotificationSendJobHandler } from './notification-send.job-handler';

const SCHOOL = 'school-1';
const MESSAGE = 'msg-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makeMessage(
  overrides: Partial<NotificationMessageRow> = {},
): NotificationMessageRow {
  return {
    id: MESSAGE,
    schoolId: SCHOOL,
    messageNo: null,
    recipientUserId: 'user-1',
    recipientAudience: 'USER' as never,
    recipientAddress: 'user@example.com',
    channel: 'EMAIL' as never,
    category: 'SYSTEM' as never,
    priority: 'MEDIUM' as never,
    notificationTemplateId: null,
    templateVersionNo: null,
    eventKey: null,
    aggregateType: null,
    aggregateId: null,
    subjectRendered: 'Welcome',
    bodyRendered: 'Body',
    dataPayload: null,
    deepLink: null,
    dedupeKey: null,
    status: 'QUEUED' as never,
    scheduledAt: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    lastError: null,
    attemptCount: 0,
    maxAttempts: 5,
    campaignId: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  } as NotificationMessageRow;
}

function makeJobCtx(): JobHandlerContext {
  return {
    job: {
      id: 'job-1',
      schoolId: SCHOOL,
      queue: NOTIFICATION_SEND_JOB_QUEUE,
      type: NOTIFICATION_SEND_JOB_HANDLER,
      payload: { messageId: MESSAGE, schoolId: SCHOOL },
      priority: 0,
      status: 'RUNNING' as never,
      attempts: 1,
      maxAttempts: 5,
      runAt: NOW,
      claimedAt: NOW,
      claimedBy: 'worker-1',
      startedAt: NOW,
      completedAt: null,
      lastError: null,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    },
    attempt: 1,
  };
}

interface Harness {
  handler: NotificationSendJobHandler;
  jobRegistry: { register: jest.Mock };
  messages: {
    findById: jest.Mock;
    updateStatus: jest.Mock;
    appendEvent: jest.Mock;
  };
  channels: {
    resolve: jest.Mock;
    getDefaultProvider: jest.Mock;
  };
  outbox: { publish: jest.Mock };
  audit: { record: jest.Mock };
  jobs: { enqueue: jest.Mock };
  dlq: { create: jest.Mock };
  adapter: { send: jest.Mock; channel: string; providerCode: string };
  invoke: (ctx?: JobHandlerContext) => Promise<void>;
}

function makeHarness(adapterSend?: jest.Mock): Harness {
  const jobRegistry = { register: jest.fn() };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const messages = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
    appendEvent: jest.fn(async () => undefined),
  };
  const adapter = {
    channel: 'EMAIL',
    providerCode: 'ses',
    send:
      adapterSend ??
      jest.fn(async () => ({
        providerCode: 'ses',
        providerStatus: 'DELIVERED',
        providerMessageId: 'prov-msg-1',
      })),
  };
  const channels = {
    getDefaultProvider: jest.fn(() => 'ses'),
    resolve: jest.fn(async () => adapter),
  };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a-1', rowHash: 'h' })) };
  const jobs = { enqueue: jest.fn(async () => ({ id: 'job-2' })) };
  const dlq = { create: jest.fn(async () => undefined) };

  const handler = new NotificationSendJobHandler(
    jobRegistry as never,
    prisma as never,
    messages as never,
    channels as never,
    outbox as never,
    audit as never,
    jobs as never,
    dlq as never,
  );

  handler.onApplicationBootstrap();
  const registered = jobRegistry.register.mock.calls[0]?.[1] as
    | JobHandler<{ messageId: string; schoolId: string }>
    | undefined;
  if (registered === undefined) throw new Error('handler not registered');

  return {
    handler,
    jobRegistry,
    messages,
    channels,
    outbox,
    audit,
    jobs,
    dlq,
    adapter,
    invoke: async (ctx = makeJobCtx()) => {
      await registered({ messageId: MESSAGE, schoolId: SCHOOL }, ctx);
    },
  };
}

describe('NotificationSendJobHandler.onApplicationBootstrap', () => {
  it('registers the handler under NOTIFICATION_SEND_JOB_HANDLER', () => {
    const h = makeHarness();
    expect(h.jobRegistry.register).toHaveBeenCalledWith(
      NOTIFICATION_SEND_JOB_HANDLER,
      expect.any(Function),
    );
  });
});

describe('NotificationSendJobHandler.process — no-op guards', () => {
  it('no-ops when the message is missing (findById returns null)', async () => {
    const h = makeHarness();
    h.messages.findById.mockResolvedValueOnce(null);
    await h.invoke();
    expect(h.adapter.send).not.toHaveBeenCalled();
    expect(h.messages.updateStatus).not.toHaveBeenCalled();
  });

  it('no-ops when message status is not in {QUEUED, FAILED} (e.g. already DELIVERED)', async () => {
    const h = makeHarness();
    h.messages.findById.mockResolvedValueOnce(
      makeMessage({ status: 'DELIVERED' as never }),
    );
    await h.invoke();
    expect(h.adapter.send).not.toHaveBeenCalled();
    expect(h.messages.updateStatus).not.toHaveBeenCalled();
  });

  it('no-ops when message is soft-deleted', async () => {
    const h = makeHarness();
    h.messages.findById.mockResolvedValueOnce(makeMessage({ deletedAt: NOW }));
    await h.invoke();
    expect(h.adapter.send).not.toHaveBeenCalled();
  });
});

describe('NotificationSendJobHandler.process — success path', () => {
  it('QUEUED → SENDING then calls adapter.send', async () => {
    const h = makeHarness();
    const message = makeMessage();
    h.messages.findById.mockResolvedValueOnce(message);
    const sendingRow = makeMessage({ status: 'SENDING' as never, version: 2 });
    h.messages.updateStatus.mockResolvedValueOnce(sendingRow);
    // sentRow, deliveredRow
    h.messages.updateStatus.mockResolvedValue(
      makeMessage({ status: 'SENT' as never, version: 3 }),
    );
    await h.invoke();
    // First updateStatus = transition to SENDING.
    expect(h.messages.updateStatus.mock.calls[0]?.[4]).toMatchObject({
      status: 'SENDING',
    });
    expect(h.adapter.send).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL,
        recipientAddress: 'user@example.com',
        bodyText: 'Body',
        subject: 'Welcome',
      }),
    );
  });

  it('on DELIVERED result: flips status to SENT then DELIVERED, appends SENT+DELIVERED events, publishes notification.delivered, records audit', async () => {
    const h = makeHarness();
    h.messages.findById.mockResolvedValueOnce(makeMessage());
    h.messages.updateStatus.mockResolvedValue(makeMessage({ status: 'SENT' as never, version: 2 }));
    await h.invoke();

    const statusCalls = h.messages.updateStatus.mock.calls.map((c) => c[4]?.status);
    expect(statusCalls).toEqual(['SENDING', 'SENT', 'DELIVERED']);

    const eventTypes = h.messages.appendEvent.mock.calls.map((c) => c[1].eventType);
    expect(eventTypes).toEqual(expect.arrayContaining(['SENT', 'DELIVERED']));

    expect(h.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: NotificationsOutboxTopics.MESSAGE_DELIVERED,
        eventType: 'NotificationDelivered',
      }),
    );

    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification.sent',
        resourceType: 'NotificationMessage',
        after: expect.objectContaining({ status: 'DELIVERED' }),
      }),
      expect.any(Object),
    );
  });
});

describe('NotificationSendJobHandler.process — adapter failure paths', () => {
  it('CommunicationChannelNotImplementedError + retries remaining → FAILED, errorCode=PROVIDER_NOT_IMPLEMENTED, retry enqueued with backoff, outbox notification.failed', async () => {
    const send = jest.fn(async () => {
      throw new CommunicationChannelNotImplementedError('ses');
    });
    const h = makeHarness(send);
    h.messages.findById.mockResolvedValueOnce(makeMessage({ attemptCount: 1, maxAttempts: 5 }));
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'SENDING' as never, attemptCount: 1, maxAttempts: 5, version: 2 }),
    );
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'FAILED' as never, attemptCount: 2, maxAttempts: 5, version: 3 }),
    );

    await h.invoke();

    // Final transition is FAILED with bumped attemptCount.
    const failedCall = h.messages.updateStatus.mock.calls.find(
      (c) => c[4]?.status === 'FAILED',
    );
    expect(failedCall?.[4]).toMatchObject({
      status: 'FAILED',
      attemptCount: 2,
    });

    const failedEvent = h.messages.appendEvent.mock.calls.find(
      (c) => c[1].eventType === 'FAILED',
    );
    expect(failedEvent?.[1]).toMatchObject({
      eventType: 'FAILED',
      errorCode: 'PROVIDER_NOT_IMPLEMENTED',
    });

    expect(h.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: NotificationsOutboxTopics.MESSAGE_FAILED,
        eventType: 'NotificationFailed',
        payload: expect.objectContaining({
          errorCode: 'PROVIDER_NOT_IMPLEMENTED',
          willRetry: true,
          attemptCount: 2,
        }),
      }),
    );

    expect(h.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: NOTIFICATION_SEND_JOB_QUEUE,
        handlerName: NOTIFICATION_SEND_JOB_HANDLER,
        schoolId: SCHOOL,
        payload: { messageId: MESSAGE, schoolId: SCHOOL },
        runAt: expect.any(Date),
      }),
      expect.anything(),
    );
    // No DLQ on a transient failure.
    expect(h.dlq.create).not.toHaveBeenCalled();
  });

  it('attempts exhausted → DEAD_LETTER, appends DEAD_LETTER event, writes JobDeadLetter row, publishes notification.dead_lettered', async () => {
    const send = jest.fn(async () => {
      throw new CommunicationChannelNotImplementedError('ses');
    });
    const h = makeHarness(send);
    h.messages.findById.mockResolvedValueOnce(makeMessage({ attemptCount: 4, maxAttempts: 5 }));
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'SENDING' as never, attemptCount: 4, maxAttempts: 5, version: 2 }),
    );
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'DEAD_LETTER' as never, attemptCount: 5, maxAttempts: 5, version: 3 }),
    );

    await h.invoke();

    const dlqTransition = h.messages.updateStatus.mock.calls.find(
      (c) => c[4]?.status === 'DEAD_LETTER',
    );
    expect(dlqTransition?.[4]).toMatchObject({ status: 'DEAD_LETTER', attemptCount: 5 });

    const dlEvent = h.messages.appendEvent.mock.calls.find(
      (c) => c[1].eventType === 'DEAD_LETTER',
    );
    expect(dlEvent?.[1]).toMatchObject({
      eventType: 'DEAD_LETTER',
      errorCode: 'PROVIDER_NOT_IMPLEMENTED',
    });

    expect(h.dlq.create).toHaveBeenCalledTimes(1);
    expect(h.dlq.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        schoolId: SCHOOL,
        queue: NOTIFICATION_SEND_JOB_QUEUE,
        handlerName: NOTIFICATION_SEND_JOB_HANDLER,
      }),
      expect.anything(),
    );

    expect(h.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: NotificationsOutboxTopics.MESSAGE_DEAD_LETTERED,
        eventType: 'NotificationDeadLettered',
      }),
    );

    // No further retry enqueued on exhaustion.
    expect(h.jobs.enqueue).not.toHaveBeenCalled();
  });

  it('unknown adapter error tags errorCode=ADAPTER_ERROR', async () => {
    const send = jest.fn(async () => {
      throw new Error('boom');
    });
    const h = makeHarness(send);
    h.messages.findById.mockResolvedValueOnce(makeMessage({ attemptCount: 0, maxAttempts: 5 }));
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'SENDING' as never, version: 2 }),
    );
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'FAILED' as never, attemptCount: 1, version: 3 }),
    );

    await h.invoke();

    const failedEvent = h.messages.appendEvent.mock.calls.find(
      (c) => c[1].eventType === 'FAILED',
    );
    expect(failedEvent?.[1]).toMatchObject({
      eventType: 'FAILED',
      errorCode: 'ADAPTER_ERROR',
    });
  });
});

describe('NotificationSendJobHandler.process — channel-disabled is permanent', () => {
  it('CommunicationChannelDisabledError from resolve → DEAD_LETTER straight away, no retry enqueue', async () => {
    const h = makeHarness();
    h.channels.resolve.mockImplementationOnce(async () => {
      throw new CommunicationChannelDisabledError({
        channel: 'EMAIL',
        reason: 'CHANNEL_FLAG_DISABLED',
      });
    });
    h.messages.findById.mockResolvedValueOnce(makeMessage());
    h.messages.updateStatus.mockResolvedValueOnce(
      makeMessage({ status: 'DEAD_LETTER' as never, version: 2 }),
    );

    await h.invoke();

    expect(h.adapter.send).not.toHaveBeenCalled();
    // No SENDING transition either — we jump straight to DEAD_LETTER.
    const statusCalls = h.messages.updateStatus.mock.calls.map((c) => c[4]?.status);
    expect(statusCalls).toEqual(['DEAD_LETTER']);

    const dlEvent = h.messages.appendEvent.mock.calls.find(
      (c) => c[1].eventType === 'DEAD_LETTER',
    );
    expect(dlEvent?.[1]).toMatchObject({
      eventType: 'DEAD_LETTER',
      errorCode: 'CHANNEL_DISABLED',
    });

    expect(h.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: NotificationsOutboxTopics.MESSAGE_DEAD_LETTERED,
      }),
    );
    expect(h.dlq.create).toHaveBeenCalledTimes(1);
    expect(h.jobs.enqueue).not.toHaveBeenCalled();
  });
});

describe('NotificationSendJobHandler — optimistic-lock VersionConflict', () => {
  it('re-fetches and retries once on VersionConflict during transition', async () => {
    const h = makeHarness();
    h.messages.findById
      // First load.
      .mockResolvedValueOnce(makeMessage({ version: 1 }))
      // Re-fetch after first conflict — still in QUEUED so retry proceeds.
      .mockResolvedValueOnce(makeMessage({ version: 2 }));
    // First updateStatus (SENDING) throws VersionConflict.
    h.messages.updateStatus
      .mockImplementationOnce(async () => {
        throw new VersionConflict('NotificationMessage', MESSAGE, 1);
      })
      // Retry succeeds.
      .mockResolvedValueOnce(makeMessage({ status: 'SENDING' as never, version: 3 }))
      // Subsequent SENT / DELIVERED transitions succeed.
      .mockResolvedValue(makeMessage({ status: 'SENT' as never, version: 4 }));

    await h.invoke();
    expect(h.adapter.send).toHaveBeenCalled();
  });

  it('if reloaded row is in a terminal status after conflict → no-op for that transition', async () => {
    const h = makeHarness();
    h.messages.findById
      .mockResolvedValueOnce(makeMessage({ version: 1 }))
      // After the conflict the row has already raced to DELIVERED.
      .mockResolvedValueOnce(makeMessage({ status: 'DELIVERED' as never, version: 9 }));
    h.messages.updateStatus.mockImplementationOnce(async () => {
      throw new VersionConflict('NotificationMessage', MESSAGE, 1);
    });

    await h.invoke();
    // Only the conflicting attempt was made; no further updates and no
    // adapter call because the SENDING transition resolved to null.
    expect(h.messages.updateStatus).toHaveBeenCalledTimes(1);
    expect(h.adapter.send).not.toHaveBeenCalled();
  });
});
