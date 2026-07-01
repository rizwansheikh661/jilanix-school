/**
 * TimelineService — read-only assembly of a single message's lifecycle.
 *
 * Sprint 19 forbids new storage. The timeline is the append-only
 * `NotificationMessageEvent` ledger plus a few derived top-line fields
 * from the parent `NotificationMessage` (status, channel, recipient).
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { NotificationMessageRepository } from '../../notifications/notification-message/notification-message.repository';
import type {
  NotificationMessageEventRow,
  NotificationMessageWithEvents,
} from '../../notifications/notifications.types';
import { RequestContextRegistry } from '../../request-context';
import { CommunicationCenterFeatureFlags } from '../communication-center.constants';
import { CommunicationCenterDisabledError } from '../communication-center.errors';
import { NotFoundError } from '../../errors/domain-error';

export interface MessageTimelineHeader {
  readonly id: string;
  readonly channel: string;
  readonly status: string;
  readonly recipientUserId: string;
  readonly recipientAudience: string | null;
  readonly eventKey: string | null;
  readonly campaignId: string | null;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly readAt: Date | null;
  readonly failedAt: Date | null;
}

export interface MessageTimeline {
  readonly message: MessageTimelineHeader;
  readonly events: readonly NotificationMessageEventRow[];
}

@Injectable()
export class TimelineService {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly messages: NotificationMessageRepository,
  ) {}

  public async getTimeline(messageId: string): Promise<MessageTimeline> {
    const { schoolId } = await this.assertModuleEnabled();
    const row = (await this.messages.findById(undefined, schoolId, messageId, {
      includeEvents: true,
    })) as NotificationMessageWithEvents | null;
    if (row === null) {
      throw new NotFoundError('NotificationMessage', messageId);
    }
    return {
      message: {
        id: row.id,
        channel: row.channel,
        status: row.status,
        recipientUserId: row.recipientUserId,
        recipientAudience: row.recipientAudience,
        eventKey: row.eventKey,
        campaignId: row.campaignId,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        createdAt: row.createdAt,
        sentAt: row.sentAt,
        deliveredAt: row.deliveredAt,
        readAt: row.readAt,
        failedAt: row.failedAt,
      },
      events: row.events,
    };
  }

  private async assertModuleEnabled(): Promise<{ schoolId: string }> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === null || ctx.schoolId === undefined) {
      throw new CommunicationCenterDisabledError();
    }
    const enabled = await this.featureFlags.isEnabled(
      CommunicationCenterFeatureFlags.MODULE,
      { schoolId: ctx.schoolId },
    );
    if (!enabled) throw new CommunicationCenterDisabledError();
    return { schoolId: ctx.schoolId };
  }
}
