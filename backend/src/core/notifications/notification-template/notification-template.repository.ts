/**
 * NotificationTemplateRepository — persistence for the notification template
 * header (`notification_templates`) and its APPEND_ONLY version rows
 * (`notification_template_versions`).
 *
 * Soft-deleted rows (`deletedAt IS NOT NULL`) are filtered out of read paths.
 * Active-uniqueness on `(schoolId, channel, code)` is enforced at the DB
 * level by a hand-edited partial unique on the STORED `deleted_at_key`
 * column; the service additionally pre-checks for duplicates to surface a
 * friendlier domain error before the DB constraint trips.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { VersionConflict } from '../../errors/domain-error';
import type {
  NotificationAudienceValue,
  NotificationCategoryValue,
  NotificationChannelValue,
  NotificationPriorityValue,
} from '../notifications.constants';
import type {
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';

export interface CreateNotificationTemplateInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly channel: NotificationChannelValue;
  readonly category: NotificationCategoryValue;
  readonly eventKey?: string | null;
  readonly defaultPriority?: NotificationPriorityValue;
  readonly locale?: string;
  readonly audience?: NotificationAudienceValue;
  readonly variablesSpec?: Record<string, unknown> | null;
  readonly createdBy: string | null;
}

export interface UpdateNotificationTemplateInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly category?: NotificationCategoryValue;
  readonly defaultPriority?: NotificationPriorityValue;
  readonly locale?: string;
  readonly audience?: NotificationAudienceValue;
  readonly eventKey?: string | null;
  readonly variablesSpec?: Record<string, unknown> | null;
}

export interface ListNotificationTemplatesFilters {
  readonly channel?: NotificationChannelValue;
  readonly category?: NotificationCategoryValue;
  readonly isActive?: boolean;
  readonly eventKey?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface AppendNotificationTemplateVersionInput {
  readonly notificationTemplateId: string;
  readonly versionNo: number;
  readonly subject?: string | null;
  readonly bodyText: string;
  readonly bodyHtml?: string | null;
  readonly variablesSnapshot?: Record<string, unknown> | null;
  readonly createdBy: string | null;
}

@Injectable()
export class NotificationTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  public async findById(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
  ): Promise<NotificationTemplateRow | null> {
    const reader = this.resolve(tx);
    return reader.notificationTemplate.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
  }

  public async findByCode(
    tx: PrismaTx | undefined,
    schoolId: string,
    code: string,
  ): Promise<NotificationTemplateRow | null> {
    const reader = this.resolve(tx);
    return reader.notificationTemplate.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
  }

  public async list(
    tx: PrismaTx | undefined,
    schoolId: string,
    filters: ListNotificationTemplatesFilters,
  ): Promise<{
    readonly rows: readonly NotificationTemplateRow[];
    readonly nextCursor: string | null;
  }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filters.channel !== undefined) where.channel = filters.channel;
    if (filters.category !== undefined) where.category = filters.category;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.eventKey !== undefined) where.eventKey = filters.eventKey;

    const rows = await reader.notificationTemplate.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: filters.limit + 1,
      ...(filters.cursor !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: filters.cursor } }, skip: 1 }
        : {}),
    });

    const nextCursor =
      rows.length > filters.limit ? (rows.pop()?.id ?? null) : null;
    return { rows, nextCursor };
  }

  public async create(
    tx: PrismaTx | undefined,
    schoolId: string,
    data: CreateNotificationTemplateInput,
  ): Promise<NotificationTemplateRow> {
    const writer = this.resolve(tx);
    return writer.notificationTemplate.create({
      data: {
        schoolId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        channel: data.channel,
        category: data.category,
        eventKey: data.eventKey ?? null,
        ...(data.defaultPriority !== undefined
          ? { defaultPriority: data.defaultPriority }
          : {}),
        ...(data.locale !== undefined ? { locale: data.locale } : {}),
        ...(data.audience !== undefined ? { audience: data.audience } : {}),
        variablesSpec:
          data.variablesSpec === null || data.variablesSpec === undefined
            ? Prisma.JsonNull
            : (data.variablesSpec as unknown as Prisma.InputJsonValue),
        isActive: true,
        activeVersionNo: 1,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      },
    });
  }

  public async update(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
    expectedVersion: number,
    data: UpdateNotificationTemplateInput & {
      readonly updatedBy: string | null;
      readonly activeVersionNo?: number;
      readonly isActive?: boolean;
    },
  ): Promise<NotificationTemplateRow> {
    const writer = this.resolve(tx);
    const patch: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: data.updatedBy,
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.category !== undefined) patch.category = data.category;
    if (data.defaultPriority !== undefined) {
      patch.defaultPriority = data.defaultPriority;
    }
    if (data.locale !== undefined) patch.locale = data.locale;
    if (data.audience !== undefined) patch.audience = data.audience;
    if (data.eventKey !== undefined) patch.eventKey = data.eventKey;
    if (data.variablesSpec !== undefined) {
      patch.variablesSpec =
        data.variablesSpec === null
          ? Prisma.JsonNull
          : (data.variablesSpec as unknown as Prisma.InputJsonValue);
    }
    if (data.activeVersionNo !== undefined) {
      patch.activeVersionNo = data.activeVersionNo;
    }
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    const result = await writer.notificationTemplate.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: patch,
    });
    if (result.count === 0) {
      throw new VersionConflict('NotificationTemplate', id, expectedVersion);
    }
    const reloaded = await writer.notificationTemplate.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflict('NotificationTemplate', id, expectedVersion);
    }
    return reloaded;
  }

  public async softDelete(
    tx: PrismaTx | undefined,
    schoolId: string,
    id: string,
    expectedVersion: number,
    deletedBy: string | null,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const result = await writer.notificationTemplate.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy,
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflict('NotificationTemplate', id, expectedVersion);
    }
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  public async findActiveVersion(
    tx: PrismaTx | undefined,
    schoolId: string,
    templateId: string,
  ): Promise<NotificationTemplateVersionRow | null> {
    const reader = this.resolve(tx);
    const header = await reader.notificationTemplate.findFirst({
      where: { schoolId, id: templateId, deletedAt: null },
      select: { activeVersionNo: true },
    });
    if (header === null) return null;
    return reader.notificationTemplateVersion.findFirst({
      where: {
        schoolId,
        notificationTemplateId: templateId,
        versionNo: header.activeVersionNo,
      },
    });
  }

  public async listVersions(
    tx: PrismaTx | undefined,
    schoolId: string,
    templateId: string,
  ): Promise<readonly NotificationTemplateVersionRow[]> {
    const reader = this.resolve(tx);
    return reader.notificationTemplateVersion.findMany({
      where: { schoolId, notificationTemplateId: templateId },
      orderBy: { versionNo: 'asc' },
    });
  }

  public async appendVersion(
    tx: PrismaTx | undefined,
    schoolId: string,
    data: AppendNotificationTemplateVersionInput,
  ): Promise<NotificationTemplateVersionRow> {
    const writer = this.resolve(tx);
    return writer.notificationTemplateVersion.create({
      data: {
        schoolId,
        notificationTemplateId: data.notificationTemplateId,
        versionNo: data.versionNo,
        subject: data.subject ?? null,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml ?? null,
        variablesSnapshot:
          data.variablesSnapshot === null || data.variablesSnapshot === undefined
            ? Prisma.JsonNull
            : (data.variablesSnapshot as unknown as Prisma.InputJsonValue),
        createdBy: data.createdBy,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Delete guards
  // -------------------------------------------------------------------------

  public async countQueuedMessagesByTemplate(
    tx: PrismaTx | undefined,
    schoolId: string,
    templateId: string,
  ): Promise<number> {
    const reader = this.resolve(tx);
    return reader.notificationMessage.count({
      where: {
        schoolId,
        notificationTemplateId: templateId,
        deletedAt: null,
        status: { in: ['QUEUED', 'SENDING'] },
      },
    });
  }

  public async countActiveCampaignsByTemplate(
    tx: PrismaTx | undefined,
    schoolId: string,
    templateId: string,
  ): Promise<number> {
    const reader = this.resolve(tx);
    return reader.notificationCampaign.count({
      where: {
        schoolId,
        notificationTemplateId: templateId,
        deletedAt: null,
        status: { in: ['DRAFT', 'QUEUED', 'SENDING'] },
      },
    });
  }
}
