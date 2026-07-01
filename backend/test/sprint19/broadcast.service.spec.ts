/**
 * BroadcastService unit specs — Sprint 19.
 *
 * Critical paths:
 *   - create() with immediate schedule → wraps campaign.create + start,
 *     emits BROADCAST_CREATED, audits.
 *   - create() with future scheduledAt → enqueues job, emits
 *     BROADCAST_SCHEDULED, leaves campaign in DRAFT (no start()).
 *   - cancel() → wraps campaign.cancel, emits BROADCAST_CANCELLED.
 *   - retry() → emits BROADCAST_RETRY_REQUESTED with failedCount.
 */
import { withTestContext } from '../../src/core/request-context';
import { BroadcastService } from '../../src/core/communication-center/broadcast/broadcast.service';
import {
  CommunicationCenterJobs,
  CommunicationCenterOutboxTopics,
} from '../../src/core/communication-center/communication-center.constants';
import type { NotificationCampaignRow } from '../../src/core/notifications/notifications.types';

function makeCampaign(overrides: Partial<NotificationCampaignRow> = {}): NotificationCampaignRow {
  return {
    id: 'cmp-1',
    schoolId: 'school-1',
    code: null,
    name: 'Term 1 Announcement',
    description: null,
    status: 'DRAFT',
    targetType: 'CLASS',
    targetId: 'cls-1',
    audience: null,
    notificationTemplateId: 'tpl-1',
    channels: ['EMAIL'],
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    failureReason: null,
    totalCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    version: 1,
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  } as NotificationCampaignRow;
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {
      notificationMessage: { count: jest.fn().mockResolvedValue(0) },
    },
  };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };
  const campaigns = {
    create: jest.fn(),
    start: jest.fn(),
    cancel: jest.fn(),
    getById: jest.fn(),
    list: jest.fn(),
  };
  const campaignRepo = { findById: jest.fn() };
  const outbox = { publish: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'a', rowHash: 'h' }) };
  const jobs = { enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }) };

  const svc = new BroadcastService(
    prisma as never,
    featureFlags as never,
    campaigns as never,
    campaignRepo as never,
    outbox as never,
    audit as never,
    jobs as never,
  );
  return { svc, prisma, featureFlags, campaigns, campaignRepo, outbox, audit, jobs };
}

describe('BroadcastService.create — immediate', () => {
  it('creates draft, emits BROADCAST_CREATED, starts campaign, audits', async () => {
    const t = makeService();
    const draft = makeCampaign({ id: 'cmp-1', version: 1 });
    const started = makeCampaign({ id: 'cmp-1', version: 2, status: 'QUEUED' });
    t.campaigns.create.mockResolvedValueOnce(draft);
    t.campaigns.start.mockResolvedValueOnce({ campaign: started });

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.create({
        name: 'T1',
        notificationTemplateId: 'tpl-1',
        channel: 'EMAIL',
        targetType: 'CLASS',
        targetId: 'cls-1',
      }),
    );

    expect(out.started).toBe(true);
    expect(out.campaign.status).toBe('QUEUED');
    expect(t.campaigns.start).toHaveBeenCalledWith('cmp-1', 1);
    expect(t.jobs.enqueue).not.toHaveBeenCalled();
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: CommunicationCenterOutboxTopics.BROADCAST_CREATED,
        eventType: 'BroadcastCreated',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'comms.broadcast.created',
        resourceType: 'NotificationCampaign',
        resourceId: 'cmp-1',
      }),
      expect.anything(),
    );
  });
});

describe('BroadcastService.create — scheduled', () => {
  it('enqueues job, emits BROADCAST_SCHEDULED, does NOT start campaign', async () => {
    const t = makeService();
    const draft = makeCampaign({ id: 'cmp-2', version: 1 });
    t.campaigns.create.mockResolvedValueOnce(draft);
    const future = new Date(Date.now() + 60 * 60 * 1000);

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.create({
        name: 'Later',
        notificationTemplateId: 'tpl-1',
        channel: 'EMAIL',
        targetType: 'CLASS',
        targetId: 'cls-1',
        scheduledAt: future,
      }),
    );

    expect(out.started).toBe(false);
    expect(t.campaigns.start).not.toHaveBeenCalled();
    expect(t.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: CommunicationCenterJobs.QUEUE,
        handlerName: CommunicationCenterJobs.SCHEDULED_BROADCAST_START_HANDLER,
        payload: { schoolId: 'school-1', campaignId: 'cmp-2' },
        runAt: future,
      }),
      expect.anything(),
    );
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: CommunicationCenterOutboxTopics.BROADCAST_SCHEDULED,
      }),
    );
  });
});

describe('BroadcastService.cancel', () => {
  it('wraps campaign.cancel and emits BROADCAST_CANCELLED', async () => {
    const t = makeService();
    const cancelled = makeCampaign({ id: 'cmp-3', status: 'CANCELLED', version: 3 });
    t.campaigns.cancel.mockResolvedValueOnce(cancelled);

    const out = await withTestContext({ schoolId: 'school-1' }, () =>
      t.svc.cancel('cmp-3', 2),
    );

    expect(out.status).toBe('CANCELLED');
    expect(t.campaigns.cancel).toHaveBeenCalledWith('cmp-3', 2);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: CommunicationCenterOutboxTopics.BROADCAST_CANCELLED,
      }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'comms.broadcast.cancelled' }),
      expect.anything(),
    );
  });
});

describe('BroadcastService.retry', () => {
  it('counts failed messages and emits BROADCAST_RETRY_REQUESTED', async () => {
    const t = makeService();
    const campaign = makeCampaign({ id: 'cmp-4', status: 'COMPLETED' });
    t.campaignRepo.findById.mockResolvedValueOnce(campaign);
    (t.prisma.client.notificationMessage.count as jest.Mock).mockResolvedValueOnce(5);

    const out = await withTestContext({ schoolId: 'school-1' }, () => t.svc.retry('cmp-4'));

    expect(out.failedCount).toBe(5);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: CommunicationCenterOutboxTopics.BROADCAST_RETRY_REQUESTED,
        payload: { campaignId: 'cmp-4', failedCount: 5 },
      }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'comms.broadcast.retry_requested',
        after: { failedCount: 5 },
      }),
      expect.anything(),
    );
  });
});
