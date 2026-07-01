/**
 * ScheduledBroadcastStartJobHandler — invoked by the Job Scheduler when a
 * delayed broadcast's `runAt` is reached.
 *
 * Sprint 19 forbids new dispatch logic. The handler simply calls
 * `NotificationCampaignService.start(id, version)` inside a
 * `runWithSystemContext` so the existing campaign FSM transitions DRAFT
 * → QUEUED and the notification module's send-job fanout takes over.
 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { NotificationCampaignService } from '../../notifications/notification-campaign/notification-campaign.service';
import { NotificationCampaignRepository } from '../../notifications/notification-campaign/notification-campaign.repository';
import { runWithSystemContext } from '../../request-context';
import { CommunicationCenterJobs } from '../communication-center.constants';

export interface ScheduledBroadcastStartPayload {
  readonly schoolId: string;
  readonly campaignId: string;
}

@Injectable()
export class ScheduledBroadcastStartJobHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledBroadcastStartJobHandler.name);

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly campaigns: NotificationCampaignService,
    private readonly campaignRepo: NotificationCampaignRepository,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register<ScheduledBroadcastStartPayload>(
      CommunicationCenterJobs.SCHEDULED_BROADCAST_START_HANDLER,
      (payload, ctx) => this.handle(payload, ctx),
    );
  }

  public async handle(
    payload: ScheduledBroadcastStartPayload,
    _ctx: JobHandlerContext,
  ): Promise<void> {
    void _ctx;
    await runWithSystemContext(
      { schoolId: payload.schoolId },
      async () => {
        const campaign = await this.campaignRepo.findById(
          undefined,
          payload.schoolId,
          payload.campaignId,
        );
        if (campaign === null) {
          this.logger.warn(
            `Scheduled broadcast ${payload.campaignId} not found at run time — skipping.`,
          );
          return;
        }
        if (campaign.status !== 'DRAFT') {
          this.logger.log(
            `Scheduled broadcast ${payload.campaignId} no longer DRAFT (status=${campaign.status}); skipping.`,
          );
          return;
        }
        await this.campaigns.start(campaign.id, campaign.version);
        this.logger.log(
          `Scheduled broadcast ${payload.campaignId} started (campaign FSM took over).`,
        );
      },
    );
  }
}
