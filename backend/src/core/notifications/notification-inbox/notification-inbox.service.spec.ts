/**
 * NotificationInboxService unit specs — feed filters + cursor, unread
 * count, and the idempotent mark-read paths (single + bulk) including
 * cross-user / cross-channel rejection.
 *
 * Persistence + cross-cutting deps are fully mocked.
 */
import { RequestContextRegistry } from '../../request-context';
import { NotificationsOutboxTopics } from '../notifications.constants';
import { NotificationMessageNotFoundError } from '../notifications.errors';
import type { NotificationMessageRow } from '../notifications.types';
import { NotificationInboxService } from './notification-inbox.service';

const SCHOOL = 'school-1';
const USER = 'user-1';
const NOW = new Date('2026-06-22T12:00:00.000Z');

type Status = NotificationMessageRow['status'];

function makeMessage(overrides: Partial<NotificationMessageRow> = {}): NotificationMessageRow {
  return {
    id: 'msg-1',
    schoolId: SCHOOL,
    messageNo: null,
    recipientUserId: USER,
    recipientAudience: 'USER' as never,
    recipientAddress: USER,
    channel: 'IN_APP' as never,
    category: 'ACADEMIC' as never,
    priority: 'MEDIUM' as never,
    notificationTemplateId: 'tpl-1',
    templateVersionNo: 1,
    eventKey: 'TEST',
    aggregateType: 'TestSend',
    aggregateId: 'tpl-1',
    campaignId: null,
    subjectRendered: 'subj',
    bodyRendered: 'body',
    dataPayload: {},
    deepLink: null,
    dedupeKey: null,
    status: 'DELIVERED' as Status,
    scheduledAt: null,
    sentAt: NOW,
    deliveredAt: NOW,
    readAt: null,
    failedAt: null,
    lastError: null,
    providerCode: null,
    providerMessageId: null,
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: USER,
    updatedBy: USER,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  } as unknown as NotificationMessageRow;
}

interface CaptureCalls {
  findMany: Array<{
    where: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
    cursor?: unknown;
    skip?: number;
  }>;
  count: Array<{ where: Record<string, unknown> }>;
  updateMany: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
  update: Array<{ where: unknown; data: Record<string, unknown> }>;
  eventCreate: Array<{ data: Record<string, unknown> }>;
}

function makeService(opts: {
  findManyResult?: NotificationMessageRow[];
  countResult?: number;
  findFirstResult?: NotificationMessageRow | null;
  findUniqueResult?: NotificationMessageRow | null;
  updateManyCount?: number;
} = {}) {
  const calls: CaptureCalls = {
    findMany: [],
    count: [],
    updateMany: [],
    update: [],
    eventCreate: [],
  };
  const messageStore = {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number; cursor?: unknown; skip?: number }) => {
      calls.findMany.push(args);
      return opts.findManyResult ?? [];
    }),
    count: jest.fn(async (args: { where: Record<string, unknown> }) => {
      calls.count.push(args);
      return opts.countResult ?? 0;
    }),
    findFirst: jest.fn(async () => opts.findFirstResult ?? null),
    findUnique: jest.fn(async () => opts.findUniqueResult ?? null),
    update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
      calls.update.push(args);
      return makeMessage({ readAt: NOW, status: 'READ' as Status });
    }),
    updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      calls.updateMany.push(args);
      return { count: opts.updateManyCount ?? 0 };
    }),
  };
  const eventStore = {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      calls.eventCreate.push(args);
      return { id: 'ev' };
    }),
  };
  const txStore = {
    notificationMessage: messageStore,
    notificationMessageEvent: eventStore,
  };
  const prisma = {
    get client() {
      return txStore;
    },
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txStore)),
  };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const svc = new NotificationInboxService(
    prisma as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return { svc, prisma, outbox, audit, featureFlags, calls, messageStore, eventStore };
}

function withCtx<T>(fn: () => Promise<T>, userId: string = USER): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('NotificationInboxService.feed', () => {
  it('filters to unread (readAt IS NULL) and orders by createdAt desc', async () => {
    const t = makeService({ findManyResult: [makeMessage()] });
    await withCtx(() => t.svc.feed({ unread: true }));
    const args = t.calls.findMany[0]!;
    expect(args.where).toEqual(
      expect.objectContaining({
        schoolId: SCHOOL,
        recipientUserId: USER,
        channel: 'IN_APP',
        deletedAt: null,
        readAt: null,
      }),
    );
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('filters by category when provided', async () => {
    const t = makeService({ findManyResult: [makeMessage({ category: 'ACADEMIC' as never })] });
    await withCtx(() => t.svc.feed({ category: 'ACADEMIC' }));
    expect(t.calls.findMany[0]!.where).toEqual(
      expect.objectContaining({ category: 'ACADEMIC' }),
    );
  });

  it('cursor pagination returns nextCursor when over the limit', async () => {
    const overflow: NotificationMessageRow[] = [];
    for (let i = 0; i < 26; i += 1) {
      overflow.push(makeMessage({ id: `m-${i}` }));
    }
    const t = makeService({ findManyResult: overflow });
    const { items, nextCursor } = await withCtx(() => t.svc.feed({}));
    expect(items.length).toBe(25);
    expect(nextCursor).toBe('m-25');

    const t2 = makeService({ findManyResult: [makeMessage({ id: 'm-100' })] });
    const result = await withCtx(() => t2.svc.feed({ cursor: 'prev-cursor' }));
    expect(result.nextCursor).toBeNull();
    expect(t2.calls.findMany[0]!.cursor).toEqual({
      schoolId_id: { schoolId: SCHOOL, id: 'prev-cursor' },
    });
    expect(t2.calls.findMany[0]!.skip).toBe(1);
  });
});

describe('NotificationInboxService.unreadCount', () => {
  it('returns the single integer from the underlying count query', async () => {
    const t = makeService({ countResult: 7 });
    const { count } = await withCtx(() => t.svc.unreadCount());
    expect(count).toBe(7);
    expect(t.calls.count[0]!.where).toEqual(
      expect.objectContaining({
        schoolId: SCHOOL,
        recipientUserId: USER,
        channel: 'IN_APP',
        readAt: null,
        deletedAt: null,
      }),
    );
  });
});

describe('NotificationInboxService.markRead', () => {
  it('first-time read: sets readAt, status=READ, appends event, publishes outbox', async () => {
    const unread = makeMessage({ readAt: null });
    const t = makeService({ findFirstResult: unread, findUniqueResult: makeMessage({ readAt: NOW, status: 'READ' as Status }) });
    const out = await withCtx(() => t.svc.markRead('msg-1'));

    expect(out.readAt).not.toBeNull();
    expect(t.calls.update[0]!.data).toEqual(
      expect.objectContaining({ status: 'READ', readAt: expect.any(Date) }),
    );
    expect(t.calls.eventCreate[0]!.data).toEqual(
      expect.objectContaining({ eventType: 'READ', notificationMessageId: 'msg-1' }),
    );

    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.MESSAGE_READ }),
    );
  });

  it('is idempotent: second call no-ops (no extra event, no extra outbox)', async () => {
    const alreadyRead = makeMessage({ readAt: NOW, status: 'READ' as Status });
    const t = makeService({ findFirstResult: alreadyRead });
    const out = await withCtx(() => t.svc.markRead('msg-1'));
    expect(out).toBe(alreadyRead);
    expect(t.calls.update.length).toBe(0);
    expect(t.calls.eventCreate.length).toBe(0);
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });

  it('rejects message belonging to a different user', async () => {
    const otherUserMsg = makeMessage({ recipientUserId: 'other-user' });
    const t = makeService({ findFirstResult: otherUserMsg });
    await expect(withCtx(() => t.svc.markRead('msg-1'))).rejects.toBeInstanceOf(
      NotificationMessageNotFoundError,
    );
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });

  it('rejects non-IN_APP message', async () => {
    const email = makeMessage({ channel: 'EMAIL' as never });
    const t = makeService({ findFirstResult: email });
    await expect(withCtx(() => t.svc.markRead('msg-1'))).rejects.toBeInstanceOf(
      NotificationMessageNotFoundError,
    );
  });
});

describe('NotificationInboxService.markAllRead', () => {
  it('flips all unread, returns {updated:N}, publishes single bulk outbox event', async () => {
    const unread = [makeMessage({ id: 'a' }), makeMessage({ id: 'b' }), makeMessage({ id: 'c' })];
    const t = makeService({ updateManyCount: 3 });
    // Override findMany on the tx store to return our unread list.
    t.messageStore.findMany.mockResolvedValueOnce(unread.map((u) => ({ id: u.id })) as never);

    const { updated } = await withCtx(() => t.svc.markAllRead());
    expect(updated).toBe(3);

    expect(t.calls.updateMany[0]!.data).toEqual(
      expect.objectContaining({ status: 'READ', readAt: expect.any(Date) }),
    );
    expect(t.calls.eventCreate.length).toBe(3);

    expect(t.outbox.publish).toHaveBeenCalledTimes(1);
    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string; payload: Record<string, unknown> }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.MESSAGE_READ,
        payload: expect.objectContaining({ bulk: true, messageIds: ['a', 'b', 'c'] }),
      }),
    );
  });

  it('no unread → returns {updated:0} and does not publish', async () => {
    const t = makeService();
    t.messageStore.findMany.mockResolvedValueOnce([] as never);
    const out = await withCtx(() => t.svc.markAllRead());
    expect(out.updated).toBe(0);
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});
