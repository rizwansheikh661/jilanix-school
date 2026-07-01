/**
 * HomeworkAttachmentService — orchestrates uploads + soft-delete of files
 * attached to a Homework row.
 *
 * Upload flow (non-tx — FileAssetService manages its own atomicity):
 *   1. assertModuleEnabled + HomeworkNotFoundError pre-check.
 *   2. `fileAssetService.upload({purpose:'HOMEWORK_ATTACHMENT', ...})`.
 *   3. In a business tx: insert HomeworkAttachment row + bump
 *      Homework.attachmentCount(+1) + outbox + audit.
 *   4. If the row insert fails after upload, soft-delete the orphaned asset
 *      (best-effort; logs+swallows the cleanup error).
 *
 * Delete flow: tx soft-deletes the row + bumps Homework.attachmentCount(-1)
 * + outbox + audit; AFTER commit calls `fileAssetService.softDelete(fileAssetId)`
 * (best-effort).
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
import {
  AcademicContentFeatureFlags,
  AcademicContentOutboxTopics,
  FILE_PURPOSE_HOMEWORK_ATTACHMENT,
  type AttachmentTypeValue,
} from '../academic-content.constants';
import {
  AcademicContentModuleDisabledError,
  HomeworkAttachmentNotFoundError,
  HomeworkNotFoundError,
} from '../academic-content.errors';
import type { HomeworkAttachmentRow } from '../academic-content.types';
import { HomeworkRepository } from '../homework/homework.repository';
import {
  HomeworkAttachmentRepository,
  type ListHomeworkAttachmentArgs,
} from './homework-attachment.repository';

export interface UploadHomeworkAttachmentArgs {
  readonly homeworkId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId?: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Buffer;
}

@Injectable()
export class HomeworkAttachmentService {
  private readonly logger = new Logger(HomeworkAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HomeworkAttachmentRepository,
    private readonly homeworkRepo: HomeworkRepository,
    private readonly fileAssetService: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListHomeworkAttachmentArgs): Promise<{
    readonly items: readonly HomeworkAttachmentRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const homework = await this.homeworkRepo.findById(args.homeworkId);
    if (homework === null) throw new HomeworkNotFoundError(args.homeworkId);
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async upload(
    args: UploadHomeworkAttachmentArgs,
  ): Promise<HomeworkAttachmentRow> {
    await this.assertModuleEnabled();
    const homework = await this.homeworkRepo.findById(args.homeworkId);
    if (homework === null) throw new HomeworkNotFoundError(args.homeworkId);

    const asset = await this.fileAssetService.upload({
      purpose: FILE_PURPOSE_HOMEWORK_ATTACHMENT,
      fileName: args.fileName,
      mimeType: args.mimeType,
      body: args.body,
      isPublic: false,
    });

    try {
      return await this.prisma.transaction(async (rawTx) => {
        const tx = rawTx as unknown as PrismaTx;
        const created = await this.repo.create(
          {
            homeworkId: args.homeworkId,
            fileAssetId: asset.id,
            attachmentType: args.attachmentType,
            title: args.title,
            uploadedByStaffId: args.uploadedByStaffId ?? null,
          },
          tx,
        );
        await this.homeworkRepo.bumpAttachmentCount(args.homeworkId, 1, tx);
        await this.outbox.publish(tx, {
          topic: AcademicContentOutboxTopics.HOMEWORK_ATTACHMENT_UPLOADED,
          eventType: 'HomeworkAttachmentUploaded',
          aggregateType: 'HomeworkAttachment',
          aggregateId: created.id,
          payload: {
            id: created.id,
            homeworkId: args.homeworkId,
            fileAssetId: asset.id,
            attachmentType: args.attachmentType,
          },
        });
        await this.audit.record(
          {
            action: 'homework-attachment.create',
            category: 'general',
            resourceType: 'HomeworkAttachment',
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
    homeworkId: string,
    attachmentId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    let fileAssetId: string | null = null;
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(attachmentId, tx);
      if (current === null || current.homeworkId !== homeworkId) {
        throw new HomeworkAttachmentNotFoundError(attachmentId);
      }
      fileAssetId = current.fileAssetId;
      await this.repo.softDelete(attachmentId, expectedVersion, tx);
      await this.homeworkRepo.bumpAttachmentCount(homeworkId, -1, tx);
      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.HOMEWORK_ATTACHMENT_DELETED,
        eventType: 'HomeworkAttachmentDeleted',
        aggregateType: 'HomeworkAttachment',
        aggregateId: attachmentId,
        payload: {
          id: attachmentId,
          homeworkId,
          fileAssetId: current.fileAssetId,
        },
      });
      await this.audit.record(
        {
          action: 'homework-attachment.delete',
          category: 'general',
          resourceType: 'HomeworkAttachment',
          resourceId: attachmentId,
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
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new AcademicContentModuleDisabledError();
  }
}
