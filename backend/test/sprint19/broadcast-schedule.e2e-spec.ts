/**
 * Sprint 19 e2e — scheduled broadcast flow.
 *
 * Walks the schedule path through real BroadcastController +
 * BroadcastService with an in-memory campaign / outbox / jobs stub:
 *
 *   1. POST /api/v1/comms-center/broadcasts with future scheduledAt →
 *      campaign stays in DRAFT, a Job is enqueued at runAt against the
 *      `comms-center` queue, outbox emits `comms.center.broadcast.scheduled`.
 *   2. ScheduleService.list returns the pending broadcast (from the same
 *      in-memory store) so operators can see it on the dashboard.
 *   3. The ScheduledBroadcastStartJobHandler is invoked with the enqueued
 *      payload → calls NotificationCampaignService.start(), flipping the
 *      campaign to QUEUED.
 */
import { withTestContext } from '../../src/core/request-context';
import { BroadcastController } from '../../src/core/communication-center/broadcast/broadcast.controller';
import { BroadcastService } from '../../src/core/communication-center/broadcast/broadcast.service';
import {
  CommunicationCenterJobs,
  CommunicationCenterOutboxTopics,
} from '../../src/core/communication-center/communication-center.constants';
import { ScheduledBroadcastStartJobHandler } from '../../src/core/communication-center/schedule/scheduled-broadcast-start.job-handler';
import { ScheduleService } from '../../src/core/communication-center/schedule/schedule.service';
import type { NotificationCampaignRow } from '../../src/core/notifications/notifications.types';
import type { JobHandlerContext } from '../../src/core/jobs/jobs.types';

function makeCampaign(overrides: Partial<NotificationCampaignRow> = {}): NotificationCampaignRow {
  return {
    id: 'cmp-2',
    schoolId: 'school-1',
    code: null,
    name: 'Future Notice',
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

interface OutboxRecord {
  topic: string;
  eventType: string;
}
interface JobRow {
  id: string;
  schoolId: string;
  queue: string;
  type: string;
  status: string;
  runAt: Date;
  payload: Record<string, unknown>;
}

describe('Sprint 19 e2e — scheduled broadcast flow', () => {
  it('schedules → ScheduleService lists → handler starts', async () => {
    const outbox: OutboxRecord[] = [];
    const jobs: JobRow[] = [];
    let campaign: NotificationCampaignRow = makeCampaign();

    const prismaStub = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      client: {
        notificationCampaign: {
          findMany: jest.fn(async () =>
            campaign.status === 'DRAFT' && campaign.scheduledAt !== null
              ? [campaign]
              : [],
          ),
        },
        job: {
          findFirst: jest.fn(async ({ where }: { where: { schoolId: string } }) =>
            jobs.find((j) => j.schoolId === where.schoolId && j.status === 'PENDING') ?? null,
          ),
        },
        notificationMessage: { count: jest.fn().mockResolvedValue(0) },
      },
    };
    const featureFlagsStub = { isEnabled: jest.fn().mockResolvedValue(true) };

    const campaignsStub = {
      create: jest.fn(async (input: { scheduledAt?: Date }) => {
        campaign = makeCampaign({ scheduledAt: input.scheduledAt ?? null });
        return campaign;
      }),
      start: jest.fn(async (id: string, version: number) => {
        campaign = makeCampaign({
          id,
          version: version + 1,
          status: 'QUEUED',
          scheduledAt: campaign.scheduledAt,
          startedAt: new Date('2026-06-25T03:00:00Z'),
        });
        return { campaign };
      }),
      cancel: jest.fn(),
      getById: jest.fn(),
      list: jest.fn(),
    };
    const campaignRepoStub = { findById: jest.fn(async () => campaign) };

    const outboxStub = {
      publish: jest.fn(async (_tx: unknown, row: OutboxRecord) => {
        outbox.push(row);
        return { id: `ob-${outbox.length}` };
      }),
    };
    const auditStub = { record: jest.fn().mockResolvedValue({ id: 'a', rowHash: 'h' }) };
    const jobsStub = {
      enqueue: jest.fn(async (req: {
        schoolId: string;
        queue: string;
        handlerName: string;
        payload: Record<string, unknown>;
        runAt: Date;
      }) => {
        const row: JobRow = {
          id: `job-${jobs.length + 1}`,
          schoolId: req.schoolId,
          queue: req.queue,
          type: req.handlerName,
          status: 'PENDING',
          runAt: req.runAt,
          payload: req.payload,
        };
        jobs.push(row);
        return { id: row.id };
      }),
    };

    const broadcastService = new BroadcastService(
      prismaStub as never,
      featureFlagsStub as never,
      campaignsStub as never,
      campaignRepoStub as never,
      outboxStub as never,
      auditStub as never,
      jobsStub as never,
    );
    const broadcastController = new BroadcastController(broadcastService);
    const scheduleService = new ScheduleService(prismaStub as never, featureFlagsStub as never);

    const future = new Date(Date.now() + 60 * 60 * 1000);

    // 1. POST broadcast with future scheduledAt
    const result = await withTestContext({ schoolId: 'school-1' }, () =>
      broadcastController.create({
        name: 'Future Notice',
        notificationTemplateId: 'tpl-1',
        channel: 'EMAIL',
        targetType: 'CLASS',
        targetId: 'cls-1',
        scheduledAt: future.toISOString(),
      } as never),
    );

    expect(result.started).toBe(false);
    expect(result.campaign.status).toBe('DRAFT');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toMatchObject({
      queue: CommunicationCenterJobs.QUEUE,
      type: CommunicationCenterJobs.SCHEDULED_BROADCAST_START_HANDLER,
      status: 'PENDING',
      runAt: future,
      payload: { schoolId: 'school-1', campaignId: 'cmp-2' },
    });
    expect(outbox.map((o) => o.topic)).toEqual([
      CommunicationCenterOutboxTopics.BROADCAST_SCHEDULED,
    ]);

    // 2. ScheduleService.list surfaces the pending broadcast
    const pending = await withTestContext({ schoolId: 'school-1' }, () =>
      scheduleService.list({ limit: 10 }),
    );
    expect(pending.items.length).toBe(1);
    expect(pending.items[0]?.id).toBe('cmp-2');
    expect(pending.items[0]?.status).toBe('DRAFT');

    const pendingJob = await withTestContext({ schoolId: 'school-1' }, () =>
      scheduleService.findPendingJobForCampaign('school-1', 'cmp-2'),
    );
    expect(pendingJob?.runAt).toEqual(future);

    // 3. Job handler runs at runAt → campaign flips DRAFT → QUEUED
    const handler = new ScheduledBroadcastStartJobHandler(
      { register: jest.fn() } as never,
      campaignsStub as never,
      campaignRepoStub as never,
    );
    await handler.handle(
      { schoolId: 'school-1', campaignId: 'cmp-2' },
      {} as JobHandlerContext,
    );
    expect(campaignsStub.start).toHaveBeenCalledWith('cmp-2', 1);
    expect(campaign.status).toBe('QUEUED');
  });
});
