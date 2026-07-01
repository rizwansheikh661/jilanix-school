/**
 * NotificationTemplateService — orchestration for template header + version
 * CRUD inside the Notifications module (Sprint 10 Wave 4).
 *
 * Validation gates:
 *   1. `module.notifications` feature flag.
 *   2. Duplicate-code guard (active rows only) on create.
 *   3. Delete refused if any QUEUED/SENDING message OR any DRAFT/QUEUED/
 *      SENDING campaign references the template.
 *   4. EMAIL channel requires a non-empty subject on every persisted version.
 *
 * Every mutation publishes a `notification.template.*` outbox event and
 * writes a general-category audit row inside the same transaction. Soft-
 * delete + header updates use optimistic concurrency (`expectedVersion`).
 *
 * Versions are APPEND_ONLY: editing the body never mutates a prior row;
 * it inserts a new `NotificationTemplateVersion` and bumps the header
 * `activeVersionNo` + `version` so queued messages remain bound to the
 * version they rendered against.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { ValidationFailedError } from '../../errors/domain-error';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationAudienceValue,
  type NotificationCategoryValue,
  type NotificationChannelValue,
  type NotificationPriorityValue,
} from '../notifications.constants';
import {
  DuplicateNotificationTemplateCodeError,
  NotificationsModuleDisabledError,
  NotificationTemplateInUseError,
  NotificationTemplateNotFoundError,
} from '../notifications.errors';
import type {
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import {
  type ListNotificationTemplatesFilters,
  NotificationTemplateRepository,
} from './notification-template.repository';

export interface CreateNotificationTemplateArgs {
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
  readonly subject?: string | null;
  readonly bodyText: string;
  readonly bodyHtml?: string | null;
}

export interface UpdateNotificationTemplateArgs {
  readonly name?: string;
  readonly description?: string | null;
  readonly category?: NotificationCategoryValue;
  readonly defaultPriority?: NotificationPriorityValue;
  readonly locale?: string;
  readonly audience?: NotificationAudienceValue;
  readonly eventKey?: string | null;
  readonly variablesSpec?: Record<string, unknown> | null;
}

export interface AppendNotificationTemplateVersionArgs {
  readonly subject?: string | null;
  readonly bodyText: string;
  readonly bodyHtml?: string | null;
  readonly variablesSnapshot?: Record<string, unknown> | null;
}

export interface NotificationTemplateWithVersion {
  readonly header: NotificationTemplateRow;
  readonly activeVersion: NotificationTemplateVersionRow | null;
}

@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger(NotificationTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: NotificationTemplateRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  public async list(filters: ListNotificationTemplatesFilters): Promise<{
    readonly items: readonly NotificationTemplateRow[];
    readonly nextCursor: string | null;
  }> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const { rows, nextCursor } = await this.repo.list(undefined, schoolId, filters);
    return { items: rows, nextCursor };
  }

  public async getById(id: string): Promise<NotificationTemplateWithVersion> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const header = await this.repo.findById(undefined, schoolId, id);
    if (header === null) throw new NotificationTemplateNotFoundError(id);
    const activeVersion = await this.repo.findActiveVersion(
      undefined,
      schoolId,
      id,
    );
    return { header, activeVersion };
  }

  public async listVersions(
    id: string,
  ): Promise<readonly NotificationTemplateVersionRow[]> {
    await this.assertModuleEnabled();
    const { schoolId } = this.tenant();
    const header = await this.repo.findById(undefined, schoolId, id);
    if (header === null) throw new NotificationTemplateNotFoundError(id);
    return this.repo.listVersions(undefined, schoolId, id);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public async create(
    input: CreateNotificationTemplateArgs,
  ): Promise<NotificationTemplateWithVersion> {
    await this.assertModuleEnabled();
    this.assertSubjectForChannel(input.channel, input.subject ?? null);

    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findByCode(tx as PrismaTx, schoolId, input.code);
      if (dup !== null) {
        throw new DuplicateNotificationTemplateCodeError(input.code);
      }

      const header = await this.repo.create(tx as PrismaTx, schoolId, {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        channel: input.channel,
        category: input.category,
        eventKey: input.eventKey ?? null,
        ...(input.defaultPriority !== undefined
          ? { defaultPriority: input.defaultPriority }
          : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.audience !== undefined ? { audience: input.audience } : {}),
        ...(input.variablesSpec !== undefined
          ? { variablesSpec: input.variablesSpec }
          : {}),
        createdBy: userId ?? null,
      });

      const version = await this.repo.appendVersion(tx as PrismaTx, schoolId, {
        notificationTemplateId: header.id,
        versionNo: 1,
        subject: input.subject ?? null,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        ...(input.variablesSpec !== undefined
          ? { variablesSnapshot: input.variablesSpec }
          : {}),
        createdBy: userId ?? null,
      });

      await this.outbox.publish(tx as PrismaTx, {
        topic: NotificationsOutboxTopics.TEMPLATE_CREATED,
        eventType: 'NotificationTemplateCreated',
        aggregateType: 'NotificationTemplate',
        aggregateId: header.id,
        schoolId,
        payload: {
          id: header.id,
          code: header.code,
          channel: header.channel,
          category: header.category,
          activeVersionNo: header.activeVersionNo,
        },
      });

      await this.audit.record(
        {
          action: 'notification_template.create',
          category: 'general',
          resourceType: 'NotificationTemplate',
          resourceId: header.id,
          after: { header, activeVersion: version },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `NotificationTemplate created id=${header.id} code="${header.code}" channel=${header.channel}.`,
      );

      return { header, activeVersion: version };
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateNotificationTemplateArgs,
  ): Promise<NotificationTemplateRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(tx as PrismaTx, schoolId, id);
      if (current === null) throw new NotificationTemplateNotFoundError(id);

      const updated = await this.repo.update(
        tx as PrismaTx,
        schoolId,
        id,
        expectedVersion,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.defaultPriority !== undefined
            ? { defaultPriority: input.defaultPriority }
            : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          ...(input.audience !== undefined ? { audience: input.audience } : {}),
          ...(input.eventKey !== undefined ? { eventKey: input.eventKey } : {}),
          ...(input.variablesSpec !== undefined
            ? { variablesSpec: input.variablesSpec }
            : {}),
          updatedBy: userId ?? null,
        },
      );

      await this.outbox.publish(tx as PrismaTx, {
        topic: NotificationsOutboxTopics.TEMPLATE_UPDATED,
        eventType: 'NotificationTemplateUpdated',
        aggregateType: 'NotificationTemplate',
        aggregateId: id,
        schoolId,
        payload: {
          id,
          code: updated.code,
          channel: updated.channel,
          category: updated.category,
        },
      });

      await this.audit.record(
        {
          action: 'notification_template.update',
          category: 'general',
          resourceType: 'NotificationTemplate',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(tx as PrismaTx, schoolId, id);
      if (current === null) throw new NotificationTemplateNotFoundError(id);

      const [queuedMessages, activeCampaigns] = await Promise.all([
        this.repo.countQueuedMessagesByTemplate(tx as PrismaTx, schoolId, id),
        this.repo.countActiveCampaignsByTemplate(tx as PrismaTx, schoolId, id),
      ]);
      if (queuedMessages > 0 || activeCampaigns > 0) {
        throw new NotificationTemplateInUseError(id);
      }

      await this.repo.softDelete(
        tx as PrismaTx,
        schoolId,
        id,
        expectedVersion,
        userId ?? null,
      );

      await this.outbox.publish(tx as PrismaTx, {
        topic: NotificationsOutboxTopics.TEMPLATE_DELETED,
        eventType: 'NotificationTemplateDeleted',
        aggregateType: 'NotificationTemplate',
        aggregateId: id,
        schoolId,
        payload: { id, code: current.code, channel: current.channel },
      });

      await this.audit.record(
        {
          action: 'notification_template.delete',
          category: 'general',
          resourceType: 'NotificationTemplate',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `NotificationTemplate soft-deleted id=${id} code="${current.code}".`,
      );
    });
  }

  public async appendVersion(
    id: string,
    expectedHeaderVersion: number,
    input: AppendNotificationTemplateVersionArgs,
  ): Promise<{
    readonly header: NotificationTemplateRow;
    readonly version: NotificationTemplateVersionRow;
  }> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(tx as PrismaTx, schoolId, id);
      if (current === null) throw new NotificationTemplateNotFoundError(id);
      this.assertSubjectForChannel(current.channel, input.subject ?? null);

      const nextVersionNo = current.activeVersionNo + 1;
      const version = await this.repo.appendVersion(tx as PrismaTx, schoolId, {
        notificationTemplateId: id,
        versionNo: nextVersionNo,
        subject: input.subject ?? null,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        ...(input.variablesSnapshot !== undefined
          ? { variablesSnapshot: input.variablesSnapshot }
          : {}),
        createdBy: userId ?? null,
      });

      const header = await this.repo.update(
        tx as PrismaTx,
        schoolId,
        id,
        expectedHeaderVersion,
        {
          activeVersionNo: nextVersionNo,
          updatedBy: userId ?? null,
        },
      );

      await this.outbox.publish(tx as PrismaTx, {
        topic: NotificationsOutboxTopics.TEMPLATE_VERSION_CREATED,
        eventType: 'NotificationTemplateVersionCreated',
        aggregateType: 'NotificationTemplate',
        aggregateId: id,
        schoolId,
        payload: {
          id,
          code: header.code,
          versionNo: nextVersionNo,
        },
      });

      await this.audit.record(
        {
          action: 'notification_template.version_create',
          category: 'general',
          resourceType: 'NotificationTemplate',
          resourceId: id,
          before: { activeVersionNo: current.activeVersionNo },
          after: { activeVersionNo: nextVersionNo, version },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return { header, version };
    });
  }

  public async activate(
    id: string,
    expectedVersion: number,
  ): Promise<NotificationTemplateRow> {
    return this.setActive(id, expectedVersion, true);
  }

  public async deactivate(
    id: string,
    expectedVersion: number,
  ): Promise<NotificationTemplateRow> {
    return this.setActive(id, expectedVersion, false);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async setActive(
    id: string,
    expectedVersion: number,
    isActive: boolean,
  ): Promise<NotificationTemplateRow> {
    await this.assertModuleEnabled();
    const { schoolId, userId } = this.tenant();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(tx as PrismaTx, schoolId, id);
      if (current === null) throw new NotificationTemplateNotFoundError(id);

      const updated = await this.repo.update(
        tx as PrismaTx,
        schoolId,
        id,
        expectedVersion,
        {
          isActive,
          updatedBy: userId ?? null,
        },
      );

      const topic = isActive
        ? NotificationsOutboxTopics.TEMPLATE_ACTIVATED
        : NotificationsOutboxTopics.TEMPLATE_DEACTIVATED;
      const eventType = isActive
        ? 'NotificationTemplateActivated'
        : 'NotificationTemplateDeactivated';

      await this.outbox.publish(tx as PrismaTx, {
        topic,
        eventType,
        aggregateType: 'NotificationTemplate',
        aggregateId: id,
        schoolId,
        payload: { id, code: updated.code, isActive },
      });

      await this.audit.record(
        {
          action: isActive
            ? 'notification_template.activate'
            : 'notification_template.deactivate',
          category: 'general',
          resourceType: 'NotificationTemplate',
          resourceId: id,
          before: { isActive: current.isActive },
          after: { isActive: updated.isActive },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  private assertSubjectForChannel(
    channel: string,
    subject: string | null,
  ): void {
    if (channel !== 'EMAIL') return;
    if (subject === null || subject.trim() === '') {
      throw new DomainSubjectRequiredError();
    }
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new NotificationsModuleDisabledError();
  }

  private tenant(): {
    readonly schoolId: string;
    readonly userId: string | undefined;
  } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('NotificationTemplateService requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }
}

/**
 * Local guard raised when an EMAIL-channel template version is persisted
 * without a subject. Mirrors the shape of `ValidationFailedError` but is
 * scoped to this service so call-sites can map it independently in tests.
 */
class DomainSubjectRequiredError extends ValidationFailedError {
  constructor() {
    super(
      [
        {
          path: 'subject',
          code: 'SUBJECT_REQUIRED',
          message: 'subject is required when channel = EMAIL.',
        },
      ],
      'subject is required for EMAIL templates',
    );
  }
}
