/**
 * Sprint 19 e2e — broadcast lifecycle through the controller layer.
 *
 * Walks BroadcastController end-to-end against in-memory stubs of
 * NotificationCampaignService, OutboxPublisher, Audit, Prisma and Jobs:
 *
 *   1. POST /api/v1/comms-center/broadcasts → service creates a draft and
 *      kicks NotificationCampaignService.start() immediately. Outbox row
 *      `comms.center.broadcast.created` is recorded and audited.
 *   2. POST /api/v1/comms-center/broadcasts/:id/cancel with If-Match →
 *      campaign is cancelled, outbox row `comms.center.broadcast.cancelled`
 *      is recorded.
 *
 * The feature flag is enabled; tenant scope is supplied via
 * withTestContext to satisfy assertModuleEnabled().
 */
import { withTestContext } from '../../src/core/request-context';
import { BroadcastController } from '../../src/core/communication-center/broadcast/broadcast.controller';
import { BroadcastService } from '../../src/core/communication-center/broadcast/broadcast.service';
import { CommunicationCenterOutboxTopics } from '../../src/core/communication-center/communication-center.constants';
import type { NotificationCampaignRow } from '../../src/core/notifications/notifications.types';

interface OutboxRecord {
  topic: string;
  eventType: string;
  payload: Record<string, unknown>;
}
interface AuditRecord {
  action: string;
  resourceType: string;
  resourceId: string;
}

function makeCampaign(overrides: Partial<NotificationCampaignRow> = {}): NotificationCampaignRow {
  return {
    id: 'cmp-1',
    schoolId: 'school-1',
    code: null,
    name: 'T1 Notice',
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
    recipientCount: 0,
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

function buildSuite() {
  const outbox: OutboxRecord[] = [];
  const audits: AuditRecord[] = [];
  const enqueued: Array<{ handlerName: string; payload: unknown; runAt?: Date }> = [];

  const prismaStub = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {
      notificationMessage: { count: jest.fn().mockResolvedValue(2) },
    },
  };
  const featureFlagsStub = { isEnabled: jest.fn().mockResolvedValue(true) };

  let campaignState: NotificationCampaignRow = makeCampaign();

  const campaignsStub = {
    create: jest.fn(async () => {
      campaignState = makeCampaign({ id: 'cmp-1', version: 1, status: 'DRAFT' });
      return campaignState;
    }),
    start: jest.fn(async (id: string, version: number) => {
      campaignState = makeCampaign({
        id,
        version: version + 1,
        status: 'QUEUED',
        startedAt: new Date('2026-06-25T01:00:00Z'),
      });
      return { campaign: campaignState };
    }),
    cancel: jest.fn(async (id: string, version: number) => {
      campaignState = makeCampaign({
        id,
        version: version + 1,
        status: 'CANCELLED',
        cancelledAt: new Date('2026-06-25T02:00:00Z'),
      });
      return campaignState;
    }),
    getById: jest.fn(async () => ({ campaign: campaignState, summary: {} })),
    list: jest.fn(),
  };

  const campaignRepoStub = { findById: jest.fn(async () => campaignState) };

  const outboxStub = {
    publish: jest.fn(async (_tx: unknown, row: OutboxRecord) => {
      outbox.push(row);
      return { id: `ob-${outbox.length}` };
    }),
  };
  const auditStub = {
    record: jest.fn(async (rec: AuditRecord) => {
      audits.push(rec);
      return { id: `a-${audits.length}`, rowHash: 'h' };
    }),
  };
  const jobsStub = {
    enqueue: jest.fn(async (req: { handlerName: string; payload: unknown; runAt?: Date }) => {
      enqueued.push(req);
      return { id: `job-${enqueued.length}` };
    }),
  };

  const service = new BroadcastService(
    prismaStub as never,
    featureFlagsStub as never,
    campaignsStub as never,
    campaignRepoStub as never,
    outboxStub as never,
    auditStub as never,
    jobsStub as never,
  );
  const controller = new BroadcastController(service);

  return { controller, outbox, audits, enqueued, campaignsStub };
}

describe('Sprint 19 e2e — broadcast lifecycle', () => {
  it('admin creates immediate broadcast then cancels it via controller', async () => {
    const s = buildSuite();

    const created = await withTestContext({ schoolId: 'school-1' }, () =>
      s.controller.create({
        name: 'T1 Notice',
        notificationTemplateId: 'tpl-1',
        channel: 'EMAIL',
        targetType: 'CLASS',
        targetId: 'cls-1',
      } as never),
    );

    expect(created.started).toBe(true);
    expect(created.campaign.id).toBe('cmp-1');
    expect(created.campaign.status).toBe('QUEUED');
    expect(s.campaignsStub.start).toHaveBeenCalledWith('cmp-1', 1);
    expect(s.enqueued.length).toBe(0); // no future scheduledAt
    expect(s.outbox.map((o) => o.topic)).toEqual([
      CommunicationCenterOutboxTopics.BROADCAST_CREATED,
    ]);
    expect(s.audits[0]?.action).toBe('comms.broadcast.created');

    // -- Cancel ---------------------------------------------------------
    const cancelled = await withTestContext({ schoolId: 'school-1' }, () =>
      s.controller.cancel('cmp-1', '"2"'),
    );
    expect(cancelled.status).toBe('CANCELLED');
    expect(s.campaignsStub.cancel).toHaveBeenCalledWith('cmp-1', 2);
    expect(s.outbox.map((o) => o.topic)).toContain(
      CommunicationCenterOutboxTopics.BROADCAST_CANCELLED,
    );
    expect(s.audits.map((a) => a.action)).toContain('comms.broadcast.cancelled');
  });
});
