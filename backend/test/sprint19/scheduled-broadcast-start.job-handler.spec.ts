/**
 * ScheduledBroadcastStartJobHandler unit specs — Sprint 19.
 *
 * Critical paths:
 *   - DRAFT campaign at run-time → calls NotificationCampaignService.start()
 *     with the latest version.
 *   - non-DRAFT campaign (e.g. cancelled before runAt) → skip without
 *     calling start().
 *   - missing campaign → skip without throwing.
 */
import {
  ScheduledBroadcastStartJobHandler,
  type ScheduledBroadcastStartPayload,
} from '../../src/core/communication-center/schedule/scheduled-broadcast-start.job-handler';
import type { JobHandlerContext } from '../../src/core/jobs/jobs.types';
import type { NotificationCampaignRow } from '../../src/core/notifications/notifications.types';

function makeCampaign(overrides: Partial<NotificationCampaignRow> = {}): NotificationCampaignRow {
  return {
    id: 'cmp-1',
    schoolId: 'school-1',
    code: null,
    name: 'X',
    description: null,
    status: 'DRAFT',
    targetType: 'CLASS',
    targetId: 'cls-1',
    audience: null,
    notificationTemplateId: 'tpl-1',
    channels: ['EMAIL'],
    scheduledAt: new Date(),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    failureReason: null,
    totalCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    version: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  } as NotificationCampaignRow;
}

function makeHandler() {
  const registry = { register: jest.fn() };
  const campaigns = { start: jest.fn().mockResolvedValue({ campaign: makeCampaign() }) };
  const campaignRepo = { findById: jest.fn() };
  const handler = new ScheduledBroadcastStartJobHandler(
    registry as never,
    campaigns as never,
    campaignRepo as never,
  );
  return { handler, registry, campaigns, campaignRepo };
}

const ctx: JobHandlerContext = {} as JobHandlerContext;
const payload: ScheduledBroadcastStartPayload = { schoolId: 'school-1', campaignId: 'cmp-1' };

describe('ScheduledBroadcastStartJobHandler', () => {
  it('registers with the JobHandlerRegistry at application bootstrap', () => {
    const t = makeHandler();
    t.handler.onApplicationBootstrap();
    expect(t.registry.register).toHaveBeenCalledWith(
      'comms.scheduled-broadcast.start',
      expect.any(Function),
    );
  });

  it('starts the campaign when status is still DRAFT', async () => {
    const t = makeHandler();
    t.campaignRepo.findById.mockResolvedValueOnce(makeCampaign({ status: 'DRAFT', version: 7 }));
    await t.handler.handle(payload, ctx);
    expect(t.campaigns.start).toHaveBeenCalledWith('cmp-1', 7);
  });

  it('skips when campaign is no longer DRAFT (e.g. cancelled)', async () => {
    const t = makeHandler();
    t.campaignRepo.findById.mockResolvedValueOnce(makeCampaign({ status: 'CANCELLED' }));
    await t.handler.handle(payload, ctx);
    expect(t.campaigns.start).not.toHaveBeenCalled();
  });

  it('skips silently when campaign is missing', async () => {
    const t = makeHandler();
    t.campaignRepo.findById.mockResolvedValueOnce(null);
    await expect(t.handler.handle(payload, ctx)).resolves.toBeUndefined();
    expect(t.campaigns.start).not.toHaveBeenCalled();
  });
});
