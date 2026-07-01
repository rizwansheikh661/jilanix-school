/**
 * NotificationCampaignService unit specs — create validation
 * (single-channel + targetId + code sequencing), start orchestration
 * (broadcast flag, status guard, recipient resolution with skips +
 * outbox + audit), and cancel state transitions.
 *
 * Persistence + cross-cutting deps are fully mocked.
 */
import { ValidationFailedError } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { NotificationsOutboxTopics } from '../notifications.constants';
import {
  NotificationBroadcastDisabledError,
  NotificationCampaignNotStartableError,
} from '../notifications.errors';
import type {
  NotificationCampaignRow,
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import { NotificationCampaignService } from './notification-campaign.service';

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

function makeVersion(): NotificationTemplateVersionRow {
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
  } as unknown as NotificationTemplateVersionRow;
}

function makeCampaign(overrides: Partial<NotificationCampaignRow> = {}): NotificationCampaignRow {
  return {
    id: 'cmp-1',
    schoolId: SCHOOL,
    code: 'CMP-000001',
    name: 'Test Campaign',
    description: null,
    channels: ['IN_APP'] as unknown as never,
    notificationTemplateId: 'tpl-1',
    targetType: 'SCHOOL' as never,
    targetId: null,
    audience: 'USER' as never,
    status: 'DRAFT' as never,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: USER,
    updatedBy: USER,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  } as unknown as NotificationCampaignRow;
}

function makeService() {
  const txStore = {
    notificationMessage: {
      create: jest.fn(async ({ data }: { data: { id?: string } }) => ({
        id: data.id ?? 'msg-new',
      })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    notificationMessageEvent: {
      create: jest.fn(async () => ({ id: 'ev' })),
    },
    user: {
      findMany: jest.fn<Promise<Array<{ id: string }>>, [unknown?]>(async () => []),
    },
  };
  const prisma = {
    get client() {
      return txStore;
    },
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txStore)),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    appendRecipients: jest.fn(async () => 0),
    listRecipients: jest.fn(),
    recipientSummary: jest.fn(async () => ({
      total: 0,
      skipped: 0,
      byReason: { OPTED_OUT: 0, QUIET_HOURS: 0, QUOTA_EXHAUSTED: 0, CHANNEL_DISABLED: 0 },
    })),
  };
  const templates = {
    findById: jest.fn(),
    findActiveVersion: jest.fn(),
  };
  const preferences = { shouldDeliver: jest.fn() };
  const entitlements = { assertAndIncrement: jest.fn() };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const featureFlags = {
    isEnabled: jest.fn<Promise<boolean>, [string, unknown?]>(async () => true),
  };
  const sequences = { nextValue: jest.fn(async () => 1) };

  const svc = new NotificationCampaignService(
    prisma as never,
    repo as never,
    templates as never,
    preferences as never,
    entitlements as never,
    outbox as never,
    audit as never,
    featureFlags as never,
    sequences as never,
  );
  return {
    svc,
    prisma,
    repo,
    templates,
    preferences,
    entitlements,
    outbox,
    audit,
    featureFlags,
    sequences,
    txStore,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: USER,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('NotificationCampaignService.create', () => {
  it('rejects when channels[] does not match the template channel', async () => {
    const t = makeService();
    t.templates.findById.mockResolvedValue(makeTemplate({ channel: 'IN_APP' as never }));
    await expect(
      withCtx(() =>
        t.svc.create({
          name: 'C',
          channels: ['EMAIL'],
          notificationTemplateId: 'tpl-1',
          targetType: 'SCHOOL',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('rejects when targetId is missing for a non-SCHOOL target', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          name: 'C',
          channels: ['IN_APP'],
          notificationTemplateId: 'tpl-1',
          targetType: 'CLASS',
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });

  it('generates CMP-<n> code via SequenceService when no code provided', async () => {
    const t = makeService();
    t.templates.findById.mockResolvedValue(makeTemplate());
    t.sequences.nextValue.mockResolvedValue(42);
    t.repo.create.mockImplementation(async (_tx, _s, input: { code: string | null }) =>
      makeCampaign({ code: input.code ?? null }),
    );
    const out = await withCtx(() =>
      t.svc.create({
        name: 'C',
        channels: ['IN_APP'],
        notificationTemplateId: 'tpl-1',
        targetType: 'SCHOOL',
      }),
    );
    expect(t.sequences.nextValue).toHaveBeenCalled();
    expect(out.code).toBe('CMP-000042');

    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.CAMPAIGN_CREATED }),
    );
  });
});

describe('NotificationCampaignService.start', () => {
  it('throws NotificationBroadcastDisabledError when allow_broadcast flag is off', async () => {
    const t = makeService();
    // Module is on but broadcast is off (toggle via flag map).
    t.featureFlags.isEnabled.mockImplementation(async (flag: string) =>
      flag === 'module.notifications',
    );
    await expect(withCtx(() => t.svc.start('cmp-1', 1))).rejects.toBeInstanceOf(
      NotificationBroadcastDisabledError,
    );
  });

  it('throws NotificationCampaignNotStartableError when status != DRAFT', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeCampaign({ status: 'COMPLETED' as never }));
    await expect(withCtx(() => t.svc.start('cmp-1', 1))).rejects.toBeInstanceOf(
      NotificationCampaignNotStartableError,
    );
  });

  it('SCHOOL audience with 3 users (opted-out, quiet-hours, ok) emits 1 message + 2 skips and bumps counters', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(
      makeCampaign({ status: 'DRAFT' as never, targetType: 'SCHOOL' as never }),
    );
    t.templates.findById.mockResolvedValue(makeTemplate({ channel: 'IN_APP' as never }));
    t.templates.findActiveVersion.mockResolvedValue(makeVersion());
    t.txStore.user.findMany.mockResolvedValueOnce([
      { id: 'u-opted' },
      { id: 'u-quiet' },
      { id: 'u-ok' },
    ]);
    t.preferences.shouldDeliver.mockImplementation(async (_tx, _s, userId: string) => {
      if (userId === 'u-opted') return { allowed: false, skipReason: 'OPTED_OUT' };
      if (userId === 'u-quiet') return { allowed: false, skipReason: 'QUIET_HOURS' };
      return { allowed: true };
    });
    let updatedSnapshot: { recipientCount?: number; sentCount?: number } = {};
    t.repo.update.mockImplementation(async (_tx, _s, _id, _v, data: { recipientCount?: number; sentCount?: number }) => {
      updatedSnapshot = data;
      return makeCampaign({
        status: 'COMPLETED' as never,
        recipientCount: data.recipientCount ?? 0,
        sentCount: data.sentCount ?? 0,
      });
    });

    const result = await withCtx(() => t.svc.start('cmp-1', 1));

    // 1 message created
    expect(t.txStore.notificationMessage.create).toHaveBeenCalledTimes(1);

    // Recipients persisted: 1 ok + 2 skipped — appendRecipients invoked twice
    const calls = t.repo.appendRecipients.mock.calls as unknown as Array<[unknown, Array<{ skipped: boolean; skipReason?: string }>]>;
    const allRows = calls.flatMap((c) => c[1]);
    expect(allRows.filter((r) => !r.skipped).length).toBe(1);
    const skippedRows = allRows.filter((r) => r.skipped);
    expect(skippedRows.length).toBe(2);
    const skipReasons = skippedRows.map((r) => r.skipReason).sort();
    expect(skipReasons).toEqual(['OPTED_OUT', 'QUIET_HOURS']);

    // Counters
    expect(updatedSnapshot.recipientCount).toBe(3);
    expect(updatedSnapshot.sentCount).toBe(1);
    expect(result.campaign.status).toBe('COMPLETED');

    // Outbox: per-message DELIVERED + campaign.started
    const publishCalls = t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>;
    const topics = publishCalls.map((c) => c[1].topic);
    expect(topics).toContain(NotificationsOutboxTopics.MESSAGE_DELIVERED);
    expect(topics).toContain(NotificationsOutboxTopics.CAMPAIGN_STARTED);
  });
});

describe('NotificationCampaignService.cancel', () => {
  it('cancels a QUEUED campaign, flips QUEUED messages to CANCELLED, publishes outbox', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeCampaign({ status: 'QUEUED' as never }));
    t.repo.update.mockResolvedValue(
      makeCampaign({ status: 'CANCELLED' as never, code: 'CMP-000001' }),
    );

    await withCtx(() => t.svc.cancel('cmp-1', 1));

    expect(t.txStore.notificationMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campaignId: 'cmp-1', status: 'QUEUED' }),
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    const publishArgs = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1];
    expect(publishArgs).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.CAMPAIGN_CANCELLED }),
    );
  });

  it('allowed in DRAFT and SENDING (not just QUEUED)', async () => {
    for (const status of ['DRAFT', 'SENDING'] as const) {
      const t = makeService();
      t.repo.findById.mockResolvedValue(makeCampaign({ status: status as never }));
      t.repo.update.mockResolvedValue(makeCampaign({ status: 'CANCELLED' as never }));
      await expect(withCtx(() => t.svc.cancel('cmp-1', 1))).resolves.toBeDefined();
    }
  });

  it('refused when status is COMPLETED', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeCampaign({ status: 'COMPLETED' as never }));
    await expect(withCtx(() => t.svc.cancel('cmp-1', 1))).rejects.toBeInstanceOf(
      NotificationCampaignNotStartableError,
    );
  });
});
