/**
 * EventDocumentService — orchestrates uploads + soft-delete.
 *
 * Upload flow (non-tx — FileAssetService manages its own atomicity):
 *   1. assertModuleEnabled + EventNotFoundError pre-check.
 *   2. `fileAssetService.upload({purpose:'EVENT_DOCUMENT', ...})`.
 *   3. In a business tx: insert EventDocument row + outbox + audit.
 *   4. If the row insert fails after upload, soft-delete the orphaned asset
 *      (best-effort; logs+swallows the cleanup error).
 *
 * Delete flow: tx soft-deletes the row + outbox + audit; AFTER commit calls
 * `fileAssetService.softDelete(fileAssetId)` (best-effort).
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { FileAssetService } from '../../file-storage/file-asset/file-asset.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { EventRepository } from '../event/event.repository';
import {
  EventsFeatureFlags,
  EventsOutboxTopics,
  type EventDocumentTypeValue,
} from '../events.constants';
import {
  EventDocumentNotFoundError,
  EventNotFoundError,
  EventsModuleDisabledError,
} from '../events.errors';
import type { EventDocumentRow } from '../events.types';
import {
  EventDocumentRepository,
  type ListEventDocumentArgs,
} from './event-document.repository';

export interface UploadEventDocumentArgs {
  readonly eventId: string;
  readonly documentType: EventDocumentTypeValue;
  readonly title: string;
  readonly description?: string | null;
  readonly isPublic?: boolean;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Buffer;
}

@Injectable()
export class EventDocumentService {
  private readonly logger = new Logger(EventDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventDocumentRepository,
    private readonly eventRepo: EventRepository,
    private readonly fileAssetService: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListEventDocumentArgs): Promise<{
    readonly items: readonly EventDocumentRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async upload(args: UploadEventDocumentArgs): Promise<EventDocumentRow> {
    await this.assertModuleEnabled();
    const event = await this.eventRepo.findById(args.eventId);
    if (event === null) throw new EventNotFoundError(args.eventId);

    const asset = await this.fileAssetService.upload({
      purpose: 'EVENT_DOCUMENT',
      fileName: args.fileName,
      mimeType: args.mimeType,
      body: args.body,
      isPublic: args.isPublic ?? false,
    });

    try {
      return await this.prisma.transaction(async (rawTx) => {
        const tx = rawTx as unknown as PrismaTx;
        const created = await this.repo.create(
          {
            eventId: args.eventId,
            fileAssetId: asset.id,
            documentType: args.documentType,
            title: args.title,
            description: args.description ?? null,
            isPublic: args.isPublic ?? false,
          },
          tx,
        );
        await this.outbox.publish(tx, {
          topic: EventsOutboxTopics.DOCUMENT_UPLOADED,
          eventType: 'EventDocumentUploaded',
          aggregateType: 'EventDocument',
          aggregateId: created.id,
          payload: {
            id: created.id,
            eventId: args.eventId,
            fileAssetId: asset.id,
            documentType: args.documentType,
          },
        });
        await this.audit.record(
          {
            action: 'event-document.create',
            category: 'general',
            resourceType: 'EventDocument',
            resourceId: created.id,
            after: created,
          },
          { tx: tx as unknown as AuditTxLike },
        );
        return created;
      });
    } catch (err) {
      await this.tryCleanupAsset(asset.id);
      throw err;
    }
  }

  public async delete(
    eventId: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    let fileAssetId: string | null = null;
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(documentId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventDocumentNotFoundError(documentId);
      }
      fileAssetId = current.fileAssetId;
      await this.repo.softDelete(documentId, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.DOCUMENT_DELETED,
        eventType: 'EventDocumentDeleted',
        aggregateType: 'EventDocument',
        aggregateId: documentId,
        payload: { id: documentId, eventId, fileAssetId: current.fileAssetId },
      });
      await this.audit.record(
        {
          action: 'event-document.delete',
          category: 'general',
          resourceType: 'EventDocument',
          resourceId: documentId,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });

    if (fileAssetId !== null) {
      await this.tryCleanupAsset(fileAssetId);
    }
  }

  private async tryCleanupAsset(fileAssetId: string): Promise<void> {
    try {
      await this.fileAssetService.softDelete(fileAssetId);
    } catch (err) {
      this.logger.warn(
        `Failed to soft-delete orphaned FileAsset=${fileAssetId}: ${(err as Error).message}`,
      );
    }
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(EventsFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new EventsModuleDisabledError();
  }
}
