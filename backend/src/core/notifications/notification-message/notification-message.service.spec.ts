/**
 * NotificationMessageService unit specs — getById event inclusion,
 * cancel state guard + outbox/audit, and the send-test ad-hoc path
 * (super-admin vs tenant, IN_APP vs EMAIL).
 *
 * Persistence + cross-cutting deps are fully mocked.
 */
import { ForbiddenError } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { NotificationsOutboxTopics } from '../notifications.constants';
import {
  NotificationMessageNotCancellableError,
  NotificationMessageNotFoundError,
} from '../notifications.errors';
import type {
  NotificationMessageRow,
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import { NotificationMessageService } from './notification-message.service';

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
    channel: 'EMAIL' as never,
    category: 'SYSTEM' as never,
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
    status: 'QUEUED' as Status,
    scheduledAt: NOW,
    sentAt: null,
    deliveredAt: null,
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

function makeTemplate(overrides: Partial<NotificationTemplateRow> = {}): NotificationTemplateRow {
  return {
    id: 'tpl-1',
    schoolId: SCHOOL,
    code: 'TPL-A',
    name: 'Test Template',
    description: null,
    channel: 'EMAIL' as never,
    category: 'SYSTEM' as never,
    eventKey: null,
    defaultPriority: 'MEDIUM' as never,
    locale: 'en-IN',
    audience: 'USER' as never,
    variablesSpec: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: USER,
    updatedBy: USER,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  } as unknown as NotificationTemplateRow;
}

function makeVersion(
  overrides: Partial<NotificationTemplateVersionRow> = {},
): NotificationTemplateVersionRow {
  return {
    id: 'tv-1',
    schoolId: SCHOOL,
    notificationTemplateId: 'tpl-1',
    versionNo: 1,
    subject: 'Hello',
    bodyText: 'Hello world',
    bodyHtml: null,
    variablesSnapshot: null,
    createdAt: NOW,
    createdBy: USER,
    ...overrides,
  } as unknown as NotificationTemplateVersionRow;
}

function makeService() {
  const txStore = {
    notificationMessage: {
      create: jest.fn(
        async ({ data }: { data: Record<string, unknown> }) =>
          makeMessage({
            id: 'msg-created',
            status: data.status as Status,
            channel: data.channel as never,
            recipientUserId: data.recipientUserId as string,
            sentAt: (data.sentAt as Date | null) ?? null,
            deliveredAt: (data.deliveredAt as Date | null) ?? null,
          }),
      ),
    },
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txStore)),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(async (_tx, _s, id: string, _v: number, data: { status: Status }) =>
      makeMessage({ id, status: data.status, version: 2 }),
    ),
    appendEvent: jest.fn(async () => ({ id: 'ev-1' })),
  };
  const templates = {
    findById: jest.fn(),
    findActiveVersion: jest.fn(),
  };
  const registry = { has: jest.fn(() => false) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new NotificationMessageService(
    prisma as never,
    repo as never,
    templates as never,
    registry as never,
    outbox as never,
    audit as never,
    featureFlags as never,
  );
  return { svc, prisma, repo, templates, registry, featureFlags, outbox, audit, txStore };
}

function withCtx<T>(
  fn: () => Promise<T>,
  ctxOverrides: { actorScope?: 'tenant' | 'global'; userId?: string } = {},
): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: ctxOverrides.userId ?? USER,
    actorScope: ctxOverrides.actorScope ?? 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('NotificationMessageService.getById', () => {
  it('returns the row with its events ledger eagerly loaded', async () => {
    const t = makeService();
    const row = { ...makeMessage(), events: [{ id: 'ev-1', eventType: 'QUEUED' }] };
    t.repo.findById.mockResolvedValue(row);
    const out = await withCtx(() => t.svc.getById('msg-1'));
    expect(out).toBe(row);
    expect(t.repo.findById).toHaveBeenCalledWith(undefined, SCHOOL, 'msg-1', {
      includeEvents: true,
    });
  });

  it('throws NotificationMessageNotFoundError when missing', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(withCtx(() => t.svc.getById('missing'))).rejects.toBeInstanceOf(
      NotificationMessageNotFoundError,
    );
  });
});

describe('NotificationMessageService.cancel', () => {
  it('cancels a QUEUED message, appends event, publishes outbox, and audits', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeMessage({ status: 'QUEUED' as Status }));

    const out = await withCtx(() => t.svc.cancel('msg-1', 1));

    expect(out.status).toBe('CANCELLED');
    expect(t.repo.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      SCHOOL,
      'msg-1',
      1,
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    const appendArgs = (t.repo.appendEvent.mock.calls as unknown as Array<[unknown, { eventType: string }]>)[0]![1];
    expect(appendArgs).toEqual(expect.objectContaining({ eventType: 'CANCELLED' }));

    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string; eventType: string }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.MESSAGE_CANCELLED,
        eventType: 'NotificationCancelled',
      }),
    );

    const auditArgs = (t.audit.record.mock.calls as unknown as Array<[{ action: string; category: string }]>)[0]![0];
    expect(auditArgs).toEqual(
      expect.objectContaining({
        action: 'notification_message.cancel',
        category: 'general',
      }),
    );
  });

  it('throws NotificationMessageNotCancellableError when status=SENT', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeMessage({ status: 'SENT' as Status }));
    await expect(withCtx(() => t.svc.cancel('msg-1', 1))).rejects.toBeInstanceOf(
      NotificationMessageNotCancellableError,
    );
    expect(t.repo.updateStatus).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });

  it('throws NotificationMessageNotCancellableError when status=DELIVERED', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeMessage({ status: 'DELIVERED' as Status }));
    await expect(withCtx(() => t.svc.cancel('msg-1', 1))).rejects.toBeInstanceOf(
      NotificationMessageNotCancellableError,
    );
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});

describe('NotificationMessageService.sendTest', () => {
  it('super-admin can target an arbitrary recipient', async () => {
    const t = makeService();
    t.templates.findById.mockResolvedValue(makeTemplate({ channel: 'IN_APP' as never }));
    t.templates.findActiveVersion.mockResolvedValue(makeVersion());

    const out = await withCtx(
      () =>
        t.svc.sendTest({
          templateId: 'tpl-1',
          recipientUserId: 'other-user',
          payload: { foo: 'bar' },
        }),
      { actorScope: 'global' },
    );

    expect(out.recipientUserId).toBe('other-user');
    expect(t.txStore.notificationMessage.create).toHaveBeenCalledTimes(1);
  });

  it('tenant user blocked from targeting another user (ForbiddenError)', async () => {
    const t = makeService();
    t.templates.findById.mockResolvedValue(makeTemplate());
    t.templates.findActiveVersion.mockResolvedValue(makeVersion());

    await expect(
      withCtx(
        () =>
          t.svc.sendTest({
            templateId: 'tpl-1',
            recipientUserId: 'other-user',
            payload: {},
          }),
        { actorScope: 'tenant' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(t.txStore.notificationMessage.create).not.toHaveBeenCalled();
  });

  it('IN_APP template creates message with status=DELIVERED + sentAt + deliveredAt set', async () => {
    const t = makeService();
    t.templates.findById.mockResolvedValue(makeTemplate({ channel: 'IN_APP' as never }));
    t.templates.findActiveVersion.mockResolvedValue(makeVersion());

    const out = await withCtx(() =>
      t.svc.sendTest({ templateId: 'tpl-1', payload: { foo: 'bar' } }),
    );

    expect(out.status).toBe('DELIVERED');
    expect(out.sentAt).not.toBeNull();
    expect(out.deliveredAt).not.toBeNull();

    const createArgs = (
      t.txStore.notificationMessage.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>
    )[0]![0].data;
    expect(createArgs.status).toBe('DELIVERED');
    expect(createArgs.sentAt).not.toBeNull();
    expect(createArgs.deliveredAt).not.toBeNull();

    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.MESSAGE_DELIVERED }),
    );
  });

  it('EMAIL template creates message with status=QUEUED + publishes notification.queued', async () => {
    const t = makeService();
    t.templates.findById.mockResolvedValue(makeTemplate({ channel: 'EMAIL' as never }));
    t.templates.findActiveVersion.mockResolvedValue(makeVersion());

    const out = await withCtx(() =>
      t.svc.sendTest({ templateId: 'tpl-1', payload: { foo: 'bar' } }),
    );

    expect(out.status).toBe('QUEUED');

    const createArgs = (
      t.txStore.notificationMessage.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>
    )[0]![0].data;
    expect(createArgs.status).toBe('QUEUED');
    expect(createArgs.deliveredAt).toBeNull();

    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.MESSAGE_QUEUED }),
    );
  });
});
