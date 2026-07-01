/**
 * AssignmentSubmissionAttachmentService — upload/list/delete attachments on
 * an assignment submission. Mirrors AssignmentAttachmentService.
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
  FILE_PURPOSE_ASSIGNMENT_SUBMISSION,
  type AttachmentTypeValue,
} from '../academic-content.constants';
import {
  AcademicContentModuleDisabledError,
  AssignmentSubmissionAttachmentNotFoundError,
  AssignmentSubmissionNotFoundError,
} from '../academic-content.errors';
import type { AssignmentSubmissionAttachmentRow } from '../academic-content.types';
import {
  AssignmentSubmissionAttachmentRepository,
  type ListSubmissionAttachmentArgs,
} from './assignment-submission-attachment.repository';
import { AssignmentSubmissionRepository } from './assignment-submission.repository';

export interface UploadSubmissionAttachmentArgs {
  readonly submissionId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId?: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Buffer;
}

@Injectable()
export class AssignmentSubmissionAttachmentService {
  private readonly logger = new Logger(AssignmentSubmissionAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AssignmentSubmissionAttachmentRepository,
    private readonly submissionRepo: AssignmentSubmissionRepository,
    private readonly fileAssetService: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListSubmissionAttachmentArgs): Promise<{
    readonly items: readonly AssignmentSubmissionAttachmentRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const submission = await this.submissionRepo.findById(args.submissionId);
    if (submission === null) {
      throw new AssignmentSubmissionNotFoundError(args.submissionId);
    }
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async upload(
    args: UploadSubmissionAttachmentArgs,
  ): Promise<AssignmentSubmissionAttachmentRow> {
    await this.assertModuleEnabled();
    const submission = await this.submissionRepo.findById(args.submissionId);
    if (submission === null) {
      throw new AssignmentSubmissionNotFoundError(args.submissionId);
    }

    const asset = await this.fileAssetService.upload({
      purpose: FILE_PURPOSE_ASSIGNMENT_SUBMISSION,
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
            submissionId: args.submissionId,
            fileAssetId: asset.id,
            attachmentType: args.attachmentType,
            title: args.title,
            uploadedByStaffId: args.uploadedByStaffId ?? null,
          },
          tx,
        );
        await this.outbox.publish(tx, {
          topic: AcademicContentOutboxTopics.SUBMISSION_ATTACHMENT_UPLOADED,
          eventType: 'AssignmentSubmissionAttachmentUploaded',
          aggregateType: 'AssignmentSubmissionAttachment',
          aggregateId: created.id,
          payload: {
            id: created.id,
            submissionId: args.submissionId,
            fileAssetId: asset.id,
            attachmentType: args.attachmentType,
          },
        });
        await this.audit.record(
          {
            action: 'assignment-submission-attachment.create',
            category: 'general',
            resourceType: 'AssignmentSubmissionAttachment',
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
    submissionId: string,
    attachmentId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    let fileAssetId: string | null = null;
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(attachmentId, tx);
      if (current === null || current.submissionId !== submissionId) {
        throw new AssignmentSubmissionAttachmentNotFoundError(attachmentId);
      }
      fileAssetId = current.fileAssetId;
      await this.repo.softDelete(attachmentId, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.SUBMISSION_ATTACHMENT_DELETED,
        eventType: 'AssignmentSubmissionAttachmentDeleted',
        aggregateType: 'AssignmentSubmissionAttachment',
        aggregateId: attachmentId,
        payload: {
          id: attachmentId,
          submissionId,
          fileAssetId: current.fileAssetId,
        },
      });
      await this.audit.record(
        {
          action: 'assignment-submission-attachment.delete',
          category: 'general',
          resourceType: 'AssignmentSubmissionAttachment',
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
