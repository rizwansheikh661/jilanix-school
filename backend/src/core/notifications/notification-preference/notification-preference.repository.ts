/**
 * NotificationPreferenceRepository — persistence for
 * `notification_user_preferences` rows. One active row per user enforced at
 * the DB level via a partial unique on the STORED `deleted_at_key` column.
 *
 * Composite primary key is `(schoolId, id)`; lookups by user use the
 * `(schoolId, userId, deletedAt = null)` slice.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { NotificationUserPreferenceRow } from '../notifications.types';

export interface CreateNotificationPreferenceInput {
  readonly userId: string;
  readonly channelEmail: boolean;
  readonly channelSms: boolean;
  readonly channelWhatsapp: boolean;
  readonly channelInApp: boolean;
  readonly channelPush?: boolean;
  readonly emergencyOverride?: boolean;
  readonly categoryOptOuts: Prisma.InputJsonValue | null;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly quietHoursTimezone: string | null;
  readonly locale: string;
}

export interface UpdateNotificationPreferenceInput {
  readonly channelEmail?: boolean;
  readonly channelSms?: boolean;
  readonly channelWhatsapp?: boolean;
  readonly channelInApp?: boolean;
  readonly channelPush?: boolean;
  readonly emergencyOverride?: boolean;
  readonly categoryOptOuts?: Prisma.InputJsonValue | null;
  readonly quietHoursStart?: string | null;
  readonly quietHoursEnd?: string | null;
  readonly quietHoursTimezone?: string | null;
  readonly locale?: string;
}

@Injectable()
export class NotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findByUser(
    tx: PrismaTx | undefined,
    schoolId: string,
    userId: string,
  ): Promise<NotificationUserPreferenceRow | null> {
    const reader = this.resolve(tx);
    return reader.notificationUserPreference.findFirst({
      where: { schoolId, userId, deletedAt: null },
    });
  }

  public async create(
    tx: PrismaTx | undefined,
    schoolId: string,
    actorUserId: string | null,
    data: CreateNotificationPreferenceInput,
  ): Promise<NotificationUserPreferenceRow> {
    const writer = this.resolve(tx);
    return writer.notificationUserPreference.create({
      data: {
        schoolId,
        userId: data.userId,
        channelEmail: data.channelEmail,
        channelSms: data.channelSms,
        channelWhatsapp: data.channelWhatsapp,
        channelInApp: data.channelInApp,
        ...(data.channelPush !== undefined ? { channelPush: data.channelPush } : {}),
        ...(data.emergencyOverride !== undefined
          ? { emergencyOverride: data.emergencyOverride }
          : {}),
        categoryOptOuts:
          data.categoryOptOuts === null
            ? Prisma.JsonNull
            : data.categoryOptOuts,
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        quietHoursTimezone: data.quietHoursTimezone,
        locale: data.locale,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }

  public async update(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
    expectedVersion: number,
    actorUserId: string | null,
    input: UpdateNotificationPreferenceInput,
  ): Promise<NotificationUserPreferenceRow> {
    const writer = this.resolve(tx);
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: actorUserId,
    };
    if (input.channelEmail !== undefined) data.channelEmail = input.channelEmail;
    if (input.channelSms !== undefined) data.channelSms = input.channelSms;
    if (input.channelWhatsapp !== undefined) data.channelWhatsapp = input.channelWhatsapp;
    if (input.channelInApp !== undefined) data.channelInApp = input.channelInApp;
    if (input.channelPush !== undefined) data.channelPush = input.channelPush;
    if (input.emergencyOverride !== undefined) {
      data.emergencyOverride = input.emergencyOverride;
    }
    if (input.categoryOptOuts !== undefined) {
      data.categoryOptOuts =
        input.categoryOptOuts === null ? Prisma.JsonNull : input.categoryOptOuts;
    }
    if (input.quietHoursStart !== undefined) data.quietHoursStart = input.quietHoursStart;
    if (input.quietHoursEnd !== undefined) data.quietHoursEnd = input.quietHoursEnd;
    if (input.quietHoursTimezone !== undefined) {
      data.quietHoursTimezone = input.quietHoursTimezone;
    }
    if (input.locale !== undefined) data.locale = input.locale;

    const result = await writer.notificationUserPreference.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError(
        'NotificationUserPreference',
        id,
        expectedVersion,
      );
    }
    const reloaded = await writer.notificationUserPreference.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError(
        'NotificationUserPreference',
        id,
        expectedVersion,
      );
    }
    return reloaded;
  }
}
