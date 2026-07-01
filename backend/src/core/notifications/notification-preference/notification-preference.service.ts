/**
 * NotificationPreferenceService — orchestration for self-service per-user
 * preference rows + the read-only `shouldDeliver` helper used by the
 * dispatcher.
 *
 * Mutations open a single transaction, publish a
 * `notification.preference.updated` outbox event, and write a
 * `general`-category audit row. The lazy default-create path is silent
 * (no outbox/audit) — users land on the screen with sane defaults without
 * generating events for an action they did not take.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  DEFAULT_LOCALE,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_QUIET_HOURS_TIMEZONE,
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationCategoryValue,
  type NotificationChannelValue,
  type NotificationPriorityValue,
} from '../notifications.constants';
import type { NotificationUserPreferenceRow } from '../notifications.types';
import {
  NotificationPreferenceRepository,
  type UpdateNotificationPreferenceInput,
} from './notification-preference.repository';

export interface UpdateNotificationPreferenceArgs {
  readonly channelEmail?: boolean;
  readonly channelSms?: boolean;
  readonly channelWhatsapp?: boolean;
  readonly channelInApp?: boolean;
  readonly channelPush?: boolean;
  readonly emergencyOverride?: boolean;
  readonly categoryOptOuts?: Record<string, readonly string[]> | null;
  readonly quietHoursStart?: string | null;
  readonly quietHoursEnd?: string | null;
  readonly quietHoursTimezone?: string | null;
  readonly locale?: string;
}

export interface ShouldDeliverResult {
  readonly allowed: boolean;
  readonly skipReason?: 'OPTED_OUT' | 'QUIET_HOURS';
}

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: NotificationPreferenceRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async getOrCreateDefault(): Promise<NotificationUserPreferenceRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.requireTenantUser();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findByUser(tx, schoolId, userId);
      if (existing !== null) return existing;

      return this.repo.create(tx, schoolId, userId, {
        userId,
        channelEmail: true,
        channelSms: true,
        channelWhatsapp: true,
        channelInApp: true,
        channelPush: true,
        emergencyOverride: true,
        categoryOptOuts: null,
        quietHoursStart: DEFAULT_QUIET_HOURS_START,
        quietHoursEnd: DEFAULT_QUIET_HOURS_END,
        quietHoursTimezone: DEFAULT_QUIET_HOURS_TIMEZONE,
        locale: DEFAULT_LOCALE,
      });
    });
  }

  public async update(
    expectedVersion: number,
    input: UpdateNotificationPreferenceArgs,
  ): Promise<NotificationUserPreferenceRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.requireTenantUser();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current =
        (await this.repo.findByUser(tx, schoolId, userId)) ??
        (await this.repo.create(tx, schoolId, userId, {
          userId,
          channelEmail: true,
          channelSms: true,
          channelWhatsapp: true,
          channelInApp: true,
          channelPush: true,
          emergencyOverride: true,
          categoryOptOuts: null,
          quietHoursStart: DEFAULT_QUIET_HOURS_START,
          quietHoursEnd: DEFAULT_QUIET_HOURS_END,
          quietHoursTimezone: DEFAULT_QUIET_HOURS_TIMEZONE,
          locale: DEFAULT_LOCALE,
        }));

      const patch: UpdateNotificationPreferenceInput = {
        ...(input.channelEmail !== undefined ? { channelEmail: input.channelEmail } : {}),
        ...(input.channelSms !== undefined ? { channelSms: input.channelSms } : {}),
        ...(input.channelWhatsapp !== undefined
          ? { channelWhatsapp: input.channelWhatsapp }
          : {}),
        ...(input.channelInApp !== undefined ? { channelInApp: input.channelInApp } : {}),
        ...(input.channelPush !== undefined ? { channelPush: input.channelPush } : {}),
        ...(input.emergencyOverride !== undefined
          ? { emergencyOverride: input.emergencyOverride }
          : {}),
        ...(input.categoryOptOuts !== undefined
          ? {
              categoryOptOuts:
                input.categoryOptOuts === null
                  ? null
                  : (input.categoryOptOuts as unknown as Prisma.InputJsonValue),
            }
          : {}),
        ...(input.quietHoursStart !== undefined
          ? { quietHoursStart: input.quietHoursStart }
          : {}),
        ...(input.quietHoursEnd !== undefined
          ? { quietHoursEnd: input.quietHoursEnd }
          : {}),
        ...(input.quietHoursTimezone !== undefined
          ? { quietHoursTimezone: input.quietHoursTimezone }
          : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      };

      const updated = await this.repo.update(
        tx,
        schoolId,
        current.id,
        expectedVersion,
        userId,
        patch,
      );

      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.PREFERENCE_UPDATED,
        eventType: 'NotificationPreferenceUpdated',
        aggregateType: 'NotificationUserPreference',
        aggregateId: updated.id,
        schoolId,
        payload: {
          id: updated.id,
          schoolId,
          userId,
          channelEmail: updated.channelEmail,
          channelSms: updated.channelSms,
          channelWhatsapp: updated.channelWhatsapp,
          channelInApp: updated.channelInApp,
          channelPush: updated.channelPush,
          emergencyOverride: updated.emergencyOverride,
        },
      });

      await this.audit.record(
        {
          action: 'notification_preference.update',
          category: 'general',
          resourceType: 'NotificationUserPreference',
          resourceId: updated.id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `NotificationPreference updated id=${updated.id} user=${userId}.`,
      );
      return updated;
    });
  }

  /**
   * Pure read used by the dispatcher. CRITICAL-priority bypasses
   * opt-out + quiet-hours ONLY when the user has `emergencyOverride=true`
   * on their preference row (the default for new rows). When the user has
   * explicitly disabled the override the CRITICAL message is gated the
   * same as any other priority. Missing preference rows assume the
   * all-channels-on, 21:00–07:00 IST defaults with `emergencyOverride=true`.
   * Quiet-hours timezone shifting uses Intl (`Asia/Kolkata` default) so we
   * do not depend on the process TZ.
   */
  public async shouldDeliver(
    tx: PrismaTx,
    schoolId: string,
    recipientUserId: string,
    channel: NotificationChannelValue,
    category: NotificationCategoryValue,
    priority: NotificationPriorityValue,
    now: Date,
  ): Promise<ShouldDeliverResult> {
    const pref = await this.repo.findByUser(tx, schoolId, recipientUserId);
    const channelEmail = pref?.channelEmail ?? true;
    const channelSms = pref?.channelSms ?? true;
    const channelWhatsapp = pref?.channelWhatsapp ?? true;
    const channelInApp = pref?.channelInApp ?? true;
    const channelPush = pref?.channelPush ?? true;
    const emergencyOverride = pref?.emergencyOverride ?? true;
    const quietHoursStart = pref?.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
    const quietHoursEnd = pref?.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;
    const quietHoursTimezone =
      pref?.quietHoursTimezone ?? DEFAULT_QUIET_HOURS_TIMEZONE;
    const categoryOptOuts = readCategoryOptOuts(pref?.categoryOptOuts ?? null);

    // CRITICAL bypass is conditional on the user's emergencyOverride flag.
    // When the flag is true (default) CRITICAL traffic always lands.
    if (priority === 'CRITICAL' && emergencyOverride) return { allowed: true };

    if (channel === 'EMAIL' && !channelEmail) {
      return { allowed: false, skipReason: 'OPTED_OUT' };
    }
    if (channel === 'SMS' && !channelSms) {
      return { allowed: false, skipReason: 'OPTED_OUT' };
    }
    if (channel === 'WHATSAPP' && !channelWhatsapp) {
      return { allowed: false, skipReason: 'OPTED_OUT' };
    }
    if (channel === 'IN_APP' && !channelInApp) {
      return { allowed: false, skipReason: 'OPTED_OUT' };
    }
    if (channel === 'PUSH' && !channelPush) {
      return { allowed: false, skipReason: 'OPTED_OUT' };
    }

    const blockedChannels = categoryOptOuts[category];
    if (blockedChannels !== undefined && blockedChannels.includes(channel)) {
      return { allowed: false, skipReason: 'OPTED_OUT' };
    }

    if (isInQuietHours(now, quietHoursStart, quietHoursEnd, quietHoursTimezone)) {
      return { allowed: false, skipReason: 'QUIET_HOURS' };
    }

    return { allowed: true };
  }

  private requireTenantUser(): { schoolId: string; userId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error(
        'NotificationPreferenceService requires tenant scope (schoolId).',
      );
    }
    if (ctx.userId === undefined) {
      throw new Error(
        'NotificationPreferenceService requires an authenticated user (userId).',
      );
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId };
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new Error(
        `Feature flag "${NotificationsFeatureFlags.MODULE}" is disabled.`,
      );
    }
  }
}

function readCategoryOptOuts(
  raw: unknown,
): Record<string, readonly string[]> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return out;
}

function parseHhmm(value: string): number {
  const [hStr, mStr] = value.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  return h * 60 + m;
}

function nowMinutesInZone(now: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = Number.parseInt(part.value, 10) % 24;
    if (part.type === 'minute') minute = Number.parseInt(part.value, 10);
  }
  return hour * 60 + minute;
}

function isInQuietHours(
  now: Date,
  startHhmm: string,
  endHhmm: string,
  timeZone: string,
): boolean {
  const start = parseHhmm(startHhmm);
  const end = parseHhmm(endHhmm);
  if (start === end) return false;
  let nowMins: number;
  try {
    nowMins = nowMinutesInZone(now, timeZone);
  } catch {
    nowMins = nowMinutesInZone(now, DEFAULT_QUIET_HOURS_TIMEZONE);
  }
  if (start < end) {
    return nowMins >= start && nowMins < end;
  }
  return nowMins >= start || nowMins < end;
}

export const __test__ = {
  parseHhmm,
  nowMinutesInZone,
  isInQuietHours,
  readCategoryOptOuts,
};
