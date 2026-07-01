/**
 * NotificationEventDispatcherService unit specs — registry lookup,
 * per-recipient preference + entitlement skips, channel branching
 * (IN_APP vs EMAIL), CRITICAL bypass semantics, variable merge order,
 * and dedupe-collision suppression.
 *
 * Persistence + cross-cutting deps are fully mocked.
 */
import { Prisma } from '@prisma/client';

import { RequestContextRegistry } from '../../request-context';
import {
  NotificationsOutboxTopics,
  type NotificationChannelValue,
  type NotificationPriorityValue,
} from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationQuotaExceededError,
  NotificationEventUnknownError,
} from '../notifications.errors';
import type {
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import { NotificationEventDispatcherService } from './notification-event-dispatcher.service';

const SCHOOL = 'school-1';
const USER = 'user-1';
const NOW = new Date('2026-06-22T12:00:00.000Z');

function makeTemplate(overrides: Partial<NotificationTemplateRow> = {}): NotificationTemplateRow {
  return {
    id: 'tpl-1',
    schoolId: SCHOOL,
    code: 'TPL-A',
    name: 'Test Template',
    description: null,
    channel: 'IN_APP' as never,
    category: 'SYSTEM' as never,
    eventKey: 'FEE_INVOICE_GENERATED',
    defaultPriority: 'MEDIUM' as never,
    locale: 'en-IN',
    audience: 'PARENT' as never,
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
    subject: 'Subj',
    bodyText: 'Body',
    bodyHtml: null,
    variablesSnapshot: null,
    createdAt: NOW,
    createdBy: USER,
    ...overrides,
  } as unknown as NotificationTemplateVersionRow;
}

interface DispatcherMocks {
  registry: { get: jest.Mock; has: jest.Mock };
  templates: { list: jest.Mock; findActiveVersion: jest.Mock };
  preferences: { shouldDeliver: jest.Mock };
  entitlements: { assertAndIncrement: jest.Mock };
  outbox: { publish: jest.Mock };
  audit: { record: jest.Mock };
  featureFlags: { isEnabled: jest.Mock };
  brandingResolver: { resolve: jest.Mock };
  txStore: {
    notificationMessage: { create: jest.Mock };
    notificationMessageEvent: { create: jest.Mock };
  };
}

function makeService(): {
  svc: NotificationEventDispatcherService;
} & DispatcherMocks {
  const txStore = {
    notificationMessage: {
      create: jest.fn(async () => ({ id: 'msg-new' })),
    },
    notificationMessageEvent: {
      create: jest.fn(async () => ({ id: 'ev' })),
    },
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txStore)),
  };
  const registry = {
    get: jest.fn(),
    has: jest.fn(() => true),
  };
  const templates = {
    list: jest.fn(async () => ({ rows: [], nextCursor: null })),
    findActiveVersion: jest.fn(async () => makeVersion()),
  };
  const preferences = { shouldDeliver: jest.fn(async () => ({ allowed: true })) };
  const entitlements = { assertAndIncrement: jest.fn(async () => undefined) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const brandingResolver = { resolve: jest.fn(async () => ({ currentYear: '2026' })) };

  const svc = new NotificationEventDispatcherService(
    prisma as never,
    registry as never,
    templates as never,
    preferences as never,
    entitlements as never,
    outbox as never,
    audit as never,
    featureFlags as never,
    brandingResolver as never,
  );
  return { svc, registry, templates, preferences, entitlements, outbox, audit, featureFlags, brandingResolver, txStore };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: USER,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

const eventDef = (overrides: Record<string, unknown> = {}) => ({
  key: 'FEE_INVOICE_GENERATED',
  category: 'FEES',
  defaultPriority: 'MEDIUM' as NotificationPriorityValue,
  audience: 'PARENT',
  description: 'desc',
  sampleVariables: {},
  ...overrides,
});

describe('NotificationEventDispatcherService.dispatch — registry', () => {
  it('throws NotificationEventUnknownError when event key is unknown', async () => {
    const t = makeService();
    t.registry.get.mockImplementation((key: string) => {
      throw new NotificationEventUnknownError(key);
    });
    await expect(
      withCtx(() =>
        t.svc.dispatch({
          eventKey: 'NOT_REGISTERED',
          schoolId: SCHOOL,
          recipients: [{ userId: 'u1' }],
          variables: {},
        }),
      ),
    ).rejects.toBeInstanceOf(NotificationEventUnknownError);
  });
});

describe('NotificationEventDispatcherService.dispatch — no templates', () => {
  it('returns empty result when no active templates match the event', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({ rows: [], nextCursor: null });
    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u1' }],
        variables: {},
      }),
    );
    expect(out).toEqual({ created: [], skipped: [] });
    expect(t.txStore.notificationMessage.create).not.toHaveBeenCalled();
  });
});

describe('NotificationEventDispatcherService.dispatch — channel branch', () => {
  it('IN_APP template + 1 recipient: status=DELIVERED, event DELIVERED, outbox notification.delivered', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'IN_APP' as never })],
      nextCursor: null,
    });
    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u1' }],
        variables: {},
      }),
    );
    expect(out.created.length).toBe(1);

    const createArgs = (
      t.txStore.notificationMessage.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>
    )[0]![0].data;
    expect(createArgs.status).toBe('DELIVERED');

    const eventArgs = (
      t.txStore.notificationMessageEvent.create.mock.calls as unknown as Array<[{ data: { eventType: string } }]>
    )[0]![0].data;
    expect(eventArgs.eventType).toBe('DELIVERED');

    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(NotificationsOutboxTopics.MESSAGE_DELIVERED);
  });

  it('EMAIL template + 1 recipient: status=QUEUED, outbox notification.queued', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'EMAIL' as never })],
      nextCursor: null,
    });
    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u1', address: 'u1@example.com' }],
        variables: {},
      }),
    );
    expect(out.created.length).toBe(1);
    const createArgs = (
      t.txStore.notificationMessage.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>
    )[0]![0].data;
    expect(createArgs.status).toBe('QUEUED');
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(NotificationsOutboxTopics.MESSAGE_QUEUED);
    expect(t.entitlements.assertAndIncrement).toHaveBeenCalled();
  });
});

describe('NotificationEventDispatcherService.dispatch — per-recipient skips', () => {
  it('opted-out recipient appears in skipped[] with reason OPTED_OUT and no message created', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'IN_APP' as never })],
      nextCursor: null,
    });
    t.preferences.shouldDeliver.mockResolvedValue({ allowed: false, skipReason: 'OPTED_OUT' });

    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u-out' }],
        variables: {},
      }),
    );
    expect(out.created).toEqual([]);
    expect(out.skipped).toEqual([
      expect.objectContaining({ recipientUserId: 'u-out', reason: 'OPTED_OUT' }),
    ]);
    expect(t.txStore.notificationMessage.create).not.toHaveBeenCalled();
  });

  it('quota exhausted recipient is skipped (reason QUOTA_EXCEEDED); loop continues for others', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'EMAIL' as never })],
      nextCursor: null,
    });
    // First recipient throws quota; second succeeds
    let call = 0;
    t.entitlements.assertAndIncrement.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        throw new CommunicationQuotaExceededError({
          channel: 'EMAIL' as NotificationChannelValue,
          limit: 100,
          used: 100,
        });
      }
    });

    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u-over' }, { userId: 'u-ok' }],
        variables: {},
      }),
    );
    expect(out.skipped).toEqual([
      expect.objectContaining({ recipientUserId: 'u-over', reason: 'QUOTA_EXCEEDED' }),
    ]);
    expect(out.created).toEqual([
      expect.objectContaining({ recipientUserId: 'u-ok' }),
    ]);
  });

  it('channel disabled recipient is skipped (reason CHANNEL_DISABLED)', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'SMS' as never })],
      nextCursor: null,
    });
    t.entitlements.assertAndIncrement.mockRejectedValue(
      new CommunicationChannelDisabledError({
        channel: 'SMS' as NotificationChannelValue,
        reason: 'TENANT_DISABLED',
      }),
    );

    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u1' }],
        variables: {},
      }),
    );
    expect(out.skipped).toEqual([
      expect.objectContaining({ recipientUserId: 'u1', reason: 'CHANNEL_DISABLED' }),
    ]);
    expect(out.created).toEqual([]);
  });
});

describe('NotificationEventDispatcherService.dispatch — CRITICAL priority', () => {
  it('CRITICAL bypasses preference (mocked allow) but NOT quota; recipient is still skipped', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'EMAIL' as never })],
      nextCursor: null,
    });
    // preference returns allowed regardless (simulating CRITICAL bypass internally)
    t.preferences.shouldDeliver.mockResolvedValue({ allowed: true });
    // quota still throws
    t.entitlements.assertAndIncrement.mockRejectedValue(
      new CommunicationQuotaExceededError({
        channel: 'EMAIL' as NotificationChannelValue,
        limit: 1,
        used: 1,
      }),
    );

    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u-critical' }],
        variables: {},
        priorityOverride: 'CRITICAL',
      }),
    );
    expect(out.created).toEqual([]);
    expect(out.skipped).toEqual([
      expect.objectContaining({ recipientUserId: 'u-critical', reason: 'QUOTA_EXCEEDED' }),
    ]);
  });
});

describe('NotificationEventDispatcherService.dispatch — variable merge', () => {
  it('input.variables override sampleVariables from the event definition', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(
      eventDef({ sampleVariables: { who: 'sample', extra: 'kept' } }),
    );
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'IN_APP' as never })],
      nextCursor: null,
    });
    t.templates.findActiveVersion.mockResolvedValue(
      makeVersion({ bodyText: 'who={{who}} extra={{extra}}' }),
    );

    await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u1' }],
        variables: { who: 'override' },
      }),
    );

    const createArgs = (
      t.txStore.notificationMessage.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>
    )[0]![0].data;
    expect(createArgs.bodyRendered).toBe('who=override extra=kept');
  });
});

describe('NotificationEventDispatcherService.dispatch — dedupe collision', () => {
  it('silently swallows Prisma P2002 from notificationMessage.create (no row in skipped[], no throw)', async () => {
    const t = makeService();
    t.registry.get.mockReturnValue(eventDef());
    t.templates.list.mockResolvedValue({
      rows: [makeTemplate({ channel: 'IN_APP' as never })],
      nextCursor: null,
    });
    const dupeErr = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    t.txStore.notificationMessage.create.mockRejectedValueOnce(dupeErr);

    const out = await withCtx(() =>
      t.svc.dispatch({
        eventKey: 'FEE_INVOICE_GENERATED',
        schoolId: SCHOOL,
        recipients: [{ userId: 'u-dup' }],
        variables: {},
      }),
    );
    expect(out.created).toEqual([]);
    expect(out.skipped).toEqual([]);
    // No event row appended, no outbox publish for the message
    expect(t.txStore.notificationMessageEvent.create).not.toHaveBeenCalled();
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).not.toContain(NotificationsOutboxTopics.MESSAGE_DELIVERED);
    expect(topics).not.toContain(NotificationsOutboxTopics.MESSAGE_QUEUED);
  });
});
